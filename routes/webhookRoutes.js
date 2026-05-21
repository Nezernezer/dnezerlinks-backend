const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Ensure this route is handled before any global JSON/URL-encoded middleware
router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-wiaxy-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature) return res.status(401).send('Missing signature');
    if (!secret) return res.status(500).send('Secret not configured');

    try {
        // 1. Generate the expected signature
        // The body must be the EXACT buffer received from the network
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(req.body); 
        const expectedSignature = hmac.digest('hex');

        // 2. Compare using constant-time comparison
        const sigBuffer = Buffer.from(signature, 'utf8');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

        if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            console.error("Signature Mismatch!");
            console.log("Calculated:", expectedSignature);
            console.log("Received:", signature);
            return res.status(401).send('Invalid signature');
        }

        // 3. ONLY parse after the signature is verified
        const eventData = JSON.parse(req.body.toString('utf8'));
        
        // ... (Your existing logic for handling 'charge.success')
        return res.status(200).send("Success");

    } catch (error) {
        console.error("Processing Error:", error);
        return res.status(400).send("Invalid request");
    }
});
