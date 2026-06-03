const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Ensure body parser reads raw payload as buffer for precise HMAC validation
router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    // Express normalizes headers to lowercase. Check both variants just in case.
    const signature = req.headers['x-wiaxy-signature'] || req.headers['x-billstack-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature || !secret) {
        console.error("❌ Missing signature or secret key from incoming webhook header.");
        return res.status(401).send('Unauthorized');
    }

    try {
        // 1. Generate HMAC-SHA256 hash using the raw Buffer data
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(req.body);
        const expectedSignature = hmac.digest('hex');

        // 2. Clean and normalize the strings to lowercase before converting to buffers
        const incomingSigClean = signature.trim().toLowerCase();
        const expectedSigClean = expectedSignature.trim().toLowerCase();

        const sigBuffer = Buffer.from(incomingSigClean, 'utf-8');
        const expBuffer = Buffer.from(expectedSigClean, 'utf-8');

        // 3. Timing-safe comparison to prevent side-channel timing attacks
        if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
            console.error("❌ Signature mismatch!");
            console.log("Headers Received Signature:", incomingSigClean);
            console.log("Backend Computed Signature:", expectedSigClean);
            return res.status(401).send('Invalid signature');
        }

        // 4. Process valid event payload safely
        const eventData = JSON.parse(req.body.toString('utf8'));
        console.log("✅ Webhook verified successfully:", eventData.event);

        if (eventData.event === 'PAYMENT_NOTIFICATION') {
            const { amount, merchant_reference } = eventData.data;

            // Extract user UID from reference (e.g., if format is "VA_UID_TIMESTAMP")
            let uid = merchant_reference;
            if (merchant_reference.startsWith('VA_')) {
                const parts = merchant_reference.split('_');
                uid = parts[1]; // Grabs the middle UID token string cleanly
            }

            console.log(`💰 Funding wallet for user reference: ${uid} with Amount: ₦${amount}`);

            // Use atomical database transaction to update client wallet balance safely
            await db.ref(`users/${uid}/balance`).transaction((currentBalance) => {
                return (parseFloat(currentBalance) || 0) + parseFloat(amount);
            });

            return res.status(200).send("Processed");
        }

        return res.status(200).send("Event acknowledged");

    } catch (e) {
        console.error("🔥 Webhook processing error:", e.message);
        return res.status(400).send("Parsing error");
    }
});

module.exports = router;
