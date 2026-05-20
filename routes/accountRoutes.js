const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const GENERATE_ACCOUNT_URL = process.env.BILLSTACK_API_URL || 'https://api.billstack.co/v2/thirdparty/generateVirtualAccount';

const getBillstackHeaders = () => ({
    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
});

router.post('/fund', async (req, res) => {
    try {
        const { uid, email, first_name, last_name, phone, requested_bank } = req.body;

        // Use the exact field names Billstack expects
        const payload = {
            email: email, 
            name: `${first_name} ${last_name}`,
            phone: phone,
            bank: requested_bank.toLowerCase(),
            reference: `VA_${uid}_${requested_bank}_${Date.now()}`
        };

        console.log('📤 Sending Payload:', JSON.stringify(payload));

        const response = await axios.post(GENERATE_ACCOUNT_URL, payload, {
            headers: getBillstackHeaders()
        });

        const data = response.data.data || response.data;
        
        // Save to Firebase only if account exists
        if (data.account_number || data.accountNumber) {
            const account = {
                bank_name: data.bankName || data.bank_name || requested_bank,
                account_number: data.account_number || data.accountNumber,
                account_name: `${first_name} ${last_name}`,
                created_at: Date.now()
            };

            await db.ref(`users/${uid}/virtual_accounts`).push(account);
            return res.json({ success: true, account });
        } else {
            return res.status(400).json({ success: false, message: "Provider accepted request but returned no account." });
        }

    } catch (error) {
        // If it's a 400 "Email not Found", tell the user exactly what to do
        if (error.response?.data?.message === "Email not Found") {
            return res.status(400).json({ 
                success: false, 
                message: "Customer record missing. Please add this user to your Billstack dashboard under 'Customers' first." 
            });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
