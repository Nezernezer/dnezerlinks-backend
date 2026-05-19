const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const BILLSTACK_URL = 'https://api.billstack.co/v2/thirdparty/generateVirtualAccount';

const SUPPORTED_BANKS = [
    'PALMPAY',
    '9PSB',
    'SAFEHAVEN',
    'BANKLY',
    'PROVIDUS'
];

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const normalizeEmail = (email = '') => {
    return email.trim().toLowerCase();
};

const normalizePhone = (phone = '') => {
    return phone.replace(/\D/g, '');
};

const generateReference = (uid, bank) => {
    return `VA_${uid}_${bank}_${Date.now()}`;
};

const formatAccountName = (firstName, lastName) => {
    const cleanLast = lastName.trim();
    const cleanFirst = firstName.trim().substring(0, 2);

    return `${cleanLast} ${cleanFirst}`.trim();
};

const createVirtualAccount = async ({
    uid,
    email,
    first_name,
    last_name,
    phone,
    bank
}) => {

    const payload = {
        email: normalizeEmail(email),
        reference: generateReference(uid, bank),
        firstName: first_name.trim().substring(0, 2),
        lastName: last_name.trim(),
        phone: normalizePhone(phone),
        bank,
        currency: 'NGN'
    };

    const response = await axios.post(
        BILLSTACK_URL,
        payload,
        {
            headers: {
                Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 25000
        }
    );

    return response.data;
};

const extractAccountData = (responseData, bank, first_name, last_name) => {

    const data = responseData.data || responseData;

    const accountNumber =
        data.account_number ||
        data.accountNumber;

    if (!accountNumber) {
        return null;
    }

    return {
        bank_name:
            data.bank_name ||
            data.bank?.name ||
            `${bank} Bank`,

        account_number: accountNumber,

        account_name:
            data.account_name ||
            data.accountName ||
            formatAccountName(first_name, last_name),

        bank_code: bank
    };
};

/*
|--------------------------------------------------------------------------
| Route
|--------------------------------------------------------------------------
*/

router.post('/fund', async (req, res) => {

    try {

        const {
            uid,
            email,
            first_name,
            last_name,
            phone
        } = req.body;

        /*
        |--------------------------------------------------------------------------
        | Validation
        |--------------------------------------------------------------------------
        */

        if (
            !uid ||
            !email ||
            !first_name ||
            !last_name ||
            !phone
        ) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const userRef = db.ref(`users/${uid}`);

        const snapshot = await userRef.once('value');

        const userData = snapshot.val() || {};

        /*
        |--------------------------------------------------------------------------
        | Return Existing Accounts
        |--------------------------------------------------------------------------
        */

        if (
            userData.virtual_accounts &&
            Object.keys(userData.virtual_accounts).length > 0
        ) {

            const existingAccounts = Object.values(
                userData.virtual_accounts
            );

            return res.json({
                success: true,
                message: 'Accounts already exist',
                primaryAccount: existingAccounts[0],
                allAccounts: existingAccounts
            });
        }

        console.log(`\n🔄 Creating virtual accounts for UID: ${uid}`);

        const successfulAccounts = [];
        const failedAccounts = [];

        /*
        |--------------------------------------------------------------------------
        | Generate Accounts
        |--------------------------------------------------------------------------
        */

        for (const bank of SUPPORTED_BANKS) {

            try {

                console.log(`🏦 Processing ${bank}...`);

                const responseData = await createVirtualAccount({
                    uid,
                    email,
                    first_name,
                    last_name,
                    phone,
                    bank
                });

                console.log(
                    `📥 ${bank} Response:`,
                    JSON.stringify(responseData, null, 2)
                );

                const account = extractAccountData(
                    responseData,
                    bank,
                    first_name,
                    last_name
                );

                if (account) {

                    successfulAccounts.push(account);

                    console.log(`✅ ${bank} account created`);

                } else {

                    failedAccounts.push({
                        bank,
                        error:
                            responseData.message ||
                            'Account creation failed'
                    });

                    console.log(`⚠️ ${bank} failed`);

                }

            } catch (error) {

                const errorMessage =
                    error.response?.data ||
                    error.message ||
                    'Unknown error';

                failedAccounts.push({
                    bank,
                    error: errorMessage
                });

                console.error(`❌ ${bank} Error:`, errorMessage);
            }
        }

        /*
        |--------------------------------------------------------------------------
        | No Successful Accounts
        |--------------------------------------------------------------------------
        */

        if (successfulAccounts.length === 0) {

            return res.status(500).json({
                success: false,
                error: 'Could not create virtual accounts',
                details: failedAccounts
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Save Accounts
        |--------------------------------------------------------------------------
        */

        const primaryAccount = successfulAccounts[0];

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

        console.log('✅ Accounts saved successfully');

        /*
        |--------------------------------------------------------------------------
        | Response
        |--------------------------------------------------------------------------
        */

        return res.json({
            success: true,
            message: `${successfulAccounts.length} account(s) created successfully`,
            primaryAccount,
            allAccounts: successfulAccounts,
            failedAccounts
        });

    } catch (error) {

        console.error('❌ Critical Error:', error);

        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;
