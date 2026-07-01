// routes/airtimeRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

router.post('/buy', async (req, res) => {
    const { uid, phone, amount, networkID } = req.body;

    // 1. Strict Request Validation
    if (!uid || !phone || !amount || !networkID) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const db = admin.database();
    const userRef = db.ref(`users/${uid}/balance`);
    const amountNum = parseFloat(amount);
    
    // 2. Pre-generate the exact Firebase push reference for tracking
    const txRef = db.ref(`transactions/${uid}`).push();
    const uniqueTxKey = txRef.key; 

    try {
        // 🔒 LOCK TRANSACTION: Check balance and debit user UPFRONT to prevent double-spending
        let apiCallAllowed = false;
        
        await userRef.transaction((currentBalance) => {
            if (currentBalance === null || currentBalance < amountNum) {
                return; // Cancel transaction if balance is insufficient
            }
            apiCallAllowed = true;
            return currentBalance - amountNum;
        });

        if (!apiCallAllowed) {
            return res.status(400).json({ success: false, error: "Api connection error" });
        }

        console.log(`💳 Debit Locked: ₦${amountNum} deducted from UID: ${uid}. Initiating provider call...`);

        // 3. Call VTU API with your required payload structure and tracking parameter
        const response = await axios.post(
            'https://vtunaija.com.ng/api/topup/',
            {
                network: networkID,
                mobile_number: phone,
                amount: amount,
                airtime_type: "VTU",
                Ported_number: "true",
                "request-id": uniqueTxKey // ⚡ Sent to VTUNaija so code can look it up automatically
            },
            {
                headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` },
                timeout: 45000  // 45 Seconds provider window
            }
        );

        const apiStatus = String(response.data.Status || response.data.status || "").toLowerCase();

        // 4. Handle Successful Execution
        if (apiStatus === "successful" || apiStatus === "success") {
            await txRef.set({
                service: "Airtime Purchase",
                network: networkID,
                phone: phone,
                amount: amountNum,
                type: "debit",
                status: "successful",
                timestamp: Date.now(),
                reference: uniqueTxKey, 
                description: `Successfully purchased ${amount} Airtime for ${phone}`
            });

            return res.json({ success: true, message: "Airtime Successful" });
        }

        // 5. Handle Known Provider Failures (Refund immediately if provider rejects cleanly)
        console.error("❌ VTU Provider rejected request:", response.data);
        
        await userRef.transaction(currentBalance => (currentBalance || 0) + amountNum);
        return res.status(400).json({
            success: false,
            error: response.data.api_response || "VTU provider failed to complete request"
        });

    } catch (error) {
        console.error("⚠️ Airtime Purchase Exception Handler Active:", error.message);
        
        // 6. Handle Network Hangs / Midway Timeouts
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.message.includes('Network Error')) {
            try {
                // Keep the money debited, log as pending. Gatekeeper will handle checkout or refund automatically.
                await txRef.set({
                    service: "Airtime Purchase",
                    network: networkID,
                    phone: phone,
                    amount: amountNum,
                    type: "debit",
                    status: "pending", 
                    timestamp: Date.now(),
                    reference: uniqueTxKey, 
                    description: `Airtime purchase for ${phone} (Pending background reconciliation)`
                });
            } catch (dbErr) {
                console.error("❌ Failed to commit pending node state to Firebase:", dbErr.message);
            }
            
            return res.status(504).json({ 
                success: false, 
                error: "Network timeout with provider. Your transaction status is being verified in the background." 
            });
        }
        
        // 7. Handle System Connection/Route Crashes (Safe Instant Refund)
        await userRef.transaction(currentBalance => (currentBalance || 0) + amountNum);
        return res.status(500).json({ success: false, error: "System routing failure. Balance safely returned." });
    }
});

module.exports = router;
