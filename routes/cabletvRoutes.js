const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin'); // Ensure firebase-admin is initialized in your main index.js

// 1. VALIDATION ROUTE (Look up customer name)
router.post('/validate', async (req, res) => {
    const { iuc, providerID } = req.body;

    try {
        const token = process.env.VTUNAIJA_API_KEY ? process.env.VTUNAIJA_API_KEY.trim() : "";
        const url = "https://vtunaija.com.ng/api/cablesub/verify/";

        const response = await axios.post(url, {
            cablename: String(providerID),
            smart_card_number: String(iuc).trim()
        }, {
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.status === 'success') {
            res.json({
                success: true,
                customerName: response.data.Customer_Name || response.data.name
            });
        } else {
            res.json({
                success: false,
                error: response.data.api_response || "IUC/Smartcard number not valid"
            });
        }
    } catch (error) {
        console.error("VALIDATION ERROR:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Validation failed. Check connection." });
    }
});

// 2. PAYMENT ROUTE (Process the actual subscription)
router.post('/pay', async (req, res) => {
    const { iuc, providerID, cableplan, amount, uid, pin } = req.body;

    try {
        const token = process.env.VTUNAIJA_API_KEY ? process.env.VTUNAIJA_API_KEY.trim() : "";
        const db = admin.database();

        // A. Verify User and Check Balance/PIN in Firebase
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();

        if (!userData) return res.status(404).json({ success: false, error: "User not found" });
        
        // PIN Verification
        if (userData.transaction_pin !== pin) {
            return res.status(400).json({ success: false, error: "Invalid Transaction PIN" });
        }

        // Balance Check
        const balance = parseFloat(userData.wallet_balance || 0);
        const cost = parseFloat(amount);
        if (balance < cost) {
            return res.status(400).json({ success: false, error: "Insufficient Wallet Balance" });
        }

        // B. Call VTUNAIJA API
        const url = "https://vtunaija.com.ng/api/cablesub/";
        const vtuResponse = await axios.post(url, {
            cablename: String(providerID),
            cableplan: String(cableplan),
            smart_card_number: String(iuc).trim()
        }, {
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // C. Handle VTUNAIJA Response
        // Note: Check their API docs for exact success strings (e.g., 'success' or 'Transaction Successful')
        if (vtuResponse.data.status === 'success' || vtuResponse.data.status === 'Transaction Successful') {
            
            // D. Deduct money from wallet and record transaction
            await userRef.update({
                wallet_balance: balance - cost
            });

            // Log to Transactions history
            await db.ref(`transactions/${uid}`).push({
                type: 'Cable TV',
                amount: cost,
                iuc: iuc,
                status: 'Successful',
                date: new Date().toISOString()
            });

            res.json({
                success: true,
                message: "Subscription Successful!",
                data: vtuResponse.data
            });
        } else {
            res.status(400).json({
                success: false,
                error: vtuResponse.data.api_response || "Transaction Failed at Provider"
            });
        }

    } catch (error) {
        console.error("PAYMENT ERROR:", error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            error: "Network Error: API connection failed." 
        });
    }
});

module.exports = router;
