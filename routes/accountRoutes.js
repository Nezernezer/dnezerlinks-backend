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
 * Note: Use backticks (``) for reference strings to ensure UID/Bank are injected correctly.
 */
const generateVirtualAccount = async ({ email, first_name, last_name, phone, requested_bank, uid }) => {
    const payload = {
        email: email, // This must be the CUSTOMER'S email
        name: `${first_name} ${last_name}`,
        phone: phone,
        bank: requested_bank.toLowerCase(),
        // Correct string injection using backticks
        reference: `VA_${uid}_${requested_bank}_${Date.now()}` 
    };

    console.log('📤 Sending targeted payload to Billstack:', JSON.stringify(payload));

    const response = await axios.post(GENERATE_ACCOUNT_URL, payload, {
        headers: getBillstackHeaders(),
        timeout: 25000
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

        // 1. Validate Input
        if (!uid || !email || !requested_bank) {
            return res.status(400).json({ success: false, error: 'Missing critical user data' });
        }

        // 2. Check Firebase for duplicate lane to save API costs
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val() || {};
        const existingAccounts = userData.virtual_accounts ? Object.values(userData.virtual_accounts) : [];

        if (existingAccounts.some(acc => acc.bank_name?.toLowerCase().includes(requested_bank.toLowerCase()))) {
            return res.json({ success: true, message: 'Lane already active' });
        }

        // 3. Generate Account
        console.log(`\n🔄 Generating ${requested_bank} for ${email}`);
        
        let responseData;
        try {
            responseData = await generateVirtualAccount({ email, first_name, last_name, phone, requested_bank, uid });
        } catch (error) {
            console.error('❌ Billstack API Error:', error.response?.data || error.message);
            return res.status(500).json({ success: false, error: 'Billstack API failed' });
        }

        // 4. Extract and Validate response
        const data = responseData.data || responseData;
        const accountNumber = data.accountNumber || data.account_number;
        const bankName = data.bankName || data.bank_name || requested_bank;

        if (!accountNumber) {
            return res.status(500).json({ success: false, error: 'Provider returned no account number' });
        }

        const account = {
            bank_name: bankName,
            account_number: accountNumber,
            account_name: `${first_name} ${last_name}`,
            created_at: Date.now()
        };

        // 5. Force save to Firebase
        await db.ref(`users/${uid}/virtual_accounts`).push(account);
        console.log("✅ Data successfully saved to Firebase!");

        return res.json({ success: true, account });

    } catch (error) {
        console.error('❌ Critical Server Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
