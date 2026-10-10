// routes/bettingRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

// ========== VERIFY BETTING ACCOUNT ==========
router.post('/verify', async (req, res) => {
    const { providerID, customerID } = req.body;

    if (!providerID || !customerID) {
        return res.status(400).json({ success: false, error: "Provider and Customer ID are required" });
    }

    try {
        const response = await axios.post(
            'https://pairgate.com/api/v1/bet/verify',
            {
                provider_id: String(providerID),
                customer_id: String(customerID)
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PAIRGATE_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                timeout: 20000
            }
        );

        const data = response.data;

        if (data && (data.status === "success" || data.code === 200) && data.data?.status === true) {
            return res.json({
                success: true,
                customer_name: data.data.customer_name || "Verified Customer"
            });
        }

        return res.status(400).json({
            success: false,
            error: data?.message || data?.data?.message || "Account not found or invalid"
        });

    } catch (error) {
        console.warn("⚠️ Pairgate verify error:", error.message);
        if (error.response) {
            console.warn("Status:", error.response.status, "Body:", JSON.stringify(error.response.data));
        }

        const msg = error.response?.data?.message
            || error.response?.data?.data?.message
            || "Could not verify account. Please try again.";

        return res.status(error.response?.status || 500).json({
            success: false,
            error: msg
        });
    }
});

// ========== FUND BETTING WALLET ==========
router.post('/fund', async (req, res) => {
    const { uid, customerID, amount, providerID, pin } = req.body;

    if (!uid || !customerID || !amount || !providerID) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const userRef = db.ref(`users/${uid}`);
    const amountNum = parseFloat(amount);

    try {
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

        const reference = `BET-\( {uid}- \){Date.now()}-${Math.floor(Math.random() * 1000000)}`;

        let apiSuccess = false;
        let responseData = null;

        try {
            const response = await axios.post(
                'https://pairgate.com/api/v1/bet/purchase',   // ✅ correct endpoint
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
            console.warn("⚠️ Pairgate betting API error:", apiError.message);
            if (apiError.response) {
                console.warn("Status:", apiError.response.status);
                console.warn("Body:", JSON.stringify(apiError.response.data));
            }
        }

        if (!apiSuccess) {
            throw new Error("Betting gateway connection failed or timed out. Please try again.");
        }

        // Debit balance
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
            reference: responseData?.data?.reference_code || responseData?.reference || reference,
            description: `Betting funding (${providerID}) for account ${customerID}`
        });

        console.log(`✅ Betting wallet funded: ₦${amount} → \( {customerID} [ \){providerID}] (UID: ${uid})`);
        return res.json({ success: true, message: "Betting Wallet Funded Successfully", data: responseData });

    } catch (error) {
        console.error("❌ Betting funding error:", error.message);
        if (error.response) {
            console.error("Provider status:", error.response.status);
            console.error("Provider response:", error.response.data);
        }

        const providerError = error.response?.data?.message || error.message || "API Connection Error";
        return res.status(error.response?.status || 500).json({
            success: false,
            error: providerError
        });
    }
});

module.exports = router;
