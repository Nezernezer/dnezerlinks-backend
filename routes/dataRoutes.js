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

    try {
        // 1. Fetch user profile for security and balance validations
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        const userData = snap.val();

        if (!userData) {
            return res.status(404).json({ success: false, error: "User profile not found." });
        }

        // 2. PIN Security Validation
        const savedPin = String(userData.transaction_pin || userData.pin);
        if (String(pin) !== savedPin) {
            return res.status(401).json({ success: false, error: "Incorrect Transaction PIN!" });
        }

        // 3. User Balance Verification
        const currentBalance = parseFloat(userData.balance || 0);
        if (currentBalance < purchaseAmount) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // 4. Call VTUNAIJA API with a secure timeout
        try {
            const response = await axios.post('https://vtunaija.com.ng/api/data/', {
                network: networkID,
                mobile_number: phone,
                plan: dataPlan,
                Ported_number: "true"
            }, {
                headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` },
                timeout: 35000 // Safely absorbs API gateway spikes
            });

            // 5. Handle Provider Response
            if (response.data && response.data.Status === "successful") {
                
                // Deduct balance atomically (matching airtime's winning logic)
                await userRef.child('balance').transaction(currentBal => {
                    return (currentBal || 0) - purchaseAmount;
                });

                // Log transaction to the same uniform path: transactions/${uid}
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
                    reference: response.data.request_id || txnId,
                    description: `Data subscription for ${phone}`
                });

                console.log(`✅ Data subscription successful: ${dataPlan} to ${phone} (UID: ${uid})`);
                return res.json({ success: true, message: "Data Subscription Successful", transaction_id: txnId });

            } else {
                // API rejected transaction before any debit occurs
                console.error("❌ VTU API Data Rejection:", response.data);
                return res.status(400).json({ 
                    success: false, 
                    error: response.data.api_response || "VTU provider rejected request" 
                });
            }

        } catch (apiError) {
            console.error("❌ Gateway Interchange Exception Pipeline:", apiError.message);
            
            // Handle explicit network timeout drops
            if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
                return res.status(504).json({ success: false, error: "VTU API timeout. Balance intact." });
            }
            
            return res.status(502).json({ success: false, error: "Provider network handshake dropped. Balance intact." });
        }

    } catch (e) {
        console.error("❌ System Core Pipeline Failure:", e.message);
        return res.status(500).json({ success: false, error: "Internal Server Processing Error." });
    }
});

module.exports = router;
