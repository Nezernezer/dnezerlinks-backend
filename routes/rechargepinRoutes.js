// routes/rechargepinRoutes.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const axios = require('axios');

// Handles: POST /api/rechargepin/generate
router.post('/generate', async (req, res) => {
    const { uid, network, amount, qty, brandName } = req.body;

    const parsedAmt = parseFloat(amount);
    const parsedQty = parseInt(qty);
    const totalCost = parsedAmt * parsedQty;
    const finalBrandValue = brandName || "Dnezerlinks";

    // Validate payload
    if (!uid || !network || isNaN(parsedAmt) || isNaN(parsedQty) || parsedQty < 1) {
        return res.status(400).json({ success: false, error: 'Invalid payload details.' });
    }

    const apiKey = process.env.VTUNAIJA_API_KEY?.trim();
    if (!apiKey) {
        console.error("🔥 Environment Variable 'VTUNAIJA_API_KEY' is missing on Render!");
        return res.status(500).json({ success: false, error: 'Server configuration error.' });
    }

    // VTU Naija: 1=MTN, 2=GLO, 3=9MOBILE, 4=AIRTEL
    const networkMap = { 'MTN': '1', 'GLO': '2', '9MOBILE': '3', 'AIRTEL': '4' };
    const apiNetworkId = networkMap[String(network).toUpperCase()];

    if (!apiNetworkId) {
        return res.status(400).json({ success: false, error: 'Unsupported Network platform selected.' });
    }

    const db = admin.database();
    const userRef = db.ref(`users/${uid}`);
    const requestId = `\( {uid}- \){Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    try {
        // 1. Pre-check balance
        const balSnap = await userRef.child('balance').once('value');
        const liveServerBalance = balSnap.val();

        if (liveServerBalance === null) {
            return res.status(400).json({
                success: false,
                error: "Database configuration error: Balance node does not exist for this account."
            });
        }

        // 2. Deduct balance safely
        const transactionResult = await userRef.child('balance').transaction((currentBal) => {
            if (currentBal === null) {
                return Number(liveServerBalance) - totalCost;
            }

            const numericBalance = Number(currentBal);
            if (isNaN(numericBalance) || numericBalance < totalCost) {
                return; // abort
            }

            return numericBalance - totalCost;
        });

        if (!transactionResult.committed) {
            return res.status(400).json({
                success: false,
                error: `Insufficient Balance! Your wallet is less than ₦${totalCost.toLocaleString()}`
            });
        }

        // 3. Call VTU Naija
        try {
            const pinRequest = await axios.post(
                'https://vtunaija.com.ng/api/rechargepin/',
                {
                    network: apiNetworkId,
                    network_amount: String(parsedAmt),
                    quantity: String(parsedQty),
                    name_on_card: finalBrandValue,
                    "request-id": requestId
                },
                {
                    headers: {
                        'Authorization': `Token ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );

            const data = pinRequest.data || {};
            const apiStatus = String(data.status || data.Status || "").toLowerCase();

            if (apiStatus !== 'success' && apiStatus !== 'successful') {
                throw new Error(data.api_response || data.message || data.msg || 'Provider API Rejected Request');
            }

            // 4. Parse pins/serials
            let pinStringArray = [];
            let serialStringArray = [];

            if (typeof data.pin === 'string') {
                pinStringArray = data.pin.split(',');
            } else if (Array.isArray(data.pin)) {
                pinStringArray = data.pin;
            }

            if (typeof data.serial === 'string') {
                serialStringArray = data.serial.split(',');
            } else if (Array.isArray(data.serial)) {
                serialStringArray = data.serial;
            }

            const pinsGenerated = pinStringArray
                .map((pinCode, index) => ({
                    pin: String(pinCode).trim(),
                    serial: serialStringArray[index] ? String(serialStringArray[index]).trim() : 'N/A'
                }))
                .filter(p => p.pin !== "");

            // 5. Log transaction
            const txRef = db.ref(`transactions/${uid}`).push();
            await txRef.set({
                type: 'debit',
                service: 'Recharge PIN',
                description: `\( {network} ₦ \){parsedAmt} x ${parsedQty}`,
                amount: totalCost,
                status: 'successful',
                timestamp: Date.now(),
                date: new Date().toLocaleString(),
                reference: requestId,
                pins: pinsGenerated,
                brandName: finalBrandValue,
                network: network
            });

            return res.status(200).json({
                success: true,
                message: 'PINs Generated Successfully!',
                pins: pinsGenerated,
                network: network,
                amount: parsedAmt,
                brandName: finalBrandValue
            });

        } catch (apiError) {
            console.error("🔥 VTU Naija Connection Failure:", apiError.message);

            if (apiError.response) {
                console.error("VTU Naija status:", apiError.response.status);
                console.error("VTU Naija response:", apiError.response.data);
            }

            // Auto-refund
            await userRef.child('balance').transaction((currentBal) => {
                const currentNumericBal = currentBal === null ? 0 : Number(currentBal);
                return currentNumericBal + totalCost;
            });

            const providerError = apiError.response?.data?.api_response
                || apiError.response?.data?.message
                || apiError.response?.data?.msg
                || apiError.message
                || 'Provider service failed';

            return res.status(apiError.response?.status || 502).json({
                success: false,
                error: `${providerError}. Your funds have been auto-refunded.`
            });
        }

    } catch (rootError) {
        console.error("Critical System failure:", rootError);
        return res.status(500).json({ success: false, error: 'Internal server operations failed.' });
    }
});

module.exports = router;
