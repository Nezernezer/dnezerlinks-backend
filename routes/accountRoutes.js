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
        const cleanEmail = email.toLowerCase().trim();
        const cleanPhone = phone ? phone.replace(/\s+/g, '') : "08000000000";
        
        const payload = {
            email: cleanEmail,
            firstName: first_name || "Customer",
            lastName: last_name || "User",
            phone: cleanPhone,
            reference: `DZN-${uid.slice(0,4)}-${Date.now()}`
        };

        // STEP 1: Register Customer (Fixes "Email not Found")
        console.log(`[Dnezerlinks] Registering: ${cleanEmail}`);
        try {
            await billstack.post('/createCustomer', {
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
                phone: payload.phone
            });
            // CRITICAL: Give Billstack 2 seconds to index the new customer
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.log("Customer already exists or error ignored.");
        }

        // STEP 2: Waterfall Generation
        const banks = ["PALMPAY", "9PSB", "PROVIDUS"];
        let account = null;

        for (const bank of banks) {
            try {
                console.log(`[Dnezerlinks] Trying bank: ${bank}`);
                const response = await billstack.post('/generateVirtualAccount', { ...payload, bank });
                if (response.data?.status && response.data.data?.account?.[0]) {
                    account = response.data.data.account[0];
                    break;
                }
            } catch (e) {
                console.error(`${bank} failed: ${e.response?.data?.message || e.message}`);
            }
        }

        if (!account) throw new Error("All bank gateways are currently busy. Try again in 1 minute.");

        // STEP 3: Save to Firebase
        const accName = `${payload.lastName} ${payload.firstName[0]} - Dnezerlinks`;
        await db.ref(`users/${uid}`).update({
            bank_name: account.bank_name,
            account_number: account.account_number,
            account_name: accName,
            email: cleanEmail
        });

        res.json({ success: true, ...account, account_name: accName });

    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
