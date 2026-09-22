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

    // Network mapping
    // WisePay uses: 1=MTN, 2=GLO, 3=9MOBILE, 4=AIRTEL (same as VTU Naija)
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

        // ============================================
        // 3. TRY WISEPAY FIRST
        // ============================================
        let pinsGenerated = [];
        let providerUsed = null;
        let providerError = null;

        try {
            const wisePayKey = process.env.WISEPAY_API_KEY?.trim();
            
            if (!wisePayKey) {
                throw new Error("WISEPAY_API_KEY not configured");
            }

            const wiseResponse = await axios.post(
                'https://wisepay.com.ng/api/v1/topup/recharge-card',
                {
                    network: apiNetworkId,
                    denomination: String(parsedAmt),
                    quantity: String(parsedQty),
                    reference: requestId
                },
                {
                    headers: {
                        'Authorization': wisePayKey,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 60000
                }
            );

            const data = wiseResponse.data || {};

            if (data.status === true && data.code === 200 && data.data?.pins) {
                // Success from WisePay
                pinsGenerated = data.data.pins.map(item => ({
                    pin: String(item.pin || '').trim(),
                    serial: String(item.sn || item.serial || 'N/A').trim()
                })).filter(p => p.pin !== "");

                if (pinsGenerated.length > 0) {
                    providerUsed = "WisePay";
                } else {
                    throw new Error("WisePay returned empty pins");
                }
            } else {
                throw new Error(data.data?.message || data.message || "WisePay rejected the request");
            }

        } catch (wiseError) {
            console.error("🔥 WisePay failed:", wiseError.message);
            if (wiseError.response) {
                console.error("WisePay status:", wiseError.response.status);
                console.error("WisePay response:", wiseError.response.data);
            }
            providerError = wiseError.response?.data?.data?.message 
                || wiseError.response?.data?.message 
                || wiseError.message;
        }

        // ============================================
        // 4. FALLBACK TO VTU NAIJA IF WISEPAY FAILED
        // ============================================
        if (!providerUsed) {
            try {
                const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
                
                if (!vtuKey) {
                    throw new Error("VTUNAIJA_API_KEY not configured");
                }

                // Note: VTU Naija requires min qty 10
                if (parsedQty < 10) {
                    throw new Error(`VTU Naija requires minimum quantity of 10 (you requested ${parsedQty})`);
                }

                const vtuResponse = await axios.post(
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
                            'Authorization': `Token ${vtuKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 60000
                    }
                );

                const data = vtuResponse.data || {};
                const apiStatus = String(data.status || data.Status || "").toLowerCase();

                if (apiStatus !== 'success' && apiStatus !== 'successful') {
                    throw new Error(data.api_response || data.message || data.msg || 'VTU Naija rejected request');
                }

                // Parse pins
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

                pinsGenerated = pinStringArray
                    .map((pinCode, index) => ({
                        pin: String(pinCode).trim(),
                        serial: serialStringArray[index] ? String(serialStringArray[index]).trim() : 'N/A'
                    }))
                    .filter(p => p.pin !== "");

                if (pinsGenerated.length === 0) {
                    throw new Error("VTU Naija returned empty pins");
                }

                providerUsed = "VTU Naija";

            } catch (vtuError) {
                console.error("🔥 VTU Naija also failed:", vtuError.message);
                
                // Both providers failed → Refund
                await userRef.child('balance').transaction((currentBal) => {
                    const currentNumericBal = currentBal === null ? 0 : Number(currentBal);
                    return currentNumericBal + totalCost;
                });

                const finalError = providerError 
                    ? `WisePay: ${providerError} | VTU Naija: ${vtuError.message}`
                    : vtuError.message;

                return res.status(502).json({
                    success: false,
                    error: `${finalError}. Your funds have been auto-refunded.`
                });
            }
        }

        // ============================================
        // 5. SUCCESS - Log transaction
        // ============================================
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
            network: network,
            provider: providerUsed
        });

        return res.status(200).json({
            success: true,
            message: `PINs Generated Successfully via ${providerUsed}!`,
            pins: pinsGenerated,
            network: network,
            amount: parsedAmt,
            brandName: finalBrandValue,
            provider: providerUsed
        });

    } catch (rootError) {
        console.error("Critical System failure:", rootError);
        return res.status(500).json({ success: false, error: 'Internal server operations failed.' });
    }
});

module.exports = router;
