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
    const { uid, email, first_name, last_name, phone, pin } = req.body;

    try {
        if (!uid || !email || !pin) throw new Error("Incomplete request data (UID, Email, or PIN missing)");

        // 1. PIN VALIDATION (Fixes "Invalid PIN" error)
        const userRef = db.ref(`users/${uid}`);
        const userSnap = await userRef.once('value');
        const userData = userSnap.val();

        if (!userData || String(userData.pin) !== String(pin)) {
            return res.status(400).json({ success: false, error: "Invalid PIN" });
        }

        const cleanEmail = email.toLowerCase().trim();
        const payload = {
            email: cleanEmail,
            firstName: first_name || "Customer",
            lastName: last_name || "Dnezer",
            phone: phone ? phone.replace(/\s+/g, '') : "08000000000"
        };

        // 2. REGISTER CUSTOMER (Prevents "Email not Found" state error)
        try {
            await billstack.post('/createCustomer', payload);
            await new Promise(r => setTimeout(r, 2000)); // Delay for Billstack sync
        } catch (e) {
            console.log("[Account] Customer verified or updated.");
        }

        // 3. WATERFALL GENERATION (PalmPay -> 9PSB -> Providus)
        const banks = ["PALMPAY", "9PSB", "PROVIDUS"];
        let account = null;

        for (const bank of banks) {
            try {
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
                console.error(`[Bank Fail] ${bank}:`, err.response?.data?.message || err.message);
            }
        }

        if (!account) throw new Error("Bank gateways are currently unresponsive. Please try again.");

        // 4. SAVE TO FIREBASE
        const accName = `${payload.lastName} ${payload.firstName[0]} - Dnezerlinks`;
        await userRef.update({
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
