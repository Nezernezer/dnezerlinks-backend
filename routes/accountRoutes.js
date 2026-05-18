const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const SUPPORTED_BANKS = ["PROVIDUS", "SAFEHAVEN", "BANKLY", "9PSB"]; // PALMPAY removed for now

router.post('/fund', async (req, res) => {
    const { uid, email, first_name, last_name, phone } = req.body;

    if (!uid || !email || !first_name || !last_name || !phone) {
        return res.status(400).json({
            success: false,
            error: "Missing required fields"
        });
    }

    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        const userData = snap.val();

        // Return existing account if any
        if (userData && userData.account_number) {
            return res.json({
                success: true,
                account: {
                    bank_name: userData.bank_name,
                    account_number: userData.account_number,
                    account_name: userData.account_name
                }
            });
        }

        let accountCreated = null;
        let lastError = null;

        // Try banks one by one until one succeeds
        for (const bank of SUPPORTED_BANKS) {
            try {
                console.log(`Trying to create account with ${bank}...`);

                const response = await axios.post(
                    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
                    {
                        email: email,
                        reference: `VA_\( {uid}_ \){Date.now()}`,
                        firstName: first_name,
                        lastName: last_name,
                        phone: phone,
                        bank: bank,
                        currency: "NGN"
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                console.log(`✅ Success with ${bank}:`, JSON.stringify(response.data, null, 2));

                const resData = response.data;
                const accountData = resData.data || resData;

                accountCreated = {
                    bank_name: accountData.bank_name || accountData.bank?.name || bank + " Bank",
                    account_number: accountData.account_number || accountData.accountNumber,
                    account_name: accountData.account_name || accountData.accountName || `${first_name} ${last_name}`
                };

                if (accountCreated.account_number) break; // Success

            } catch (bankError) {
                lastError = bankError.response?.data || bankError.message;
                console.error(`Failed with ${bank}:`, lastError?.message || lastError);
            }
        }

        if (!accountCreated || !accountCreated.account_number) {
            throw new Error(lastError?.message || "All banks failed to generate virtual account");
        }

        // Save to Firebase
        await userRef.update({
            bank_name: accountCreated.bank_name,
            account_number: accountCreated.account_number,
            account_name: accountCreated.account_name,
            email: email,
            balance: userData?.balance || 0,
            updatedAt: Date.now()
        });

        res.json({
            success: true,
            message: "Virtual account created successfully",
            account: accountCreated
        });

    } catch (err) {
        console.error("Billstack API Error:", err.response?.data || err.message);

        res.status(500).json({
            success: false,
            error: "Failed to generate virtual account",
            details: err.response?.data?.message || err.message
        });
    }
});

module.exports = router;
