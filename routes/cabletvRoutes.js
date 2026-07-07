const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// 1. VALIDATION ROUTE (Detects Customer Name)
router.post('/validate', async (req, res) => {
    const { iuc, providerID } = req.body;

    console.log(`[VALIDATION ATTEMPT] IUC: ${iuc}, ProviderID: ${providerID}`);

    try {
        const token = process.env.VTUNAIJA_API_KEY?.trim();
        const vtuRes = await axios.post("https://vtunaija.com.ng/api/cablesub/verify/", {
            cablename: String(providerID),
            smart_card_number: String(iuc)
        }, {
            headers: { 'Authorization': `Token ${token}` },
            timeout: 20000 // Quick 20s validation threshold
        });

        console.log("Full VTU Response:", vtuRes.data);

        if (vtuRes.data.status === 'success') {
            const actualName = vtuRes.data.customer_name || vtuRes.data.name || vtuRes.data.customerName || "Invalid IUC/card number, please check and try again";
            console.log(`[SUCCESS] Found Customer: ${actualName}`);
            return res.json({ success: true, customerName: actualName });
        } else {
            console.log(`[FAILED] Provider rejected IUC: ${iuc}`);
            return res.json({ success: false });
        }
    } catch (error) {
        console.error("Validation Error Log:", error.response?.data || error.message);
        return res.status(500).json({ success: false, error: "Validation Service Error" });
    }
});

// 2. PAYMENT ROUTE (Upgraded with upfront atomic lock and 1-minute timeout tracking)
router.post('/pay', async (req, res) => {
    const { iuc, providerID, planID, amount, uid } = req.body; // PIN check removed to align with index.js architecture

    console.log(`[PAYMENT START] UserUID: ${uid}, IUC: ${iuc}, Plan: ${planID}, Price: ${amount}`);

    if (!uid || !iuc || !providerID || !planID || !amount) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const token = process.env.VTUNAIJA_API_KEY?.trim();
    const db = admin.database();
    const userRef = db.ref(`users/${uid}/balance`);
    const planCost = parseFloat(amount);

    // Generate unique push key EARLY before calling the gateway provider
    const txRef = db.ref(`transactions/${uid}`).push();
    const uniqueTxKey = txRef.key;

    // Helper map for clean dashboard UI display strings
    const providerNames = { '1': 'DSTV', '2': 'GOTV', '3': 'STARTIMES' };
    const providerText = providerNames[String(providerID)] || 'Cable TV';

    try {
        // 🔒 TRANSACTION WALLET LOCK: Deduct balance upfront to stop race condition double-spending
        let apiCallAllowed = false;
        await userRef.transaction((currentBalance) => {
            if (currentBalance === null || currentBalance < planCost) {
                return; // Cancel execution context safely if money is missing
            }
            apiCallAllowed = true;
            return Math.round((currentBalance - planCost) * 100) / 100;
        });

        if (!apiCallAllowed) {
            return res.status(400).json({ success: false, error: "Insufficient Wallet Balance" });   
        }

        console.log(`💳 CableTV Balance Locked: ₦${planCost} deducted from UID: ${uid}. Contacting provider infrastructure.`);

        // Fire VTU API with 1-minute tracking parameter mapping
        const vtuResponse = await axios.post("https://vtunaija.com.ng/api/cablesub/", {              
            cablename: String(providerID),
            cableplan: String(planID),
            smart_card_number: String(iuc).trim(),
            "request-id": uniqueTxKey // ⚡ Automation anchor passed to VTUNaija mapping logs
        }, {
            headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
            timeout: 60000 // 🕒 Timeout updated to 1 minute (60,000ms)
        });

        const apiStatus = String(vtuResponse.data.status || vtuResponse.data.Status || "").toLowerCase();

        // Log Clean Success State
        if (apiStatus === 'success' || apiStatus === 'successful') {
            console.log(`[PAYMENT SUCCESS] IUC ${iuc} successfully subscribed to Plan ${planID}`);

            await txRef.set({
                type: 'debit',
                service: 'Cable TV',
                description: `Successfully renewed ${providerText} Subscription`,
                phone: String(iuc).trim(),
                amount: planCost,
                status: 'successful', // Normalized lowercase 'successful' status format
                timestamp: Date.now(),
                date: new Date().toLocaleString(),
                reference: uniqueTxKey
            });

            return res.json({ success: true });
        } else {
            // Handle Direct Gateway Provider Rejections (Instant Automatic Balance Reversal)
            console.log(`[PAYMENT REJECTED] Status: ${vtuResponse.data.status}, Msg: ${vtuResponse.data.msg}`);
            
            await userRef.transaction(currentBalance => Math.round(((currentBalance || 0) + planCost) * 100) / 100);
            return res.status(400).json({
                success: false,
                error: vtuResponse.data.msg || "Provider Refused Transaction"
            });
        }
    } catch (error) {
        console.error(`⚠️ Cable TV Exception Handler Triggered: ${error.message}`);

        // Handle Heavy Handshake Overloading / Dropped Connections
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.message.includes('Network Error')) {
            try {
                // Keep the money locked, flag state node as 'pending' for automated engine execution
                await txRef.set({
                    type: 'debit',
                    service: 'Cable TV',
                    description: `${providerText} Subscription (Pending confirmation verification)`,
                    phone: String(iuc).trim(),
                    amount: planCost,
                    status: 'pending', // 📝 Kept pending for background reconciliation gatekeeper evaluation
                    timestamp: Date.now(),
                    date: new Date().toLocaleString(),
                    reference: uniqueTxKey
                });
                console.log(`📝 Gateway Sync Node Generated: Kept ₦${planCost} locked for verification tracking (${uniqueTxKey})`);
            } catch (dbErr) {
                console.error("❌ Failed to log pending transaction reference state node:", dbErr.message);
            }

            return res.status(504).json({ 
                success: false, 
                error: "Network timeout with cable provider. Your transaction status is being verified in the background." 
            });
        }

        // Local Server Parsing Fault / Crash Safety Fallback Recovery Loop
        await userRef.transaction(currentBalance => Math.round(((currentBalance || 0) + planCost) * 100) / 100);
        return res.status(500).json({ success: false, error: "Server Transaction Routing Failure. Wallet Returned Safely." });
    }
});

module.exports = router;
