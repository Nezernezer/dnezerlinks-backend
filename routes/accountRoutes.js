const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const GENERATE_ACCOUNT_URL = process.env.BILLSTACK_API_URL || 'https://api.billstack.co/v2/thirdparty/generateVirtualAccount';

const getBillstackHeaders = () => ({
    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
});

/**
 * Generates an account with a sanitized alphanumeric reference
 * to prevent provider-side rejection.
 */
const generateVirtualAccount = async ({ email, first_name, last_name, phone, requested_bank, uid }) => {
    // Sanitize Reference: Keep only A-Z, 0-9. Prevents "invalid format" errors.
    const cleanUid = uid.replace(/[^a-z0-9]/gi, '');
    const cleanBank = requested_bank.replace(/[^a-z0-9]/gi, '');
    const reference = `VA${cleanUid}${cleanBank}${Date.now()}`.substring(0, 30);

    const payload = {
        email: email,
        name: `${first_name} ${last_name}`,
        phone: phone,
        bank: requested_bank.toLowerCase(),
        reference: reference
    };

    console.log('📤 Sending Payload:', JSON.stringify(payload));

    const response = await axios.post(GENERATE_ACCOUNT_URL, payload, {
        headers: getBillstackHeaders(),
        timeout: 30000
    });

    return response.data;
};

router.post('/fund', async (req, res) => {
    try {
        const { uid, email, first_name, last_name, phone, requested_bank } = req.body;

        if (!uid || !email || !requested_bank) {
            return res.status(400).json({ success: false, error: 'Missing data' });
        }

        const responseData = await generateVirtualAccount({ email, first_name, last_name, phone, requested_bank, uid });
        
        // Comprehensive path check for account numbers returned by various providers
        const result = responseData.data || responseData;
        const accountNumber = result.account_number || result.accountNumber || result.nuban;

        if (!accountNumber) {
            console.error('❌ Provider returned no account. Full Response:', JSON.stringify(responseData));
            return res.status(400).json({ success: false, message: "Provider accepted request but returned no account." });
        }

        const account = {
            bank_name: result.bankName || result.bank_name || requested_bank,
            account_number: accountNumber,
            account_name: `${first_name} ${last_name}`,
            created_at: Date.now()
        };

        await db.ref(`users/${uid}/virtual_accounts`).push(account);
        return res.json({ success: true, account });

    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        console.error('❌ Generation Error:', errorMessage);
        return res.status(500).json({ success: false, message: errorMessage });
    }
});

module.exports = router;
