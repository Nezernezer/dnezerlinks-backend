const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// NEW: Validation route (PIN-free)
router.post('/validate', async (req, res) => {
    const { iuc, providerID } = req.body;
    try {
        const token = process.env.VTUNAIJA_API_KEY?.trim();
        const vtuRes = await axios.post("https://vtunaija.com.ng/api/cablesub/verify/", {
            cablename: String(providerID),
            smart_card_number: String(iuc)
        }, {
            headers: { 'Authorization': `Token ${token}` }
        });

        if (vtuRes.data.status === 'success') {
            return res.json({ 
                success: true, 
                customerName: vtuRes.data.customer_name || "Valid Customer" 
            });
        } else {
            return res.json({ success: false });
        }
    } catch (error) {
        console.error("Validation Error:", error.message);
        return res.status(500).json({ success: false, error: "Validation failed" });
    }
});

// UPDATED: Original Payment Logic with VTUNAIJA integration
router.post('/pay', async (req, res) => {
    const { iuc, providerID, planID, amount, uid, pin } = req.body;

    try {
        const token = process.env.VTUNAIJA_API_KEY?.trim();
        const db = admin.database();
        const userRef = db.ref(`users/${uid}`);
        
        // Use req.user from gatekeeper or fetch manually as per your original code
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();

        if (!userData) return res.status(404).json({ success: false, error: "User not found" });

        // Maintain your original PIN security check
        const storedPin = userData.transaction_pin || userData.pin;
        if (String(storedPin) !== String(pin)) {
            return res.status(401).json({ success: false, error: "Incorrect Transaction PIN" });
        }

        const currentBalance = parseFloat(userData.balance || 0);
        const planCost = parseFloat(amount);

        // Maintain your original balance check
        if (currentBalance < planCost) {
            return res.status(400).json({ success: false, error: "Insufficient Wallet Balance" });
        }

        // VTUNAIJA Transaction Logic
        const vtuResponse = await axios.post("https://vtunaija.com.ng/api/cablesub/", {
            cablename: String(providerID),
            cableplan: String(planID),
            smart_card_number: String(iuc).trim()
        }, {
            headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
            timeout: 45000
        });

        if (vtuResponse.data.status === 'success') {
            const finalBalance = Math.round((currentBalance - planCost) * 100) / 100;
            await userRef.update({ balance: finalBalance });
            return res.json({ success: true });
        } else {
            return res.status(400).json({
                success: false,
                error: vtuResponse.data.msg || vtuResponse.data.api_response || "Provider Refused Transaction"
            });
        }
    } catch (error) {
        console.error("Backend Error:", error.message);
        return res.status(500).json({ success: false, error: "Server Transaction Error" });
    }
});

module.exports = router;
