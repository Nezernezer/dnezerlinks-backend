const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

router.post('/fund', async (req, res) => {
    const { uid, email, first_name, last_name, phone } = req.body;
    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        if (snap.val() && snap.val().account_number) return res.json(snap.val());

        const response = await axios.post('https://api.billstack.co/v2/virtual-accounts', 
            { email, first_name, last_name, phone, currency: "NGN" },
            { headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}` } }
        );
        const account = response.data.data;
        await userRef.update({ ...account, balance: snap.val()?.balance || 0, email });
        res.json(account);
    } catch (err) { res.status(500).json({ error: "Failed" }); }
});
module.exports = router;
