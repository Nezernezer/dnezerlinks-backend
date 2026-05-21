const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Ensure this route uses express.raw() to get the buffer BEFORE any JSON parsing
router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-billstack-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature) {
        console.error("[Webhook] Missing signature header");
        return res.status(401).send('Missing signature');
    }

    if (!secret) {
        console.error("[Webhook] BILLSTACK_SECRET_KEY not set in environment");
        return res.status(500).send('Internal Server Error');
    }

    try {
        // 1. Generate the hash using the RAW buffer (req.body)
        // Do NOT convert to string before hashing
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(req.body);
        const expectedSignature = hmac.digest('hex');

        // 2. Compare safely
        // Both sides must be compared as buffers to avoid encoding issues
        const sigBuffer = Buffer.from(signature, 'utf8');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

        if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            console.error("[Webhook] Signature mismatch!");
            return res.status(401).send('Invalid signature');
        }

        // 3. Process the data
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
        console.error("[Webhook] Processing Error:", error.message);
        return res.status(400).send("Processing error");
    }
});

module.exports = router;
