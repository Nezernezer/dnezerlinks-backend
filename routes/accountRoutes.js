const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/fund', async (req, res) => {
    const { uid, email, first_name, last_name, phone } = req.body;

    // Basic validation
    if (!uid || !email || !first_name || !last_name || !phone) {
        return res.status(400).json({
            error: "Missing required fields",
            required: ["uid", "email", "first_name", "last_name", "phone"]
        });
    }

    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        const userData = snap.val();

        // If account already exists, return it
        if (userData && userData.account_number) {
            return res.json({
                success: true,
                account: {
                    bank_name: userData.bank_name,
                    account_number: userData.account_number,
                    account_name: userData.account_name,
                    email: userData.email
                }
            });
        }

        // Call Billstack API
        const response = await axios.post(
            'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
            {
                email: email,
                reference: `VA_\( {uid}_ \){Date.now()}`,   // Required & unique
                firstName: first_name,
                lastName: last_name,
                phone: phone,
                bank: "PALMPAY",                        // Change to PROVIDUS, SAFEHAVEN, BANKLY etc. if needed
                currency: "NGN"
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Log full response for debugging
        console.log("Billstack Full Response:", JSON.stringify(response.data, null, 2));

        const resData = response.data;
        let accountData = resData.data || resData;

        // Safely extract account details
        const account = {
            bank_name: accountData.bank_name || accountData.bank?.name || accountData.bankName || "N/A",
            account_number: accountData.account_number || accountData.accountNumber,
            account_name: accountData.account_name || accountData.accountName || `${first_name} ${last_name}`,
        };

        // Validate critical fields
        if (!account.account_number) {
            throw new Error("Account number not returned by Billstack");
        }

        // Save to Firebase
        await userRef.update({
            bank_name: account.bank_name,
            account_number: account.account_number,
            account_name: account.account_name,
            email: email,
            balance: userData?.balance || 0,
            updatedAt: Date.now()
        });

        res.json({
            success: true,
            message: "Virtual account created successfully",
            account: account
        });

    } catch (err) {
        console.error("Billstack API Error:", err.response?.data || err.message);

        const errorMessage = err.response?.data?.message 
                          || err.response?.data?.error 
                          || err.message;

        res.status(err.response?.status || 500).json({
            success: false,
            error: "Failed to generate virtual account",
            details: errorMessage
        });
    }
});

module.exports = router;
