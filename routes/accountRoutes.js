const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

// Reusable Billstack request helper
const billstackApi = async (endpoint, payload) => {
    return await axios({
        method: 'POST',
        url: `https://api.billstack.co/v2/thirdparty/${endpoint}`,
        headers: {
            'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
        },
        data: payload,
        timeout: 20000
    });
};

router.post('/fund', async (req, res) => {
    const { uid, email, first_name, last_name, phone } = req.body;

    try {
        if (!uid || !email) throw new Error("User identification missing");

        const cleanEmail = email.toLowerCase().trim();
        const cleanFirst = (first_name || "Customer").trim();
        const cleanLast = (last_name || "Dnezer").trim();
        const cleanPhone = phone ? phone.replace(/\s+/g, '') : "08000000000";

        // STEP 1: Register Customer on Billstack (Fixes "Email not Found")
        try {
            console.log(`[Account] Registering ${cleanEmail}...`);
            await billstackApi('createCustomer', {
                email: cleanEmail,
                firstName: cleanFirst,
                lastName: cleanLast,
                phone: cleanPhone
            });
            // Small delay for system propagation
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.log("[Account] Customer already exists on Billstack.");
        }

        // STEP 2: Waterfall Generation (PalmPay -> 9PSB -> Providus)
        const banks = ["PALMPAY", "9PSB", "PROVIDUS"];
        let finalAccount = null;
        let lastError = "";

        for (const bank of banks) {
            try {
                console.log(`[Account] Attempting ${bank}...`);
                const response = await billstackApi('generateVirtualAccount', {
                    email: cleanEmail,
                    firstName: cleanFirst,
                    lastName: cleanLast,
                    phone: cleanPhone,
                    bank: bank,
                    reference: `ACC-${uid.substring(0,5)}-${Date.now()}`
                });

                if (response.data?.status === true && response.data.data?.account?.[0]) {
                    finalAccount = response.data.data.account[0];
                    break; 
                }
            } catch (err) {
                lastError = err.response?.data?.message || err.message;
            }
        }

        if (!finalAccount) throw new Error(`Gateway Busy: ${lastError}`);

        // STEP 3: Save to Firebase with Dnezerlinks branding
        const displayName = `${cleanLast} ${cleanFirst[0]} - Dnezerlinks`;
        await db.ref(`users/${uid}`).update({
            bank_name: finalAccount.bank_name,
            account_number: finalAccount.account_number,
            account_name: displayName,
            email: cleanEmail
        });

        res.json({
            success: true,
            bank_name: finalAccount.bank_name,
            account_number: finalAccount.account_number,
            account_name: displayName
        });

    } catch (err) {
        console.error("[Account Error]:", err.message);
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
