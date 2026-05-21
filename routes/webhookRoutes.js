const express = require('express');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', async (req, res) => {
    try {
        const payload = req.body;
        console.log(`[Webhook] Received event: ${payload.event}`);

        // SCENARIO 1: Standard Card Charge
        if (payload.event === 'charge.success') {
            await processCredit(payload.data.customer.email, (payload.data.amount / 100) * 0.98, payload.data.id, res);
        } 
        // SCENARIO 2: Reserved Account/Bank Transfer (Wiaxy Payload)
        else if (payload.event === 'PAYMENT_NOTIFICATION') {
            await processCreditByRef(payload.data.merchant_reference, parseFloat(payload.data.amount) * 0.98, payload.data.reference, res);
        } else {
            res.status(200).send("Event ignored");
        }
    } catch (error) {
        console.error("Webhook Error:", error.message);
        res.status(200).send("Handled"); // Always 200 to stop retries
    }
});

// Helper for Email-based credits
async function processCredit(email, amount, txId, res) {
    const txRef = db.ref(`processed_transactions/${txId}`);
    if ((await txRef.once('value')).exists()) return res.status(200).send("Duplicate");

    const userQuery = await db.ref('users').orderByChild('email').equalTo(email.toLowerCase().trim()).once('value');
    const userData = userQuery.val();
    
    if (userData) {
        const uid = Object.keys(userData)[0];
        await db.ref(`users/${uid}/balance`).transaction(bal => (bal || 0) + amount);
        await txRef.set({ uid, amount, timestamp: Date.now() });
        res.status(200).send("Success");
    } else {
        res.status(404).send("User not found");
    }
}

// Helper for Merchant Ref-based credits
async function processCreditByRef(merchantRef, amount, txId, res) {
    const txRef = db.ref(`processed_transactions/${txId}`);
    if ((await txRef.once('value')).exists()) return res.status(200).send("Duplicate");

    const userQuery = await db.ref('users').orderByChild('merchant_reference').equalTo(merchantRef).once('value');
    const userData = userQuery.val();
    
    if (userData) {
        const uid = Object.keys(userData)[0];
        await db.ref(`users/${uid}/balance`).transaction(bal => (bal || 0) + amount);
        await txRef.set({ uid, amount, timestamp: Date.now() });
        res.status(200).send("Success");
    } else {
        res.status(404).send("User not found");
    }
}

module.exports = router;
