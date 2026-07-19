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
        
        // Dynamic comparison check against Render's environment variable
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

// Maps to: GET /api/admin/user
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

module.exports = router;
