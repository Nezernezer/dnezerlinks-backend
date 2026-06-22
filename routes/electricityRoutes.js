const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// 🗺️ VTUNAIJA PLAN DISCO MAPPER MAPPINGS
const discoIdMap = {
    'AEDC': 1,
    'BEDC': 2,
    'EEDC': 3,
    'EKEDC': 4,
    'IBEDC': 5,
    'IKEDC': 6,
    'JEDC': 7,
    'KAEDCO': 8,
    'KEDCO': 9,
    'PHEDC': 10,
    'YEDC': 11
};

// 🔌 METER VALIDATION ENDPOINT
router.post('/validate-meter', async (req, res) => {
    try {
        const { meterNumber, disco } = req.body;
        if (!meterNumber || !disco) {
            return res.status(400).json({ status: 'error', error: 'Missing parameters' });
        }

        const discoId = discoIdMap[disco];
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
                meter_number: String(meterNumber)
            },
            {
                headers: { 
                    'Authorization': `Token ${vtuKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        if (response.data && (response.data.status === 'success' || response.data.Status === 'successful')) {
            return res.status(200).json({
                status: 'success',
                customer: response.data.Customer_Name || response.data.name || 'Verified Customer'
            });
        } else {
            return res.status(400).json({
                status: 'error',
                error: response.data.api_response || 'Meter validation failed'
            });
        }

    } catch (err) {
        console.error("Meter Validation Error:", err.response?.data || err.message);
        return res.status(500).json({ status: 'error', error: 'Verification system offline' });
    }
});

// 💳 DISCO BILL PAYMENT ENDPOINT
router.post('/pay', async (req, res) => {
    try {
        const { uid, meterNumber, amount, tokenType, disco } = req.body;

        if (!uid || !meterNumber || !amount || !disco || !tokenType) {
            return res.status(400).json({ success: false, error: 'Missing payment fields' });
        }

        const discoId = discoIdMap[disco];
        if (!discoId) {
            return res.status(400).json({ success: false, error: 'Unsupported Disco selection' });
        }

        const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
        if (!vtuKey) {
            return res.status(500).json({ success: false, error: 'Gateway configuration missing' });
        }

        const userRef = admin.database().ref(`users/${uid}`);
        let balanceUpdateSuccess = false;

        await userRef.child('balance').transaction((currentBal) => {
            if (currentBal === null || currentBal < amount) return; 
            balanceUpdateSuccess = true;
            return currentBal - amount;
        });

        if (!balanceUpdateSuccess) {
            return res.status(400).json({ success: false, error: 'Insufficient Wallet Balance' });
        }

        try {
            const vtuPayload = {
                disco_name: String(discoId),
                meter_number: String(meterNumber),
                MeterType: tokenType.toLowerCase(),
                amount: String(amount)
            };

            const vtuRes = await axios.post('https://vtunaija.com.ng/api/billpayment/', vtuPayload, {
                headers: {
                    'Authorization': `Token ${vtuKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 25000
            });

            if (vtuRes.data && (vtuRes.data.status === 'success' || vtuRes.data.Status === 'successful')) {
                return res.status(200).json({
                    success: true,
                    token: vtuRes.data.electricitytoken || vtuRes.data.token || null
                });
            } else {
                // Reverse transaction balance if VTU fails explicitly
                await userRef.child('balance').transaction(currentBal => (currentBal || 0) + amount);
                return res.status(400).json({
                    success: false,
                    error: vtuRes.data.api_response || 'Provider rejected processing request'
                });
            }

        } catch (apiErr) {
            // Reverse transaction balance on timeout drops
            await userRef.child('balance').transaction(currentBal => (currentBal || 0) + amount);
            console.error("VTUNAIJA Payment Hook Connection failed:", apiErr.response?.data || apiErr.message);
            return res.status(500).json({ success: false, error: 'External billing gateway timeout' });
        }

    } catch (err) {
        return res.status(500).json({ success: false, error: 'Internal system routing anomaly' });
    }
});

module.exports = router;
