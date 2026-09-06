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
        // 1. Check balance
        const snap = await userRef.once('value');
        const balance = snap.val() || 0;

        if (balance < amountNum) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // 2. Generate unique request-id (required by VTU Naija)
        const requestId = `\( {Date.now()} \){Math.floor(Math.random() * 100000)}`;

        // 3. Call VTU Naija API
        const response = await axios.post(
            'https://vtunaija.com.ng/api/topup/',
            {
                network: String(networkID),       // must be "1", "2", "3" or "4"
                mobile_number: String(phone),
                amount: String(amount),
                airtime_type: "VTU",
                Ported_number: "true",
                "request-id": requestId           // REQUIRED
            },
            {
                headers: {
                    'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 50000
            }
        );

        // 4. Handle success
        if (response.data.Status === "successful" || response.data.status === "success") {
            // Deduct balance atomically
            await userRef.transaction(currentBalance => {
                return (currentBalance || 0) - amountNum;
            });

            // Log transaction
            const txRef = db.ref(`transactions/${uid}`).push();
            await txRef.set({
                service: "Airtime Purchase",
                network: networkID,
                phone: phone,
                amount: amountNum,
                type: "debit",
                status: "successful",
                timestamp: Date.now(),
                reference: response.data.id || response.data.request_id || requestId || txRef.key,
                description: `Airtime purchase for ${phone}`
            });

            console.log(`✅ Airtime bought: ${amount} to ${phone} (UID: ${uid})`);
            return res.json({ success: true, message: "Airtime Successful" });
        }

        // VTU API returned failure
        console.error("VTU API error:", response.data);
        return res.status(400).json({
            success: false,
            error: response.data.api_response || response.data.message || "VTU provider failed"
        });

    } catch (error) {
        console.error("Airtime purchase error:", error.message);

        // Log the real response from VTU Naija if available
        if (error.response) {
            console.error("VTU Naija status:", error.response.status);
            console.error("VTU Naija response:", error.response.data);
        }

        // Handle timeout
        if (error.code === 'ECONNABORTED') {
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
                status: "pending",
                timestamp: Date.now(),
                reference: txRef.key,
                description: `Airtime purchase for ${phone} (Timed out - Pending)`
            });

            console.log(`⏳ Airtime timed out after 50s. Logged as pending: ${amount} (UID: ${uid})`);
            return res.status(504).json({
                success: false,
                error: "VTU API timeout. Transaction marked as pending."
            });
        }

        // Return provider error message if available
        const providerError = error.response?.data?.api_response 
            || error.response?.data?.message 
            || "API Connection Error";

        return res.status(error.response?.status || 500).json({
            success: false,
            error: providerError
        });
    }
});

module.exports = router;
