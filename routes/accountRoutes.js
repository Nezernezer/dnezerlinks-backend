const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

// Load Billstack API URL from environment (with fallback)
const GENERATE_ACCOUNT_URL =
    process.env.BILLSTACK_API_URL ||
    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount';

// Called at request time so env var is always fresh
const getBillstackHeaders = () => ({
    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
});

const normalizeEmail = (email = '') => email.trim().toLowerCase();
const normalizePhone = (phone = '') => phone.replace(/\D/g, '');

// Fallback name formatter – only used if Billstack does NOT return an account name
const formatAccountName = (firstName, lastName) => {
    return `${firstName.trim()} ${lastName.trim().substring(0, 2)}`.trim();
};

/**
 * Generate virtual account via Billstack.
 * Billstack assigns the bank automatically.
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
| Diagnostic – test Billstack directly without touching Firebase
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
| POST /api/account/create
| Generate a virtual account for a user.
|--------------------------------------------------------------------------
*/
router.post('/create', async (req, res) => {
    try {
        const { uid, email, first_name, last_name, phone } = req.body;

        // ---- Authentication (you must implement your own) ----
        // Example: verify Firebase Auth token from header
        // const decodedToken = await admin.auth().verifyIdToken(req.headers.authorization);
        // if (decodedToken.uid !== uid) {
        //     return res.status(403).json({ error: 'Unauthorized' });
        // }

        // ---- Input Validation ----
        if (!uid || !email || !first_name || !last_name || !phone) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        const normalizedPhone = normalizePhone(phone);
        if (normalizedPhone.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number (must have at least 10 digits)'
            });
        }

        if (!process.env.BILLSTACK_SECRET_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Billstack API key is not configured'
            });
        }

        // ---- Check existing accounts (non‑transactional read) ----
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val() || {};

        const existingAccounts = userData.virtual_accounts
            ? Object.values(userData.virtual_accounts)
            : [];

        if (existingAccounts.length > 0) {
            console.log(`ℹ️ Accounts already exist for UID: ${uid}`);
            return res.json({
                success: true,
                message: 'Accounts already exist',
                primaryAccount: existingAccounts[0],
                allAccounts: existingAccounts
            });
        }

        // ---- Generate new virtual account ----
        console.log(`\n🔄 Generating virtual account for UID: ${uid}`);

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

        // Billstack may return 200 with status: false / success: false
        if (responseData?.status === false || responseData?.success === false) {
            return res.status(400).json({
                success: false,
                error: responseData.message || 'Billstack rejected the request',
                billstackResponse: responseData
            });
        }

        // Extract account details (handle both flat and nested response shapes)
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
            created_at: Date.now()
        };

        // ---- Save to Firebase using a Transaction (race‑condition safe) ----
        try {
            await userRef.transaction((currentData) => {
                if (currentData === null) {
                    currentData = {};
                }

                // If another request already saved accounts, abort
                if (currentData.virtual_accounts && Object.keys(currentData.virtual_accounts).length > 0) {
                    return; // undefined signals abort
                }

                // Use push() to create a unique key for each account (allows multiple later)
                if (!currentData.virtual_accounts) {
                    currentData.virtual_accounts = {};
                }
                const newAccountKey = currentData.virtual_accounts
                    ? Object.keys(currentData.virtual_accounts).length.toString()
                    : '0';
                currentData.virtual_accounts[newAccountKey] = account;

                // Set top‑level fields for easy access
                currentData.email = normalizeEmail(email);
                currentData.bank_name = account.bank_name;
                currentData.account_number = account.account_number;
                currentData.account_name = account.account_name;
                currentData.balance = currentData.balance || 0;
                currentData.updatedAt = Date.now();

                return currentData; // commit
            });

            console.log('✅ Account saved to Firebase (transaction committed)');

            // Since we wrote inside the transaction, the account is now safely stored
            return res.json({
                success: true,
                message: 'Virtual account created successfully',
                primaryAccount: account,
                allAccounts: [account]
            });

        } catch (transactionError) {
            console.error('❌ Firebase transaction error:', transactionError);
            // If transaction fails because another request created accounts first,
            // we return the existing ones gracefully.
            const finalSnapshot = await userRef.once('value');
            const finalData = finalSnapshot.val() || {};
            const finalAccounts = finalData.virtual_accounts
                ? Object.values(finalData.virtual_accounts)
                : [];
            if (finalAccounts.length > 0) {
                return res.json({
                    success: true,
                    message: 'Accounts already exist (detected after transaction)',
                    primaryAccount: finalAccounts[0],
                    allAccounts: finalAccounts
                });
            }

            return res.status(500).json({
                success: false,
                error: 'Failed to save account to Firebase'
            });
        }

    } catch (error) {
        console.error('❌ Critical Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
