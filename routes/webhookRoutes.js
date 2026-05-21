const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Ensure express.raw() captures the buffer for accurate HMAC verification
router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    // We identified the signature header is 'x-wiaxy-signature'
    const signature = req.headers['x-wiaxy-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature) {
        console.error("[Webhook] Error: 'x-wiaxy-signature' header missing.");
        return res.status(401).send('Missing signature');
    }

    if (!secret) {
        console.error("[Webhook] Error: BILLSTACK_SECRET_KEY is not configured.");
        return res.status(500).send('Server configuration error');
    }

    try {
        // 1. HMAC Verification
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(req.body);
        const expectedSignature = hmac.digest('hex');

        // 2. Constant-time comparison to prevent timing attacks
        const sigBuffer = Buffer.from(signature, 'utf8');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

        // Check length first, then use timingSafeEqual
        if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            console.error("[Webhook] Security Alert: Signature mismatch!");
            console.log("Expected:", expectedSignature, "Received:", signature);
            return res.status(401).send('Invalid signature');
        }

        // 3. Process the Payload
        const eventData = JSON.parse(req.body.toString('utf8'));
        const { event, data } = eventData;

        if (event === 'charge.success') {
            const { reference, amount, customer } = data;
            const email = customer.email.toLowerCase().trim();
            const credit = (amount / 100) * 0.98;

            // Prevent duplicate processing
            const txRef = db.ref(`transactions/${reference}`);
            const snap = await txRef.once('value');
            if (snap.exists()) {
                console.log(`[Webhook] Transaction ${reference} already processed.`);
                return res.status(200).send("Already processed");
            }

            // Update user balance
            const users = await db.ref('users').orderByChild('email').equalTo(email).once('value');
            const userData = users.val();
            
            if (userData) {
                const uid = Object.keys(userData)[0];
                await db.ref(`users/${uid}/balance`).transaction(curr => (curr || 0) + credit);
                await txRef.set({ status: 'completed', amount: credit, time: Date.now() });
                console.log(`[Webhook] Success: Credited ${email} with ${credit}`);
                return res.status(200).send("Success");
            } else {
                console.error(`[Webhook] User ${email} not found.`);
            }
        }
        
        return res.status(200).send("Event received");

    } catch (error) {
        console.error("[Webhook] Processing Error:", error.message);
        return res.status(400).send("Processing error");
    }
});

module.exports = router;
