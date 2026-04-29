const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const VTU_BASE_URL = "https://vtunaija.com.ng/api";

// Profit calculation logic
function getProfit(base) {
    if (base < 5000) return 500;
    if (base < 15000) return 800;
    if (base < 30000) return 1300;
    return 2200;
}

// ====================== VALIDATE SMARTCARD ======================
router.post('/validate', async (req, res) => {
    const { iuc, providerID } = req.body;
    try {
        const response = await axios.post(`${VTU_BASE_URL}/cablesub/verify/`, {
            cablename: providerID.toString(),
            smart_card_number: iuc
        }, {
            headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` }
        });

        if (response.data.Status === "successful") {
            return res.json({ success: true, customerName: response.data.Customer_Name || response.data.name });
        }
        res.status(400).json({ success: false, error: response.data.api_response || "Invalid IUC" });
    } catch (e) {
        res.status(500).json({ success: false, error: "Validation Connection Error" });
    }
});

// ====================== SUBSCRIBE ======================
router.post('/buy', async (req, res) => {
    const { uid, iuc, providerID, planDetails, pin } = req.body;

    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        const userData = snap.val();

        if (!userData) return res.status(404).json({ success: false, error: "User not found" });

        // Security Checks
        if (userData.pin !== pin) return res.status(400).json({ success: false, error: "Invalid PIN" });
        
        const totalAmount = parseFloat(planDetails.total);
        const expectedTotal = parseFloat(planDetails.base) + getProfit(parseFloat(planDetails.base));

        // Integrity Check: Ensure price hasn't been tampered with on frontend
        if (totalAmount !== expectedTotal) {
            return res.status(400).json({ success: false, error: "Security Alert: Price Mismatch" });
        }

        if ((userData.balance || 0) < totalAmount) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // Call VTUNAIJA
        const response = await axios.post(`${VTU_BASE_URL}/cablesub/`, {
            cablename: providerID,
            cableplan: planDetails.vtu_id,
            smart_card_number: iuc
        }, {
            headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` }
        });

        if (response.data.Status === "successful") {
            // Deduct Balance
            await db.ref(`users/${uid}/balance`).transaction(c => (c || 0) - totalAmount);

            // Log Transaction
            await db.ref(`transactions/${uid}`).push().set({
                service: `Cable TV (${planDetails.name})`,
                iuc: iuc,
                amount: totalAmount,
                type: "debit",
                status: "successful",
                timestamp: Date.now(),
                reference: response.data.request_id || Date.now().toString(),
                description: `${planDetails.name} subscription to ${iuc}`
            });

            return res.json({ success: true, message: "Subscription Successful" });
        }
        
        res.status(400).json({ success: false, error: response.data.api_response || "Provider Failed" });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: "API Connection Error" });
    }
});

module.exports = router;
