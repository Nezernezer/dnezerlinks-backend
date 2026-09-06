// routes/electricityRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// VTU Naija DISCO IDs (confirm AEDC/BEDC/etc on your VTU Naija dashboard if needed)
const discoIdMap = {
    'IKEDC': '1',
    'EKEDC': '2',
    'KEDCO': '3',
    'PHEDC': '4',
    'JEDC': '5',
    'IBEDC': '6',
    'KAEDCO': '7',
    'AEDC': '8',
    'BEDC': '9',
    'EEDC': '10',
    'YEDC': '11'
};

// 🔌 VALIDATE METER
router.post('/validate-meter', async (req, res) => {
    try {
        const { meterNumber, disco } = req.body;

        if (!meterNumber || !disco) {
            return res.status(400).json({ status: 'error', error: 'Missing parameters' });
        }

        const discoKey = String(disco).toUpperCase();
        const discoId = discoIdMap[discoKey];
        if (!discoId) {
            return res.status(400).json({ status: 'error', error: 'Unsupported Disco type' });
        }

        const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
        if (!vtuKey) {
            return res.status(500).json({ status: 'error', error: 'Gateway configuration missing' });
        }

        console.log(`[METER VALIDATE] disco=\( {discoKey} id= \){discoId} meter=${meterNumber}`);

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
                timeout: 20000,
                validateStatus: () => true
            }
        );

        const data = response.data || {};
        console.log('[METER VALIDATE RESPONSE]', response.status, JSON.stringify(data));

        const apiStatus = String(data.status || data.Status || '').toLowerCase();
        const apiMsg = String(data.api_response || data.message || data.msg || '').toLowerCase();

        const isSuccess =
            (response.status >= 200 && response.status < 300) &&
            (
                apiStatus === 'success' ||
                apiStatus === 'successful' ||
                apiMsg.includes('successfully') ||
                apiMsg.includes('name gotten')
            );

        let customerName =
            data.Customer_Name ||
            data.customer_Name ||
            data.customer_name ||
            data.name ||
            data.Name ||
            data.customer ||
            data.Customer ||
            null;

        if (!customerName && data.Full_Details) {
            try {
                const details = typeof data.Full_Details === 'string'
                    ? JSON.parse(data.Full_Details)
                    : data.Full_Details;
                customerName = details.Customer_Name || details.customer_name || details.name || null;
            } catch (e) {
                // ignore
            }
        }

        if (isSuccess && customerName && String(customerName).trim() !== '') {
            return res.status(200).json({
                status: 'success',
                customer: String(customerName).trim(),
                address: data.Customer_Address || data.address || ''
            });
        }

        if (isSuccess && !customerName) {
            return res.status(400).json({
                status: 'error',
                error: 'Provider verified meter but did not return customer name. Check DISCO ID mapping on VTU Naija.'
            });
        }

        return res.status(400).json({
            status: 'error',
            error: data.api_response || data.message || data.msg || 'Meter validation failed'
        });

    } catch (err) {
        console.error('Meter Validation Error:', err.response?.data || err.message);
        return res.status(err.response?.status || 500).json({
            status: 'error',
            error: err.response?.data?.api_response ||
                err.response?.data?.message ||
                err.message ||
                'Verification service unavailable'
        });
    }
});

// 💳 PAY ELECTRICITY
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
    const balanceRef = db.ref(`users/${uid}/balance`);
    const requestId = `\( {uid}- \){Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    try {
        let balanceUpdateSuccess = false;
        await balanceRef.transaction((currentBal) => {
            if (currentBal === null || Number(currentBal) < payAmount) return;
            balanceUpdateSuccess = true;
            return Math.round((Number(currentBal) - payAmount) * 100) / 100;
        });

        if (!balanceUpdateSuccess) {
            return res.status(400).json({ success: false, error: 'Insufficient Wallet Balance' });
        }

        try {
            const vtuRes = await axios.post(
                'https://vtunaija.com.ng/api/billpayment/',
                {
                    disco_name: String(discoId),
                    meter_number: String(meterNumber).trim(),
                    MeterType: String(tokenType).toLowerCase(),
                    amount: String(payAmount),
                    'request-id': requestId
                },
                {
                    headers: {
                        'Authorization': `Token ${vtuKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000,
                    validateStatus: () => true
                }
            );

            console.log('[ELECTRICITY PAY RESPONSE]', vtuRes.status, JSON.stringify(vtuRes.data));

            const data = vtuRes.data || {};
            const apiStatus = String(data.status || data.Status || '').toLowerCase();

            if (
                vtuRes.status >= 200 &&
                vtuRes.status < 300 &&
                (apiStatus === 'success' || apiStatus === 'successful')
            ) {
                const tokenValue = data.electricitytoken || data.token || data.Token || null;

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
                    token: tokenValue,
                    reference: requestId,
                    amount: payAmount,
                    disco: disco,
                    meterNumber: String(meterNumber).trim(),
                    meterType: tokenType,
                    date: new Date().toLocaleString()
                });
            }

            // Refund on reject
            await balanceRef.transaction(currentBal =>
                Math.round((Number(currentBal || 0) + payAmount) * 100) / 100
            );

            return res.status(400).json({
                success: false,
                error: data.api_response || data.message || data.msg || 'Provider rejected request'
            });
        } catch (apiErr) {
            await balanceRef.transaction(currentBal =>
                Math.round((Number(currentBal || 0) + payAmount) * 100) / 100
            );

            console.error('VTUNAIJA Payment Error:', apiErr.response?.data || apiErr.message);

            return res.status(apiErr.response?.status || 500).json({
                success: false,
                error: apiErr.response?.data?.api_response ||
                    apiErr.response?.data?.message ||
                    'External billing gateway error. Funds refunded.'
            });
        }
    } catch (err) {
        console.error('Electricity pay error:', err.message);
        return res.status(500).json({ success: false, error: 'Internal system routing anomaly' });
    }
});

module.exports = router;
