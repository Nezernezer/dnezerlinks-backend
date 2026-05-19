const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const BILLSTACK_SECRET_KEY = process.env.BILLSTACK_SECRET_KEY;

const BILLSTACK_HEADERS = {
    Authorization: `Bearer ${BILLSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
};

const GENERATE_ACCOUNT_URL =
    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount';

const CREATE_CUSTOMER_URL =
    'https://api.billstack.co/v2/customer/createCustomer';

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

/*
|--------------------------------------------------------------------------
| Account Name
| Full First Name + First 2 Letters of Last Name
|--------------------------------------------------------------------------
*/

const formatAccountName = (firstName, lastName) => {

    const cleanFirstName =
        firstName.trim();

    const cleanLastName =
        lastName.trim()
        .substring(0, 2);

    return `${cleanFirstName} ${cleanLastName}`.trim();
};

/*
|--------------------------------------------------------------------------
| Create Billstack Customer
|--------------------------------------------------------------------------
*/

const createCustomer = async ({
    email,
    first_name,
    last_name,
    phone
}) => {

    try {

        const payload = {
            email: normalizeEmail(email),
            firstName: first_name.trim(),
            lastName: last_name.trim(),
            phone: normalizePhone(phone)
        };

        console.log(
            '📤 Creating customer:',
            payload.email
        );

        const response = await axios.post(
            CREATE_CUSTOMER_URL,
            payload,
            {
                headers: BILLSTACK_HEADERS,
                timeout: 25000
            }
        );

        console.log(
            '✅ Customer Response:',
            JSON.stringify(response.data, null, 2)
        );

        return response.data;

    } catch (error) {

        const err =
            error.response?.data ||
            error.message;

        console.log(
            '⚠️ Customer Create Error:',
            JSON.stringify(err, null, 2)
        );

        return null;
    }
};

/*
|--------------------------------------------------------------------------
| Generate Virtual Account
|--------------------------------------------------------------------------
*/

const generateVirtualAccount = async ({
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
        firstName: first_name.trim(),
        lastName: last_name.trim(),
        phone: normalizePhone(phone),
        bank,
        currency: 'NGN'
    };

    const response = await axios.post(
        GENERATE_ACCOUNT_URL,
        payload,
        {
            headers: BILLSTACK_HEADERS,
            timeout: 25000
        }
    );

    return response.data;
};

/*
|--------------------------------------------------------------------------
| Extract Account Data
|--------------------------------------------------------------------------
*/

const extractAccountData = (
    responseData,
    bank,
    first_name,
    last_name
) => {

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
            formatAccountName(
                first_name,
                last_name
            ),

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

        /*
        |--------------------------------------------------------------------------
        | Firebase User
        |--------------------------------------------------------------------------
        */

        const userRef = db.ref(`users/${uid}`);

        const snapshot =
            await userRef.once('value');

        const userData =
            snapshot.val() || {};

        /*
        |--------------------------------------------------------------------------
        | Existing Accounts
        |--------------------------------------------------------------------------
        */

        if (
            userData.virtual_accounts &&
            Object.keys(
                userData.virtual_accounts
            ).length > 0
        ) {

            console.log(
                `ℹ️ Accounts already exist for UID: ${uid}`
            );

            const existingAccounts =
                Object.values(
                    userData.virtual_accounts
                );

            return res.json({
                success: true,
                message: 'Accounts already exist',
                primaryAccount:
                    existingAccounts[0],
                allAccounts:
                    existingAccounts
            });
        }

        console.log(
            `\n🔄 Starting account creation for UID: ${uid}`
        );

        /*
        |--------------------------------------------------------------------------
        | Create Customer First
        |--------------------------------------------------------------------------
        */

        await createCustomer({
            email,
            first_name,
            last_name,
            phone
        });

        /*
        |--------------------------------------------------------------------------
        | Generate Accounts
        |--------------------------------------------------------------------------
        */

        const successfulAccounts = [];

        const failedAccounts = [];

        for (const bank of SUPPORTED_BANKS) {

            try {

                console.log(
                    `🏦 Creating ${bank} account...`
                );

                const responseData =
                    await generateVirtualAccount({
                        uid,
                        email,
                        first_name,
                        last_name,
                        phone,
                        bank
                    });

                console.log(
                    `📥 ${bank} Response:`,
                    JSON.stringify(
                        responseData,
                        null,
                        2
                    )
                );

                const account =
                    extractAccountData(
                        responseData,
                        bank,
                        first_name,
                        last_name
                    );

                if (account) {

                    successfulAccounts.push(
                        account
                    );

                    console.log(
                        `✅ ${bank} success`
                    );

                } else {

                    const failMessage =
                        responseData.message ||
                        'Failed to generate account';

                    failedAccounts.push({
                        bank,
                        error: failMessage
                    });

                    console.log(
                        `⚠️ ${bank} failed: ${failMessage}`
                    );
                }

            } catch (error) {

                const err =
                    error.response?.data ||
                    error.message;

                failedAccounts.push({
                    bank,
                    error: err
                });

                console.error(
                    `❌ ${bank} Error:`,
                    JSON.stringify(
                        err,
                        null,
                        2
                    )
                );
            }
        }

        /*
        |--------------------------------------------------------------------------
        | No Successful Accounts
        |--------------------------------------------------------------------------
        */

        if (
            successfulAccounts.length === 0
        ) {

            console.error(
                '❌ All banks failed'
            );

            return res.status(500).json({
                success: false,
                error:
                    'Could not create any virtual account',
                details: failedAccounts
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Primary Account
        |--------------------------------------------------------------------------
        */

        const primaryAccount =
            successfulAccounts[0];

        /*
        |--------------------------------------------------------------------------
        | Firebase Object
        |--------------------------------------------------------------------------
        */

        const virtualAccountsObject = {};

        successfulAccounts.forEach(
            (account, index) => {

                virtualAccountsObject[
                    `account_${index}`
                ] = account;
            }
        );

        /*
        |--------------------------------------------------------------------------
        | Save To Firebase
        |--------------------------------------------------------------------------
        */

        await userRef.update({

            email:
                normalizeEmail(email),

            bank_name:
                primaryAccount.bank_name,

            account_number:
                primaryAccount.account_number,

            account_name:
                primaryAccount.account_name,

            bank_code:
                primaryAccount.bank_code,

            balance:
                userData.balance || 0,

            virtual_accounts:
                virtualAccountsObject,

            updatedAt: Date.now()
        });

        console.log(
            '✅ Accounts saved to Firebase'
        );

        /*
        |--------------------------------------------------------------------------
        | Success Response
        |--------------------------------------------------------------------------
        */

        return res.json({
            success: true,
            message:
                `${successfulAccounts.length} account(s) created successfully`,
            primaryAccount,
            allAccounts:
                successfulAccounts,
            failedAccounts
        });

    } catch (error) {

        console.error(
            '❌ Critical Error:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                'Internal server error'
        });
    }
});

module.exports = router;
