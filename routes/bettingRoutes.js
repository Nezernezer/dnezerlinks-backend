// routes/bettingRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/fund', async (req, res) => {
    const { uid, customerID, amount, providerID, pin } = req.body;

    // Validate required fields
    if (!uid || !customerID || !amount || !providerID) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const userRef = db.ref(`users/${uid}`);
    const amountNum = parseFloat(amount);

    try {
        // 1. Double check user balance and PIN verification securely on the backend
        const snap = await userRef.once('value');
        const userData = snap.val();

        if (!userData) {
            return res.status(404).json({ success: false, error: "User account not found" });
        }

        const balance = userData.balance || 0;
        const storedPin = userData.transaction_pin || userData.pin;

        if (pin && storedPin && String(pin) !== String(storedPin)) {
            return res.status(400).json({ success: false, error: "Incorrect Transaction PIN" });
        }

        if (balance < amountNum) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // 2. Generate a unique reference ID for transaction idempotency
        const reference = `BET-\( {uid}- \){Date.now()}-${Math.floor(Math.random() * 1000000)}`;

        let apiSuccess = false;
        let responseData = null;

        // 3. Send request to Pairgate Betting API
        // ✅ FIXED: correct endpoint is /bet/purchase  (not /betting/purchase)
        try {
            const response = await axios.post(
                'https://pairgate.com/api/v1/bet/purchase',
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

            if (response.data && (response.data.status === "success" || response.data.code === 200 || response.data.status === true)) {
                apiSuccess = true;
                responseData = response.data;
            }
        } catch (apiError) {
            console.warn("⚠️ Pairgate betting API encountered an error or timeout:", apiError.message);
            if (apiError.response) {
                console.warn("Provider status:", apiError.response.status);
                console.warn("Provider response:", JSON.stringify(apiError.response.data));
            }
        }

        if (!apiSuccess) {
            throw new Error("Betting gateway connection failed or timed out. Please try again.");
        }

        // 4. Debit user balance on Firebase and record transaction log atomically
        await userRef.child('balance').transaction(currentBalance => {
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
            reference: responseData?.data?.reference_code || responseData?.reference || responseData?.id || reference,
            description: `Betting funding (${providerID}) for account ${customerID}`
        });

        console.log(`✅ Betting wallet funded successfully: ₦${amount} for \( {customerID} [ \){providerID}] (UID: ${uid})`);
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
