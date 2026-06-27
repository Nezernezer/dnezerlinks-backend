const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// --- EXPANDED NIGERIAN FINANCIAL/BRAND/AGENCY BLACKLIST ---
const RESTRICTED_SENDER_IDS = [
    // --- System & Core Admin ---
    "dnezerlinks", "dnezer", "admin", "support", "verify", "otp",

    // --- Regulatory, Government & Tax ---
    "cbn", "fgn", "efcc", "police", "npf", "naira", "enaira", "tax", "firs",
    "icpc","nan", "fan", "frsc", "nscdc", "customs", "ncs", "nis", "immigration", "dss", "nia",
    "nafdac", "ncc", "nimc", "nin", "cac", "inec", "ndlea", "nema", "cibn", "sec",

    // --- Tier 1 & 2 Commercial Banks (and Holding Companies) ---
    "access", "accessbank", "fidelity", "fidelitybank", "firstbank", "fbn",
    "guaranty", "gtbank", "gtb", "gtco", "unitedbank", "uba", "zenith", "zenithbank",
    "fcmb", "ecobank", "citibank", "globus", "keystone", "keystonebank", "polaris", 
    "polarisbank", "stanbic", "stanbicibtc", "standardchartered", "stanchart", 
    "sterling", "sterlingbank", "titan", "titantrust", "union", "unionbank", 
    "unity", "unitybank", "wema", "providus", "providusbank", "parallex", "parallexbank", 
    "suntrust", "suntrustbank", "signature", "signaturebank", "optimus", "optimusbank",
    "heritage", "heritagebank", "premiumtrust",

    // --- Non-Interest & Merchant Banks ---
    "jaiz", "jaizbank", "taj", "tajbank", "lotus", "lotusbank", "altbank", "alternativebank",
    "coronation", "fbnmerchant", "fsdh", "greenwich", "nova", "novabank", "randmerchant", "rmb",

    // --- Top Fintechs, Neo-banks & Payment Operators ---
    "opay", "palmpay", "palm", "kuda", "kudabank", "moniepoint", "flutterwave", "f4w",
    "interswitch", "vulte", "carbon", "fairmoney", "piggyvest", "cowrywise", "rubies",
    "chipper", "chippercash", "bundle", "paga", "baxi"
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

        // 5. Sender ID Spoofing Guard & Admin Authorization
        let requestedSender = (senderName || "Dnezerlinks").trim();
        const normalizedSender = requestedSender.toLowerCase().replace(/[\s-_\.]/g, '');

        // TODO: Replace this placeholder string with your absolute admin Firebase UID
        const ADMIN_UID = 'YOUR_ACTUAL_ADMIN_UID_HERE'; 

        // Block unauthorized impersonation of the core admin brand name
        const isTryingToImpersonateAdmin = (normalizedSender.includes('dnezerlinks') || normalizedSender.includes('dnezer')) && activeUid !== ADMIN_UID;

        // Check against the expanded financial, tech, and agency blacklist
        const isRestrictedBrand = RESTRICTED_SENDER_IDS.some(restrictedWord => {
            // If the sender is the official admin, skip the system-level brand block
            if ((restrictedWord === 'dnezerlinks' || restrictedWord === 'dnezer') && activeUid === ADMIN_UID) {
                return false; 
            }
            return normalizedSender === restrictedWord || normalizedSender.includes(restrictedWord);
        });

        if (isTryingToImpersonateAdmin || isRestrictedBrand) {
            return res.status(403).json({
                success: false,
                error: `Security Alert: The Sender ID '${requestedSender}' matches a restricted commercial brand, financial institution, or government agency.`
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
