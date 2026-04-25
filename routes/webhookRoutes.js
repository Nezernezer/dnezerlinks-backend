const express = require('express');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', async (req, res) => {
    const { event, data } = req.body;
    if (event === 'charge.success') {
        const email = data.customer.email;
        const amount = (data.amount / 100) * 0.98; // Deduct 2%
        const userQuery = await db.ref('users').orderByChild('email').equalTo(email).once('value');
        if (userQuery.val()) {
            const uid = Object.keys(userQuery.val())[0];
            await db.ref(`users/${uid}/balance`).transaction(c => (c || 0) + amount);
        }
    }
    res.sendStatus(200);
});
module.exports = router;
