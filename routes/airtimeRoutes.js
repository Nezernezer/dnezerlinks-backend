// routes/airtimeRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/buy', async (req, res) => {
    const { uid, phone, amount, networkID } = req.body;

    // Validate required fields
    if (!uid || !phone || !amount || !networkID) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const userRef = db.ref(`users/${uid}/balance`);
    const amountNum = parseFloat(amount);

    try {
        // 1. Check user balance
        const snap = await userRef.once('value');
        const balance = snap.val() || 0;

        if (balance < amountNum) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // 2. Generate a unique request ID for gateway tracking
        const requestId = `${uid}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

        let vtuSuccess = false;
        let responseData = null;

        // 3. Try VTU Naija API first
        try {
            const response = await axios.post(
                'https://vtunaija.com.ng/api/topup/',
                {
                    network: String(networkID),
                    mobile_number: String(phone),
                    amount: String(amount),
                    airtime_type: "VTU",
                    Ported_number: "true",
                    "request-id": requestId
                },
                {
                    headers: {
                        'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            if (response.data.Status === "successful" || response.data.status === "success") {
                vtuSuccess = true;
                responseData = response.data;
            }
        } catch (vtuError) {
            console.warn("⚠️ VTU Naija failed or timed out. Switching to WisePay fallback...", vtuError.message);
        }

        // 4. Fallback to WisePay API if VTU Naija failed
        if (!vtuSuccess) {
            console.log("🔄 Attempting WisePay API fallback...");
            
            const wisePayResponse = await axios.post(
                'https://wisepay.com.ng/api/v1/airtime', // Update endpoint URL if your specific integration path differs
                {
                    network: String(networkID),
                    phone: String(phone),
                    amount: String(amount),
                    request_id: requestId
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.WISEPAY_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            if (wisePayResponse.data && (wisePayResponse.data.status === "success" || wisePayResponse.data.success)) {
                responseData = wisePayResponse.data;
            } else {
                throw new Error(wisePayResponse.data?.message || "WisePay provider fallback failed");
            }
        }

        // 5. Debit user balance and log successful transaction on Firebase
        await userRef.transaction(currentBalance => {
            return (currentBalance || 0) - amountNum;
        });

        const txRef = db.ref(`transactions/${uid}`).push();
        await txRef.set({
            service: "Airtime Purchase",
            network: networkID,
            phone: phone,
            amount: amountNum,
            type: "debit",
            status: "successful",
            timestamp: Date.now(),
            reference: responseData.id || responseData.request_id || responseData.reference || requestId || txRef.key,
            description: `Airtime purchase for ${phone}`
        });

        console.log(`✅ Airtime processed successfully: ${amount} to ${phone} (UID: ${uid})`);
        return res.json({ success: true, message: "Airtime Successful" });

    } catch (error) {
        console.error("❌ Airtime purchase processing error:", error.message);

        if (error.response) {
            console.error("Provider error status:", error.response.status);
            console.error("Provider error response:", error.response.data);
        }

        const providerError = error.response?.data?.api_response
            || error.response?.data?.message
            || error.message
            || "API Connection Error";

        return res.status(error.response?.status || 500).json({
            success: false,
            error: providerError
        });
    }
});

module.exports = router;
s
