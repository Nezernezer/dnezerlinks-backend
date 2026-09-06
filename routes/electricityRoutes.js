// routes/electricityRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// VTU Naija DISCO IDs (from their official docs)
// Confirm any extra discos on your VTU Naija dashboard if needed
const discoIdMap = {
    'IKEDC': 1,   // Ikeja
    'EKEDC': 2,   // Eko
    'KEDCO': 3,   // Kano
    'PHEDC': 4,   // Port Harcourt (PHED)
    'JEDC': 5,    // Jos
    'IBEDC': 6,   // Ibadan
    'KAEDCO': 7,  // Kaduna (if enabled on your account)
    // Keep these only if VTU Naija lists them for your account:
    'AEDC': 8,
    'BEDC': 9,
    'EEDC': 10,
    'YEDC': 11
};

// 🔌 METER VALIDATION
router.post('/validate-meter', async (req, res) => {
    try {
        const { meterNumber, disco } = req.body;

        if (!meterNumber || !disco) {
            return res.status(400).json({ status: 'error', error: 'Missing parameters' });
        }

        const discoId = discoIdMap[String(disco).toUpperCase()];
        if (!discoId) {
            return res.status(400).json({ status: 'error', error: 'Unsupported Disco type' });
        }

        const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
        if (!vtuKey) {
            return res.status(500).json({ status: 'error', error: 'Gateway configuration missing' });
        }

        const response = await axios.post(
            'https://vtunaija.com.ng/api/billpayment/verify/',
            {
                disco_name: String(discoId),
                meter_number: String(meterNumber).trim()
            },
            {
                headers: {
                    'Authorization': `Token ${vtuKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );

        const apiStatus = String(response.data?.status || response.data?.Status || '').toLowerCase();

        if (apiStatus === 'success' || apiStatus === 'successful') {
            return res.status(200).json({
                status: 'success',
                customer: response.data.Customer_Name
                    || response.data.customer_name
                    || response.data.name
                    || 'Verified Customer'
            });
        }

        return res.status(400).json({
            status: 'error',
            error: response.data?.api_response || response.data?.message || 'Meter validation failed'
        });
    } catch (err) {
        console.error("Meter Validation Error:", err.response?.data || err.message);
        return res.status(500).json({
            status: 'error',
            error: 'Verification service unavailable. Please try again later.'
        });
    }
});

// 💳 ELECTRICITY PAYMENT
router.post('/pay', async (req, res) => {
    const { uid, meterNumber, amount, tokenType, disco } = req.body;

    if (!uid || !meterNumber || !amount || !disco || !tokenType) {
        return res.status(400).json({ success: false, error: 'Missing payment fields' });
    }

    const discoId = discoIdMap[String(disco).toUpperCase()];
    if (!discoId) {
        return res.status(400).json({ success: false, error: 'Unsupported Disco selection' });
    }

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount < 1000) {
        return res.status(400).json({ success: false, error: 'Minimum amount is ₦1,000' });
    }

    const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
    if (!vtuKey) {
        return res.status(500).json({ success: false, error: 'Gateway configuration missing' });
    }

    const db = admin.database();
    const userRef = db.ref(`users/${uid}`);
    const balanceRef = userRef.child('balance');
    const requestId = `\( {uid}- \){Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    try {
        // 1. Lock wallet
        let balanceUpdateSuccess = false;
        await balanceRef.transaction((currentBal) => {
            if (currentBal === null || Number(currentBal) < payAmount) return;
            balanceUpdateSuccess = true;
            return Math.round((Number(currentBal) - payAmount) * 100) / 100;
        });

        if (!balanceUpdateSuccess) {
            return res.status(400).json({ success: false, error: 'Insufficient Wallet Balance' });
        }

        // 2. Call VTU Naija
        try {
            const vtuPayload = {
                disco_name: String(discoId),
                meter_number: String(meterNumber).trim(),
                MeterType: String(tokenType).toLowerCase(), // prepaid | postpaid
                amount: String(payAmount),
                "request-id": requestId
            };

            const vtuRes = await axios.post(
                'https://vtunaija.com.ng/api/billpayment/',
                vtuPayload,
                {
                    headers: {
                        'Authorization': `Token ${vtuKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );

            const apiStatus = String(vtuRes.data?.status || vtuRes.data?.Status || '').toLowerCase();

            if (apiStatus === 'success' || apiStatus === 'successful') {
                const tokenValue = vtuRes.data.electricitytoken
                    || vtuRes.data.token
                    || null;

                // Log transaction
                const txRef = db.ref(`transactions/${uid}`).push();
                await txRef.set({
                    type: 'debit',
                    service: 'Electricity',
                    description: `${disco} ${tokenType} - Meter ${meterNumber}`,
                    phone: String(meterNumber).trim(),
                    amount: payAmount,
                    status: 'successful',
                    timestamp: Date.now(),
                    date: new Date().toLocaleString(),
                    reference: requestId,
                    token: tokenValue,
                    disco: disco
                });

                return res.status(200).json({
                    success: true,
                    token: tokenValue
                });
            }

            // Provider rejected — refund
            await balanceRef.transaction(currentBal =>
                Math.round((Number(currentBal || 0) + payAmount) * 100) / 100
            );

            return res.status(400).json({
                success: false,
                error: vtuRes.data?.api_response
                    || vtuRes.data?.message
                    || vtuRes.data?.msg
                    || 'Provider rejected processing request'
            });

        } catch (apiErr) {
            // Refund on API error
            await balanceRef.transaction(currentBal =>
                Math.round((Number(currentBal || 0) + payAmount) * 100) / 100
            );

            console.error("VTUNAIJA Payment Error:", apiErr.response?.data || apiErr.message);

            if (apiErr.response) {
                console.error("VTU Naija status:", apiErr.response.status);
                console.error("VTU Naija response:", apiErr.response.data);
            }

            const providerError = apiErr.response?.data?.api_response
                || apiErr.response?.data?.message
                || apiErr.response?.data?.msg
                || 'External billing gateway error. Funds refunded.';

            return res.status(apiErr.response?.status || 500).json({
                success: false,
                error: providerError
            });
        }
    } catch (err) {
        console.error("Electricity pay error:", err.message);
        return res.status(500).json({ success: false, error: 'Internal system routing anomaly' });
    }
});

module.exports = router;
