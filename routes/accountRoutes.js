const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

const SUPPORTED_BANKS = ["PALMPAY", "9PSB", "SAFEHAVEN", "BANKLY", "PROVIDUS"];

router.post('/fund', async (req, res) => {
    const { uid, email, first_name, last_name, phone } = req.body;

    if (!uid || !email || !first_name || !last_name || !phone) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        const userData = snap.val();

        if (userData?.account_number) {
            return res.json({ success: true, account: userData });
        }

        console.log(`\n🔄 Starting account creation for UID: ${uid}`);

        let accountCreated = null;
        const errors = [];

        for (const bank of SUPPORTED_BANKS) {
            try {
                console.log(`Trying ${bank}...`);

                const payload = {
                    email: email.trim().toLowerCase(),
                    reference: `VA_\( {uid}_ \){Date.now()}`,
                    firstName: first_name.trim(),
                    lastName: last_name.trim(),
                    phone: phone.trim().replace(/\D/g, ''),
                    bank: bank,
                    currency: "NGN"
                };

                const response = await axios.post(
                    'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
                    payload,
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 25000
                    }
                );

                // Log full response for debugging
                console.log(`📥 Response from ${bank}:`, JSON.stringify(response.data, null, 2));

                const resData = response.data;
                const accountData = resData.data || resData;

                // Better success check
                if (resData.status === true && (accountData?.account_number || accountData?.accountNumber)) {
                    accountCreated = {
                        bank_name: accountData.bank_name || accountData.bank?.name || `${bank} Bank`,
                        account_number: accountData.account_number || accountData.accountNumber,
                        account_name: accountData.account_name || accountData.accountName || `${first_name} ${last_name}`
                    };
                    console.log(`✅ SUCCESS with ${bank} - Stopping further attempts`);
                    break;
                } else {
                    // Log why it failed
                    const failMsg = resData.message || resData.error || "No account_number returned";
                    console.log(`⚠️ ${bank} returned but failed: ${failMsg}`);
                    errors.push({ bank, error: failMsg });
                }

            } catch (bankError) {
                const errDetail = bankError.response?.data || bankError.message;
                errors.push({ bank, error: errDetail });
                console.error(`❌ ${bank} Error:`, errDetail);
            }
        }

        if (!accountCreated || !accountCreated.account_number) {
            console.error("All banks failed", errors);
            return res.status(500).json({
                success: false,
                error: "Service temporarily unavailable. Please try again in a few minutes.",
                details: errors
            });
        }

        // Save to Firebase
        await userRef.update({
            bank_name: accountCreated.bank_name,
            account_number: accountCreated.account_number,
            account_name: accountCreated.account_name,
            email: email.trim().toLowerCase(),
            balance: userData?.balance || 0,
            updatedAt: Date.now()
        });

        console.log(`✅ Account saved to Firebase for UID: ${uid}`);

        res.json({
            success: true,
            message: `Virtual account created with ${accountCreated.bank_name}`,
            account: accountCreated
        });

    } catch (err) {
        console.error("Critical Error:", err.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

module.exports = router;
