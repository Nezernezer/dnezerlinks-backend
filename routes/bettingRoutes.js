// routes/bettingRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/fund', async (req, res) => {
    const { uid, customerID, amount, providerID } = req.body;

    // Validate required fields
    if (!uid || !customerID || !amount || !providerID) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const userRef = db.ref(`users/${uid}/balance`);
    const amountNum = parseFloat(amount);

    try {
        // 1. Check user wallet balance
        const snap = await userRef.once('value');
        const balance = snap.val() || 0;

        if (balance < amountNum) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // 2. Generate a unique reference ID for transaction idempotency
        const reference = `BET-${uid}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

        let apiSuccess = false;
        let responseData = null;

        // 3. Send request to Pairgate Betting API
        try {
            const response = await axios.post(
                'https://pairgate.com/api/v1/betting/purchase',
                {
                    provider_id: String(providerID),
                    customer_id: String(customerID),
                    amount: amountNum,
                    reference: reference
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.PAIRGATE_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    timeout: 30000
                }
            );

            if (response.data && (response.data.status === "success" || response.data.code === 200)) {
                apiSuccess = true;
                responseData = response.data;
            }
        } catch (apiError) {
            console.warn("⚠️ Pairgate betting API encountered an error or timeout:", apiError.message);
        }

        if (!apiSuccess) {
            throw new Error("Betting gateway connection failed or timed out. Please try again.");
        }

        // 4. Debit user balance on Firebase and record transaction log
        await userRef.transaction(currentBalance => {
            return (currentBalance || 0) - amountNum;
        });

        const txRef = db.ref(`transactions/${uid}`).push();
        await txRef.set({
            service: "Betting Funding",
            network: providerID,
            provider: providerID,
            recipient: customerID,
            phone: customerID,
            amount: amountNum,
            type: "debit",
            status: "successful",
            timestamp: Date.now(),
            reference: responseData.reference || responseData.id || reference,
            description: `Betting funding (${providerID}) for account ${customerID}`
        });

        console.log(`✅ Betting wallet funded successfully: ₦${amount} for ${customerID} [${providerID}] (UID: ${uid})`);
        return res.json({ success: true, message: "Betting Wallet Funded Successfully", data: responseData });

    } catch (error) {
        console.error("❌ Betting funding error:", error.message);

        if (error.response) {
            console.error("Provider error status:", error.response.status);
            console.error("Provider error response:", error.response.data);
        }

        const providerError = error.response?.data?.message
            || error.message
            || "API Connection Error";

        return res.status(error.response?.status || 500).json({
            success: false,
            error: providerError
        });
    }
});

module.exports = router;
