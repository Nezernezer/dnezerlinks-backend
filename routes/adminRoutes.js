const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

const MASTER_ADMIN_UID = process.env.MASTER_ADMIN_UID;

// Helper: verify master admin
async function verifyMaster(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: "Missing token" });
        return null;
    }

    try {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (decodedToken.uid !== MASTER_ADMIN_UID) {
            res.status(403).json({ error: "Access Denied" });
            return null;
        }
        return decodedToken;
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
        return null;
    }
}

// ====================== VERIFY STATUS ======================
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

// ====================== VTUNAIJA (works) ======================
router.get('/user', async (req, res) => {
    try {
        const user = await verifyMaster(req, res);
        if (!user) return;

        const vtuKey = process.env.VTUNAIJA_API_KEY?.trim();
        if (!vtuKey) throw new Error("VTU key missing from Render variables");

        const vtuRes = await axios.get('https://vtunaija.com.ng/api/user/', {
            headers: { 'Authorization': `Token ${vtuKey}` },
            timeout: 10000
        });

        return res.status(200).json(vtuRes.data);

    } catch (err) {
        console.error("Vtunaija error:", err.message);
        return res.status(200).json({ balance: "0.00", error: err.message });
    }
});

// ====================== PAIRGATE ======================
router.get('/balance/pairgate', async (req, res) => {
    try {
        const user = await verifyMaster(req, res);
        if (!user) return;

        const apiKey = process.env.PAIRGATE_API_KEY?.trim();
        if (!apiKey) throw new Error("PAIRGATE_API_KEY missing");

        const response = await axios.get('https://pairgate.com/api/v1/wallet/balance', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            timeout: 12000
        });

        const data = response.data;
        const balance = data?.data?.balance ?? data?.balance ?? 0;

        return res.json({
            success: true,
            balance: Number(balance) || 0,
            unit: 'NGN'
        });

    } catch (err) {
        console.error("Pairgate balance error:", err.response?.data || err.message);
        return res.status(500).json({
            success: false,
            error: err.response?.data?.message || err.message
        });
    }
});

// ====================== BULKSMSLIVE ======================
router.get('/balance/bulksmslive', async (req, res) => {
    try {
        const user = await verifyMaster(req, res);
        if (!user) return;

        const apiKey = process.env.BULKSMSLIVE_API_KEY?.trim();
        if (!apiKey) throw new Error("BULKSMSLIVE_API_KEY missing");

        const response = await axios.post('https://api.bulksmslive.com/v2/app/balance', {}, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        const data = response.data;
        console.log("BulkSMSLive raw:", JSON.stringify(data));

        const balance = data.amount
            ?? data.balance
            ?? data.Balance
            ?? data.units
            ?? data.data?.balance
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

// ====================== WISEPAY ======================
router.get('/balance/wisepay', async (req, res) => {
    try {
        const user = await verifyMaster(req, res);
        if (!user) return;

        const apiKey = process.env.WISEPAY_API_KEY?.trim();
        const email = process.env.WISEPAY_EMAIL?.trim();

        if (!apiKey) throw new Error("WISEPAY_API_KEY missing");
        if (!email) throw new Error("WISEPAY_EMAIL missing");

        const response = await axios.post(
            'https://wisepay.com.ng/api/live/v1/load/wallet-balance',
            { email },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 15000
            }
        );

        const data = response.data;
        console.log("WisePay raw:", JSON.stringify(data));

        const balance = data?.data?.product?.wallet
            ?? data?.data?.wallet
            ?? data?.wallet
            ?? data?.balance
            ?? data?.data?.balance
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
