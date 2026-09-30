const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const axios = require('axios');

// --- COMPREHENSIVE NIGERIAN FINANCIAL/BRAND BLACKLIST ---
const RESTRICTED_SENDER_IDS = [
    "admin", "support", "verify", "otp",
    "access", "accessbank", "fidelity", "fidelitybank", "firstbank", "fbn",
    "guaranty", "gtbank", "gtb", "gtco", "unitedbank", "uba", "zenith", "zenithbank",
    "opay", "palmpay", "palm", "kuda", "kudabank", "moniepoint",
    "cbn", "fgn", "efcc", "police", "npf", "naira", "enaira", "tax", "firs"
];

// Helper function to resolve the actual Firebase DB node key for a user
async function resolveUserKey(db, activeUid) {
    const directSnap = await db.ref(`users/${activeUid}`).once('value');
    if (directSnap.exists()) {
        return activeUid;
    }

    // Secondary search by child property 'userId' if direct key lookup yields null
    const querySnap = await db.ref('users').orderByChild('userId').equalTo(activeUid).once('value');
    if (querySnap.exists()) {
        const keys = Object.keys(querySnap.val());
        return keys[0]; // Return the actual Push ID (-P2gw5tSUBT...)
    }

    return activeUid; // Fallback to direct key if no matching record is found
}

