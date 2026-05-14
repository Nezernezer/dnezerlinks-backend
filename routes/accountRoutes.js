const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/fund', async (req, res) => {

    const {
        uid,
        email,
        first_name,
        last_name,
        phone
    } = req.body;

    try {

        // ================= VALIDATION =================
        if (!uid || !email) {

            return res.status(400).json({
                success: false,
                error: 'UID and Email are required'
            });
        }

        const userRef = db.ref(`users/${uid}`);

        const snap = await userRef.once('value');

        // ================= RETURN EXISTING ACCOUNT =================
        if (
            snap.exists() &&
            snap.val().account_number
        ) {

            console.log(
                `[Fund] Existing account returned for ${uid}`
            );

            return res.json({
                success: true,
                ...snap.val()
            });
        }

        // ================= CLEAN INPUTS =================
        const cleanEmail =
            email.toLowerCase().trim();

        const cleanFirst =
            (first_name || '').trim();

        const cleanLast =
            (last_name || '').trim();

        const shortFirst =
            cleanFirst.substring(0, 2);

        const cleanPhone = phone
            ? phone.replace(/\s+/g, '')
            : '08000000000';

        // ================= CUSTOM ACCOUNT NAME =================
        const formattedAccountName =
            `${cleanLast}${shortFirst}-Dnezerlinks`;

        // ================= UNIQUE REFERENCE =================
        const reference =
            `REF-${uid.substring(0, 5)}-${Date.now()}`;

        console.log(
            `[Fund] Creating account for ${cleanEmail}`
        );

        // ================= BILLSTACK REQUEST =================
        const response = await axios.post(
            'https://api.billstack.co/v2/thirdparty/generateVirtualAccount',
            {
                email: cleanEmail,
                firstName: cleanFirst || 'Customer',
                lastName: cleanLast || 'Client',
                phone: cleanPhone,
                reference,
                bank: 'SAFEHAVEN'
            },
            {
                headers: {
                    Authorization:
                        `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type':
                        'application/json'
                },
                timeout: 30000
            }
        );

        console.log(
            '[Fund] Billstack Response:',
            JSON.stringify(response.data, null, 2)
        );

        // ================= VALIDATE RESPONSE =================
        if (
            !response.data ||
            !response.data.data ||
            !response.data.data.account ||
            !response.data.data.account.length
        ) {

            throw new Error(
                'No account returned from Billstack'
            );
        }

        const accountData =
            response.data.data.account[0];

        // ================= SAVE TO FIREBASE =================
        const updateData = {

            bank_name:
                accountData.bank_name || 'SAFEHAVEN',

            account_number:
                accountData.account_number,

            account_name:
                formattedAccountName,

            email: cleanEmail,

            account_reference:
                response.data.data.reference ||
                reference,

            balance: 0,

            created_at: Date.now()
        };

        await userRef.update(updateData);

        console.log(
            `[Fund] SUCCESS: Account created for ${uid}`
        );

        // ================= RESPONSE =================
        return res.json({
            success: true,
            bank_name:
                accountData.bank_name,

            account_number:
                accountData.account_number,

            account_name:
                formattedAccountName,

            reference:
                response.data.data.reference
        });

    } catch (err) {

        console.error(
            '========== BILLSTACK ERROR =========='
        );

        if (err.response) {

            console.error(
                'Status:',
                err.response.status
            );

            console.error(
                'Response:',
                JSON.stringify(
                    err.response.data,
                    null,
                    2
                )
            );

        } else {

            console.error(
                'Message:',
                err.message
            );
        }

        return res.status(400).json({
            success: false,
            error:
                err.response?.data?.message ||
                err.message ||
                'Generation Failed'
        });
    }
});

module.exports = router;
