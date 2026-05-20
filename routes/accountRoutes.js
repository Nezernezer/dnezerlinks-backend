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

        // Construct payload exactly as required by Billstack documentation
        const payload = {
            email: email,
            reference: `VA_${uid}_${Date.now()}`,
            firstName: first_name,
            lastName: last_name,
            phone: phone,
            bank: requested_bank.toUpperCase() // Ensure strict formatting (e.g., "PALMPAY")
        };

        console.log('📤 Sending Payload to Billstack:', JSON.stringify(payload, null, 2));

        const response = await axios.post(GENERATE_ACCOUNT_URL, payload, {
            headers: getBillstackHeaders()
        });

        // Parse response according to the provided documentation structure
        const responseData = response.data;
        
        if (responseData.status === true && responseData.data && responseData.data.account) {
            // Extract the first account from the array
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
            return res.status(400).json({ 
                success: false, 
                message: responseData.message || "Cannot reserve account at the moment." 
            });
        }

    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error('❌ Generation Error:', errorMsg);
        return res.status(500).json({ success: false, message: errorMsg });
    }
});

module.exports = router;
