// routes/webhookRoutes.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-wiaxy-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature) {
        console.error("❌ Missing signature header");
        return res.status(401).send('Missing signature');
    }

    // Log raw body and signature for debugging
    const rawBody = req.body;
    const rawBodyString = rawBody.toString('utf8');
    console.log("📦 Raw body received:", rawBodyString);
    console.log("🔑 Received signature:", signature);
    console.log("🔐 Secret (first 4 chars):", secret ? secret.substring(0,4)+'****' : 'MISSING');

    // Try multiple HMAC combinations
    const combos = [
        { algo: 'sha256', encoding: 'hex', label: 'SHA256-hex' },
        { algo: 'sha256', encoding: 'base64', label: 'SHA256-base64' },
        { algo: 'sha1', encoding: 'hex', label: 'SHA1-hex' },
        { algo: 'sha1', encoding: 'base64', label: 'SHA1-base64' }
    ];

    let verified = false;
    for (const combo of combos) {
        const hmac = crypto.createHmac(combo.algo, secret);
        hmac.update(rawBody);
        const computed = hmac.digest(combo.encoding);
        console.log(`⚙️ ${combo.label}:`, computed);
        if (computed.toLowerCase() === signature.toLowerCase()) {
            verified = true;
            console.log(`✅ Signature matched with ${combo.label}`);
            break;
        }
    }

    if (!verified) {
        console.error("❌ Signature mismatch!");
        return res.status(401).send('Invalid signature');
    }

    // Process event
    try {
        const eventData = JSON.parse(rawBodyString);
        const { event, data } = eventData;

        if (event === 'PAYMENT_NOTIFICATION') {
            const { amount, merchant_reference } = data;
            const uid = merchant_reference;
            if (!uid) {
                console.error("Missing merchant_reference (UID)");
                return res.status(400).send("Missing UID");
            }

            // Atomically credit balance
            const userBalanceRef = db.ref(`users/${uid}/balance`);
            await userBalanceRef.transaction(currentBalance => {
                return (currentBalance || 0) + amount;
            });

            console.log(`✅ Credited ${amount} to user ${uid}`);
            return res.status(200).send("Processed");
        }

        return res.status(200).send("Event acknowledged");
    } catch (e) {
        console.error("Error processing event:", e);
        return res.status(400).send("Error processing event");
    }
});

module.exports = router;
