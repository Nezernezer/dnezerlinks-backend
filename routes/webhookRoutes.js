const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-wiaxy-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature || !secret) {
        console.error("❌ Missing signature or secret key");
        return res.status(401).send('Unauthorized');
    }

    // 1. Generate HMAC-SHA256 hash using the raw Buffer
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(req.body);
    const expectedSignature = hmac.digest('hex');

    // 2. Timing-safe comparison (prevents timing attacks)
    const sigBuffer = Buffer.from(signature, 'hex');
    const expBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
        console.error("❌ Signature mismatch!");
        // Log these to your Render dashboard to see exactly what is being sent vs computed
        console.log("Received:", signature);
        console.log("Expected:", expectedSignature);
        return res.status(401).send('Invalid signature');
    }

    // 3. Process the event
    try {
        const eventData = JSON.parse(req.body.toString('utf8'));
        if (eventData.event === 'PAYMENT_NOTIFICATION') {
            const { amount, merchant_reference } = eventData.data;
            await db.ref(`users/${merchant_reference}/balance`).transaction(bal => (bal || 0) + amount);
            return res.status(200).send("Processed");
        }
        res.status(200).send("OK");
    } catch (e) {
        res.status(400).send("Parsing error");
    }
});

module.exports = router;
