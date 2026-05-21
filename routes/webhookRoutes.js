const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-billstack-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature || !secret) return res.status(401).send('Unauthorized');

    // 1. Verify Signature
    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from(hmac.update(req.body).digest('hex'), 'utf8');
    const checksum = Buffer.from(signature, 'utf8');

    if (!crypto.timingSafeEqual(digest, checksum)) return res.status(401).send('Invalid signature');

    // 2. Parse payload
    const eventData = JSON.parse(req.body.toString());
    const { event, data } = eventData;

    if (event === 'charge.success') {
        const { reference, amount, customer } = data;
        const email = customer.email.toLowerCase().trim();
        const credit = (amount / 100) * 0.98;

        // Idempotency: Avoid double credit
        const txRef = db.ref(`transactions/${reference}`);
        const snap = await txRef.once('value');
        if (snap.exists()) return res.status(200).send("Already processed");

        // Credit user
        const users = await db.ref('users').orderByChild('email').equalTo(email).once('value');
        const userData = users.val();
        if (userData) {
            const uid = Object.keys(userData)[0];
            await db.ref(`users/${uid}/balance`).transaction(curr => (curr || 0) + credit);
            await txRef.set({ status: 'completed', amount: credit, time: Date.now() });
            console.log(`[Webhook] Success: Credited ${email}`);
            return res.status(200).send("Success");
        }
    }
    res.status(200).send("Event ignored");
});

module.exports = router;
