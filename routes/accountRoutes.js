const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const GENERATE_ACCOUNT_URL =
    process.env.BILLSTACK_API_URL ||
    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount';

/*
|--------------------------------------------------------------------------
| Billstack Headers
|--------------------------------------------------------------------------
*/
const getBillstackHeaders = () => ({
    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
});

/*
|--------------------------------------------------------------------------
| Generate Virtual Account
|--------------------------------------------------------------------------
*/
const generateVirtualAccount = async ({
    email,
    first_name,
    last_name,
    phone,
    requested_bank,
    uid
}) => {

    const payload = {
        email: email.toLowerCase().trim(),
        name: `${first_name || ''} ${last_name || ''}`.trim(),
        phone: phone || '',
        bank: requested_bank.toLowerCase(),
        reference: `VA_${uid}_${requested_bank}_${Date.now()}`
    };

    console.log('\n📤 Sending Payload To Billstack');
    console.log(JSON.stringify(payload, null, 2));

    const response = await axios.post(
        GENERATE_ACCOUNT_URL,
        payload,
        {
            headers: getBillstackHeaders(),
            timeout: 25000
        }
    );

    console.log('\n📥 RAW BILLSTACK RESPONSE');
    console.log(JSON.stringify(response.data, null, 2));

    return response.data;
};

/*
|--------------------------------------------------------------------------
| POST /api/account/fund
|--------------------------------------------------------------------------
*/
router.post('/fund', async (req, res) => {

    try {

        const {
            uid,
            email,
            first_name,
            last_name,
            phone,
            requested_bank
        } = req.body;

        /*
        |--------------------------------------------------------------------------
        | Validate Input
        |--------------------------------------------------------------------------
        */
        if (!uid || !email || !requested_bank) {

            return res.status(400).json({
                success: false,
                error: 'Missing critical user data'
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Check Existing Accounts
        |--------------------------------------------------------------------------
        */
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');

        const userData = snapshot.val() || {};

        const existingAccounts = userData.virtual_accounts
            ? Object.values(userData.virtual_accounts)
            : [];

        const alreadyExists = existingAccounts.some(acc =>
            acc.bank_name
                ?.toLowerCase()
                .includes(requested_bank.toLowerCase())
        );

        if (alreadyExists) {

            console.log('⚠️ Lane already exists');

            return res.json({
                success: true,
                message: 'Lane already active'
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Generate Account
        |--------------------------------------------------------------------------
        */
        console.log(`\n🔄 Generating ${requested_bank} account for ${email}`);

        let responseData;

        try {

            responseData = await generateVirtualAccount({
                email,
                first_name,
                last_name,
                phone,
                requested_bank,
                uid
            });

        } catch (error) {

            console.error('\n❌ BILLSTACK API ERROR');

            if (error.response) {

                console.error(
                    JSON.stringify(error.response.data, null, 2)
                );

            } else {

                console.error(error.message);
            }

            return res.status(500).json({
                success: false,
                error: 'Billstack API failed',
                details: error.response?.data || error.message
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Extract Response Safely
        |--------------------------------------------------------------------------
        */
        const data = responseData.data || responseData;

        // Try all possible structures
        const accountNumber =
            data.accountNumber ||
            data.account_number ||

            data.account?.accountNumber ||
            data.account?.account_number ||

            data.virtualAccount?.accountNumber ||
            data.virtualAccount?.account_number ||

            data.details?.accountNumber ||
            data.details?.account_number ||

            data.data?.accountNumber ||
            data.data?.account_number ||

            null;

        const bankName =
            data.bankName ||
            data.bank_name ||

            data.account?.bankName ||
            data.account?.bank_name ||

            data.virtualAccount?.bankName ||
            data.virtualAccount?.bank_name ||

            data.details?.bankName ||
            data.details?.bank_name ||

            requested_bank;

        /*
        |--------------------------------------------------------------------------
        | Validate Account Number
        |--------------------------------------------------------------------------
        */
        if (!accountNumber) {

            console.error('\n❌ ACCOUNT NUMBER NOT FOUND');
            console.error(
                JSON.stringify(responseData, null, 2)
            );

            return res.status(500).json({
                success: false,
                error: 'Provider returned no account number',
                raw_response: responseData
            });
        }

        /*
        |--------------------------------------------------------------------------
        | Prepare Account Object
        |--------------------------------------------------------------------------
        */
        const account = {
            bank_name: bankName,
            account_number: accountNumber,
            account_name: `${first_name || ''} ${last_name || ''}`.trim(),
            created_at: Date.now()
        };

        /*
        |--------------------------------------------------------------------------
        | Save To Firebase
        |--------------------------------------------------------------------------
        */
        await db
            .ref(`users/${uid}/virtual_accounts`)
            .push(account);

        console.log('\n✅ Account Saved To Firebase');
        console.log(JSON.stringify(account, null, 2));

        /*
        |--------------------------------------------------------------------------
        | Success Response
        |--------------------------------------------------------------------------
        */
        return res.json({
            success: true,
            message: 'Virtual account generated successfully',
            account
        });

    } catch (error) {

        console.error('\n❌ CRITICAL SERVER ERROR');
        console.error(error);

        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

module.exports = router;
