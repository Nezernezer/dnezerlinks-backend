// routes/bulksmsRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');

// Pricing matches your frontend (Lagos time)
function getRatePerPage() {
    const lagosHour = parseInt(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'Africa/Lagos',
            hour: 'numeric',
            hour12: false
        }).format(new Date()),
        10
    );
    // 8:00 – 19:59 → ₦7, otherwise ₦14
    return (lagosHour >= 8 && lagosHour < 20) ? 7 : 14;
}

function isUnicode(text) {
    const gsm7bitRegExp = /^[\x20-\x7E\xA1\xA3\xA4\xA5\xA7\xBF\xC4\xC5\xC6\xC7\xC9\xD1\xD2\xD3\xD4\xD5\xD6\xD8\xDC\xDF\xE0\xE1\xE2\xE3\xE4\xE5\xE6\xE7\xE8\xE9\xEA\xEB\xEC\xED\xEE\xEF\xF1\xF2\xF3\xF4\xF5\xF6\xF8\xF9\xFA\xFB\xFC\xFE\xDF\r\n]*$/;
    return !gsm7bitRegExp.test(text);
}

function normalizePhone(num) {
    let cleaned = String(num).replace(/\D/g, '');
    if (cleaned.startsWith('0') && cleaned.length === 11) {
        cleaned = '234' + cleaned.slice(1);
    } else if (cleaned.length === 10) {
        cleaned = '234' + cleaned;
    }
    return cleaned;
}

// --- COMPREHENSIVE NIGERIAN FINANCIAL / BRAND / GOVERNMENT BLACKLIST ---
const RESTRICTED_SENDER_IDS = [
    // Generic / high-risk
    "admin", "support", "verify", "otp", "alert", "info", "service", "official",
    "bank", "banking", "finance", "credit", "loan", "naira", "enaira",

    // Commercial Banks
    "access", "accessbank", "fidelity", "fidelitybank", "firstbank", "fbn", "first",
    "guaranty", "gtbank", "gtb", "gtco", "unitedbank", "uba", "zenith", "zenithbank",
    "stanbic", "stanbicibtc", "ibtc", "sterling", "sterlingbank", "unionbank", "union",
    "wema", "wemabank", "polaris", "polarisbank", "keystone", "keystonebank",
    "ecobank", "eco", "fcmb", "heritage", "heritagebank", "unity", "unitybank",
    "providus", "providusbank", "suntrust", "suntrustbank", "titan", "titantrust",
    "jaiz", "jaizbank", "tajbank", "taj", "globus", "globusbank", "parallex",
    "premiumtrust", "premium", "lotus", "lotusbank",

    // Fintech / Digital Banks / Wallets
    "opay", "palmpay", "palm", "kuda", "kudabank", "moniepoint", "monie",
    "carbon", "fairmoney", "fair", "branch", "renmoney", "ren", "quickcheck",
    "aella", "aellacredit", "page", "pagefinancials", "flutterwave", "paystack",
    "interswitch", "nibss", "nip", "remita", "payattitude", "paga", "chipper",
    "cowrywise", "piggyvest", "piggy", "risevest", "bamboo", "chaka", "tread",
    "wallet", "ewallet", "vbank", "vfd", "sparkle", "ally", "allybank",

    // Telcos
    "mtn", "glo", "airtel", "9mobile", "etisalat", "smile", "spectranet", "ntel",

    // Government / Security / Regulatory
    "cbn", "fgn", "efcc", "police", "npf", "dss", "ndlea", "icpc", "firs", "tax",
    "customs", "immigration", "nis", "nin", "nimc", "frsc", "nss", "nsa",
    "presidency", "govng", "gov", "federal", "state", "lga", "inec", "court",
    "judiciary", "nba", "nma", "nysc", "jtb", "bvn", "nibss",

    // Popular brands / utilities often abused
    "dstv", "gotv", "startimes", "showmax", "netflix", "spotify", "whatsapp",
    "facebook", "instagram", "twitter", "x", "google", "apple", "microsoft",
    "amazon", "jumia", "konga", "payoneer", "paypal", "westernunion", "moneygram"
];

