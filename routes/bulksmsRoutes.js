const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const axios = require('axios'); // Switched to axios for explicit timeout support

// --- COMPREHENSIVE NIGERIAN FINANCIAL/BRAND BLACKLIST ---
const RESTRICTED_SENDER_IDS = [
    "admin", "support", "verify", "otp",
    "access", "accessbank", "fidelity", "fidelitybank", "firstbank", "fbn",
    "guaranty", "gtbank", "gtb", "gtco", "unitedbank", "uba", "zenith", "zenithbank",
    "opay", "palmpay", "palm", "kuda", "kudabank", "moniepoint",
    "cbn", "fgn", "efcc", "police", "npf", "naira", "enaira", "tax", "firs"
];

// Handles POST requests hitting: https://dnezerlinks-backend.onrender.com/api/bulksms/send-sms
router.post('/send-sms', async (req, res) => {
    const { recipient, message, senderName, uid, userId } = req.body;
    const activeUid = uid || userId;

    // 1. Validation Check
    if (!recipient || !message || !activeUid) {
        return res.status(400).json({
            success: false,
            error: "Missing fields: recipient, message, and userId are mandatory."
        });
    }

    const db = admin.database();
    const userRef = db.ref(`users/${activeUid}/balance`);
    
    // Generate unique reference key EARLY before calling the gateway provider
    const txRef = db.ref(`transactions/${activeUid}`).push();
    const uniqueTxKey = txRef.key;

    try {
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

        const totalCost = totalPages * ratePerPage * totalRecipients;

        // 🔒 TRANSACTION WALLET LOCK: Deduct balance upfront to avoid race condition bypasses
        let apiCallAllowed = false;
        await userRef.transaction((currentBalance) => {
            if (currentBalance === null || currentBalance < totalCost) {
                return; // Break transaction safely if funds are missing
            }
            apiCallAllowed = true;
            return currentBalance - totalCost;
        });

        if (!apiCallAllowed) {
            return res.status(402).json({
                success: false,
                error: `Insufficient balance to complete request. Total cost: ₦${totalCost}.`
            });
        }

        console.log(`💳 BulkSMS Debit Locked: ₦${totalCost} deducted from UID: ${activeUid}. Initiating gateway.`);

        // 4. Sender ID Spoofing & Admin Brand Guard
        let requestedSender = (senderName || "Dnezerlinks").trim();
        const normalizedSender = requestedSender.toLowerCase().replace(/[\s-_\.]/g, '');

        const isPlatformBrand = normalizedSender.includes("dnezerlinks") || normalizedSender.includes("dnezer");
        const adminUid = process.env.ADMIN_UID;

        if (isPlatformBrand && activeUid !== adminUid) {
            // Immediate rollback on brand protection trigger
            await userRef.transaction(currentBalance => (currentBalance || 0) + totalCost);
            return res.status(403).json({
                success: false,
                error: "Security Alert: 'Dnezerlinks' branding is restricted to administrative accounts only."
            });
        }

        const isRestricted = RESTRICTED_SENDER_IDS.some(restrictedWord =>
            normalizedSender === restrictedWord || normalizedSender.includes(restrictedWord)
        );

        if (isRestricted) {
            // Immediate rollback on restricted brand trigger
            await userRef.transaction(currentBalance => (currentBalance || 0) + totalCost);
            return res.status(403).json({
                success: false,
                error: `Security Alert: The Sender ID '${requestedSender}' contains a restricted institutional brand name.`
            });
        }

        let finalSenderName = requestedSender.substring(0, 11);
        const apiKey = process.env.BULKSMSLIVE_API_KEY;

        if (!apiKey) {
            await userRef.transaction(currentBalance => (currentBalance || 0) + totalCost);
            return res.status(500).json({ success: false, error: "Server gateway key configuration missing." });
        }

        // 5. Request to BulkSMSLive Gateway using Axios with a 1-minute timeout
        const gatewayUrl = "https://api.bulksmslive.com/v2/app/sendsms";
        const response = await axios.post(
            gatewayUrl,
            {
                sender_name: finalSenderName,
                message: message,
                recipients: cleanRecipient,
                forcednd: 1,
                "request-id": uniqueTxKey // Pre-mapping track reference parameter to the core API provider
            },
            {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                timeout: 60000 // 🕒 Timeout explicitly set to 1 minute (60,000ms)
            }
        );

        // BulkSMSLive response parsing
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

        // Handle structural payload rejections from gateway provider (Instant Auto-Refund)
        console.error("❌ BulkSMS Gateway Refusal Payload:", apiData);
        await userRef.transaction(currentBalance => (currentBalance || 0) + totalCost);
        return res.status(400).json({
            success: false,
            error: apiData.message || "BulkSMS provider failed to process transmission."
        });

    } catch (error) {
        console.error("⚠️ Bulk SMS Exception Handler Active:", error.message);

        // 7. Handle Midway Handshake Timeouts & Dropped Packets
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.message.includes('Network Error')) {
            try {
                // Keep funds locked, log transaction status as 'pending'
                await txRef.set({
                    service: "Bulk SMS",
                    sender: senderName || "Dnezerlinks",
                    recipientsCount: recipient.split(',').length,
                    amount: totalCost,
                    type: "debit",
                    status: "pending", // 📝 Kept pending for background reconciliation gatekeeper evaluation
                    timestamp: Date.now(),
                    reference: uniqueTxKey,
                    description: `Bulk SMS transaction pending verification due to provider timeout.`
                });

                console.log(`📝 Gateway Sync Node Generated: Kept ₦${totalCost} locked for verification tracking (${uniqueTxKey})`);
            } catch (dbErr) {
                console.error("❌ Failed to log pending node state to Firebase database:", dbErr.message);
            }

            return res.status(504).json({
                success: false,
                error: "Network timeout with SMS provider. Your transaction status is being verified in the background."
            });
        }

        // System crash / parsing faults recovery logic (Safe Auto-Refund)
        await userRef.transaction(currentBalance => (currentBalance || 0) + totalCost);
        return res.status(500).json({ success: false, error: "Internal Server Processing Error. Balance returned." });
    }
});

module.exports = router;
