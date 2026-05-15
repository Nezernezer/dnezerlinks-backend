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
    // Removed 'pin' from the required fields here
    const { uid, email, first_name, last_name, phone } = req.body;

    try {
        console.log(`[Account Gen] Request for UID: ${uid}, Email: ${email}`);

        if (!uid || !email) {
            throw new Error("Missing UID or Email in request");
        }

        const cleanEmail = email.toLowerCase().trim();
        const payload = {
            email: cleanEmail,
            firstName: first_name || "Customer",
            lastName: last_name || "Dnezer",
            phone: phone || "08000000000"
        };

        // 1. REGISTER CUSTOMER
        try {
            await billstack.post('/createCustomer', payload);
            await new Promise(r => setTimeout(r, 2000)); 
        } catch (e) {
            console.log("Customer setup confirmed.");
        }

        // 2. WATERFALL GENERATION
        const banks = ["PALMPAY", "9PSB", "PROVIDUS"];
        let account = null;

        for (const bank of banks) {
            try {
                console.log(`Trying ${bank}...`);
                const response = await billstack.post('/generateVirtualAccount', {
                    ...payload,
                    bank: bank,
                    reference: `DZN-${uid.slice(0, 5)}-${Date.now()}`
                });

                if (response.data?.status && response.data.data?.account?.[0]) {
                    account = response.data.data.account[0];
                    break;
                }
            } catch (err) {
                console.error(`${bank} fail:`, err.response?.data?.message || err.message);
            }
        }

        if (!account) throw new Error("All bank gateways are currently busy. Try again.");

        // 3. SAVE TO FIREBASE
        const accName = `${payload.lastName} ${payload.firstName[0]} - Dnezerlinks`;
        await db.ref(`users/${uid}`).update({
            bank_name: account.bank_name,
            account_number: account.account_number,
            account_name: accName,
            email: cleanEmail
        });

        res.json({ success: true, ...account, account_name: accName });

    } catch (error) {
        console.error("Fund Error:", error.message);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
