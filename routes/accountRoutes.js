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

        if (userData?.account_number) {
            return res.json({ success: true, account: userData });
        }

        console.log(`\n🔄 Starting account creation for UID: ${uid}`);

        const successfulAccounts = [];
        const errors = [];

        // Clean data
        const cleanEmail = email.trim().toLowerCase();
        const firstName = first_name.trim();
        const lastName = last_name.trim();

        for (const bank of SUPPORTED_BANKS) {
            try {
                const uniqueReference = `VA_\( {uid}_ \){bank}_${Date.now()}`;

                console.log(`Trying ${bank}...`);

                const payload = {
                    email: cleanEmail,
                    reference: uniqueReference,
                    firstName: firstName,
                    lastName: lastName,
                    phone: phone.trim().replace(/\D/g, ''),
                    bank: bank,
                    currency: "NGN"
                };

                const response = await axios.post(
                    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount',
                    payload,
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );

                console.log(`📥 Response from ${bank}:`, JSON.stringify(response.data, null, 2));

                const resData = response.data;
                const accountData = resData.data || resData;

                if (resData.status === true && (accountData?.account_number || accountData?.accountNumber)) {
                    const newAccount = {
                        bank_name: accountData.bank_name || `${bank} Bank`,
                        account_number: accountData.account_number || accountData.accountNumber,
                        account_name: accountData.account_name || `${lastName} ${firstName.substring(0,2)}`,
                        bank_code: bank
                    };
                    successfulAccounts.push(newAccount);
                    console.log(`✅ SUCCESS with ${bank}`);
                } else {
                    const failMsg = resData.message || "Unknown error";
                    console.log(`⚠️ ${bank} failed: ${failMsg}`);
                    errors.push({ bank, error: failMsg });
                }

            } catch (bankError) {
                const errDetail = bankError.response?.data || bankError.message;
                errors.push({ bank, error: errDetail });
                console.error(`❌ ${bank} failed:`, errDetail);
            }
        }

        if (successfulAccounts.length === 0) {
            console.error("All banks failed", errors);
            return res.status(500).json({
                success: false,
                error: "Could not create virtual account. Please try again later.",
                details: errors
            });
        }

        const primary = successfulAccounts[0];

        // Save to Firebase
        await userRef.update({
            bank_name: primary.bank_name,
            account_number: primary.account_number,
            account_name: primary.account_name,
            email: cleanEmail,
            balance: userData?.balance || 0,
            updatedAt: Date.now()
        });

        console.log(`✅ Primary account saved successfully`);

        res.json({
            success: true,
            message: `Created ${successfulAccounts.length} account(s)`,
            primaryAccount: primary,
            allAccounts: successfulAccounts
        });

    } catch (err) {
        console.error("Critical Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
