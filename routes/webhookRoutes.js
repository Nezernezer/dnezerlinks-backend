const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const admin = require('firebase-admin');

router.post('/billstack', async (req, res) => {
    // 1. Tell Billstack we got it
    res.status(200).send('Webhook Received');

    try {
        const { event, data } = req.body;
        if (event !== 'PAYMENT_NOTIFICATION' && event !== 'charge.success') return;

        const email = data.customer.email.toLowerCase().trim();
        const amountNaira = Number(data.amount) / 100;
        const ref = data.reference || data.id;

        // 2. Prevent Double Credit
        const check = await db.ref(`processed_webhooks/${ref}`).once('value');
        if (check.exists()) return console.log(`[Webhook] Duplicate ${ref} ignored.`);

        // 3. Find User
        const userSnap = await db.ref('users').orderByChild('email').equalTo(email).once('value');
        if (!userSnap.exists()) return console.error(`[Webhook] No user found for ${email}`);

        const uid = Object.keys(userSnap.val())[0];
        const creditAmount = Number((amountNaira * 0.98).toFixed(2)); // 2% platform fee

        // 4. Update Balance (Atomic)
        await db.ref(`users/${uid}/balance`).transaction(bal => (Number(bal) || 0) + creditAmount);

        // 5. Log it
        await Promise.all([
            db.ref(`processed_webhooks/${ref}`).set({ uid, amount: creditAmount, timestamp: Date.now() }),
            db.ref(`transactions/${uid}`).push({
                type: 'deposit',
                amount: creditAmount,
                reference: ref,
                status: 'success',
                method: 'Bank Transfer',
                timestamp: admin.database.ServerValue.TIMESTAMP
            })
        ]);

        console.log(`[Webhook] SUCCESS: Credited ₦${creditAmount} to ${email}`);

    } catch (err) {
        console.error("[Webhook Error]:", err.message);
    }
});

module.exports = router;
