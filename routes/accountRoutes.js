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

        // 1. Ensure Customer exists on Billstack
        try {
            await billstack.post('/createCustomer', payload);
            await new Promise(r => setTimeout(r, 2000)); 
        } catch (e) {
            console.log("Customer setup confirmed.");
        }

        // 2. SEQUENTIAL WATERFALL: PalmPay -> 9PSB -> WEMA -> Sterling -> Providus
        const banks = ["PALMPAY", "9PSB", "WEMA", "STERLING", "PROVIDUS"];
        let account = null;

        for (const bank of banks) {
            try {
                console.log(`[Waterfall] Requesting ${bank}...`);
                
                const response = await billstack.post('/generateVirtualAccount', {
                    ...payload,
                    bank: bank,
                    reference: `DZN-${uid.slice(0, 5)}-${Date.now()}`
                });

                if (response.data?.status && response.data.data?.account?.[0]) {
                    account = response.data.data.account[0];
                    console.log(`✅ ${bank} generated successfully.`);
                    break; // Exit loop on success
                }
            } catch (err) {
                console.error(`❌ ${bank} failed:`, err.response?.data?.message || err.message);
                // Loop automatically continues to the next bank
            }
        }

        if (!account) throw new Error("All bank gateways are currently busy. Please try again.");

        // 3. SAVE & BRAND FOR DNEZERLINKS
        const accName = `${payload.lastName} ${payload.firstName[0]} - Dnezerlinks`;
        await db.ref(`users/${uid}`).update({
            bank_name: account.bank_name,
            account_number: account.account_number,
            account_name: accName,
            email: cleanEmail
        });

        res.json({ success: true, ...account, account_name: accName });

    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
