const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/buy', async (req, res) => {
    const { uid, phone, dataPlan, networkID, amount } = req.body;
    try {
        const userRef = db.ref(`users/${uid}/balance`);
        const snap = await userRef.once('value');
        const balance = snap.val() || 0;

        if (balance < parseFloat(amount)) return res.status(400).json({ success: false, error: "Insufficient Balance" });

        const response = await axios.post('https://vtunaija.com.ng/api/data/', {
            network: networkID,
            mobile_number: phone,
            plan: dataPlan,
            Ported_number: "true"
        }, {
            headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` }
        });

        if (response.data.Status === "successful") {
            await userRef.transaction(c => c - parseFloat(amount));
            const txRef = db.ref(`transactions/${uid}`).push(); 
            await txRef.set({ 
                service: "Data Bundle", 
                network: networkID, 
                phone: phone, 
                amount: amount, 
                type: "debit", 
                status: "successful", 
                timestamp: Date.now(), 
                reference: response.data.request_id || txRef.key, 
                description: `Data purchase for ${phone}` 
            });
            return res.json({ success: true, message: "Data Successful" });
        }
        res.status(400).json({ success: false, error: response.data.api_response || "Failed" });
    } catch (e) { res.status(500).json({ success: false, error: "API Connection Error" }); }
});
module.exports = router;
