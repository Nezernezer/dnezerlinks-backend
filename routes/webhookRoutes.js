const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-wiaxy-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature) {
        console.error("[Webhook] Missing 'x-wiaxy-signature' header.");
        return res.status(401).send('Missing signature');
    }

    if (!secret) {
        console.error("[Webhook] BILLSTACK_SECRET_KEY not set.");
        return res.status(500).send('Configuration error');
    }

    try {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(req.body);
        const expectedSignature = hmac.digest('hex');

        const sigBuffer = Buffer.from(signature, 'utf8');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

        if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            console.error("Signature Mismatch!");
            return res.status(401).send('Invalid signature');
        }

        const eventData = JSON.parse(req.body.toString('utf8'));
        const { event, data } = eventData;

        if (event === 'charge.success') {
            const { reference, amount, customer } = data;
            const email = customer.email.toLowerCase().trim();
            const credit = (amount / 100) * 0.98;

            const txRef = db.ref(`transactions/${reference}`);
            const snap = await txRef.once('value');
            if (snap.exists()) return res.status(200).send("Already processed");

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
        return res.status(200).send("Event ignored");
    } catch (error) {
        console.error("[Webhook] Error:", error.message);
        return res.status(400).send("Processing error");
    }
});

// IMPORTANT: Export the router directly
module.exports = router;
