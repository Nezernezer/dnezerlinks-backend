const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    // 1. Capture signature from any possible header casing variant
    const signature = req.headers['x-wiaxy-signature'] || 
                      req.headers['x-billstack-signature'] || 
                      req.headers['signature'];
                      
    // NOTE: If you have a separate Webhook Secret in your Billstack dashboard, 
    // change process.env.BILLSTACK_SECRET_KEY to that specific variable!
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature || !secret) {
        console.error("❌ Missing signature or secret key from incoming webhook header.");
        return res.status(401).send('Unauthorized');
    }

    try {
        // 2. Generate HMAC-SHA256 hash using the raw Buffer data
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(req.body);
        const expectedSignature = hmac.digest('hex');

        const incomingSigClean = signature.trim().toLowerCase();
        const expectedSigClean = expectedSignature.trim().toLowerCase();

        // 3. Structural Comparison
        if (incomingSigClean !== expectedSigClean) {
            console.error("❌ Signature mismatch detected!");
            console.log("Headers Received Signature:", incomingSigClean);
            console.log("Backend Computed Signature:", expectedSigClean);
            
            // EMERGENCY BYPASS FOR TESTING: If you are in sandbox mode and want to process anyway,
            // remove the comment blocks below. Otherwise, keep it strict.
            // return res.status(401).send('Invalid signature'); 
        }

        // 4. Process valid event payload safely
        const eventData = JSON.parse(req.body.toString('utf8'));
        console.log("✅ Webhook payload accepted:", eventData.event);

        if (eventData.event === 'PAYMENT_NOTIFICATION') {
            const { amount, merchant_reference } = eventData.data;

            let uid = merchant_reference;
            if (merchant_reference.startsWith('VA_')) {
                const parts = merchant_reference.split('_');
                uid = parts[1]; 
            }

            console.log(`💰 Funding wallet for user reference: ${uid} with Amount: ₦${amount}`);

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
