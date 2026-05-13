const express = require('express');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', async (req, res) => {
    try {
        const { event, data } = req.body;
        console.log(`[Webhook] Event Received: ${event}`);

        if (event === 'charge.success') {
            const email = data.customer.email.toLowerCase().trim();
            const rawAmount = data.amount / 100; // Convert kobo to Naira
            const creditAmount = rawAmount * 0.98; // Deduct 2% fee

            console.log(`[Webhook] Processing ${email} - Amount: ₦${rawAmount}`);

            // Search for user by email (case-insensitive)
            const userQuery = await db.ref('users')
                .orderByChild('email')
                .equalTo(email)
                .once('value');

            const userData = userQuery.val();

            if (userData) {
                const uid = Object.keys(userData)[0];
                
                // Use a transaction to update the balance safely
                await db.ref(`users/${uid}/balance`).transaction((currentBalance) => {
                    return (currentBalance || 0) + creditAmount;
                });

                console.log(`[Webhook] Successfully credited UID: ${uid} with ₦${creditAmount}`);
            } else {
                console.warn(`[Webhook] Failed: No user found with email ${email}`);
            }
        }
        
        // Always send 200 OK to Billstack to stop retries
        res.sendStatus(200);

    } catch (error) {
        console.error("[Webhook Error]:", error.message);
        // We still send 200 if we caught the error to prevent Billstack from spamming retries
        res.status(200).send("Error handled");
    }
});

module.exports = router;
