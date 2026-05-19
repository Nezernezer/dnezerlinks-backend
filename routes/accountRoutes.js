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

        // FIX 1: Allow users missing the nested node to enter the loop and sync their secondary banks
        if (userData?.virtual_accounts) {
            console.log(`ℹ️ All accounts already exist for UID: ${uid}`);
            const savedAccounts = Object.values(userData.virtual_accounts);
            return res.json({ 
                success: true, 
                account: userData,
                primaryAccount: savedAccounts[0],
                allAccounts: savedAccounts
            });
        }

        console.log(`\n🔄 Starting account creation for UID: ${uid} - All banks mode`);

        const successfulAccounts = [];
        const errors = [];

        // FIX 2: Format Name to LastName + First 2 letters of FirstName
        const formattedLastName = last_name.trim();
        const formattedFirstName = first_name.trim().substring(0, 2);
        const combinedAccountName = `${formattedLastName} ${formattedFirstName}`.trim();

        for (const bank of SUPPORTED_BANKS) {
            try {
                // FIX 3: Clean, accurate JavaScript template literal syntax
                const uniqueReference = `VA_${uid}_${bank}_${Date.now()}`;

                console.log(`Trying ${bank} with ref: ${uniqueReference}`);

                const payload = {
                    email: email.trim().toLowerCase(),
                    reference: uniqueReference,
                    firstName: formattedFirstName,
                    lastName: formattedLastName,
                    phone: phone.trim().replace(/\D/g, ''),
                    bank: bank,
                    currency: "NGN"
                };

                // FIX 4: Removed trailing slash to prevent LiteSpeed server 404 HTML errors
                const response = await axios.post(
                    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount',
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

                if ((resData.status === true || resData.success === true) && (accountData?.account_number || accountData?.accountNumber)) {
                    const newAccount = {
                        bank_name: accountData.bank_name || accountData.bank?.name || `${bank} Bank`,
                        account_number: accountData.account_number || accountData.accountNumber,
                        account_name: accountData.account_name || accountData.accountName || combinedAccountName,
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

        // Select the primary account
        const primaryAccount = successfulAccounts[0];

        // FIX 5: Convert the successful arrays into a clean indexed object map for Firebase RTDB
        const virtualAccountsObject = {};
        successfulAccounts.forEach((acc, index) => {
            virtualAccountsObject[`account_${index}`] = acc;
        });

        // FIX 6: Write all successfully generated bank nodes to Firebase 
        await userRef.update({
            bank_name: primaryAccount.bank_name,
            account_number: primaryAccount.account_number,
            account_name: primaryAccount.account_name,
            bank_code: primaryAccount.bank_code,
            email: email.trim().toLowerCase(),
            balance: userData?.balance || 0,
            virtual_accounts: virtualAccountsObject, 
            updatedAt: Date.now()
        });

        console.log(`✅ Accounts saved to Firebase safely.`);

        res.json({
            success: true,
            message: `Successfully created ${successfulAccounts.length} account(s)`,
            primaryAccount: primaryAccount,
            allAccounts: successfulAccounts   
        });

    } catch (err) {
        console.error("Critical Error:", err.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

module.exports = router;
