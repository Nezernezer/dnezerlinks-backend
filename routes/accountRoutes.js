const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const GENERATE_ACCOUNT_URL = 'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/';

const getBillstackHeaders = () => ({
    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
});

router.post('/fund', async (req, res) => {
    try {
        const { uid, email, first_name, last_name, phone, requested_bank } = req.body;

        // Construct payload: handle first_name fallback and force last_name to be blank if missing
        const payload = {
            email: email,
            reference: `VA_${uid}_${Date.now()}`,
            firstName: first_name ? first_name.trim() : "Dnezerlinks",
            lastName: last_name ? last_name.trim() : "", // Blank if not provided
            phone: phone,
            bank: requested_bank.toUpperCase()
        };

        console.log('📤 Sending Payload to Billstack:', JSON.stringify(payload, null, 2));

        const response = await axios.post(GENERATE_ACCOUNT_URL, payload, {
            headers: getBillstackHeaders()
        });

        const responseData = response.data;

        if (responseData.status === true && responseData.data && responseData.data.account) {
            const accountInfo = responseData.data.account[0];

            const accountToSave = {
                bank_name: accountInfo.bank_name,
                account_number: accountInfo.account_number,
                account_name: accountInfo.account_name,
                created_at: accountInfo.created_at
            };

            // Save to Firebase
            await db.ref(`users/${uid}/virtual_accounts`).push(accountToSave);

            return res.json({ success: true, account: accountToSave });
        } else {
            console.log('⚠️ Billstack responded with status False:', JSON.stringify(responseData, null, 2));
            return res.status(400).json({
                success: false,
                message: responseData.message || "Cannot reserve account at the moment."
            });
        }

    } catch (error) {
        if (error.response) {
            console.error('❌ Billstack API Error Response:', JSON.stringify(error.response.data, null, 2));
            console.error('❌ Status Code:', error.response.status);
            return res.status(error.response.status).json({ 
                success: false, 
                message: error.response.data.message || "API rejection error." 
            });
        }
        
        console.error('❌ Network/Internal Error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
