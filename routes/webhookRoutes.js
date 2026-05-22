const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Use express.raw to capture the body as a buffer for HMAC verification
router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-wiaxy-signature']; // As identified in previous logs
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature) return res.status(401).send('Missing signature');
    if (!secret) return res.status(500).send('Secret not configured');

    // 1. Verify Signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(req.body);
    const expectedSignature = hmac.digest('hex');

    if (signature !== expectedSignature) {
        console.error("Signature Mismatch!");
        return res.status(401).send('Invalid signature');
    }

    // 2. Parse body only after successful verification
    const eventData = JSON.parse(req.body.toString('utf8'));
    const { event, data } = eventData;

    // 3. Process Transaction
    // According to Screenshot_20260522-190426.jpg, event is "PAYMENT_NOTIFICATION"
    if (event === 'PAYMENT_NOTIFICATION') {
        const { amount, merchant_reference } = data; 
        // Note: Use merchant_reference if mapping to a specific user/order
        
        // Ensure you handle the logic based on the payload structure in 
        // Screenshot_20260522-190426.jpg
        console.log(`Processing ${event} for amount: ${amount}`);
        
        // ... (Your balance update logic here)
    }

    res.sendStatus(200);
});

module.exports = router;