router.post('/send-sms', async (req, res) => {
    // Frontend sends: userId, pin, recipient, message, senderName
    const { userId, uid, recipient, message, senderName } = req.body;
    const activeUid = userId || uid;

    if (!activeUid || !recipient || !message || !senderName) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const trimmedSender = String(senderName).trim();

    if (trimmedSender.length === 0 || trimmedSender.length > 11) {
        return res.status(400).json({ success: false, error: "Sender ID must be 1–11 characters" });
    }

    // Blacklist check (case-insensitive + partial match)
    const cleanSender = trimmedSender.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isRestricted = RESTRICTED_SENDER_IDS.some(restricted =>
        cleanSender === restricted || cleanSender.includes(restricted)
    );

    if (isRestricted) {
        return res.status(400).json({
            success: false,
            error: "This Sender ID is restricted. Please choose a different name."
        });
    }

    // Parse recipients
    const rawList = String(recipient).split(',').map(n => n.trim()).filter(Boolean);
    const recipients = [...new Set(rawList.map(normalizePhone).filter(n => n.length >= 12 && n.length <= 14))];

    if (recipients.length === 0) {
        return res.status(400).json({ success: false, error: "No valid recipients found" });
    }

    // Calculate pages & cost (server-side)
    const unicode = isUnicode(message);
    const charsPerPage = unicode ? 70 : 160;
    const pages = Math.max(1, Math.ceil(message.length / charsPerPage));
    const rate = getRatePerPage();
    const totalCost = pages * rate * recipients.length;

    const userRef = db.ref(`users/${activeUid}/balance`);

    try {
        // 1. Check balance
        const snap = await userRef.once('value');
        const balance = snap.val() || 0;

        if (balance < totalCost) {
            return res.status(400).json({
                success: false,
                error: `Insufficient Balance. Need ₦${totalCost.toFixed(2)}`
            });
        }

        // 2. Call BulkSMSLive API (correct lowercase / snake_case keys)
        const response = await axios.post(
            'https://api.bulksmslive.com/v2/app/sendsms',
            {
                message: message,
                sender_name: trimmedSender.substring(0, 11),
                recipients: recipients.join(','),
                forcednd: '1'
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.BULKSMSLIVE_API_KEY}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 50000
            }
        );

        const data = response.data || {};
        const isSuccess =
            data.status === 1 ||
            data.status === '1' ||
            String(data.msg || data.message || '').toLowerCase().includes('ok');

        if (isSuccess) {
            // 3. Deduct balance
            await userRef.transaction(current => {
                return (current || 0) - totalCost;
            });

            // 4. Log transaction
            const txRef = db.ref(`transactions/${activeUid}`).push();
            await txRef.set({
                service: "Bulk SMS",
                sender: trimmedSender,
                recipients: recipients.join(','),
                recipient_count: recipients.length,
                pages,
                message: message.substring(0, 200),
                amount: totalCost,
                type: "debit",
                status: "successful",
                timestamp: Date.now(),
                reference: data.Msgid || data.msgid || data.msg_id || txRef.key,
                description: `Bulk SMS to ${recipients.length} recipient(s) – ${pages} page(s)`
            });

            console.log(`✅ Bulk SMS sent: \( {recipients.length} recipients, ₦ \){totalCost} (UID: ${activeUid})`);
            return res.json({
                success: true,
                message: "Bulk SMS Sent Successfully",
                cost: totalCost,
                recipients: recipients.length,
                pages
            });
        }

        // Provider returned failure
        console.error("BulkSMSLive error:", data);
        return res.status(400).json({
            success: false,
            error: data.msg || data.message || "SMS provider failed"
        });

    } catch (error) {
        console.error("Bulk SMS error:", error.message);

        if (error.response) {
            console.error("BulkSMSLive status:", error.response.status);
            console.error("BulkSMSLive response:", error.response.data);
        }

        // Timeout handling
        if (error.code === 'ECONNABORTED') {
            await userRef.transaction(current => {
                return (current || 0) - totalCost;
            });

            const txRef = db.ref(`transactions/${activeUid}`).push();
            await txRef.set({
                service: "Bulk SMS",
                sender: trimmedSender,
                recipients: recipients.join(','),
                recipient_count: recipients.length,
                pages,
                message: message.substring(0, 200),
                amount: totalCost,
                type: "debit",
                status: "pending",
                timestamp: Date.now(),
                reference: txRef.key,
                description: `Bulk SMS timed out – Pending (${recipients.length} recipients)`
            });

            return res.status(504).json({
                success: false,
                error: "SMS API timeout. Transaction marked as pending."
            });
        }

        const providerError =
            error.response?.data?.msg ||
            error.response?.data?.message ||
            error.response?.data?.error ||
            "API Connection Error";

        return res.status(error.response?.status || 500).json({
            success: false,
            error: providerError
        });
    }
});

module.exports = router;
