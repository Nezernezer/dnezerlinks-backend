// routes/cabletvRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// VTU Naija Cable IDs:
// 1 = GOTV, 2 = DSTV, 3 = STARTIMES, 4 = SHOWMAX
const providerNames = {
    '1': 'GOTV',
    '2': 'DSTV',
    '3': 'STARTIMES',
    '4': 'SHOWMAX'
};

// 1. VALIDATION ROUTE
router.post('/validate', async (req, res) => {
    const { iuc, providerID } = req.body;

    console.log(`[VALIDATION ATTEMPT] IUC: ${iuc}, ProviderID: ${providerID}`);

    if (!iuc || !providerID) {
        return res.status(400).json({ success: false, error: "Missing IUC or provider" });
    }

    try {
        const token = process.env.VTUNAIJA_API_KEY?.trim();
        const vtuRes = await axios.post(
            "https://vtunaija.com.ng/api/cablesub/verify/",
            {
                cablename: String(providerID),
                smart_card_number: String(iuc).trim()
            },
            {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );

        console.log("Full VTU Response:", vtuRes.data);

        const apiStatus = String(vtuRes.data.status || vtuRes.data.Status || "").toLowerCase();

        if (apiStatus === 'success' || apiStatus === 'successful') {
            const actualName = vtuRes.data.customer_name
                || vtuRes.data.name
                || vtuRes.data.customerName
                || "Customer found";
            console.log(`[SUCCESS] Found Customer: ${actualName}`);
            return res.json({ success: true, customerName: actualName });
        }

        console.log(`[FAILED] Provider rejected IUC: ${iuc}`);
        return res.json({
            success: false,
            error: vtuRes.data.api_response || vtuRes.data.msg || "Invalid IUC/card number"
        });
    } catch (error) {
        console.error("Validation Error Log:", error.response?.data || error.message);
        return res.status(500).json({ success: false, error: "Validation Service Error" });
    }
});

// 2. PAYMENT ROUTE
router.post('/pay', async (req, res) => {
    const { iuc, providerID, planID, amount, uid } = req.body;

    console.log(`[PAYMENT START] UserUID: ${uid}, IUC: ${iuc}, Plan: ${planID}, Price: ${amount}`);

    if (!uid || !iuc || !providerID || !planID || !amount) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const token = process.env.VTUNAIJA_API_KEY?.trim();
    const db = admin.database();
    const userRef = db.ref(`users/${uid}/balance`);
    const planCost = parseFloat(amount);

    const txRef = db.ref(`transactions/${uid}`).push();
    const uniqueTxKey = txRef.key;
    const requestId = `\( {uid}- \){Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    const providerText = providerNames[String(providerID)] || 'Cable TV';

    try {
        // Lock wallet first
        let apiCallAllowed = false;
        await userRef.transaction((currentBalance) => {
            if (currentBalance === null || currentBalance < planCost) {
                return;
            }
            apiCallAllowed = true;
            return Math.round((currentBalance - planCost) * 100) / 100;
        });

        if (!apiCallAllowed) {
            return res.status(400).json({ success: false, error: "Insufficient Wallet Balance" });
        }

        console.log(`💳 CableTV Balance Locked: ₦${planCost} deducted from UID: ${uid}`);

        const vtuResponse = await axios.post(
            "https://vtunaija.com.ng/api/cablesub/",
            {
                cablename: String(providerID),
                cableplan: String(planID),
                smart_card_number: String(iuc).trim(),
                "request-id": requestId
            },
            {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );

        const apiStatus = String(vtuResponse.data.status || vtuResponse.data.Status || "").toLowerCase();

        if (apiStatus === 'success' || apiStatus === 'successful') {
            console.log(`[PAYMENT SUCCESS] IUC ${iuc} subscribed to Plan ${planID}`);

            await txRef.set({
                type: 'debit',
                service: 'Cable TV',
                description: `Successfully renewed ${providerText} Subscription`,
                phone: String(iuc).trim(),
                amount: planCost,
                status: 'successful',
                timestamp: Date.now(),
                date: new Date().toLocaleString(),
                reference: requestId,
                local_ref: uniqueTxKey
            });

            return res.json({ success: true });
        }

        // Provider rejected — refund immediately
        console.log(`[PAYMENT REJECTED]`, vtuResponse.data);

        await userRef.transaction(currentBalance =>
            Math.round(((currentBalance || 0) + planCost) * 100) / 100
        );

        return res.status(400).json({
            success: false,
            error: vtuResponse.data.api_response
                || vtuResponse.data.msg
                || vtuResponse.data.message
                || "Provider Refused Transaction"
        });

    } catch (error) {
        console.error(`⚠️ Cable TV Exception: ${error.message}`);

        if (error.response) {
            console.error("VTU Naija status:", error.response.status);
            console.error("VTU Naija response:", error.response.data);
        }

        if (error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.message.includes('Network Error')) {
            try {
                await txRef.set({
                    type: 'debit',
                    service: 'Cable TV',
                    description: `${providerText} Subscription (Pending confirmation verification)`,
                    phone: String(iuc).trim(),
                    amount: planCost,
                    status: 'pending',
                    timestamp: Date.now(),
                    date: new Date().toLocaleString(),
                    reference: requestId,
                    local_ref: uniqueTxKey
                });
                console.log(`📝 Pending transaction logged: ${requestId}`);
            } catch (dbErr) {
                console.error("❌ Failed to log pending transaction:", dbErr.message);
            }

            return res.status(504).json({
                success: false,
                error: "Network timeout with cable provider. Your transaction status is being verified in the background."
            });
        }

        // Other errors — refund
        await userRef.transaction(currentBalance =>
            Math.round(((currentBalance || 0) + planCost) * 100) / 100
        );

        const providerError = error.response?.data?.api_response
            || error.response?.data?.msg
            || error.response?.data?.message
            || "Server Transaction Routing Failure. Wallet Returned Safely.";

        return res.status(error.response?.status || 500).json({
            success: false,
            error: providerError
        });
    }
});

module.exports = router;
