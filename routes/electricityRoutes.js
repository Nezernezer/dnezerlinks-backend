const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// 🔌 METER VALIDATION ENDPOINT
router.post('/validate-meter', async (req, res) => {
    try {
        const { meterNumber, disco } = req.body;
        if (!meterNumber || !disco) {
            return res.status(400).json({ status: 'error', error: 'Missing parameters' });
        }

        const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
        if (!vtuKey) {
            return res.status(500).json({ status: 'error', error: 'Gateway configuration missing' });
        }

        // Hit VTUNAIJA validation API
        const response = await axios.get(
            `https://vtunaija.com.ng/api/electricity-verify/?disco=${disco}&meter_number=${meterNumber}`,
            {
                headers: { 'Authorization': `Token ${vtuKey}` },
                timeout: 12000
            }
        );

        if (response.data && response.data.invalid === false) {
            return res.status(200).json({ 
                status: 'success', 
                customer: response.data.customer_name || 'Verified Customer' 
            });
        } else {
            return res.status(400).json({ 
                status: 'error', 
                error: response.data.error || 'Meter validation failed' 
            });
        }

    } catch (err) {
        console.error("Meter Validation Error:", err.message);
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

        const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
        if (!vtuKey) {
            return res.status(500).json({ success: false, error: 'Gateway configuration missing' });
        }

        // Verify balance inside a database transaction framework
        const userRef = admin.database().ref(`users/${uid}`);
        let balanceUpdateSuccess = false;

        await userRef.child('balance').transaction((currentBal) => {
            if (currentBal === null || currentBal < amount) return; // Abort if insufficient
            balanceUpdateSuccess = true;
            return currentBal - amount;
        });

        if (!balanceUpdateSuccess) {
            return res.status(400).json({ success: false, error: 'Insufficient Wallet Balance' });
        }

        // Balance deducted successfully -> Execute lookup payload order with VTUNAIJA
        try {
            const vtuPayload = {
                disco: disco,
                meter_number: meterNumber,
                MeterType: tokenType,
                amount: parseInt(amount)
            };

            const vtuRes = await axios.post('https://vtunaija.com.ng/api/electricity/', vtuPayload, {
                headers: { 
                    'Authorization': `Token ${vtuKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 25000
            });

            // Handle response format structures returned by VTUNAIJA status mappings
            if (vtuRes.data && (vtuRes.data.status === 'success' || vtuRes.data.status === 'Successful')) {
                return res.status(200).json({ 
                    success: true, 
                    token: vtuRes.data.token || vtuRes.data.main_token || null 
                });
            } else {
                // Reverse transaction balance if the API provider fails explicitly
                await userRef.child('balance').transaction(currentBal => (currentBal || 0) + amount);
                return res.status(400).json({ 
                    success: false, 
                    error: vtuRes.data.error || 'Provider rejected request' 
                });
            }

        } catch (apiErr) {
            // Reverse balance on network timeouts or breakdowns
            await userRef.child('balance').transaction(currentBal => (currentBal || 0) + amount);
            console.error("VTUNAIJA Electricity API Connection failed:", apiErr.message);
            return res.status(500).json({ success: false, error: 'External billing gateway timeout' });
        }

    } catch (err) {
        return res.status(500).json({ success: false, error: 'Internal system routing anomaly' });
    }
});

module.exports = router;

