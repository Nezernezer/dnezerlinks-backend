const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const RESERVE_ACCOUNT_URL =
    'https://api.billstack.co/v2/thirdparty/reserveAccount';

const SUPPORTED_BANKS = [
    'PALMPAY',
    '9PSB',
    'SAFEHAVEN',
    'BANKLY',
    'PROVIDUS'
];

// ✅ Called at request time — always picks up the live env var value
const getBillstackHeaders = () => ({
    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
});

const normalizeEmail = (email = '') => email.trim().toLowerCase();
const normalizePhone = (phone = '') => phone.replace(/\D/g, '');
const generateReference = (uid, bank) => `VA_${uid}_${bank}_${Date.now()}`;

const formatAccountName = (firstName, lastName) => {
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim().substring(0, 2);
    return `${cleanFirstName} ${cleanLastName}`.trim();
};

const extractAccountData = (responseData, bank, first_name, last_name) => {
    const data = responseData.data || responseData;
    const accountNumber = data.account_number || data.accountNumber;

    if (!accountNumber) return null;

    return {
        bank_name: data.bank_name || data.bank?.name || `${bank} Bank`,
        account_number: accountNumber,
        account_name: formatAccountName(first_name, last_name),
        bank_code: bank
    };
};

const reserveAccount = async ({ uid, email, first_name, last_name, phone, bank }) => {
    const payload = {
        email: normalizeEmail(email),
        reference: generateReference(uid, bank),
        firstName: first_name.trim(),
        lastName: last_name.trim(),
        phone: normalizePhone(phone),
        bank,
        currency: 'NGN'
    };

    console.log(`📤 Reserving ${bank} account — payload:`, JSON.stringify(payload, null, 2));

    const response = await axios.post(RESERVE_ACCOUNT_URL, payload, {
        headers: getBillstackHeaders(),  // ✅ Fresh headers on every call
        timeout: 25000
    });

    return response.data;
};

/*
|--------------------------------------------------------------------------
| Diagnostic endpoint — test Billstack connectivity without Firebase
| POST /api/account/test-billstack
| Body: { email, first_name, last_name, phone }
| Remove this route once everything is confirmed working
|--------------------------------------------------------------------------
*/
router.post('/test-billstack', async (req, res) => {
    const { email, first_name, last_name, phone } = req.body;

    if (!email || !first_name || !last_name || !phone) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        const payload = {
            email: normalizeEmail(email),
            reference: `TEST_${Date.now()}`,
            firstName: first_name.trim(),
            lastName: last_name.trim(),
            phone: normalizePhone(phone),
            bank: 'PALMPAY',
            currency: 'NGN'
        };

        console.log('🧪 Test payload:', JSON.stringify(payload, null, 2));
        console.log('🔑 Key present:', !!process.env.BILLSTACK_SECRET_KEY);

        const response = await axios.post(RESERVE_ACCOUNT_URL, payload, {
            headers: getBillstackHeaders(),
            timeout: 25000
        });

        return res.json({ success: true, billstackResponse: response.data });

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
| Main fund route
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
                error: 'Billstack API key is not configured on this server'
            });
        }

        /*
        |----------------------------------------------------------------------
        | Check for existing accounts in Firebase
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

        console.log(`\n🔄 Reserving accounts for UID: ${uid}`);

        const successfulAccounts = [];
        const failedAccounts = [];

        for (const bank of SUPPORTED_BANKS) {
            try {
                const responseData = await reserveAccount({
                    uid, email, first_name, last_name, phone, bank
                });

                console.log(`📥 ${bank} Response:`, JSON.stringify(responseData, null, 2));

                // Billstack sometimes returns 200 with success: false
                if (responseData?.status === false || responseData?.success === false) {
                    const failMessage = responseData.message || 'Billstack rejected the request';
                    failedAccounts.push({ bank, error: failMessage });
                    console.log(`⚠️ ${bank} rejected: ${failMessage}`);
                    continue;
                }

                const account = extractAccountData(responseData, bank, first_name, last_name);

                if (account) {
                    successfulAccounts.push(account);
                    console.log(`✅ ${bank} success`);
                } else {
                    const failMessage = responseData.message || 'No account number in response';
                    failedAccounts.push({ bank, error: failMessage });
                    console.log(`⚠️ ${bank} — no account number: ${failMessage}`);
                }

            } catch (error) {
                const err = error.response?.data || error.message;
                failedAccounts.push({ bank, error: err });
                console.error(`❌ ${bank} Error:`, JSON.stringify(err, null, 2));
            }
        }

        if (successfulAccounts.length === 0) {
            console.error('❌ All banks failed:', JSON.stringify(failedAccounts, null, 2));
            return res.status(500).json({
                success: false,
                error: 'Could not create any virtual account',
                details: failedAccounts
            });
        }

        const primaryAccount = successfulAccounts[0];

        /*
        |----------------------------------------------------------------------
        | Save to Firebase
        |----------------------------------------------------------------------
        */
        const virtualAccountsObject = {};
        successfulAccounts.forEach((account, index) => {
            virtualAccountsObject[`account_${index}`] = account;
        });

        await userRef.update({
            email: normalizeEmail(email),
            bank_name: primaryAccount.bank_name,
            account_number: primaryAccount.account_number,
            account_name: primaryAccount.account_name,
            bank_code: primaryAccount.bank_code,
            balance: userData.balance || 0,
            virtual_accounts: virtualAccountsObject,
            updatedAt: Date.now()
        });

        console.log('✅ Accounts saved to Firebase');

        return res.json({
            success: true,
            message: `${successfulAccounts.length} account(s) created successfully`,
            primaryAccount,
            allAccounts: successfulAccounts,
            failedAccounts
        });

    } catch (error) {
        console.error('❌ Critical Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
