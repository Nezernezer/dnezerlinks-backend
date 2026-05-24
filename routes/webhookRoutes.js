const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-wiaxy-signature'];
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature) return res.status(401).send('Missing signature');

    // HMAC Verification
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(req.body);
    const expectedSignature = hmac.digest('hex');

    if (signature !== expectedSignature) {
        console.error("Signature Mismatch!");
        return res.status(401).send('Invalid signature');
    }

    try {
        const eventData = JSON.parse(req.body.toString('utf8'));
        const { event, data } = eventData;

        if (event === 'PAYMENT_NOTIFICATION') {
            const { amount, merchant_reference } = data;
            // Add your logic here to find the user and update the balance
            console.log(`Successfully processed ${merchant_reference} for ${amount}`);
            return res.status(200).send("Processed");
        }
        
        return res.status(200).send("Event acknowledged");
    } catch (e) {
        console.error("Parsing Error:", e);
        return res.status(400).send("Parsing error");
    }
});

module.exports = router;
