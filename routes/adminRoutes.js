const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

const MASTER_ADMIN_UID = "VCSNLSzYV2WsNG93mPE2ZtwdTna2";

// This will now maps flawlessly to: /api/admin/user
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
