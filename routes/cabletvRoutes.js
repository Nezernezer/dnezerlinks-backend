const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// 1. VALIDATION ROUTE (Detects Customer Name)
router.post('/validate', async (req, res) => {
    const { iuc, providerID } = req.body;
    
    // Log details to Render immediately
    console.log(`[VALIDATION ATTEMPT] IUC: ${iuc}, ProviderID: ${providerID}`);

    try {
        const token = process.env.VTUNAIJA_API_KEY?.trim();
        const vtuRes = await axios.post("https://vtunaija.com.ng/api/cablesub/verify/", {
            cablename: String(providerID),
            smart_card_number: String(iuc)
        }, {
            headers: { 'Authorization': `Token ${token}` }
        });

        // This log helps you see the FULL API response in Render
        console.log("Full VTU Response:", vtuRes.data);

        if (vtuRes.data.status === 'success') {
            // Check all possible name fields to avoid "Valid Customer" fallback
            const actualName = vtuRes.data.customer_name || vtuRes.data.name || vtuRes.data.customerName || "Valid Customer";
            
            console.log(`[SUCCESS] Found Customer: ${actualName}`);
            return res.json({ success: true, customerName: actualName });
        } else {
            console.log(`[FAILED] Provider rejected IUC: ${iuc}`);
            return res.json({ success: false });
        }
    } catch (error) {
        console.error("Validation Error Log:", error.response?.data || error.message);
        return res.status(500).json({ success: false, error: "Validation Service Error" });
    }
});

// 2. PAYMENT ROUTE (Full Detailed Logs)
router.post('/pay', async (req, res) => {
    const { iuc, providerID, planID, amount, uid, pin } = req.body;

    // Log full customer and transaction details for Render
    console.log(`[PAYMENT START] UserUID: ${uid}, IUC: ${iuc}, Plan: ${planID}, Price: ${amount}`);

    try {
        const token = process.env.VTUNAIJA_API_KEY?.trim();
        const db = admin.database();
        const userRef = db.ref(`users/${uid}`);
        
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();

        if (!userData) return res.status(404).json({ success: false, error: "User not found" });

        const storedPin = userData.transaction_pin || userData.pin;
        if (String(storedPin) !== String(pin)) {
            return res.status(401).json({ success: false, error: "Incorrect Transaction PIN" });
        }

        const currentBalance = parseFloat(userData.balance || 0);
        const planCost = parseFloat(amount);

        if (currentBalance < planCost) {
            return res.status(400).json({ success: false, error: "Insufficient Wallet Balance" });
        }

        const vtuResponse = await axios.post("https://vtunaija.com.ng/api/cablesub/", {
            cablename: String(providerID),
            cableplan: String(planID),
            smart_card_number: String(iuc).trim()
        }, {
            headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' },
            timeout: 45000
        });

        if (vtuResponse.data.status === 'success') {
            console.log(`[PAYMENT SUCCESS] IUC ${iuc} successfully subscribed to Plan ${planID}`);
            const finalBalance = Math.round((currentBalance - planCost) * 100) / 100;
            await userRef.update({ balance: finalBalance });
            return res.json({ success: true });
        } else {
            console.log(`[PAYMENT REJECTED] Status: ${vtuResponse.data.status}, Msg: ${vtuResponse.data.msg}`);
            return res.status(400).json({
                success: false,
                error: vtuResponse.data.msg || "Provider Refused Transaction"
            });
        }
    } catch (error) {
        console.error(`[CRITICAL ERROR] IUC: ${iuc}, Error: ${error.message}`);
        if (error.response) {
            console.error("Provider Raw Error Data:", error.response.data);
        }
        return res.status(500).json({ success: false, error: "Server Transaction Error" });
    }
});

module.exports = router;
