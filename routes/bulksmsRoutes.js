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

// Helper to resolve the real Firebase DB key
async function resolveUserKey(db, activeUid) {
    const directSnap = await db.ref(`users/${activeUid}`).once('value');
    if (directSnap.exists()) {
        return activeUid;
    }

    const querySnap = await db.ref('users').orderByChild('userId').equalTo(activeUid).once('value');
    if (querySnap.exists()) {
        const keys = Object.keys(querySnap.val());
        return keys[0];
    }

    return activeUid;
}

router.post('/send-sms', async (req, res) => {
    console.log("🔥 BULKSMS ROUTE HIT", new Date().toISOString());
    console.log("Body keys:", Object.keys(req.body || {}));

    const { recipient, message, senderName, uid, userId, pin } = req.body;
    const activeUid = uid || userId;

    if (!recipient || !message || !activeUid || !pin) {
        return res.status(400).json({
            success: false,
            error: "Missing fields: recipient, message, userId, and pin are mandatory."
        });
    }

    const db = admin.database();
    const targetDbKey = await resolveUserKey(db, activeUid);
    const userRef = db.ref(`users/${targetDbKey}`);
    const txRef = db.ref(`transactions/${targetDbKey}`).push();
    const uniqueTxKey = txRef.key;

    let totalCost = 0;

    try {
        // Second-layer PIN check (extra safety)
        const userSnap = await userRef.once('value');
        const userData = userSnap.val() || {};
        const storedPin = userData.transaction_pin || userData.pin;

        if (!storedPin || String(storedPin) !== String(pin)) {
            return res.status(401).json({
                success: false,
                error: "Invalid transaction PIN."
            });
        }

        // Page calculation
        const isUnicode = /^[\x20-\x7E\xA1\xA3\xA4\xA5\xA7\xBF\xC4\xC5\xC6\xC7\xC9\xD1\xD2\xD3\xD4\xD5\xD6\xD8\xDC\xDF\xE0\xE1\xE2\xE3\xE4\xE5\xE6\xE7\xE8\xE9\xEA\xEB\xEC\xED\xEE\xEF\xF1\xF2\xF3\xF4\xF5\xF6\xF8\xF9\xFA\xFB\xFC\xFE\xDF\r\n]*$/.test(message) === false;
        const charsPerPage = isUnicode ? 70 : 160;
        const totalPages = Math.ceil(message.length / charsPerPage);

        // Lagos time rate
        const lagosHour = parseInt(
            new Intl.DateTimeFormat('en-US', {
                timeZone: 'Africa/Lagos',
                hour: 'numeric',
                hour12: false
            }).format(new Date()), 10
        );
        const ratePerPage = (lagosHour >= 8 && lagosHour < 20) ? 7 : 14;

        // Recipients
        const cleanRecipient = recipient.replace(/\+/g, '').replace(/\s+/g, '').trim();
        const totalRecipients = cleanRecipient.split(',').filter(n => n.length >= 10).length;

        if (totalRecipients === 0) {
            return res.status(400).json({ success: false, error: "No valid recipient numbers provided." });
        }

        totalCost = totalPages * ratePerPage * totalRecipients;
        const balanceRef = db.ref(`users/${targetDbKey}/balance`);

        console.log(`💰 Cost → pages:\( {totalPages} rate: \){ratePerPage} recipients:\( {totalRecipients} total:₦ \){totalCost}`);
        console.log(`🔑 DB key: ${targetDbKey}`);

        // SAFE TRANSACTION (no side effects)
        const txResult = await balanceRef.transaction((currentBalance) => {
            const balance = Number(currentBalance) || 0;
            if (balance < totalCost) {
                return; // abort
            }
            return balance - totalCost;
        });

        if (!txResult.committed) {
            const currentBal = Number(txResult.snapshot.val()) || 0;
            console.log(`❌ Insufficient → balance:₦\( {currentBal} needed:₦ \){totalCost}`);
            return res.status(402).json({
                success: false,
                error: `Insufficient balance. Your database balance is ₦\( {currentBal}, but total cost is ₦ \){totalCost}.`
            });
        }

        console.log(`💳 Debited ₦${totalCost} from ${targetDbKey}`);

        // Sender ID checks
        let requestedSender = (senderName || "Dnezerlinks").trim();
        const normalizedSender = requestedSender.toLowerCase().replace(/[\s-_\.]/g, '');

        const isPlatformBrand = normalizedSender.includes("dnezerlinks") || normalizedSender.includes("dnezer");
        const adminUid = process.env.ADMIN_UID;

        if (isPlatformBrand && targetDbKey !== adminUid && activeUid !== adminUid) {
            await balanceRef.transaction(current => (Number(current) || 0) + totalCost);
            return res.status(403).json({
                success: false,
                error: "Security Alert: 'Dnezerlinks' branding is restricted to administrative accounts only."
            });
        }

        const isRestricted = RESTRICTED_SENDER_IDS.some(word =>
            normalizedSender === word || normalizedSender.includes(word)
        );

        if (isRestricted) {
            await balanceRef.transaction(current => (Number(current) || 0) + totalCost);
            return res.status(403).json({
                success: false,
                error: `Security Alert: The Sender ID '${requestedSender}' contains a restricted institutional brand name.`
            });
        }

        const finalSenderName = requestedSender.substring(0, 11);
        const apiKey = process.env.BULKSMSLIVE_API_KEY;

        if (!apiKey) {
            await balanceRef.transaction(current => (Number(current) || 0) + totalCost);
            return res.status(500).json({ success: false, error: "Server gateway key configuration missing." });
        }

        // Call BulkSMSLive gateway
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

        // Gateway refused → refund
        console.error("❌ Gateway refused:", apiData);
        await balanceRef.transaction(current => (Number(current) || 0) + totalCost);
        return res.status(400).json({
            success: false,
            error: apiData.message || "BulkSMS provider failed to process transmission."
        });

    } catch (error) {
        console.error("⚠️ BulkSMS Exception:", error.message);

        // Always try to refund
        try {
            if (totalCost > 0) {
                const balanceRef = db.ref(`users/${targetDbKey}/balance`);
                await balanceRef.transaction(current => (Number(current) || 0) + totalCost);
                console.log("↩️ Refunded ₦" + totalCost);
            }
        } catch (refundErr) {
            console.error("❌ Refund failed:", refundErr.message);
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
                console.error("❌ Failed to log pending:", dbErr.message);
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
