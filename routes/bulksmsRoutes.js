const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// --- COMPREHENSIVE NIGERIAN FINANCIAL/BRAND BLACKLIST ---
const RESTRICTED_SENDER_IDS = [
    "dnezerlinks", "dnezer", "admin", "support", "verify", "otp",
    "access", "accessbank", "fidelity", "fidelitybank", "firstbank", "fbn",
    "guaranty", "gtbank", "gtb", "gtco", "unitedbank", "uba", "zenith", "zenithbank",
    "opay", "palmpay", "palm", "kuda", "kudabank", "moniepoint",
    "cbn", "fgn", "efcc", "police", "npf", "naira", "enaira", "tax", "firs"
];

// Handles POST requests hitting: https://dnezerlinks-backend.onrender.com/api/bulksms/send-sms
router.post('/send-sms', async (req, res) => {
    try {
        const { recipient, message, senderName, uid, userId } = req.body;
        const activeUid = uid || userId;

        // 1. Validation Check
        if (!recipient || !message || !activeUid) {
            return res.status(400).json({
                success: false,
                error: "Missing fields: recipient, message, and userId are mandatory."
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

        const totalCost = totalPages * ratePerPage * totalRecipients;

        // 4. Balance Verification from Firebase Realtime Database
        const userRef = admin.database().ref(`users/${activeUid}`);
        const userSnap = await userRef.once('value');

        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: "User account wallet not found." });
        }

        const currentBalance = userSnap.val().balance || 0;

        if (currentBalance < totalCost) {
            return res.status(402).json({
                success: false,
                error: `Insufficient balance. This costs ₦${totalCost}. Your balance is ₦${currentBalance}.`
            });
        }

        // 5. Sender ID Spoofing Guard
        let requestedSender = (senderName || "Dnezerlinks").trim();
        const normalizedSender = requestedSender.toLowerCase().replace(/[\s-_\.]/g, '');

        const isRestricted = RESTRICTED_SENDER_IDS.some(restrictedWord =>
            normalizedSender === restrictedWord || normalizedSender.includes(restrictedWord)
        );

        if (isRestricted) {
            return res.status(403).json({
                success: false,
                error: `Security Alert: The Sender ID '${requestedSender}' contains a restricted brand name.`
            });
        }

        let finalSenderName = requestedSender.substring(0, 11);
        const apiKey = process.env.BULKSMSLIVE_API_KEY;
        
        if (!apiKey) {
            return res.status(500).json({ success: false, error: "Server gateway key configuration missing." });
        }

        // 6. Request to BulkSMSLive Gateway
        const gatewayUrl = "https://api.bulksmslive.com/v2/app/sendsms";
        const response = await fetch(gatewayUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                sender_name: finalSenderName,
                message: message,
                recipients: cleanRecipient,
                forcednd: 1
            })
        });

        const apiData = await response.json();

        // 7. Deduct Wallet Balance on Success
        const newBalance = currentBalance - totalCost;
        await userRef.update({ balance: newBalance });

        return res.status(200).json({
            success: true,
            cost: totalCost,
            pages: totalPages,
            rate: ratePerPage,
            data: apiData
        });

    } catch (error) {
        console.error("Bulk SMS Error:", error);
        return res.status(500).json({ success: false, error: "Internal Server Error exception caught." });
    }
});

module.exports = router;
