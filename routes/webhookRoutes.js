const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    // 1. DEBUG: Log all headers to find the exact key name
    console.log("--- WEBHOOK REQUEST RECEIVED ---");
    console.log("ALL HEADERS:", JSON.stringify(req.headers, null, 2));

    // 2. Automated Key Discovery
    // We search the headers object for any key containing 'billstack' or 'signature'
    const headerKeys = Object.keys(req.headers);
    const signatureKey = headerKeys.find(key => 
        key.toLowerCase().includes('billstack') && key.toLowerCase().includes('signature')
    );
    
    const signature = signatureKey ? req.headers[signatureKey] : null;
    const secret = process.env.BILLSTACK_SECRET_KEY;

    // 3. Error handling
    if (!signature) {
        console.error("DEBUG ERROR: No signature header found. Available headers:", headerKeys);
        return res.status(401).send('Missing signature');
    }

    if (!secret) {
        console.error("DEBUG ERROR: BILLSTACK_SECRET_KEY is undefined in environment variables.");
        return res.status(500).send('Server configuration error');
    }

    try {
        // 4. HMAC Verification using the raw body
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(req.body);
        const expectedSignature = hmac.digest('hex');

        // 5. Constant-time comparison
        const sigBuffer = Buffer.from(signature, 'utf8');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

        if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            console.error("SECURITY ALERT: Signature mismatch!");
            return res.status(401).send('Invalid signature');
        }

        // 6. Process Payment
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
