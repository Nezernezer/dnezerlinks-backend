const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const SUPPORTED_BANKS = ["PALMPAY", "9PSB", "SAFEHAVEN", "BANKLY", "PROVIDUS"];

router.post('/fund', async (req, res) => {
    const { uid, email, first_name, last_name, phone } = req.body;

    if (!uid || !email || !first_name || !last_name || !phone) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        const userData = snap.val();

        // Return existing account if any
        if (userData?.account_number) {
            return res.json({ success: true, account: userData });
        }

        console.log(`\n🔄 Starting account creation for UID: ${uid} - All banks mode`);

        const successfulAccounts = [];
        const errors = [];

        for (const bank of SUPPORTED_BANKS) {
            try {
                const uniqueReference = `VA_\( {uid}_ \){bank}_${Date.now()}`;

                console.log(`Trying ${bank} with ref: ${uniqueReference}`);

                const payload = {
                    email: email.trim().toLowerCase(),
                    reference: uniqueReference,
                    firstName: first_name.trim(),
                    lastName: last_name.trim(),
                    phone: phone.trim().replace(/\D/g, ''),
                    bank: bank,
                    currency: "NGN"
                };

                const response = await axios.post(
                    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
                    payload,
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 25000
                    }
                );

                console.log(`📥 Response from ${bank}:`, JSON.stringify(response.data, null, 2));

                const resData = response.data;
                const accountData = resData.data || resData;

                if (resData.status === true && (accountData?.account_number || accountData?.accountNumber)) {
                    const newAccount = {
                        bank_name: accountData.bank_name || accountData.bank?.name || `${bank} Bank`,
                        account_number: accountData.account_number || accountData.accountNumber,
                        account_name: accountData.account_name || accountData.accountName || `${first_name} ${last_name}`,
                        bank_code: bank
                    };
                    successfulAccounts.push(newAccount);
                    console.log(`✅ SUCCESS with ${bank}`);
                } else {
                    const failMsg = resData.message || "Failed to generate account";
                    console.log(`⚠️ ${bank} failed: ${failMsg}`);
                    errors.push({ bank, error: failMsg });
                }

            } catch (bankError) {
                const errDetail = bankError.response?.data || bankError.message;
                errors.push({ bank, error: errDetail });
                console.error(`❌ ${bank} Error:`, errDetail);
            }
        }

        if (successfulAccounts.length === 0) {
            console.error("All banks failed", errors);
            return res.status(500).json({
                success: false,
                error: "Could not create any virtual account at the moment.",
                details: errors
            });
        }

        // Save the FIRST successful account to Firebase (main account)
        const primaryAccount = successfulAccounts[0];

        await userRef.update({
            bank_name: primaryAccount.bank_name,
            account_number: primaryAccount.account_number,
            account_name: primaryAccount.account_name,
            email: email.trim().toLowerCase(),
            balance: userData?.balance || 0,
            updatedAt: Date.now()
        });

        console.log(`✅ Primary account saved to Firebase (${primaryAccount.bank_name})`);

        res.json({
            success: true,
            message: `Successfully created ${successfulAccounts.length} account(s)`,
            primaryAccount: primaryAccount,
            allAccounts: successfulAccounts   // Return all for future use
        });

    } catch (err) {
        console.error("Critical Error:", err.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

module.exports = router;
