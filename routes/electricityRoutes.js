const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// VTUNAIJA DISCO MAPPER
const discoIdMap = {
    'AEDC': 1, 'BEDC': 2, 'EEDC': 3, 'EKEDC': 4,
    'IBEDC': 5, 'IKEDC': 6, 'JEDC': 7, 'KAEDCO': 8,
    'KEDCO': 9, 'PHEDC': 10, 'YEDC': 11
};

// 🔌 METER VALIDATION - Fixed to match your curl
router.post('/validate-meter', async (req, res) => {
    try {
        const { meterNumber, disco } = req.body;
        if (!meterNumber || !disco) {
            return res.status(400).json({ status: 'error', error: 'Missing parameters' });
        }

        const discoId = discoIdMap[disco];
        if (!discoId) {
            return res.status(400).json({ status: 'error', error: 'Unsupported Disco' });
        }

        const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
        if (!vtuKey) {
            return res.status(500).json({ status: 'error', error: 'API Key not configured' });
        }

        const response = await axios.post(
            'https://vtunaija.com.ng/api/billpayment/verify/',
            {
                disco_name: String(discoId),     // As in your curl
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
                customer: response.data.Customer_Name || response.data.name || response.data.customer || 'Verified Customer'
            });
        } else {
            return res.status(400).json({
                status: 'error',
                error: response.data?.api_response || response.data?.message || 'Invalid meter'
            });
        }
    } catch (err) {
        console.error("Validation Error:", err.response?.data || err.message);
        
        if (err.code === 'ECONNREFUSED' || err.message.includes('connect')) {
            return res.status(503).json({ 
                status: 'error', 
                error: 'VTUNAIJA service is currently offline' 
            });
        }
        
        return res.status(500).json({ 
            status: 'error', 
            error: 'Verification failed. Please try again.' 
        });
    }
});

// 💳 PAYMENT ENDPOINT
router.post('/pay', async (req, res) => {
    try {
        const { uid, meterNumber, amount, tokenType, disco } = req.body;
        if (!uid || !meterNumber || !amount || !disco || !tokenType) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }

        const discoId = discoIdMap[disco];
        if (!discoId) return res.status(400).json({ success: false, error: 'Invalid Disco' });

        const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
        if (!vtuKey) return res.status(500).json({ success: false, error: 'API Key missing' });

        // Wallet deduction
        const userRef = admin.database().ref(`users/${uid}`);
        let success = false;
        await userRef.child('balance').transaction((bal) => {
            if (bal == null || bal < amount) return;
            success = true;
            return bal - amount;
        });

        if (!success) return res.status(400).json({ success: false, error: 'Insufficient balance' });

        // Payment request
        const payload = {
            disco_name: String(discoId),
            meter_number: String(meterNumber),
            MeterType: tokenType.toLowerCase(),
            amount: String(amount)
        };

        const vtuRes = await axios.post('https://vtunaija.com.ng/api/billpayment/', payload, {
            headers: {
                'Authorization': `Token ${vtuKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 25000
        });

        if (vtuRes.data && (vtuRes.data.status === 'success' || vtuRes.data.Status === 'successful')) {
            return res.status(200).json({
                success: true,
                token: vtuRes.data.electricitytoken || vtuRes.data.token
            });
        } else {
            // Refund on failure
            await userRef.child('balance').transaction(bal => (bal || 0) + Number(amount));
            return res.status(400).json({ 
                success: false, 
                error: vtuRes.data?.api_response || 'Payment rejected by provider' 
            });
        }
    } catch (err) {
        console.error("Payment Error:", err.message);
        return res.status(500).json({ success: false, error: 'Payment gateway error' });
    }
});

module.exports = router;
