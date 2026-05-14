const express = require('express');

const router = express.Router();

const db = require('../config/firebase');

// ================= BILLSTACK WEBHOOK =================
router.post(
'/billstack',
async (req, res) => {

    // Acknowledge immediately
    res
        .status(200)
        .send('Webhook Received');

    try {

        console.log(
            '[Webhook] Payload:',
            JSON.stringify(
                req.body,
                null,
                2
            )
        );

        const {
            event,
            data
        } = req.body;

        if (!event) {

            console.warn(
                '[Webhook] Missing event'
            );

            return;
        }

        console.log(
            `[Webhook] Event: ${event}`
        );

        // ================= SUCCESSFUL PAYMENT =================
        if (

            event ===
            'PAYMENT_NOTIFICATION'

            ||

            event ===
            'charge.success'

        ) {

            // ================= VALIDATE CUSTOMER =================
            if (

                !data ||

                !data.customer ||

                !data.customer.email

            ) {

                console.warn(
                    '[Webhook] Missing customer email'
                );

                return;
            }

            const email =
                data.customer.email
                    .toLowerCase()
                    .trim();

            const paymentReference =
                data.reference ||
                data.id;

            // ================= PREVENT DUPLICATE CREDIT =================
            const existingWebhook =
                await db
                    .ref(
                        `processed_webhooks/${paymentReference}`
                    )
                    .once('value');

            if (
                existingWebhook.exists()
            ) {

                console.log(
                    '[Webhook] Duplicate ignored'
                );

                return;
            }

            // ================= AMOUNT =================
            const rawAmount =

                Number(
                    data.amount || 0
                ) / 100;

            if (
                rawAmount <= 0
            ) {

                console.warn(
                    '[Webhook] Invalid amount'
                );

                return;
            }

            // Deduct 2%
            const creditAmount =
                Number(
                    (
                        rawAmount * 0.98
                    ).toFixed(2)
                );

            console.log(

                `[Webhook] Crediting ${email} with ₦${creditAmount}`

            );

            // ================= FIND USER =================
            const userQuery =
                await db
                    .ref('users')
                    .orderByChild('email')
                    .equalTo(email)
                    .once('value');

            if (
                !userQuery.exists()
            ) {

                console.warn(

                    `[Webhook] No user found for ${email}`

                );

                return;
            }

            const userData =
                userQuery.val();

            const uid =
                Object.keys(
                    userData
                )[0];

            // ================= CREDIT USER =================
            const balanceRef =
                db.ref(
                    `users/${uid}/balance`
                );

            await balanceRef.transaction(
                (currentBalance) => {

                    const current =
                        Number(
                            currentBalance
                        ) || 0;

                    return (
                        current +
                        creditAmount
                    );
                }
            );

            // ================= SAVE TRANSACTION =================
            const transactionRef =
                db
                    .ref(
                        `transactions/${uid}`
                    )
                    .push();

            await transactionRef.set({

                type: 'deposit',

                amount:
                    creditAmount,

                original_amount:
                    rawAmount,

                email,

                provider:
                    'Billstack',

                reference:
                    paymentReference,

                status:
                    'success',

                created_at:
                    Date.now()
            });

            // ================= MARK PROCESSED =================
            await db
                .ref(
                    `processed_webhooks/${paymentReference}`
                )
                .set({

                    processed_at:
                        Date.now()
                });

            console.log(

                `[Webhook] SUCCESS: ${uid} credited`

            );
        }

    } catch (err) {

        console.error(
            '[Webhook Error]:',
            err.message
        );

        if (err.response) {

            console.error(

                JSON.stringify(
                    err.response.data,
                    null,
                    2
                )
            );
        }
    }
});

module.exports = router;
