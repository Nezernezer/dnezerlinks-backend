const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const billstack = axios.create({
    baseURL: 'https://api.billstack.co/v2/thirdparty',
    headers: { 
        'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
    }
});

router.post('/fund', async (req, res) => {
    const { uid, email, first_name, last_name, phone } = req.body;

    try {
        if (!uid || !email) throw new Error("Missing UID or Email");

        const cleanEmail = email.toLowerCase().trim();
        const payload = {
            email: cleanEmail,
            firstName: first_name || "Customer",
            lastName: last_name || "User",
            phone: phone || "08000000000"
        };

        // 1. Setup Customer
        try {
            await billstack.post('/createCustomer', payload);
        } catch (e) {
            console.log("Customer setup verified.");
        }

        // 2. Direct PalmPay Generation
        console.log(`[Dnezerlinks] Requesting PalmPay for: ${cleanEmail}`);
        const response = await billstack.post('/generateVirtualAccount', {
            ...payload,
            bank: "PALMPAY",
            reference: `DZN-${uid.slice(0, 5)}-${Date.now()}`
        });

        if (response.data?.status && response.data.data?.account?.[0]) {
            const account = response.data.data.account[0];
            const accName = `${payload.lastName} ${payload.firstName[0]} - Dnezerlinks`;

            // 3. Save to Firebase
            await db.ref(`users/${uid}`).update({
                bank_name: account.bank_name,
                account_number: account.account_number,
                account_name: accName,
                email: cleanEmail
            });

            return res.json({ success: true, ...account, account_name: accName });
        } else {
            throw new Error(response.data?.message || "PalmPay is currently unavailable.");
        }

    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error("PalmPay Error:", errorMsg);
        res.status(400).json({ success: false, error: errorMsg });
    }
});

module.exports = router;

