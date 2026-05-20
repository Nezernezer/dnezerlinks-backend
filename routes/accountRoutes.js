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
 * Generate virtual account via Billstack.
 * Includes explicit customer identification to resolve "Email not found" errors.
 */
const generateVirtualAccount = async ({ email, first_name, last_name, phone, requested_bank, uid }) => {
    // Standardizing payload based on typical Billstack requirements
    const payload = {
        email: email,             // The user's email
        customer_email: email,    // Duplicated to cover both identification patterns
        name: `${first_name} ${last_name}`,
        phone: phone,
        bank: requested_bank.toLowerCase(),
        reference: `VA_${uid}_${requested_bank}_${Date.now()}` // Using backticks for correct injection
    };

    console.log('📤 Sending Payload to Billstack:', JSON.stringify(payload, null, 2));

    const response = await axios.post(GENERATE_ACCOUNT_URL, payload, {
        headers: getBillstackHeaders(),
        timeout: 30000
    });

    return response.data;
};

/*
|--------------------------------------------------------------------------
| POST /api/account/fund
|--------------------------------------------------------------------------
*/
router.post('/fund', async (req, res) => {
    try {
        const { uid, email, first_name, last_name, phone, requested_bank } = req.body;

        if (!uid || !email || !requested_bank) {
            return res.status(400).json({ success: false, error: 'Missing critical user data' });
        }

        // 1. Generate Account
        console.log(`\n🔄 Generating ${requested_bank} for ${email}`);
        
        let responseData;
        try {
            responseData = await generateVirtualAccount({ email, first_name, last_name, phone, requested_bank, uid });
        } catch (error) {
            const errBody = error.response?.data || error.message;
            console.error('❌ Billstack API Error:', JSON.stringify(errBody, null, 2));
            return res.status(500).json({ success: false, error: 'Billstack API failed', details: errBody });
        }

        console.log('📥 Raw Billstack Response:', JSON.stringify(responseData, null, 2));

        // 2. Check for explicit API rejections (like "Email not found")
        if (responseData?.status === false) {
            return res.status(400).json({ 
                success: false, 
                error: responseData.message || 'API rejected the request' 
            });
        }

        // 3. Robust Extraction: Look for account number in various possible response fields
        const data = responseData.data || responseData;
        const accountNumber = data.accountNumber || data.account_number || data.nuban || data.account_no;

        if (!accountNumber) {
            return res.status(500).json({ success: false, error: 'Provider returned no account number' });
        }

        // 4. Save to Firebase
        const account = {
            bank_name: data.bankName || data.bank_name || requested_bank,
            account_number: accountNumber,
            account_name: `${first_name} ${last_name}`,
            created_at: Date.now()
        };

        await db.ref(`users/${uid}/virtual_accounts`).push(account);
        console.log("✅ Data successfully saved to Firebase!");

        return res.json({ success: true, account });

    } catch (error) {
        console.error('❌ Critical Server Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
