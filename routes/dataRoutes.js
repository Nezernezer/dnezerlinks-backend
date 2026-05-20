const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/buy', async (req, res) => {
    const { uid, phone, dataPlan, networkID, amount, pin } = req.body;
    
    try {
        // 1. Validate Balance
        const userRef = db.ref(`users/${uid}/balance`);
        const snap = await userRef.once('value');
        if ((snap.val() || 0) < parseFloat(amount)) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // 2. Request to VTUNaija (10s timeout added)
        const response = await axios.post('https://vtunaija.com.ng/api/data/', {
            network: networkID,
            mobile_number: phone,
            plan: dataPlan,
            Ported_number: "true"
        }, {
            headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` },
            timeout: 10000 
        });

        if (response.data.Status === "successful") {
            await userRef.transaction(c => c - parseFloat(amount));
            return res.json({ success: true, message: "Data Successful" });
        } else {
            return res.status(400).json({ success: false, error: response.data.api_response || "Provider Error" });
        }
    } catch (e) {
        console.error("❌ Purchase System Error:", e.message);
        return res.status(500).json({ success: false, error: "API Connection Error" });
    }
});

module.exports = router;
