const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

// Bank order: PalmPay first, then 9PSB, others, Providus last
const SUPPORTED_BANKS = ["PALMPAY", "9PSB", "SAFEHAVEN", "BANKLY", "PROVIDUS"];

router.post('/fund', async (req, res) => {
    const { uid, email, first_name, last_name, phone } = req.body;

    if (!uid || !email || !first_name || !last_name || !phone) {
        return res.status(400).json({
            success: false,
            error: "Missing required fields: uid, email, first_name, last_name, phone"
        });
    }

    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        const userData = snap.val();

        // Return existing account if any
        if (userData?.account_number) {
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
        const errors = [];

        console.log(`Starting virtual account creation for UID: ${uid}`);

        for (const bank of SUPPORTED_BANKS) {
            try {
                console.log(`🔄 Trying bank: ${bank}`);

                const response = await axios.post(
                    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
                    {
                        email: email.trim().toLowerCase(),
                        reference: `VA_\( {uid}_ \){Date.now()}`,
                        firstName: first_name.trim(),
                        lastName: last_name.trim(),
                        phone: phone.trim().replace(/\D/g, ''),
                        bank: bank,
                        currency: "NGN"
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 20000
                    }
                );

                console.log(`✅ Success with ${bank}:`, JSON.stringify(response.data, null, 2));

                const resData = response.data;
                const accountData = resData.data || resData;

                accountCreated = {
                    bank_name: accountData.bank_name || accountData.bank?.name || `${bank} Bank`,
                    account_number: accountData.account_number || accountData.accountNumber,
                    account_name: accountData.account_name || accountData.accountName || `${first_name} ${last_name}`
                };

                if (accountCreated.account_number) {
                    console.log(`🎉 Account created successfully with ${bank}`);
                    break;
                }

            } catch (bankError) {
                const errInfo = bankError.response?.data || bankError.message;
                errors.push({ bank, error: errInfo?.message || errInfo });
                console.error(`❌ Failed with ${bank}:`, errInfo);
            }
        }

        if (!accountCreated || !accountCreated.account_number) {
            console.error("All banks failed:", errors);
            return res.status(500).json({
                success: false,
                error: "Could not generate virtual account at the moment. Please try again later.",
                details: errors
            });
        }

        // Save to Firebase
        await userRef.update({
            bank_name: accountCreated.bank_name,
            account_number: accountCreated.account_number,
            account_name: accountCreated.account_name,
            email: email.trim().toLowerCase(),
            balance: userData?.balance || 0,
            updatedAt: Date.now()
        });

        res.json({
            success: true,
            message: "Virtual account created successfully",
            account: accountCreated
        });

    } catch (err) {
        console.error("Unexpected Error:", err.message);
        res.status(500).json({
            success: false,
            error: "Internal server error",
            details: err.message
        });
    }
});

module.exports = router;
