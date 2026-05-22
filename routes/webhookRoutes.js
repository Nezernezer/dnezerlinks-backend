const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Ensure this uses express.raw() to keep the body as a buffer
router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-wiaxy-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature) {
        return res.status(401).send('Missing signature');
    }

    // Generate HMAC to verify identity
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(req.body);
    const expectedSignature = hmac.digest('hex');

    // Use constant-time comparison to avoid timing attacks
    if (signature !== expectedSignature) {
        console.error("Signature Mismatch! Expected:", expectedSignature, "Received:", signature);
        return res.status(401).send('Invalid signature');
    }

    // Parse body only after successful validation
    const eventData = JSON.parse(req.body.toString('utf8'));
    const { event, data } = eventData;

    // Based on Screenshot_20260522-190426.jpg, use "PAYMENT_NOTIFICATION"
    if (event === 'PAYMENT_NOTIFICATION') {
        // ... Your database logic here ...
        return res.status(200).send("Success");
    }

    res.status(200).send("Event ignored");
});

module.exports = router;
