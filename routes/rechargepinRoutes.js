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
        return res.status(400).json({ success: false, error: 'Invalid request. Please check your details.' });
    }

    // PairGate provider_id (lowercase slug)
    const pairgateNetworkMap = {
        'MTN': 'mtn',
        'AIRTEL': 'airtel',
        'GLO': 'glo',
        '9MOBILE': '9mobile'
    };
    const pairgateProviderId = pairgateNetworkMap[String(network).toUpperCase()];

    // WisePay network mapping (kept for fallback)
    // 1 = MTN, 2 = AIRTEL, 3 = GLO, 4 = 9MOBILE
    const wiseNetworkMap = {
        'MTN': '1',
        'AIRTEL': '2',
        'GLO': '3',
        '9MOBILE': '4'
    };
    const wiseNetworkId = wiseNetworkMap[String(network).toUpperCase()];

    if (!pairgateProviderId || !wiseNetworkId) {
        return res.status(400).json({ success: false, error: 'Unsupported network selected.' });
    }

    const db = admin.database();
    const userRef = db.ref(`users/${uid}`);
    const requestId = `${uid}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    try {
        // 1. Pre-check balance
        const balSnap = await userRef.child('balance').once('value');
        const liveServerBalance = balSnap.val();

        if (liveServerBalance === null) {
            console.error("Balance node missing for UID:", uid);
            return res.status(400).json({
                success: false,
                error: "Unable to process request at the moment. Please try again."
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
                error: `Insufficient Balance. You need ₦${totalCost.toLocaleString()}`
            });
        }

        // ============================================
        // 3. TRY PAIRGATE FIRST
        // ============================================
        let pinsGenerated = [];
        let providerUsed = null;
        let providerError = null;

        try {
            const pairgateKey = process.env.PAIRGATE_API_KEY?.trim();

            if (!pairgateKey) {
                throw new Error("PAIRGATE_API_KEY not configured");
            }

            const pairResponse = await axios.post(
                'https://pairgate.com/api/v1/epin/purchase',
                {
                    provider_id: pairgateProviderId,
                    quantity: parsedQty,
                    denomination: parsedAmt,
                    reference: requestId
                },
                {
                    headers: {
                        'Authorization': `Bearer ${pairgateKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 60000
                }
            );

            const data = pairResponse.data || {};

            if (
                (data.code === 200 || data.status === 'success' || data.status === true) &&
                data.data?.pins &&
                Array.isArray(data.data.pins)
            ) {
                pinsGenerated = data.data.pins.map(item => ({
                    pin: String(item.pin || '').trim(),
                    serial: String(item.serial || item.sn || 'N/A').trim()
                })).filter(p => p.pin !== "");

                if (pinsGenerated.length > 0) {
                    providerUsed = "PairGate";
                } else {
                    throw new Error("PairGate returned empty pins");
                }
            } else {
                throw new Error(data.message || data.data?.message || "PairGate rejected the request");
            }

        } catch (pairError) {
            console.error("🔥 PairGate failed:", pairError.message);
            if (pairError.response) {
                console.error("PairGate status:", pairError.response.status);
                console.error("PairGate response:", JSON.stringify(pairError.response.data, null, 2));
            }
            providerError = pairError.response?.data?.message
                || pairError.response?.data?.data?.message
                || pairError.message;
        }

        // ============================================
        // 4. FALLBACK TO WISEPAY IF PAIRGATE FAILED
        // ============================================
        if (!providerUsed) {
            try {
                const wisePayKey = process.env.WISEPAY_API_KEY?.trim();

                if (!wisePayKey) {
                    throw new Error("WISEPAY_API_KEY not configured");
                }

                const wiseResponse = await axios.post(
                    'https://wisepay.com.ng/api/live/v1/topup/recharge-card',
                    {
                        network: wiseNetworkId,
                        denomination: String(parsedAmt),
                        quantity: String(parsedQty),
                        reference: requestId
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${wisePayKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        timeout: 60000
                    }
                );

                const data = wiseResponse.data || {};

                if (data.status === true && data.code === 200 && data.data?.pins) {
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
                console.error("🔥 WisePay also failed:", wiseError.message);
                if (wiseError.response) {
                    console.error("WisePay status:", wiseError.response.status);
                    console.error("WisePay response:", JSON.stringify(wiseError.response.data, null, 2));
                }

                // Both providers failed → Refund
                await userRef.child('balance').transaction((currentBal) => {
                    const currentNumericBal = currentBal === null ? 0 : Number(currentBal);
                    return currentNumericBal + totalCost;
                });

                return res.status(502).json({
                    success: false,
                    error: "Unable to generate PINs at the moment. Your funds have been refunded. Please try again later."
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
            description: `${network} ₦${parsedAmt} x ${parsedQty}`,
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
            message: "PINs Generated Successfully!",
            pins: pinsGenerated,
            network: network,
            amount: parsedAmt,
            brandName: finalBrandValue
            // provider intentionally hidden from user
        });

    } catch (rootError) {
        console.error("Critical System failure:", rootError);
        return res.status(500).json({
            success: false,
            error: "Something went wrong. Please try again later."
        });
    }
});

module.exports = router;
