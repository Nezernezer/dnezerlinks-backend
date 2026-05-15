const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const admin = require('firebase-admin');

router.post('/billstack', async (req, res) => {
    // Acknowledge receipt to avoid Billstack retries
    res.status(200).send('OK');

    try {
        const { event, data } = req.body;
        if (event !== 'PAYMENT_NOTIFICATION' && event !== 'charge.success') return;

        const email = data.customer.email.toLowerCase().trim();
        const amountNaira = Number(data.amount) / 100;
        const ref = data.reference || data.id;

        // 1. Prevent Double Credits
        const check = await db.ref(`processed_webhooks/${ref}`).once('value');
        if (check.exists()) return;

        // 2. Find User by indexed email
        const userSnap = await db.ref('users').orderByChild('email').equalTo(email).once('value');
        if (!userSnap.exists()) return console.error(`[Webhook] User not found: ${email}`);

        const uid = Object.keys(userSnap.val())[0];
        const creditAmount = Number((amountNaira * 0.98).toFixed(2)); // Apply 2% Fee

        // 3. Atomic Balance Update
        await db.ref(`users/${uid}/balance`).transaction(bal => (Number(bal) || 0) + creditAmount);
        
        // 4. Record and Log
        await Promise.all([
            db.ref(`processed_webhooks/${ref}`).set({ uid, amount: creditAmount, date: Date.now() }),
            db.ref(`transactions/${uid}`).push({
                type: 'deposit',
                amount: creditAmount,
                reference: ref,
                status: 'success',
                method: 'Auto-Fund',
                timestamp: admin.database.ServerValue.TIMESTAMP
            })
        ]);

        console.log(`[Webhook] SUCCESS: ₦${creditAmount} credited to ${email}`);
    } catch (err) {
        console.error("[Webhook Error]:", err.message);
    }
});

module.exports = router;
