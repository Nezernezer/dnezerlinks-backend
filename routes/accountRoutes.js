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
 * Generate virtual account via Billstack for a specific chosen bank.
 */
const generateVirtualAccount = async ({ email, first_name, last_name, phone, requested_bank }) => {
    // Map frontend keys to Billstack's expected naming slugs
    let selectedBankSlug = requested_bank.toLowerCase();
    if (selectedBankSlug === 'palmpay') selectedBankSlug = 'palmpay'; 
    if (selectedBankSlug === 'wema') selectedBankSlug = 'wema';
    if (selectedBankSlug === '9psb') selectedBankSlug = '9psb';
    if (selectedBankSlug === 'safehaven') selectedBankSlug = 'safehaven';
    if (selectedBankSlug === 'bankly') selectedBankSlug = 'bankly';
    if (selectedBankSlug === 'providus') selectedBankSlug = 'providus';

    const payload = {
        email: normalizeEmail(email),
        name: `${first_name.trim()} ${last_name.trim()}`,
        phone: normalizePhone(phone),
        bank: selectedBankSlug // Passing the specific bank parameter to Billstack
    };

    console.log(`📤 Sending targeted request to Billstack for lane: ${selectedBankSlug}`);
    console.log('📤 Payload details:', JSON.stringify(payload, null, 2));

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
|--------------------------------------------------------------------------
*/
router.post('/test-billstack', async (req, res) => {
    const { email, first_name, last_name, phone, requested_bank } = req.body;

    if (!email || !first_name || !last_name || !phone || !requested_bank) {
        return res.status(400).json({ error: 'Missing fields, including requested_bank' });
    }

    try {
        const data = await generateVirtualAccount({ email, first_name, last_name, phone, requested_bank });
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
| Generate a targeted virtual account for one specific lane only.
|--------------------------------------------------------------------------
*/
router.post('/fund', async (req, res) => {
    try {
        const { uid, email, first_name, last_name, phone, requested_bank } = req.body;

        // ---- Input Validation ----
        if (!uid || !email || !first_name || !last_name || !phone || !requested_bank) {
            return res.status(400).json({
                success: false,
                error: 'Missing required routing fields'
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

        // ---- Duplicate Lane Check ----
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val() || {};

        const existingAccounts = userData.virtual_accounts ? Object.values(userData.virtual_accounts) : [];

        // Stop execution if the exact bank clicked already exists under the user node
        const laneAlreadyExists = existingAccounts.some(acc => 
            acc && acc.bank_name && acc.bank_name.toLowerCase().includes(requested_bank.toLowerCase())
        );

        if (laneAlreadyExists) {
            console.log(`ℹ️ Account line for ${requested_bank} already exists for UID: ${uid}`);
            return res.json({
                success: true,
                message: `Account lane for ${requested_bank} is already active.`,
                allAccounts: existingAccounts
            });
        }

        // ---- Targeted Generation ----
        console.log(`\n🔄 Generating ${requested_bank} virtual account link line for UID: ${uid}`);

        let responseData;
        try {
            // Pass the requested_bank parameter forward
            responseData = await generateVirtualAccount({ 
                email, first_name, last_name, phone, requested_bank 
            });
        } catch (error) {
            const err = error.response?.data || error.message;
            console.error('❌ Billstack API Error:', JSON.stringify(err, null, 2));
            return res.status(500).json({
                success: false,
                error: 'Failed to generate virtual account',
                details: err
            });
        }

        console.log('📥 Billstack Response:', JSON.stringify(responseData, null, 2));

        if (responseData?.status === false || responseData?.success === false) {
            return res.status(400).json({
                success: false,
                error: responseData.message || 'Billstack rejected the targeted request',
                billstackResponse: responseData
            });
        }

        // ---- Response Extraction & Verification ----
        const data = responseData.data || responseData;
        const accountNumber = data.accountNumber || data.account_number;
        const returnedBankName = data.bankName || data.bank_name || data.bank?.name || '';
        const accountName = data.accountName || data.account_name || formatAccountName(first_name, last_name);

        if (!accountNumber) {
            console.error('❌ No account number in response:', JSON.stringify(responseData, null, 2));
            return res.status(500).json({
                success: false,
                error: 'No account number returned by Billstack',
                billstackResponse: responseData
            });
        }

        // CRUCIAL ANTI-RANDOM FILTER: Check if returned bank matches what the user requested
        const isCorrectLane = returnedBankName.toLowerCase().includes(requested_bank.toLowerCase());
        
        if (!isCorrectLane) {
            console.warn(`⚠️ Filter Intercepted: User requested ${requested_bank} but Billstack provided ${returnedBankName}. Aborting save.`);
            return res.status(422).json({
                success: false,
                error: `The system could not allocate a ${requested_bank} account at this moment. Please try again later.`
            });
        }

        // ---- Save Validated Account to Firebase ----
        const account = {
            bank_name: returnedBankName, 
            account_number: accountNumber,
            account_name: accountName,
            created_at: Date.now()
        };

        try {
            // Secure push directly into the virtual_accounts tree node to support multiple banks
            const virtualAccountsRef = db.ref(`users/${uid}/virtual_accounts`);
            await virtualAccountsRef.push(account);

            // Maintain legacy root shortcuts for backward compatibility in top-level lookups
            await userRef.update({
                email: normalizeEmail(email),
                bank_name: account.bank_name,
                account_number: account.account_number,
                account_name: account.account_name,
                updatedAt: Date.now()
            });

            console.log(`✅ Verified ${returnedBankName} account successfully saved to its target lane.`);
            
            return res.json({
                success: true,
                message: 'Virtual account lane registered successfully',
                primaryAccount: account
            });

        } catch (dbError) {
            console.error('❌ Firebase write failure:', dbError);
            return res.status(500).json({
                success: false,
                error: 'Failed to save account node to database'
            });
        }

    } catch (error) {
        console.error('❌ Critical failure:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server processing error'
        });
    }
});

module.exports = router;
