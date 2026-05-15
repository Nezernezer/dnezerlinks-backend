const express = require('express');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', async (req, res) => {
    res.status(200).send('OK'); // Acknowledge Billstack immediately

    try {
        const { event, data } = req.body;
        if (event !== 'PAYMENT_NOTIFICATION' && event !== 'charge.success') return;

        const email = data.customer.email.toLowerCase().trim();
        const amountNaira = Number(data.amount) / 100;
        const ref = data.reference || data.id;

        // Prevent double crediting
        const check = await db.ref(`processed_webhooks/${ref}`).once('value');
        if (check.exists()) return;

        // Find user by email index
        const userSnap = await db.ref('users').orderByChild('email').equalTo(email).once('value');
        if (!userSnap.exists()) return console.error(`[Webhook] No user found for ${email}`);

        const uid = Object.keys(userSnap.val())[0];
        const creditAmount = Number((amountNaira * 0.98).toFixed(2)); // 2% charge

        // Atomic wallet update
        await db.ref(`users/${uid}/balance`).transaction(bal => (Number(bal) || 0) + creditAmount);
        
        await Promise.all([
            db.ref(`processed_webhooks/${ref}`).set({ uid, amount: creditAmount, date: Date.now() }),
            db.ref(`transactions/${uid}`).push({
                type: 'deposit',
                amount: creditAmount,
                status: 'success',
                method: 'Bank-Transfer',
                timestamp: Date.now()
            })
        ]);

        console.log(`✅ [Webhook] Credited ₦${creditAmount} to ${email}`);
    } catch (err) {
        console.error("Webhook Error:", err.message);
    }
});

module.exports = router;
