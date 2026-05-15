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

        // Ensure customer exists on Billstack
        try {
            await billstack.post('/createCustomer', payload);
        } catch (e) { 
            console.log("Customer setup verified."); 
        }

        // SEQUENCE: PalmPay -> 9PSB -> WEMA -> Sterling -> Providus
        const banks = ["PALMPAY", "9PSB", "WEMA", "STERLING", "PROVIDUS"];
        let account = null;

        for (const bank of banks) {
            try {
                console.log(`[Waterfall] Requesting ${bank}...`);
                
                // The code pauses here until Billstack sends a response for THIS specific bank
                const response = await billstack.post('/generateVirtualAccount', {
                    ...payload,
                    bank: bank,
                    reference: `DZN-${uid.slice(0, 5)}-${Date.now()}`
                });

                if (response.data?.status && response.data.data?.account?.[0]) {
                    account = response.data.data.account[0];
                    console.log(`✅ Success with ${bank}`);
                    break; // Stop and exit the loop immediately on success
                }
            } catch (err) {
                // If the bank returns an error, log it and the loop automatically moves to the next bank
                console.error(`❌ ${bank} responded:`, err.response?.data?.message || err.message);
            }
        }

        if (!account) {
            throw new Error("All bank gateways are currently busy. Please try again.");
        }

        // Save to Firebase for Dnezerlinks branding
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

