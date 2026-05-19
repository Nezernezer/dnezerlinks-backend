const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

// ✅ Correct endpoint and correct field names per Billstack docs
const GENERATE_ACCOUNT_URL =
    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount';

// Called at request time so env var is always fresh
const getBillstackHeaders = () => ({
    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
});

const normalizeEmail = (email = '') => email.trim().toLowerCase();
const normalizePhone = (phone = '') => phone.replace(/\D/g, '');

const formatAccountName = (firstName, lastName) => {
    return `${firstName.trim()} ${lastName.trim().substring(0, 2)}`.trim();
};

/*
|--------------------------------------------------------------------------
| Generate Virtual Account
| Billstack assigns the bank automatically — you do NOT specify one.
| Fields: customer (email), name (full name), phone
|--------------------------------------------------------------------------
*/
const generateVirtualAccount = async ({ email, first_name, last_name, phone }) => {
    const payload = {
        email: normalizeEmail(email),
        name: `${first_name.trim()} ${last_name.trim()}`,
        phone: normalizePhone(phone)
    };

    console.log('📤 Generating virtual account — payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(GENERATE_ACCOUNT_URL, payload, {
        headers: getBillstackHeaders(),
        timeout: 25000
    });

    return response.data;
};

/*
|--------------------------------------------------------------------------
| Diagnostic — test Billstack directly without touching Firebase
| POST /api/account/test-billstack
| Body: { email, first_name, last_name, phone }
| Remove once confirmed working
|--------------------------------------------------------------------------
*/
router.post('/test-billstack', async (req, res) => {
    const { email, first_name, last_name, phone } = req.body;

    if (!email || !first_name || !last_name || !phone) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        const data = await generateVirtualAccount({ email, first_name, last_name, phone });
        return res.json({ success: true, billstackResponse: data });
    } catch (error) {
        return res.json({
            success: false,
            status: error.response?.status,
            billstackError: error.response?.data || error.message
        });
    }
});

/*
|--------------------------------------------------------------------------
| POST /api/account/fund
|--------------------------------------------------------------------------
*/
router.post('/fund', async (req, res) => {
    try {
        const { uid, email, first_name, last_name, phone } = req.body;

        if (!uid || !email || !first_name || !last_name || !phone) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        if (!process.env.BILLSTACK_SECRET_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Billstack API key is not configured'
            });
        }

        /*
        |----------------------------------------------------------------------
        | Return existing accounts if already created
        |----------------------------------------------------------------------
        */
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val() || {};

        if (userData.virtual_accounts && Object.keys(userData.virtual_accounts).length > 0) {
            console.log(`ℹ️ Accounts already exist for UID: ${uid}`);
            const existingAccounts = Object.values(userData.virtual_accounts);
            return res.json({
                success: true,
                message: 'Accounts already exist',
                primaryAccount: existingAccounts[0],
                allAccounts: existingAccounts
            });
        }

        console.log(`\n🔄 Generating virtual account for UID: ${uid}`);

        /*
        |----------------------------------------------------------------------
        | Single call — Billstack assigns bank automatically
        |----------------------------------------------------------------------
        */
        let responseData;
        try {
            responseData = await generateVirtualAccount({ email, first_name, last_name, phone });
        } catch (error) {
            const err = error.response?.data || error.message;
            console.error('❌ Billstack Error:', JSON.stringify(err, null, 2));
            return res.status(500).json({
                success: false,
                error: 'Failed to generate virtual account',
                details: err
            });
        }

        console.log('📥 Billstack Response:', JSON.stringify(responseData, null, 2));

        // Billstack returns 200 with status: false on errors
        if (responseData?.status === false || responseData?.success === false) {
            return res.status(400).json({
                success: false,
                error: responseData.message || 'Billstack rejected the request'
            });
        }

        // Extract account details — handle both flat and nested response shapes
        const data = responseData.data || responseData;
        const accountNumber = data.accountNumber || data.account_number;
        const bankName = data.bankName || data.bank_name || data.bank?.name;
        const accountName = data.accountName || data.account_name || formatAccountName(first_name, last_name);

        if (!accountNumber) {
            console.error('❌ No account number in response:', JSON.stringify(responseData, null, 2));
            return res.status(500).json({
                success: false,
                error: 'No account number returned by Billstack',
                billstackResponse: responseData
            });
        }

        const account = {
            bank_name: bankName || 'Unknown Bank',
            account_number: accountNumber,
            account_name: accountName,
        };

        /*
        |----------------------------------------------------------------------
        | Save to Firebase
        |----------------------------------------------------------------------
        */
        await userRef.update({
            email: normalizeEmail(email),
            bank_name: account.bank_name,
            account_number: account.account_number,
            account_name: account.account_name,
            balance: userData.balance || 0,
            virtual_accounts: { account_0: account },
            updatedAt: Date.now()
        });

        console.log('✅ Account saved to Firebase');

        return res.json({
            success: true,
            message: 'Virtual account created successfully',
            primaryAccount: account,
            allAccounts: [account]
        });

    } catch (error) {
        console.error('❌ Critical Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
