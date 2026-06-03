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
        let { uid, email, first_name, last_name, phone, requested_bank } = req.body;

        // 1. Force clear any lingering "Client" strings sent from frontend storage
        if (first_name && first_name.toLowerCase().includes('client')) first_name = "";
        if (last_name && last_name.toLowerCase().includes('client')) last_name = "";

        // 2. Format names correctly. Providers require BOTH fields to be filled for regulatory checks.
        let finalFirstName = first_name ? first_name.trim() : "Dnezerlinks";
        let finalLastName = last_name ? last_name.trim() : "";

        // If the frontend passed no last name, split the business name into two so it doesn't fail bank validation
        if (!finalLastName || finalLastName === "") {
            if (finalFirstName.toLowerCase() === "dnezerlinks") {
                finalFirstName = "Dnezerlinks";
                finalLastName = "Services"; // Structural backup name instead of blank or Client
            } else {
                finalLastName = "User"; // Generic non-client compliance placeholder
            }
        }

        // Construct payload exactly as required by Billstack documentation
        const payload = {
            email: email,
            reference: `VA_${uid}_${Date.now()}`,
            firstName: finalFirstName,
            lastName: finalLastName,
            phone: phone,
            bank: requested_bank.toUpperCase()
        };

        console.log('📤 Sanitized Payload Sending to Billstack:', JSON.stringify(payload, null, 2));

        const response = await axios.post(GENERATE_ACCOUNT_URL, payload, {
            headers: getBillstackHeaders()
        });

        const responseData = response.data;

        if (responseData.status === true && responseData.data && responseData.data.account) {
            // Billstack returns an array, extract the first index item
            const accountInfo = responseData.data.account[0];

            const accountToSave = {
                bank_name: accountInfo.bank_name,
                account_number: accountInfo.account_number,
                account_name: accountInfo.account_name,
                created_at: accountInfo.created_at
            };

            // Save structured data to Firebase realtime database node
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
