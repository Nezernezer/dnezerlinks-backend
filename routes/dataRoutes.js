// routes/dataRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/buy', async (req, res) => {
    const { uid, phone, dataPlan, networkID, amount, pin } = req.body;

    // Validate required fields
    if (!uid || !phone || !dataPlan || !networkID || !amount || !pin) {
        return res.status(400).json({ success: false, error: "Missing required request data." });
    }

    const purchaseAmount = parseFloat(amount);
    const userRef = db.ref(`users/${uid}`);

    try {
        // 1. Fetch user profile
        const snap = await userRef.once('value');
        const userData = snap.val();

        if (!userData) {
            return res.status(404).json({ success: false, error: "User profile not found." });
        }

        // 2. PIN Security Validation
        const savedPin = String(userData.transaction_pin || userData.pin || '');
        if (String(pin) !== savedPin) {
            return res.status(401).json({ success: false, error: "Incorrect Transaction PIN!" });
        }

        // 3. Balance Verification
        const currentBalance = parseFloat(userData.balance || 0);
        if (currentBalance < purchaseAmount) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // 4. Generate unique request-id (required by VTU Naija)
        const requestId = `\( {uid}- \){Date.now()}-${Math.floor(Math.random() * 1000000)}`;

        // 5. Call VTU Naija Data API
        try {
            const response = await axios.post(
                'https://vtunaija.com.ng/api/data/',
                {
                    network: String(networkID),
                    mobile_number: String(phone),
                    plan: String(dataPlan),
                    Ported_number: "true",
                    "request-id": requestId
                },
                {
                    headers: {
                        'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 35000
                }
            );

            // 6. Handle success
            if (response.data && (response.data.Status === "successful" || response.data.status === "success")) {

                await userRef.child('balance').transaction(currentBal => {
                    return (currentBal || 0) - purchaseAmount;
                });

                const txnRef = db.ref(`transactions/${uid}`).push();
                const txnId = txnRef.key;

                await txnRef.set({
                    transaction_id: txnId,
                    service: "Data Subscription",
                    phone: phone,
                    network: networkID,
                    amount: purchaseAmount,
                    plan_id: dataPlan,
                    type: "debit",
                    status: "successful",
                    timestamp: Date.now(),
                    reference: response.data.id || response.data.request_id || requestId || txnId,
                    description: `Data subscription for ${phone}`
                });

                console.log(`✅ Data subscription successful: ${dataPlan} to ${phone} (UID: ${uid})`);
                return res.json({
                    success: true,
                    message: "Data Subscription Successful",
                    transaction_id: txnId
                });

            } else {
                console.error("❌ VTU API Data Rejection:", response.data);
                return res.status(400).json({
                    success: false,
                    error: response.data.api_response || response.data.message || "VTU provider rejected request"
                });
            }

        } catch (apiError) {
            console.error("❌ Gateway Interchange Exception Pipeline:", apiError.message);

            if (apiError.response) {
                console.error("VTU Naija status:", apiError.response.status);
                console.error("VTU Naija response:", apiError.response.data);
            }

            if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
                return res.status(504).json({
                    success: false,
                    error: "VTU API timeout. Balance intact."
                });
            }

            const providerError = apiError.response?.data?.api_response
                || apiError.response?.data?.message
                || "Provider network handshake dropped. Balance intact.";

            return res.status(apiError.response?.status || 502).json({
                success: false,
                error: providerError
            });
        }

    } catch (e) {
        console.error("❌ System Core Pipeline Failure:", e.message);
        return res.status(500).json({
            success: false,
            error: "Internal Server Processing Error."
        });
    }
});

module.exports = router;