// Handles POST requests hitting: https://dnezerlinks-backend.onrender.com/api/bulksms/send-sms
router.post('/send-sms', async (req, res) => {
    const { recipient, message, senderName, uid, userId, pin } = req.body;
    const activeUid = uid || userId;

    // 1. Validation Check (Mandatory fields including pin)
    if (!recipient || !message || !activeUid || !pin) {
        return res.status(400).json({
            success: false,
            error: "Missing fields: recipient, message, userId, and pin are mandatory."
        });
    }

    const db = admin.database();

    // Resolve the actual database key (Handles both direct Auth UIDs and Push Key paths)
    const targetDbKey = await resolveUserKey(db, activeUid);
    const userRef = db.ref(`users/${targetDbKey}`);

    // Generate unique reference key EARLY before calling the gateway provider
    const txRef = db.ref(`transactions/${targetDbKey}`).push();
    const uniqueTxKey = txRef.key;

    let totalCost = 0; // declared early so the catch block can access it

    try {
        // Fetch user record to verify Transaction PIN securely on the server
        const userSnap = await userRef.once('value');
        const userData = userSnap.val() || {};
        const storedPin = userData.transaction_pin || userData.pin;

        if (!storedPin || String(storedPin) !== String(pin)) {
            return res.status(401).json({
                success: false,
                error: "Invalid transaction PIN."
            });
        }

        // 2. Character Count & Page Split Engine (GSM 7-bit vs Unicode)
        const isUnicode = /^[\x20-\x7E\xA1\xA3\xA4\xA5\xA7\xBF\xC4\xC5\xC6\xC7\xC9\xD1\xD2\xD3\xD4\xD5\xD6\xD8\xDC\xDF\xE0\xE1\xE2\xE3\xE4\xE5\xE6\xE7\xE8\xE9\xEA\xEB\xEC\xED\xEE\xEF\xF1\xF2\xF3\xF4\xF5\xF6\xF8\xF9\xFA\xFB\xFC\xFE\xDF\r\n]*$/.test(message) === false;
        const charsPerPage = isUnicode ? 70 : 160;
        const totalPages = Math.ceil(message.length / charsPerPage);

        // 3. Dynamic Time-of-Day Billing Engine (WAT / Lagos Time)
        const lagosHour = parseInt(
            new Intl.DateTimeFormat('en-US', {
                timeZone: 'Africa/Lagos',
                hour: 'numeric',
                hour12: false
            }).format(new Date()), 10
        );

        // Daytime rate (8 AM - 7:59 PM) = ₦7 | Nighttime rate (8 PM - 7:59 AM) = ₦14
        const ratePerPage = (lagosHour >= 8 && lagosHour < 20) ? 7 : 14;

        // Clean phone numbers list
        const cleanRecipient = recipient.replace(/\+/g, '').replace(/\s+/g, '').trim();
        const totalRecipients = cleanRecipient.split(',').filter(n => n.length >= 10).length;

        if (totalRecipients === 0) {
            return res.status(400).json({ success: false, error: "No valid recipient numbers provided." });
        }

        totalCost = totalPages * ratePerPage * totalRecipients;
        const balanceRef = db.ref(`users/${targetDbKey}/balance`);

        // 🔒 SAFE TRANSACTION WALLET LOCK
        // No side-effects inside the update function — only use the committed flag
        const txResult = await balanceRef.transaction((currentBalance) => {
            const balance = Number(currentBalance) || 0;

            if (balance < totalCost) {
                return; // Abort — do not change the balance
            }
            return balance - totalCost; // Commit the deduction
        });

        if (!txResult.committed) {
            const currentBal = Number(txResult.snapshot.val()) || 0;
            return res.status(402).json({
                success: false,
                error: `Insufficient balance. Your database balance is ₦\( {currentBal}, but total cost is ₦ \){totalCost}.`
            });
        }

        console.log(`💳 BulkSMS Debit Locked: ₦${totalCost} deducted from UID Node: ${targetDbKey}. Initiating gateway.`);

        // 4. Sender ID Spoofing & Admin Brand Guard
        let requestedSender = (senderName || "Dnezerlinks").trim();
        const normalizedSender = requestedSender.toLowerCase().replace(/[\s-_\.]/g, '');

        const isPlatformBrand = normalizedSender.includes("dnezerlinks") || normalizedSender.includes("dnezer");
        const adminUid = process.env.ADMIN_UID;

        if (isPlatformBrand && targetDbKey !== adminUid && activeUid !== adminUid) {
            await balanceRef.transaction(currentBalance => (Number(currentBalance) || 0) + totalCost);
            return res.status(403).json({
                success: false,
                error: "Security Alert: 'Dnezerlinks' branding is restricted to administrative accounts only."
            });
        }

        const isRestricted = RESTRICTED_SENDER_IDS.some(restrictedWord =>
            normalizedSender === restrictedWord || normalizedSender.includes(restrictedWord)
        );

        if (isRestricted) {
            await balanceRef.transaction(currentBalance => (Number(currentBalance) || 0) + totalCost);
            return res.status(403).json({
                success: false,
                error: `Security Alert: The Sender ID '${requestedSender}' contains a restricted institutional brand name.`
            });
        }

        let finalSenderName = requestedSender.substring(0, 11);
        const apiKey = process.env.BULKSMSLIVE_API_KEY;

        if (!apiKey) {
            await balanceRef.transaction(currentBalance => (Number(currentBalance) || 0) + totalCost);
            return res.status(500).json({ success: false, error: "Server gateway key configuration missing." });
        }

        // 5. Request to BulkSMSLive Gateway
        const gatewayUrl = "https://api.bulksmslive.com/v2/app/sendsms";
        const response = await axios.post(
            gatewayUrl,
            {
                sender_name: finalSenderName,
                message: message,
                recipients: cleanRecipient,
                forcednd: 1,
                "request-id": uniqueTxKey
            },
            {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                timeout: 60000
            }
        );

        const apiData = response.data;
        const apiStatus = String(apiData.status || apiData.Status || "").toLowerCase();

        // 6. Log Clean Success State
        if (apiStatus === "success" || apiStatus === "successful" || apiData.error === false) {
            await txRef.set({
                service: "Bulk SMS",
                sender: finalSenderName,
                recipientsCount: totalRecipients,
                amount: totalCost,
                type: "debit",
                status: "successful",
                timestamp: Date.now(),
                reference: uniqueTxKey,
                description: `Sent SMS via '${finalSenderName}' to ${totalRecipients} recipient(s).`
            });

            return res.status(200).json({
                success: true,
                cost: totalCost,
                pages: totalPages,
                rate: ratePerPage,
                data: apiData
            });
        }

        console.error("❌ BulkSMS Gateway Refusal Payload:", apiData);
        await balanceRef.transaction(currentBalance => (Number(currentBalance) || 0) + totalCost);
        return res.status(400).json({
            success: false,
            error: apiData.message || "BulkSMS provider failed to process transmission."
        });

    } catch (error) {
        console.error("⚠️ Bulk SMS Exception Handler Active:", error.message);

        // Refund if we already deducted
        try {
            const balanceRef = db.ref(`users/${targetDbKey}/balance`);
            if (totalCost > 0) {
                await balanceRef.transaction(currentBalance => (Number(currentBalance) || 0) + totalCost);
            }
        } catch (refundErr) {
            console.error("❌ Failed to refund balance:", refundErr.message);
        }

        if (error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.message.includes('Network Error')) {
            try {
                await txRef.set({
                    service: "Bulk SMS",
                    sender: senderName || "Dnezerlinks",
                    recipientsCount: recipient.split(',').length,
                    amount: totalCost,
                    type: "debit",
                    status: "pending",
                    timestamp: Date.now(),
                    reference: uniqueTxKey,
                    description: `Bulk SMS transaction pending verification due to provider timeout.`
                });
            } catch (dbErr) {
                console.error("❌ Failed to log pending node state to Firebase database:", dbErr.message);
            }

            return res.status(504).json({
                success: false,
                error: "Network timeout with SMS provider. Your transaction status is being verified in the background."
            });
        }

        return res.status(500).json({
            success: false,
            error: "Internal Server Processing Error. Balance returned."
        });
    }
});

module.exports = router;
