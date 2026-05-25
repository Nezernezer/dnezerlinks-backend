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

    try {
        // 1. Check balance
        const userRef = db.ref(`users/${uid}/balance`);
        const snap = await userRef.once('value');
        const balance = snap.val() || 0;
        const amountNum = parseFloat(amount);

        if (balance < amountNum) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // 2. Call VTU API with a timeout (e.g., 30 seconds)
        const response = await axios.post(
            'https://vtunaija.com.ng/api/topup/',
            {
                network: networkID,
                mobile_number: phone,
                amount: amount,
                airtime_type: "VTU",
                Ported_number: "true"
            },
            {
                headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` },
                timeout: 30000  // 30 seconds timeout
            }
        );

        // 3. Handle response
        if (response.data.Status === "successful") {
            // Deduct balance atomically
            await userRef.transaction(currentBalance => {
                return (currentBalance || 0) - amountNum;
            });

            // Log transaction only once
            const txRef = db.ref(`transactions/${uid}`).push();
            await txRef.set({
                service: "Airtime Purchase",
                network: networkID,
                phone: phone,
                amount: amountNum,
                type: "debit",
                status: "successful",
                timestamp: Date.now(),
                reference: response.data.request_id || txRef.key,
                description: `Airtime purchase for ${phone}`
            });

            console.log(`✅ Airtime bought: ${amount} to ${phone} (UID: ${uid})`);
            return res.json({ success: true, message: "Airtime Successful" });
        }

        // VTU API returned failure
        console.error("VTU API error:", response.data);
        return res.status(400).json({
            success: false,
            error: response.data.api_response || "VTU provider failed"
        });

    } catch (error) {
        console.error("Airtime purchase error:", error.message);
        // Handle timeout or network errors
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ success: false, error: "VTU API timeout" });
        }
        return res.status(500).json({ success: false, error: "API Connection Error" });
    }
});

module.exports = router;
