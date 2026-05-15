const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const admin = require('firebase-admin');

// ============================================================
// ENDPOINT: POST /api/webhook/billstack
// Purpose: Receive payment notifications and credit user balance
// ============================================================
router.post('/billstack', async (req, res) => {
    // 1. Acknowledge receipt to Billstack immediately
    res.status(200).send('OK');

    try {
        const { event, data } = req.body;
        
        if (!event || !data) return;

        // Process standard Billstack success events
        if (event === 'PAYMENT_NOTIFICATION' || event === 'charge.success') {
            const email = data.customer?.email?.toLowerCase().trim();
            const reference = data.reference || data.id;
            const amountKobo = Number(data.amount || 0);
            
            if (!email || amountKobo <= 0) {
                return console.error('[Webhook] Invalid payload data');
            }

            // 2. Idempotency Check: Prevent duplicate credit
            const logRef = db.ref(`processed_webhooks/${reference}`);
            const logSnap = await logRef.once('value');
            if (logSnap.exists()) {
                return console.log(`[Webhook] Already processed reference: ${reference}`);
            }

            // 3. Find User by Email
            const userQuery = await db.ref('users')
                .orderByChild('email')
                .equalTo(email)
                .once('value');

            if (!userQuery.exists()) {
                return console.error(`[Webhook] User not found for email: ${email}`);
            }

            const userData = userQuery.val();
            const uid = Object.keys(userData)[0];
            
            // 4. Calculate Credit Amount (2% Fee applied)
            const amountNaira = amountKobo / 100;
            const creditAmount = Number((amountNaira * 0.98).toFixed(2));

            console.log(`[Webhook] Crediting ${email} (UID: ${uid}) with ₦${creditAmount}`);

            // 5. Atomic Balance Update
            await db.ref(`users/${uid}/balance`).transaction((current) => {
                return (Number(current) || 0) + creditAmount;
            });

            // 6. Record Transaction and Mark Webhook as Processed
            await Promise.all([
                db.ref(`transactions/${uid}`).push({
                    type: 'deposit',
                    amount: creditAmount,
                    original_amount: amountNaira,
                    reference: reference,
                    status: 'success',
                    method: 'Virtual Account',
                    timestamp: admin.database.ServerValue.TIMESTAMP,
                    created_at: Date.now()
                }),
                logRef.set({
                    processed_at: Date.now(),
                    uid: uid,
                    amount: creditAmount
                })
            ]);

            console.log(`[Webhook] SUCCESS: ${email} wallet funded.`);
        }
    } catch (err) {
        console.error('========== WEBHOOK ERROR ==========', err.message);
    }
});

module.exports = router;
