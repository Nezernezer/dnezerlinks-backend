const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// Securely targets the environment variable you saved inside the Render dashboard panel
const MASTER_ADMIN_UID = process.env.MASTER_ADMIN_UID;

// Maps to: GET /api/admin/verify-status
router.get('/verify-status', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ isAdmin: false, error: "Missing authorization token." });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        const isMaster = decodedToken.uid === MASTER_ADMIN_UID;

        if (isMaster) {
            return res.status(200).json({ isAdmin: true });
        } else {
            return res.status(403).json({ isAdmin: false, message: "Standard account context." });
        }
    } catch (error) {
        console.error("Verification engine route error:", error);
        return res.status(500).json({ isAdmin: false, error: "Internal validation pipeline failure." });
    }
});

// Maps to: GET /api/admin/user  (Vtunaija)
router.get('/user', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing token" });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.uid !== MASTER_ADMIN_UID) {
            return res.status(403).json({ error: "Access Denied" });
        }

        const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
        if (!vtuKey) throw new Error("VTU key missing from Render variables layout");

        const vtuRes = await axios.get('https://vtunaija.com.ng/api/user/', {
            headers: { 'Authorization': `Token ${vtuKey}` },
            timeout: 10000
        });

        return res.status(200).json(vtuRes.data);

    } catch (err) {
        console.error("Intercepted System Error:", err.message);
        return res.status(200).json({ balance: "0.00", error: err.message });
    }
});

// ====================== MASTER PROVIDER BALANCES ======================

// GET /api/admin/balance/pairgate
router.get('/balance/pairgate', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing token" });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.uid !== MASTER_ADMIN_UID) {
            return res.status(403).json({ error: "Access Denied" });
        }

        const response = await axios.get('https://pairgate.com/api/v1/wallet/balance', {
            headers: {
                'Authorization': `Bearer ${process.env.PAIRGATE_API_KEY}`,
                'Cache-Control': 'no-cache',
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        const data = response.data;
        return res.json({
            success: true,
            balance: data?.data?.balance ?? 0,
            unit: data?.data?.currency || 'NGN'
        });

    } catch (err) {
        console.error("Pairgate balance error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/admin/balance/bulksmslive
router.get('/balance/bulksmslive', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing token" });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.uid !== MASTER_ADMIN_UID) {
            return res.status(403).json({ error: "Access Denied" });
        }

        const response = await axios.post('https://api.bulksmslive.com/v2/app/balance', {}, {
            headers: {
                'Authorization': `Bearer ${process.env.BULKSMSLIVE_API_KEY}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        const data = response.data;
        console.log("BulkSMSLive raw response:", JSON.stringify(data));

        // Correct field is "amount"
        const balance = data.amount 
                    ?? data.balance 
                    ?? data.Balance 
                    ?? data.units 
                    ?? 0;

        return res.json({
            success: true,
            balance: Number(balance) || 0,
            unit: 'SMS Units'
        });

    } catch (err) {
        console.error("BulkSMSLive balance error:", err.response?.data || err.message);
        return res.status(500).json({ 
            success: false, 
            error: err.response?.data || err.message 
        });
    }
});

// GET /api/admin/balance/wisepay
router.get('/balance/wisepay', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing token" });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.uid !== MASTER_ADMIN_UID) {
            return res.status(403).json({ error: "Access Denied" });
        }

        // Correct production URL (with /live)
        const response = await axios.post('https://wisepay.com.ng/api/live/v1/load/wallet-balance', {
            email: process.env.WISEPAY_EMAIL || ''
        }, {
            headers: {
                'Authorization': process.env.WISEPAY_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        const data = response.data;
        console.log("WisePay raw response:", JSON.stringify(data));

        const balance = data?.data?.product?.wallet 
                     ?? data?.data?.wallet 
                     ?? data?.wallet 
                     ?? data?.balance 
                     ?? 0;

        return res.json({
            success: true,
            balance: parseFloat(balance) || 0,
            unit: 'NGN'
        });

    } catch (err) {
        console.error("WisePay balance error:", err.response?.data || err.message);
        return res.status(500).json({ 
            success: false, 
            error: err.response?.data || err.message 
        });
    }
});

module.exports = router;
