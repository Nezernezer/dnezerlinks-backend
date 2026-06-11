const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const axios = require('axios');

// Handles: POST /api/rechargepin/generate
router.post('/generate', async (req, res) => {
    // Destructure explicit fields safely sent from the frontend
    const { uid, network, amount, qty, brandName } = req.body;

    const parsedAmt = parseFloat(amount);
    const parsedQty = parseInt(qty);

    // Calculate total cost directly on the server to avoid missing parameter crashes
    const totalCost = parsedAmt * parsedQty;

    // Validate payload structure carefully
    if (!uid || !network || isNaN(parsedAmt) || isNaN(parsedQty) || parsedQty < 1) {
        return res.status(400).json({ success: false, error: 'Invalid payload details.' });
    }

    const apiKey = process.env.VTUNAIJA_API_KEY;
    if (!apiKey) {
        console.error("🔥 Environment Variable 'VTUNAIJA_API_KEY' is missing on Render!");
        return res.status(500).json({ success: false, error: 'Server configuration error.' });
    }

    const networkMap = { 'MTN': '1', 'GLO': '2', '9MOBILE': '3', 'AIRTEL': '4' };
    const apiNetworkId = networkMap[network.toUpperCase()];

    if (!apiNetworkId) {
        return res.status(400).json({ success: false, error: 'Unsupported Network platform selected.' });
    }

    const db = admin.database();
    const userRef = db.ref(`users/${uid}`);

    try {
        let orderStatus = false;
        let vtuResponseData = null;
        let dbRejectionReason = "Insufficient Balance";

        // Balance reduction logic with defensive parsing and explicit error unmasking
        const transactionResult = await userRef.child('balance').transaction((currentBal) => {
            if (currentBal === null) {
                dbRejectionReason = "Database path mismatch or configuration error (Server read balance as NULL)";
                return; // Aborts transaction
            }
            
            const numericBalance = Number(currentBal);
            const numericCost = Number(totalCost);

            if (isNaN(numericBalance) || numericBalance < numericCost) {
                dbRejectionReason = `Genuinely Insufficient Balance (Your wallet balance is ₦${numericBalance})`;
                return; // Aborts transaction
            }
            
            return numericBalance - numericCost;
        });

        // If transaction fails to commit, return the precise caught reason
        if (!transactionResult.committed) {
            return res.status(400).json({ 
                success: false, 
                error: `${dbRejectionReason}! You need ₦${totalCost.toLocaleString()}` 
            });
        }

        // Contact VTU NAIJA API using dynamic form properties
        try {
            const pinRequest = await axios.post('https://vtunaija.com.ng/api/rechargepin/', {
                network: apiNetworkId,
                network_amount: String(parsedAmt),
                quantity: String(parsedQty),
                name_on_card: brandName || "Dnezerlinks" // Dynamic fallback assignment
            }, {
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // Handle multiple response variance strings from VTU Naija's processing engine
            if (pinRequest.data && (
                pinRequest.data.status === 'success' ||
                pinRequest.data.Status === 'successful' ||
                pinRequest.data.status === 'successful'
            )) {
                orderStatus = true;
                vtuResponseData = pinRequest.data;
            } else {
                throw new Error(pinRequest.data.api_response || 'Provider API Rejected Request');
            }

        } catch (apiError) {
            console.error("🔥 VTU Naija Connection Failure:", apiError.message);

            // Auto-refund user using the exact processing totalCost if provider endpoint fails
            await userRef.child('balance').transaction((currentBal) => {
                const currentNumericBal = currentBal === null ? 0 : Number(currentBal);
                return currentNumericBal + totalCost;
            });

            return res.status(502).json({
                success: false,
                error: `Provider service failed. Your funds have been auto-refunded.`
            });
        }

        if (orderStatus) {
            // Extrapolate and parse array lists safely
            let pinStringArray = [];
            let serialStringArray = [];

            if (typeof vtuResponseData.pin === 'string') {
                pinStringArray = vtuResponseData.pin.split(',');
            }
            if (typeof vtuResponseData.serial === 'string') {
                serialStringArray = vtuResponseData.serial.split(',');
            }

            const pinsGenerated = pinStringArray.map((pinCode, index) => ({
                pin: pinCode.trim(),
                serial: serialStringArray[index] ? serialStringArray[index].trim() : 'N/A'
            })).filter(p => p.pin !== "");

            // Save transaction entry history
            const txRef = db.ref(`transactions/${uid}`).push();
            await txRef.set({
                type: 'Recharge PIN',
                service: `${network} (₦${parsedAmt} x ${parsedQty})`,
                amount: totalCost,
                date: new Date().toLocaleString(),
                status: "Successful",
                pins: pinsGenerated
            });

            return res.status(200).json({
                success: true,
                message: 'PINs Generated Successfully!',
                pins: pinsGenerated,
                network: network,
                amount: parsedAmt
            });
        }

    } catch (rootError) {
        console.error("Critical System failure:", rootError);
        return res.status(500).json({ success: false, error: 'Internal server operations failed.' });
    }
});

module.exports = router;
