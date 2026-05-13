const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/fund', async (req, res) => {
    // Destructure phone from req.body
    const { uid, email, first_name, last_name, phone } = req.body;
    
    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        
        // If account already exists, just return it
        if (snap.val() && snap.val().account_number) {
            return res.json(snap.val());
        }

        // Call Billstack V2 API
        const response = await axios.post('https://api.billstack.co/v2/virtual-accounts',
            { 
                email: email, 
                first_name: first_name, 
                last_name: last_name, 
                phone: phone, 
                currency: "NGN" 
            },
            { 
                headers: { 
                    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                } 
            }
        );

        const account = response.data.data;

        // Update Firebase with new account details
        await userRef.update({ 
            bank_name: account.bank_name,
            account_number: account.account_number,
            account_name: account.account_name,
            balance: snap.val()?.balance || 0, 
            email: email 
        });

        res.json(account);

    } catch (err) { 
        // This log is vital for debugging 400 errors
        console.error("Billstack API Error:", err.response?.data || err.message);
        res.status(err.response?.status || 500).json({ 
            error: "Failed to generate account", 
            details: err.response?.data?.message || err.message 
        }); 
    }
});

module.exports = router;
