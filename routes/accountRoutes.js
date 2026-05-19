const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

// Single valid Billstack generation endpoint
const GENERATE_ACCOUNT_URL =
    process.env.BILLSTACK_API_URL ||
    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount';

const getBillstackHeaders = () => ({
    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
});

const normalizeEmail = (email = '') => email.trim().toLowerCase();
const normalizePhone = (phone = '') => phone.replace(/\D/g, '');

const formatAccountName = (firstName, lastName) => {
    return `${firstName.trim()} ${lastName.trim()}`.trim();
};

/**
 * Generate virtual account via Billstack for a specific chosen bank.
 */
const generateVirtualAccount = async ({ customerEmail, first_name, last_name, phone, requested_bank }) => {
    let selectedBankSlug = requested_bank.toLowerCase();

    // CRUCIAL: Set this to the exact administrative email you used to register on the Billstack portal website!
    // If your Billstack account dashboard is under a different email, replace this string.
    const MERCHANT_EMAIL = process.env.BILLSTACK_MERCHANT_EMAIL || "achikasunday@gmail.com";

    const payload = {
        email: normalizeEmail(MERCHANT_EMAIL), // Matches your Billstack Developer Profile Identity
        customer_email: normalizeEmail(customerEmail), // The user currently interacting with the frontend app
        name: formatAccountName(first_name, last_name),
        phone: normalizePhone(phone),
        bank: selectedBankSlug 
    };

    console.log(`📤 Sending targeted request to Billstack for lane: ${selectedBankSlug}`);
    console.log('📤 Payload structure:', JSON.stringify(payload, null, 2));

    const response = await axios.post(GENERATE_ACCOUNT_URL, payload, {
        headers: getBillstackHeaders(),
        timeout: 25000
    });

    return response.data;
};

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
            return res.status(400).json({ success: false, error: 'Missing required routing properties' });
        }

        if (!process.env.BILLSTACK_SECRET_KEY) {
            return res.status(500).json({ success: false, error: 'Billstack API key unconfigured' });
        }

        // ---- Duplicate Lane Check ----
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val() || {};

        const existingAccounts = userData.virtual_accounts ? Object.values(userData.virtual_accounts) : [];

        // Terminate request early if the exact bank lane clicked already exists
        const laneAlreadyExists = existingAccounts.some(acc => 
            acc && acc.bank_name && acc.bank_name.toLowerCase().includes(requested_bank.toLowerCase())
        );

        if (laneAlreadyExists) {
            console.log(`ℹ️ Account line for ${requested_bank} already active for UID: ${uid}`);
            return res.json({
                success: true,
                message: `Account lane for ${requested_bank} is already active.`,
                allAccounts: existingAccounts
            });
        }

        // ---- Targeted Generation ----
        console.log(`\n🔄 Generating ${requested_bank} virtual account line for UID: ${uid}`);

        let responseData;
        try {
            responseData = await generateVirtualAccount({ 
                customerEmail: email, 
                first_name, 
                last_name, 
                phone, 
                requested_bank 
            });
        } catch (error) {
            const err = error.response?.data || error.message;
            console.error('❌ Billstack API Rejection Error:', JSON.stringify(err, null, 2));
            return res.status(500).json({ 
                success: false, 
                error: 'Billstack failed to validate the transaction',
                details: err 
            });
        }

        console.log('📥 Billstack Response Payload:', JSON.stringify(responseData, null, 2));

        if (responseData?.status === false || responseData?.success === false) {
            return res.status(400).json({
                success: false,
                error: responseData.message || 'Billstack rejected the targeted request'
            });
        }

        // ---- Response Extraction & Verification ----
        const data = responseData.data || responseData;
        const accountNumber = data.accountNumber || data.account_number;
        const returnedBankName = data.bankName || data.bank_name || data.bank?.name || '';
        const accountName = data.accountName || data.account_name || formatAccountName(first_name, last_name);

        if (!accountNumber) {
            return res.status(500).json({ success: false, error: 'No account number returned by API' });
        }

        // ANTI-RANDOM FILTER: Assert returned bank matches what the user requested
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
            const virtualAccountsRef = db.ref(`users/${uid}/virtual_accounts`);
            await virtualAccountsRef.push(account);

            // Set top-level legacy keys for old template parts compatibility
            await userRef.update({
                email: normalizeEmail(email),
                bank_name: account.bank_name,
                account_number: account.account_number,
                account_name: account.account_name,
                updatedAt: Date.now()
            });

            console.log(`✅ Verified ${returnedBankName} account successfully mapped to its target lane node.`);
            
            return res.json({
                success: true,
                message: 'Virtual account lane registered successfully',
                primaryAccount: account
            });

        } catch (dbError) {
            console.error('❌ Firebase write failure:', dbError);
            return res.status(500).json({ success: false, error: 'Failed to write data node mapping' });
        }

    } catch (error) {
        console.error('❌ Critical processing error:', error);
        return res.status(500).json({ success: false, error: 'Internal server processing error' });
    }
});

module.exports = router;
