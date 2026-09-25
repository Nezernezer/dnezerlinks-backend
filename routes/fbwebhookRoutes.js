const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || 'https://api.dlinks.name.ng';                    
const userSessions = {};                                                                
const pendingPinTokens = {};
const pendingAuthTokens = {}; // Handles secure login/signup/reset/funding webview tokens

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes inactivity timeout
const PIN_TOKEN_EXPIRY_MS = 5 * 60 * 1000;  // 5 minutes webview token expiry           
const TOKEN_EXPIRY_MS = 5 * 60 * 1000;      // 5 minutes webview auth token expiry

// Data Plans Dictionary with Categories & 18% Profit Markup
const rawPlans = {
    "mtn": {
        "Special Data": [
            { id: "1", name: "500MB (1 Day) - ₦370.00", price: 370 },
            { id: "2", name: "1GB (7 Days) - ₦784.00", price: 784 },
            { id: "3", name: "1.5GB (7 Days) - ₦975.00", price: 975 },
            { id: "4", name: "2.7GB (30 Days) - ₦1950.00", price: 1950 },
            { id: "5", name: "6GB (7 Days) - ₦2412.50", price: 2412.5 },
            { id: "6", name: "10GB (30 Days) - ₦4387.50", price: 4387.5 }
        ],
        "DataShare": [
            { id: "121", name: "1GB DataShare (7 Days) - ₦395.00", price: 395 },
            { id: "122", name: "2GB (Monthly) DataShare (30 Days) - ₦930.00", price: 930 },
            { id: "123", name: "3GB (Monthly) DataShare (30 Days) - ₦1300.00", price: 1300 },
            { id: "124", name: "5GB (Monthly) DataShare (30 Days) - ₦1650.00", price: 1650 },
            { id: "304", name: "500MB (Weekly) (30 Days) - ₦290.00", price: 290 },
            { id: "457", name: "1GB (Monthly) (30 Days) - ₦490.00", price: 490 },
            { id: "464", name: "2GB (Weekly) (7 Days) - ₦800.00", price: 800 },
            { id: "465", name: "5GB (Weekly) (7 Days) - ₦1580.00", price: 1580 }
        ],
        "GiftingPlan": [
            { id: "173", name: "110MB (1 Day) - ₦97.40", price: 97.4 },
            { id: "174", name: "230MB (1 Day) - ₦194.80", price: 194.8 },
            { id: "175", name: "6GB (7 Days) - ₦2435.00", price: 2435 },
            { id: "176", name: "2.5GB (2 Days) - ₦876.60", price: 876.6 },
            { id: "178", name: "12.5GB (30 Days) - ₦5357.00", price: 5357 },
            { id: "244", name: "1GB + 15mins (1 Day) - ₦487.00", price: 487 },
            { id: "245", name: "1.5GB (2 Days) - ₦584.40", price: 584.4 },
            { id: "246", name: "3.2GB (2 Days) - ₦974.00", price: 974 },
            { id: "247", name: "16.5GB + 10mins (30 Days) - ₦6331.00", price: 6331 },
            { id: "248", name: "20GB (30 Days) - ₦7305.00", price: 7305 },
            { id: "249", name: "25GB (30 Days) - ₦8766.00", price: 8766 },
            { id: "250", name: "36GB (30 Days) - ₦10714.00", price: 10714 },
            { id: "251", name: "75GB (30 Days) - ₦17532.00", price: 17532 },
            { id: "262", name: "165GB (30 Days) - ₦34090.00", price: 34090 },
            { id: "264", name: "2GB (2 Days) - ₦730.50", price: 730.5 },
            { id: "265", name: "12.5GB (30 Days) - ₦5357.00", price: 5357 },
            { id: "443", name: "3.5GB (7 Days) - ₦1461.00", price: 1461 },
            { id: "444", name: "7GB (30 Days) - ₦3409.00", price: 3409 },
            { id: "445", name: "20GB (7 Days) - ₦4870.00", price: 4870 },
            { id: "462", name: "2.5GB (1 Day) - ₦730.00", price: 730 }
        ],
        "BigBundles": [
            { id: "299", name: "150GB 2-Month Plan (60 Days) - ₦39280.00", price: 39280 },
            { id: "301", name: "480GB 3-Month Plan (90 Days) - ₦88200.00", price: 88200 }
        ],
        "XtraSpecial": [
            { id: "302", name: "6.75GB (30 Days) - ₦2901.00", price: 2901 },
            { id: "303", name: "14.5GB (30 Days) - ₦4835.00", price: 4835 }
        ],
        "Social Media Data": [
            { id: "436", name: "200MB (1 Day) - ₦97.40", price: 97.4 },
            { id: "437", name: "470MB (7 Days) - ₦194.80", price: 194.8 },
            { id: "438", name: "1.2GB (30 Days) - ₦438.30", price: 438.3 }
        ],
        "DataShare2": [
            { id: "502", name: "3GB (Weekly) (7 Days) - ₦1130.00", price: 1130 }
        ],
        "AwoofData": [
            { id: "503", name: "1GB (1 Day) - ₦255.00", price: 255 }
        ]
    },
    "glo": {
        "AwoofData": [
            { id: "20", name: "750MB (1 Day) - ₦188.00", price: 188 },
            { id: "21", name: "1GB (3 Days) - ₦271.00", price: 271 },
            { id: "126", name: "1.5GB (1 Day) - ₦285.00", price: 285 },
            { id: "127", name: "2.5GB (2 Days) - ₦475.00", price: 475 },
            { id: "128", name: "10GB (7 Days) - ₦1855.00", price: 1855 }
        ],
        "Corporate": [
            { id: "22", name: "500MB (30 Days) - ₦196.00", price: 196 },
            { id: "23", name: "1GB (30 Days) - ₦392.00", price: 392 },
            { id: "24", name: "2GB (30 Days) - ₦784.00", price: 784 },
            { id: "25", name: "3GB (30 Days) - ₦1176.00", price: 1176 },
            { id: "26", name: "5GB (30 Days) - ₦1960.00", price: 1960 },
            { id: "27", name: "10GB (30 Days) - ₦3920.00", price: 3920 },
            { id: "50", name: "200MB (14 Days) - ₦90.00", price: 90 }
        ],
        "Gifting Plans": [
            { id: "153", name: "125MB + 5MB Night (1 Day) - ₦98.00", price: 98 },
            { id: "154", name: "275MB + 25MB Night (2 Days) - ₦196.00", price: 196 },
            { id: "155", name: "1.5GB (1GB Night) (14 Days) - ₦490.00", price: 490 },
            { id: "156", name: "2.6GB (1.5GB Night) (30 Days) - ₦980.00", price: 980 },
            { id: "157", name: "5.2GB (3GB Night) (30 Days) - ₦1470.00", price: 1470 },
            { id: "158", name: "7.25GB (3GB Night) (30 Days) - ₦2450.00", price: 2450 },
            { id: "159", name: "10.5GB (2GB Night) (30 Days) - ₦2940.00", price: 2940 },
            { id: "160", name: "12.5GB (2GB Night) (30 Days) - ₦3920.00", price: 3920 },
            { id: "161", name: "16.5GB (2.5GB Night) (30 Days) - ₦4900.00", price: 4900 },
            { id: "162", name: "26GB (2GB Night) (30 Days) - ₦7840.00", price: 7840 },
            { id: "163", name: "42GB (4GB Night) (30 Days) - ₦9800.00", price: 9800 },
            { id: "164", name: "64GB (2GB Night) (30 Days) - ₦14700.00", price: 14700 },
            { id: "166", name: "107GB (2GB Night) (30 Days) - ₦19600.00", price: 19600 }
        ],
        "BigBundles": [
            { id: "167", name: "165GB (30 Days) - ₦29400.00", price: 29400 },
            { id: "168", name: "220GB (30 Days) - ₦39200.00", price: 39200 },
            { id: "169", name: "310GB (60 Days) - ₦49000.00", price: 49000 },
            { id: "170", name: "355GB (90 Days) - ₦58800.00", price: 58800 },
            { id: "171", name: "475GB (90 Days) - ₦73500.00", price: 73500 },
            { id: "487", name: "1TB (365 Days) - ₦147000.00", price: 147000 }
        ],
        "Corporate2": [
            { id: "447", name: "1GB (3 Days) - ₦271.00", price: 271 },
            { id: "448", name: "3GB (3 Days) - ₦813.00", price: 813 },
            { id: "449", name: "5GB (3 Days) - ₦1355.00", price: 1355 },
            { id: "453", name: "1GB (7 Days) - ₦318.00", price: 318 },
            { id: "455", name: "5GB (7 Days) - ₦1590.00", price: 1590 }
        ],
        "SocialMedia": [
            { id: "469", name: "135MB Social (3 Days) - ₦49.00", price: 49 },
            { id: "470", name: "335MB Social (7 Days) - ₦98.00", price: 98 },
            { id: "471", name: "1.1GB Social (10 Days) - ₦294.00", price: 294 },
            { id: "472", name: "1.8GB Social (15 Days) - ₦490.00", price: 490 }
        ],
        "YoutubeBundle": [
            { id: "473", name: "1GB Youtube (1 Day) - ₦245.00", price: 245 },
            { id: "474", name: "3GB Youtube (2 Days) - ₦588.00", price: 588 }
        ],
        "My-G": [
            { id: "475", name: "300MB My-G (1 Day) - ₦98.00", price: 98 },
            { id: "476", name: "1GB My-G (3 Days) - ₦294.00", price: 294 },
            { id: "477", name: "1.5GB My-G (7 Days) - ₦490.00", price: 490 },
            { id: "478", name: "3.5GB My-G (30 Days) - ₦980.00", price: 980 }
        ],
        "Campus-Boost": [
            { id: "479", name: "235MB (1 Day) - ₦98.00", price: 98 },
            { id: "480", name: "480MB (2 Days) - ₦196.00", price: 196 },
            { id: "481", name: "2GB (7 Days) - ₦490.00", price: 490 },
            { id: "482", name: "4.2GB (30 Days) - ₦980.00", price: 980 },
            { id: "483", name: "10.6GB (30 Days) - ₦1960.00", price: 1960 },
            { id: "484", name: "32GB (30 Days) - ₦4900.00", price: 4900 }
        ],
        "Night-Data": [
            { id: "485", name: "350MB (1 Day) - ₦58.80", price: 58.8 },
            { id: "486", name: "750MB (1 Day) - ₦117.60", price: 117.6 }
        ]
    },
    "airtel": {
        "Corporate": [
            { id: "28", name: "500MB (7 Days) - ₦489.00", price: 489 },
            { id: "29", name: "1GB (7 Days) - ₦782.40", price: 782.4 },
            { id: "30", name: "2GB (30 Days) - ₦1467.00", price: 1467 },
            { id: "31", name: "100MB (1 Day) - ₦97.80", price: 97.8 },
            { id: "32", name: "6GB (30 Days) - ₦2934.00", price: 2934 },
            { id: "33", name: "10GB (30 Days) - ₦3912.00", price: 3912 },
            { id: "38", name: "200MB (2 Days) - ₦195.60", price: 195.6 },
            { id: "82", name: "18GB (30 Days) - ₦5868.00", price: 5868 },
            { id: "83", name: "25GB (30 Days) - ₦7824.00", price: 7824 },
            { id: "260", name: "35GB (30 Days) - ₦9820.00", price: 9820 }
        ],
        "SME": [
            { id: "111", name: "150MB (1 Day) - ₦55.00", price: 55 },
            { id: "112", name: "300MB (2 Days) - ₦115.00", price: 115 },
            { id: "114", name: "2GB (2 Days) - ₦640.00", price: 640 },
            { id: "116", name: "3GB (2 Days) - ₦810.00", price: 810 },
            { id: "118", name: "10GB (30 Days) - ₦3065.00", price: 3065 },
            { id: "233", name: "1.5GB (1 Day) - ₦422.00", price: 422 },
            { id: "500", name: "3.5GB (7 Days) - ₦1515.00", price: 1515 },
            { id: "501", name: "5GB (7 Days) - ₦2465.00", price: 2465 }
        ],
        "GiftingPlan": [
            { id: "200", name: "100MB (1 Day) - ₦97.80", price: 97.8 },
            { id: "201", name: "200MB (2 Days) - ₦195.60", price: 195.6 },
            { id: "202", name: "300MB (1 Day) - ₦293.40", price: 293.4 },
            { id: "203", name: "500MB (7 Days) - ₦489.00", price: 489 },
            { id: "204", name: "1.5GB (7 Days) - ₦978.00", price: 978 },
            { id: "205", name: "3.5GB (7 Days) - ₦1467.00", price: 1467 },
            { id: "206", name: "4GB (30 Days) - ₦2445.00", price: 2445 },
            { id: "207", name: "8GB (30 Days) - ₦2934.00", price: 2934 },
            { id: "208", name: "10GB (30 Days) - ₦3912.00", price: 3912 },
            { id: "209", name: "13GB (30 Days) - ₦4890.00", price: 4890 },
            { id: "305", name: "1GB (7 Days) - ₦782.40", price: 782.4 },
            { id: "306", name: "2GB (30 Days) - ₦1467.00", price: 1467 },
            { id: "307", name: "3GB (30 Days) - ₦1956.00", price: 1956 },
            { id: "308", name: "6GB (7 Days) - ₦2445.00", price: 2445 },
            { id: "309", name: "10GB (7 Days) - ₦2934.00", price: 2934 },
            { id: "310", name: "18GB (7 Days) - ₦4890.00", price: 4890 },
            { id: "311", name: "18GB (30 Days) - ₦5868.00", price: 5868 },
            { id: "312", name: "25GB (30 Days) - ₦7824.00", price: 7824 },
            { id: "313", name: "35GB (30 Days) - ₦9780.00", price: 9780 },
            { id: "314", name: "60GB (30 Days) - ₦14670.00", price: 14670 },
            { id: "315", name: "100GB (30 Days) - ₦19560.00", price: 19560 }
        ],
        "SocialMedia": [
            { id: "275", name: "200MB (Social Media) (2 Days) - ₦98.10", price: 98.1 },
            { id: "276", name: "1GB (Social Media) (3 Days) - ₦294.20", price: 294.2 },
            { id: "277", name: "1.5GB (Social Media) (7 Days) - ₦490.50", price: 490.5 }
        ],
        "BingePlans": [
            { id: "282", name: "500 Naira Binge Plan (1 Day) - ₦491.00", price: 491 },
            { id: "283", name: "1.5GB Binge + Social (2 Days) - ₦586.50", price: 586.5 },
            { id: "284", name: "2GB Binge + Social (2 Days) - ₦736.50", price: 736.5 },
            { id: "285", name: "3.2GB Binge + Social (2 Days) - ₦982.00", price: 982 }
        ],
        "MiFi": [
            { id: "286", name: "13GB MiFi Data (30 Days) - ₦4910.00", price: 4910 },
            { id: "287", name: "35GB MiFi Data (30 Days) - ₦9820.00", price: 9820 },
            { id: "288", name: "60GB MiFi Data (30 Days) - ₦14730.00", price: 14730 }
        ],
        "Router": [
            { id: "289", name: "100GB Unlimited Ultra 20 (30 Days) - ₦19640.00", price: 19640 },
            { id: "290", name: "Unlimited 20MBPS (30 Days) - ₦29460.00", price: 29460 },
            { id: "291", name: "Unlimited 60MBPS (30 Days) - ₦49100.00", price: 49100 },
            { id: "292", name: "Unlimited 60MBPS (90 Days) - ₦78560.00", price: 78560 },
            { id: "293", name: "Unlimited 60MBPS (90 Days) - ₦132570.00", price: 132570 },
            { id: "294", name: "Unlimited 20MBPS (120 Days) - ₦147300.00", price: 147300 }
        ],
        "BigBundles": [
            { id: "295", name: "100GB (30 Days) - ₦19640.00", price: 19640 },
            { id: "296", name: "160GB (30 Days) - ₦29460.00", price: 29460 },
            { id: "297", name: "200GB (90 Days) - ₦49100.00", price: 49100 },
            { id: "298", name: "680GB (365 Days) - ₦98200.00", price: 98200 }
        ]
    },
    "9mobile": {
        "GiftingPlan": [
            { id: "488", name: "83MB (1 Day) - ₦98.00", price: 98 },
            { id: "489", name: "150MB+100MB (1 Day) - ₦147.00", price: 147 },
            { id: "490", name: "650MB (3 Days) - ₦490.00", price: 490 },
            { id: "491", name: "2GB (30 Days) - ₦980.00", price: 980 },
            { id: "492", name: "8.4GB (30 Days) - ₦3920.00", price: 3920 },
            { id: "493", name: "4.5GB (30 Days) - ₦1960.00", price: 1960 },
            { id: "494", name: "11.4GB (30 Days) - ₦4900.00", price: 4900 },
            { id: "495", name: "6.2GB (30 Days) - ₦2940.00", price: 2940 },
            { id: "496", name: "2.3GB (30 Days) - ₦1176.00", price: 1176 },
            { id: "497", name: "40MB (1 Day) - ₦49.00", price: 49 },
            { id: "498", name: "5.2GB (30 Days) - ₦2450.00", price: 2450 },
            { id: "499", name: "200MB-250MB (7 Days) - ₦196.00", price: 196 }
        ]
    }
};

const addProfit = (price) => Math.ceil(price + (price * 0.18));

const processPlans = (data) => {
    let processed = {};
    for (let network in data) {
        processed[network] = {};
        for (let category in data[network]) {
            processed[network][category] = data[network][category].map(plan => ({
                ...plan,
                price: addProfit(plan.price)
            }));
        }
    }
    return processed;
};

const groupedPlans = processPlans(rawPlans);

// Webhook Verification
router.get('/', (req, res) => {                                                             
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];                                       
    if (mode && token) {                                                                        
        if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
            console.log('✅ Facebook Webhook Verified Successfully.');                              
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);                                                         
        }
    }
    return res.sendStatus(400);
});

// Incoming Messenger messages
router.post('/', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');

        for (const entry of body.entry) {
            if (!entry.messaging) continue;

            for (const webhookEvent of entry.messaging) {
                if (webhookEvent.message && webhookEvent.message.text && !webhookEvent.message.is_echo) {
                    const senderPsid = webhookEvent.sender.id;
                    const incomingText = webhookEvent.message.text.trim();
                    await handleUserMessage(senderPsid, incomingText);
                }
            }
        }
    } else {
        return res.sendStatus(404);
    }
});

// Secure PIN Portal GET
router.get('/secure-pin-portal', (req, res) => {
    const { token } = req.query;

    if (!token || !pendingPinTokens[token]) {
        return res.status(400).send(`
            <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Expired Link</title>
            <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f8fafc;color:#1e293b;}</style></head>
            <body><h2 style="color:#dc2626;">❌ Link Expired or Invalid</h2><p>Please start a new request in Messenger.</p></body></html>
        `);
    }

    const sessionData = pendingPinTokens[token];
    if (Date.now() > sessionData.expiresAt) {
        delete pendingPinTokens[token];                                                         
        return res.status(400).send("<h3>❌ Link has expired. Please restart the transaction in Messenger.</h3>");                                                                  
    }

    const { service, phone, network, amount, dataPlan, cableProvider, smartcard, cablePlan, disco, meterNumber, recipients, senderId } = sessionData;

    res.send(`
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dnezerlinks Secure PIN Authorization</title>
        <script src="https://connect.facebook.net/en_US/messenger.Extensions.js" crossorigin="anonymous"></script>
        <style>
            body { font-family: -apple-system, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; height: 100vh; }
            .card { background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 360px; text-align: center; }
            h3 { color: #1e293b; margin-bottom: 8px; } p { color: #64748b; font-size: 14px; margin-bottom: 20px; }
            .summary { background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 16px; text-align: left; font-size: 13px; color: #334155; }
            input[type="password"] { width: 100%; padding: 12px; font-size: 18px; text-align: center; letter-spacing: 4px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; margin-bottom: 16px; outline: none; }
            button { background: #2563eb; color: white; border: none; width: 100%; padding: 12px; font-size: 16px; font-weight: 600; border-radius: 8px; cursor: pointer; }
            .loader { display: none; margin-top: 10px; font-size: 14px; color: #2563eb; }
            .error-msg { color: #dc2626; font-size: 13px; margin-bottom: 12px; font-weight: 500; display: none; }
        </style></head>
        <body>
            <div class="card">
                <h3>🔒 Authorize Transaction</h3><p>Enter your 4-digit transaction PIN securely</p>
                <div class="summary">
                    <div><b>Service:</b> ${service.toUpperCase()}</div>
                    ${network ? `<div><b>Network:</b> ${network.toUpperCase()}</div>` : ''}
                    ${phone ? `<div><b>Phone:</b> ${phone}</div>` : ''}
                    ${dataPlan ? `<div><b>Plan:</b> ${dataPlan}</div>` : ''}
                    <div><b>Amount:</b> NGN ${Number(amount).toLocaleString()}</div>
                </div>
                <div id="errorMsg" class="error-msg"></div>
                <form id="pinForm">
                    <input type="hidden" name="token" id="tokenField" value="${token}">
                    <input type="password" id="pinInput" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required autofocus>
                    <button type="submit" id="submitBtn">Authorize & Pay</button>
                    <div class="loader" id="loader">Processing transaction securely...</div>
                </form>
            </div>
            <script>
                function closeMessengerWindow() {
                    if (typeof MessengerExtensions !== 'undefined') {
                        MessengerExtensions.requestCloseBrowser(() => {}, () => window.close());
                    } else { window.close(); }
                }
                document.getElementById('pinForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const pin = document.getElementById('pinInput').value;
                    const token = document.getElementById('tokenField').value;
                    const submitBtn = document.getElementById('submitBtn'), loader = document.getElementById('loader'), errorMsg = document.getElementById('errorMsg');
                    submitBtn.disabled = true; loader.style.display = 'block'; errorMsg.style.display = 'none';
                    try {
                        const response = await fetch('./secure-pin-portal-submit', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token, pin })
                        });
                        const result = await response.json();
                        if (result.success || result.closeWindow) { closeMessengerWindow(); } 
                        else {
                            loader.style.display = 'none'; submitBtn.disabled = false;
                            document.getElementById('pinInput').value = '';
                            errorMsg.innerText = result.message; errorMsg.style.display = 'block';
                        }
                    } catch (err) {
                        loader.style.display = 'none'; submitBtn.disabled = false;
                        errorMsg.innerText = "Network error. Please try again."; errorMsg.style.display = 'block';
                    }
                });
            </script>
        </body></html>
    `);
});

// Secure PIN Portal Submit POST
router.post('/secure-pin-portal-submit', express.json(), async (req, res) => {
    const { token, pin } = req.body;
    if (!token || !pendingPinTokens[token]) return res.json({ success: false, message: "❌ Link is invalid or expired.", closeWindow: true });

    const sessionData = pendingPinTokens[token];
    if (Date.now() > sessionData.expiresAt) {
        delete pendingPinTokens[token];                                                         
        return res.json({ success: false, message: "❌ Link has expired.", closeWindow: true });
    }

    const { psid, service, phone, network, amount, dataPlan, cableProvider, smartcard, cablePlan, disco, meterNumber, recipients, senderId, message } = sessionData;

    try {                                                                                       
        const userId = await getLinkedUserId(psid);
        if (!userId) {
            delete pendingPinTokens[token];
            return res.json({ success: false, message: "❌ Account not linked.", closeWindow: true });
        }

        const userSnap = await admin.database().ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) return res.json({ success: false, message: "❌ User profile not found.", closeWindow: true });

        const userData = userSnap.val();
        const correctPin = userData.pin || userData.transaction_pin;

        if (String(pin).trim() !== String(correctPin).trim()) {
            sessionData.attempts = (sessionData.attempts || 0) + 1;
            const attemptsLeft = 3 - sessionData.attempts;

            if (sessionData.attempts >= 3) {
                delete pendingPinTokens[token];
                delete userSessions[psid];
                await sendMessengerReply(psid, { text: "❌ Incorrect PIN entered 3 times. Action cancelled. Type 'menu' to start over." });
                return res.json({ success: false, message: "Max attempts reached.", closeWindow: true });
            }

            return res.json({ success: false, message: `❌ Invalid PIN. Try again (${attemptsLeft} attempt(s) left).`, closeWindow: false });
        }

        delete pendingPinTokens[token];
        delete userSessions[psid];
        const parsedAmount = parseFloat(amount);

        if (service === 'airtime') {
            const networkMap = { 'mtn': '1', 'glo': '2', '9mobile': '3', 'airtel': '4' };
            const response = await axios.post(`${APP_URL}/api/airtime/buy`, {
                uid: userId, phone, amount: parsedAmount, networkID: networkMap[network?.toLowerCase()] || network, pin
            }, { timeout: 55000 });

            if (response.data?.success) {
                await sendMessengerReply(psid, { text: `✅ Airtime Purchase Successful!\nNetwork: ${network.toUpperCase()}\nPhone: ${phone}\nAmount: ₦${parsedAmount.toLocaleString()}` });
                return res.json({ success: true });
            } else {
                await sendMessengerReply(psid, { text: `❌ Airtime Failed: ${response.data.error || 'Failed'}` });
                return res.json({ success: false, closeWindow: true });
            }
        }

        if (service === 'data') {
            const networkMap = { 'mtn': '1', 'glo': '2', '9mobile': '3', 'airtel': '4' };                                                                                                   
            const response = await axios.post(`${APP_URL}/api/data/buy`, {                                           
                uid: userId, phone, dataPlan: String(dataPlan), networkID: networkMap[network?.toLowerCase()] || network, amount: parsedAmount, pin                                                                            
            }, { timeout: 55000 });
                                                                                                    
            if (response.data?.success) {                                                           
                await sendMessengerReply(psid, { text: `✅ Data Subscription Successful!\nNetwork: ${network.toUpperCase()}\nPhone: ${phone}\nPlan ID: ${dataPlan}\nAmount: ₦${parsedAmount.toLocaleString()}` });
                return res.json({ success: true });                                                 
            } else {
                await sendMessengerReply(psid, { text: `❌ Data Purchase Failed: ${response.data.error || 'Failed'}` });                                                                                              
                return res.json({ success: false, closeWindow: true });
            }                                                                                   
        }

        if (service === 'cable') {
            const response = await axios.post(`${APP_URL}/api/cable/buy`, { uid: userId, provider: cableProvider, smartcard, plan: cablePlan, amount: parsedAmount, pin }, { timeout: 55000 });
            if (response.data?.success) {
                await sendMessengerReply(psid, { text: `✅ Cable TV Subscription Successful!\nProvider: ${cableProvider.toUpperCase()}\nSmartcard: ${smartcard}\nAmount: ₦${parsedAmount.toLocaleString()}` });
                return res.json({ success: true });
            } else {
                await sendMessengerReply(psid, { text: `❌ Cable Subscription Failed: ${response.data.error}` });
                return res.json({ success: false, closeWindow: true });
            }
        }

        if (service === 'electricity') {
            const response = await axios.post(`${APP_URL}/api/electricity/buy`, { uid: userId, disco, meterNumber, amount: parsedAmount, pin }, { timeout: 55000 });
            if (response.data?.success) {
                await sendMessengerReply(psid, { text: `✅ Electricity Token Purchase Successful!\nDISCO: ${disco.toUpperCase()}\nMeter: ${meterNumber}\nToken: ${response.data.token || 'N/A'}\nAmount: ₦${parsedAmount.toLocaleString()}` });
                return res.json({ success: true });
            } else {
                await sendMessengerReply(psid, { text: `❌ Electricity Failed: ${response.data.error}` });
                return res.json({ success: false, closeWindow: true });
            }
        }

        if (service === 'bulksms') {
            const response = await axios.post(`${APP_URL}/api/bulksms/send`, { uid: userId, recipients, senderId, message, amount: parsedAmount, pin }, { timeout: 55000 });
            if (response.data?.success) {
                await sendMessengerReply(psid, { text: `✅ Bulk SMS Sent Successfully!\nSender ID: ${senderId}\nCost: ₦${parsedAmount.toLocaleString()}` });
                return res.json({ success: true });
            } else {
                await sendMessengerReply(psid, { text: `❌ Bulk SMS Failed: ${response.data.error}` });
                return res.json({ success: false, closeWindow: true });
            }
        }

        if (service === 'fund_wallet') {
            const currentBalance = Number(userData.balance || 0);
            const newBalance = currentBalance + parsedAmount;
            await admin.database().ref(`users/${userId}`).update({ balance: newBalance, updatedAt: new Date().toISOString() });
            await admin.database().ref(`users/${userId}/transactions`).push({ type: 'wallet_funding', amount: parsedAmount, status: 'success', date: new Date().toISOString() });
            await sendMessengerReply(psid, { text: `✅ Wallet Funded Successfully!\nAdded: ₦${parsedAmount.toLocaleString()}\nNew Balance: ₦${newBalance.toLocaleString()}` });
            return res.json({ success: true });
        }
                                                                                                
        return res.json({ success: true });
    } catch (error) {
        delete pendingPinTokens[token];
        await sendMessengerReply(psid, { text: `❌ Action Failed: ${error.message}` });
        return res.json({ success: false, closeWindow: true });
    }
});

// Secure Auth Portal GET
router.get('/secure-auth-portal', (req, res) => {
    const { token } = req.query;
    if (!token || !pendingAuthTokens[token]) return res.status(400).send("<h3>❌ Link Expired or Invalid.</h3>");

    const sessionData = pendingAuthTokens[token];
    if (Date.now() > sessionData.expiresAt) {
        delete pendingAuthTokens[token];
        return res.status(400).send("<h3>❌ Link Expired.</h3>");
    }

    const { action } = sessionData;
    let title = "Dnezerlinks Access", htmlForm = '';
                                                                                            
    if (action === 'login') {
        title = "Login to Dnezerlinks";
        htmlForm = `<h3>🔐 Account Login</h3><form id="authForm"><input type="email" id="email" placeholder="Email" required><br><input type="password" id="password" placeholder="Password" required><br><button type="submit" id="submitBtn">Login Securely</button></form>`;
    } else if (action === 'register') {
        title = "Create Account";
        htmlForm = `<h3>📝 Account Registration</h3><form id="authForm"><input type="text" id="name" placeholder="Full Name" required><br><input type="tel" id="phone" placeholder="Phone" required><br><input type="text" id="address" placeholder="Address" required><br><input type="email" id="email" placeholder="Email" required><br><input type="password" id="password" placeholder="Password" required><br><input type="password" id="pin" pattern="[0-9]{4}" maxlength="4" placeholder="4-Digit PIN" required><br><button type="submit" id="submitBtn">Sign Up Securely</button></form>`;
    } else if (action === 'forgot') {
        title = "Reset Password";
        htmlForm = `<h3>🔄 Password Recovery</h3><form id="authForm"><input type="email" id="email" placeholder="Email" required><br><button type="submit" id="submitBtn">Send Reset Link</button></form>`;
    }

    res.send(`
        <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title><script src="https://connect.facebook.net/en_US/messenger.Extensions.js" crossorigin="anonymous"></script>
        <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
        <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
        <style>
            body { font-family: -apple-system, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; height: 100vh; }
            .card { background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 360px; text-align: center; }
            input { width: 100%; padding: 12px; font-size: 15px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; margin-bottom: 12px; outline: none; }
            button { background: #2563eb; color: white; border: none; width: 100%; padding: 12px; font-size: 15px; font-weight: 600; border-radius: 8px; cursor: pointer; }
            .error-msg { color: #dc2626; font-size: 13px; margin-bottom: 12px; display: none; }
        </style></head>
        <body>
            <div class="card"><div id="errorMsg" class="error-msg"></div>${htmlForm}<div class="loader" id="loader" style="display:none;color:#2563eb;margin-top:10px;">Processing...</div></div>
            <script>
                firebase.initializeApp({ apiKey: "AIzaSyAXWh3ls4yEANmGy4g7xZ8jlBN0KoFC5yc", authDomain: "dnezerlinks.firebaseapp.com", databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com", projectId: "dnezerlinks-vtu" });
                function closeWindow() { if (typeof MessengerExtensions !== 'undefined') { MessengerExtensions.requestCloseBrowser(()=>{},()=>window.close()); } else { window.close(); } }
                document.getElementById('authForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('email')?.value.trim(), password = document.getElementById('password')?.value;
                    const name = document.getElementById('name')?.value?.trim(), phone = document.getElementById('phone')?.value?.trim();
                    const address = document.getElementById('address')?.value?.trim(), pin = document.getElementById('pin')?.value?.trim();
                    const btn = document.getElementById('submitBtn'), loader = document.getElementById('loader'), err = document.getElementById('errorMsg');
                    btn.disabled = true; loader.style.display = 'block'; err.style.display = 'none';
                    try {
                        let body = { token: "${token}", action: "${action}", email, password, name, phone, address, pin };
                        if ("${action}" === 'login') {
                            const userCred = await firebase.auth().signInWithEmailAndPassword(email, password);
                            body.idToken = await userCred.user.getIdToken();
                            delete body.password;
                        }
                        const res = await fetch('./secure-auth-portal-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                        const result = await res.json();
                        if (result.success) { closeWindow(); } else { loader.style.display = 'none'; btn.disabled = false; err.innerText = result.message; err.style.display = 'block'; }
                    } catch(ex) {
                        loader.style.display = 'none'; btn.disabled = false; err.innerText = ex.message || 'Error occurred.'; err.style.display = 'block';
                    }
                });
            </script>
        </body></html>
    `);
});

// Secure Auth Portal Submit POST
router.post('/secure-auth-portal-submit', express.json(), async (req, res) => {
    const { token, action, email, password, name, phone, address, pin, idToken } = req.body;
    if (!token || !pendingAuthTokens[token]) return res.json({ success: false, message: "❌ Link expired." });                                                           
    const sessionData = pendingAuthTokens[token];                                           
    if (Date.now() > sessionData.expiresAt) { delete pendingAuthTokens[token]; return res.json({ success: false, message: "❌ Link expired." }); }
                                                                                            
    const psid = sessionData.psid;
    const cleanEmail = email ? email.toLowerCase().trim() : '';

    try {
        if (action === 'login') {
            const decoded = await admin.auth().verifyIdToken(idToken);
            if ((decoded.email || '').toLowerCase() !== cleanEmail) return res.json({ success: false, message: "❌ Email mismatch." });

            const snapshot = await admin.database().ref('users').orderByChild('email').equalTo(cleanEmail).once('value');
            if (!snapshot.exists()) return res.json({ success: false, message: "❌ No account found." });

            let userId = null;
            snapshot.forEach((child) => { userId = child.key; });

            await admin.database().ref(`messenger_links/${psid}`).set({ userId, email: cleanEmail, linkedAt: new Date().toISOString() });
            await admin.database().ref(`users/${userId}/messenger_psid`).set(psid);
            delete pendingAuthTokens[token];
            await sendMessengerReply(psid, { text: `✅ Successfully Logged In & Linked to ${cleanEmail}!` });
            return res.json({ success: true });
        }

        if (action === 'register') {
            const usersRef = admin.database().ref('users');
            const snapshot = await usersRef.orderByChild('email').equalTo(cleanEmail).once('value');
            if (snapshot.exists()) return res.json({ success: false, message: "❌ Account already exists." });

            const newUserRef = usersRef.push();
            const userId = newUserRef.key;
            await newUserRef.set({ userId, name, email: cleanEmail, phone, address, password: password.trim(), pin, transaction_pin: pin, balance: 0, account_status: "active", messenger_psid: psid, createdAt: new Date().toISOString() });
            await admin.database().ref(`messenger_links/${psid}`).set({ userId, email: cleanEmail, linkedAt: new Date().toISOString() });

            delete pendingAuthTokens[token];
            await sendMessengerReply(psid, { text: `🎉 Account Created & Linked Successfully!\nEmail: ${cleanEmail}\nBalance: ₦0.00` });
            return res.json({ success: true });
        }

        if (action === 'forgot') {
            await admin.auth().generatePasswordResetLink(cleanEmail);
            delete pendingAuthTokens[token];
            await sendMessengerReply(psid, { text: `🔄 Password reset instructions sent to ${cleanEmail}.` });
            return res.json({ success: true });
        }

        return res.json({ success: false, message: "❌ Invalid action." });       
    } catch (e) {
        return res.json({ success: false, message: `❌ Error: ${e.message}` });
    }
});

// Incoming message handling
async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();
    const now = Date.now();
    let currentSession = userSessions[senderPsid];

    if (currentSession && (now - currentSession.lastActive > SESSION_TIMEOUT_MS)) {
        delete userSessions[senderPsid];
        await sendMessengerReply(senderPsid, { text: "⏳ Session timed out. Type 'menu' to start over!" });
        return;
    }

    if (currentSession) currentSession.lastActive = now;

    if (lowerText === 'menu' || lowerText === 'start' || lowerText === 'help' || lowerText === 'hi' || lowerText === 'hello') {
        delete userSessions[senderPsid];
        const isLinked = await getLinkedUserId(senderPsid);

        let welcomeMenu = "Welcome to Dnezerlinks!\n\nPlease select an option to proceed:\n\n" +
            "1. Login (Secure Web Portal)\n" +
            "2. Create Account (Secure Sign Up)\n" +
            "9. Check Account Status\n";

        if (!isLinked) {
            welcomeMenu += 
                "3. Airtime Top-up\n" +
                "4. Data Bundles\n" +
                "5. Cable TV (DSTV / GOTV)\n" +
                "6. Electricity Bills\n" +                                                              
                "7. Bulk SMS\n" +
                "8. Check Wallet Balance\n" +                                                           
                "10. Forgot Password / Reset\n" +
                "11. Logout\n" +
                "12. Fund Wallet\n" +
                "13. Transaction History";
        } else {
            welcomeMenu += "\nℹ️ *Note:* Account is currently linked. To perform transactions or use other services, please log out (Option 11) or manage your status.";
        }
                                                                                            
        await sendMessengerReply(senderPsid, { text: welcomeMenu });
        return;
    }
                                                                                            
    if (currentSession) {
        await handleSessionFlow(senderPsid, text, currentSession);
        return;                                                                             
    }
                                                                                            
    if (text === '1' || lowerText === 'login') {
        const authToken = crypto.randomBytes(32).toString('hex');                               
        pendingAuthTokens[authToken] = { psid: senderPsid, action: 'login', expiresAt: Date.now() + TOKEN_EXPIRY_MS };
        await sendMessengerButtonTemplate(senderPsid, { text: "🔐 Log in securely:", buttonText: "🔐 Open Secure Login", url: `${APP_URL}/webhook/secure-auth-portal?token=${authToken}` });
        return;
    }
    if (text === '2' || lowerText === 'register' || lowerText === 'signup') {
        const authToken = crypto.randomBytes(32).toString('hex');
        pendingAuthTokens[authToken] = { psid: senderPsid, action: 'register', expiresAt: Date.now() + TOKEN_EXPIRY_MS };
        await sendMessengerButtonTemplate(senderPsid, { text: "📝 Register account securely:", buttonText: "📝 Open Secure Registration", url: `${APP_URL}/webhook/secure-auth-portal?token=${authToken}` });
        return;
    }
    if (text === '9' || lowerText === 'status') {
        const linkedUserId = await getLinkedUserId(senderPsid);
        const replyText = linkedUserId ? "Your Messenger is successfully linked to your Dnezerlinks account!" : "Account not linked yet. Select option 1 to Login or option 2 to Create Account.";
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    // Restriction check for linked accounts accessing other services
    const isLinked = await getLinkedUserId(senderPsid);
    if (isLinked && ['3', '4', '5', '6', '7', '8', '10', '12', '13'].includes(text)) {
        await sendMessengerReply(senderPsid, { text: "❌ Access Restricted: When your account is linked, you can only access options 1 (Login), 2 (Create Account), and 9 (Check Account Status). Please log out first if needed." });
        return;
    }

    if (text === '3') {
        userSessions[senderPsid] = { step: 'AIRTIME_PHONE', data: { service: 'airtime' }, lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Enter phone number for airtime recharge:" });
        return;
    }
    if (text === '4') {
        userSessions[senderPsid] = { step: 'DATA_NETWORK', data: { service: 'data' }, lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Select Network for Data:\n1. MTN\n2. Glo\n3. Airtel\n4. 9mobile" });
        return;
    }
    if (text === '5') {
        userSessions[senderPsid] = { step: 'CABLE_PROVIDER', data: { service: 'cable' }, lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Select Cable TV Provider:\n1. DSTV\n2. GOTV\n3. Startimes" });
        return;
    }
    if (text === '6') {
        userSessions[senderPsid] = { step: 'ELECTRICITY_DISCO', data: { service: 'electricity' }, lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Enter Electricity Distribution Company (e.g., AEDC, Ikeja Electric, Eko, PHED):" });
        return;
    }
    if (text === '7') {
        userSessions[senderPsid] = { step: 'BULKSMS_RECIPIENTS', data: { service: 'bulksms' }, lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Enter recipient phone number(s) separated by commas:" });
        return;
    }                                                                                       
    if (text === '8' || lowerText === 'balance') {
        const replyText = await checkBalance(senderPsid);                                       
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }
    if (text === '10' || lowerText === 'forgot' || lowerText === 'reset') {
        const authToken = crypto.randomBytes(32).toString('hex');
        pendingAuthTokens[authToken] = { psid: senderPsid, action: 'forgot', expiresAt: Date.now() + TOKEN_EXPIRY_MS };
        await sendMessengerButtonTemplate(senderPsid, { text: "🔄 Recover password securely:", buttonText: "🔄 Reset Password", url: `${APP_URL}/webhook/secure-auth-portal?token=${authToken}` });
        return;
    }
    if (text === '11' || lowerText === 'logout') {
        const replyText = await logoutAccount(senderPsid);
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }
    if (text === '12' || lowerText === 'fund' || lowerText === 'fund wallet') {
        userSessions[senderPsid] = { step: 'FUND_WALLET_AMOUNT', data: { service: 'fund_wallet' }, lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Enter amount you want to add to your wallet (Min ₦100):" });
        return;
    }
    if (text === '13' || lowerText === 'history' || lowerText === 'transactions') {
        const replyText = await getTransactionHistory(senderPsid);
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    await sendMessengerReply(senderPsid, { text: "Welcome to Dnezerlinks! Type 'menu' to see all available options." });
}

async function handleSessionFlow(senderPsid, text, session) {                               
    if (session.step === 'AIRTIME_PHONE') {
        session.data.phone = text.trim();
        session.step = 'AIRTIME_NETWORK';
        await sendMessengerReply(senderPsid, { text: "Select network:\n1. MTN\n2. Glo\n3. 9mobile\n4. Airtel" });
        return;
    }                                                                                       
    if (session.step === 'AIRTIME_NETWORK') {
        const netMap = { '1': 'mtn', '2': 'glo', '3': '9mobile', '4': 'airtel' };               
        session.data.network = netMap[text.trim()] || text.trim().toLowerCase();
        session.step = 'AIRTIME_AMOUNT';
        await sendMessengerReply(senderPsid, { text: "Enter amount (Min ₦100):" });
        return;
    }
    if (session.step === 'AIRTIME_AMOUNT') {
        session.data.amount = text.trim();
        delete userSessions[senderPsid];
        const pinToken = crypto.randomBytes(32).toString('hex');
        pendingPinTokens[pinToken] = { psid: senderPsid, service: 'airtime', phone: session.data.phone, network: session.data.network, amount: session.data.amount, expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0 };
        await sendMessengerButtonTemplate(senderPsid, { text: `Review Airtime:\nNetwork: ${session.data.network.toUpperCase()}\nPhone: ${session.data.phone}\nAmount: ₦${session.data.amount}`, buttonText: "🔐 Enter PIN Securely", url: `${APP_URL}/webhook/secure-pin-portal?token=${pinToken}` });
        return;
    }

    // --- Dynamic Categorized Data Flow ---
    if (session.step === 'DATA_NETWORK') {
        const netMap = { '1': 'mtn', '2': 'glo', '3': 'airtel', '4': '9mobile' };
        const selectedNet = netMap[text.trim()] || text.trim().toLowerCase();
        if (!groupedPlans[selectedNet]) {
            await sendMessengerReply(senderPsid, { text: "❌ Invalid network choice. Select network:\n1. MTN\n2. Glo\n3. Airtel\n4. 9mobile" });
            return;
        }
        session.data.network = selectedNet;
        session.step = 'DATA_CATEGORY';

        const categories = Object.keys(groupedPlans[selectedNet]);
        session.data.categoriesList = categories;
        let catPrompt = `Select Category for ${selectedNet.toUpperCase()}:\n`;
        categories.forEach((cat, index) => { catPrompt += `${index + 1}. ${cat}\n`; });
        await sendMessengerReply(senderPsid, { text: catPrompt });
        return;
    }

    if (session.step === 'DATA_CATEGORY') {
        const catIndex = parseInt(text.trim()) - 1;
        const categories = session.data.categoriesList;
        if (isNaN(catIndex) || !categories[catIndex]) {
            await sendMessengerReply(senderPsid, { text: "❌ Invalid selection. Choose a valid category number:" });
            return;
        }
        const selectedCategory = categories[catIndex];
        session.data.category = selectedCategory;
        session.step = 'DATA_PLAN_SELECT';

        const plans = groupedPlans[session.data.network][selectedCategory];
        session.data.plansList = plans;
        let planPrompt = `Available plans under ${selectedCategory}:\n`;
        plans.forEach((p, index) => { planPrompt += `${index + 1}. ${p.name} (ID: ${p.id})\n`; });
        planPrompt += "\nEnter plan number:";
        await sendMessengerReply(senderPsid, { text: planPrompt });
        return;
    }

    if (session.step === 'DATA_PLAN_SELECT') {
        const planIndex = parseInt(text.trim()) - 1;
        const plans = session.data.plansList;
        if (isNaN(planIndex) || !plans[planIndex]) {
            await sendMessengerReply(senderPsid, { text: "❌ Invalid plan selection. Enter valid plan number:" });
            return;
        }
        const chosenPlan = plans[planIndex];
        session.data.dataPlan = chosenPlan.id;
        session.data.amount = chosenPlan.price;
        session.data.planName = chosenPlan.name;
        session.step = 'DATA_PHONE';

        await sendMessengerReply(senderPsid, { text: `You selected: ${chosenPlan.name}\n\nEnter recipient phone number for data bundle:` });
        return;
    }

    if (session.step === 'DATA_PHONE') {
        session.data.phone = text.trim();
        delete userSessions[senderPsid];

        const pinToken = crypto.randomBytes(32).toString('hex');                        
        pendingPinTokens[pinToken] = {
            psid: senderPsid, service: 'data', phone: session.data.phone, network: session.data.network,
            dataPlan: session.data.dataPlan, amount: session.data.amount, expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0
        };

        await sendMessengerButtonTemplate(senderPsid, {
            text: `Review Data Subscription:\nNetwork: ${session.data.network.toUpperCase()}\nPlan: ${session.data.planName}\nPhone: ${session.data.phone}\nAmount: ₦${Number(session.data.amount).toLocaleString()}\n\nClick below to enter PIN:`,
            buttonText: "🔐 Enter PIN Securely", url: `${APP_URL}/webhook/secure-pin-portal?token=${pinToken}`
        });
        return;                                                                             
    }

    if (session.step === 'CABLE_PROVIDER') {
        const provMap = { '1': 'dstv', '2': 'gotv', '3': 'startimes' };
        session.data.cableProvider = provMap[text.trim()] || text.trim().toLowerCase();
        session.step = 'CABLE_SMARTCARD';
        await sendMessengerReply(senderPsid, { text: "Enter Smartcard / IUC Number:" });
        return;
    }
    if (session.step === 'CABLE_SMARTCARD') {
        session.data.smartcard = text.trim();
        session.step = 'CABLE_PLAN';
        await sendMessengerReply(senderPsid, { text: "Enter Cable Plan Code/Name:" });
        return;
    }
    if (session.step === 'CABLE_PLAN') {
        session.data.cablePlan = text.trim();
        session.step = 'CABLE_AMOUNT';
        await sendMessengerReply(senderPsid, { text: "Enter package amount (NGN):" });
        return;
    }
    if (session.step === 'CABLE_AMOUNT') {
        session.data.amount = text.trim();
        delete userSessions[senderPsid];
        const pinToken = crypto.randomBytes(32).toString('hex');
        pendingPinTokens[pinToken] = { psid: senderPsid, service: 'cable', cableProvider: session.data.cableProvider, smartcard: session.data.smartcard, cablePlan: session.data.cablePlan, amount: session.data.amount, expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0 };
        await sendMessengerButtonTemplate(senderPsid, { text: `Review Cable:\nProvider: ${session.data.cableProvider.toUpperCase()}\nSmartcard: ${session.data.smartcard}\nAmount: ₦${session.data.amount}`, buttonText: "🔐 Enter PIN Securely", url: `${APP_URL}/webhook/secure-pin-portal?token=${pinToken}` });
        return;
    }

    if (session.step === 'ELECTRICITY_DISCO') {
        session.data.disco = text.trim().toLowerCase();
        session.step = 'ELECTRICITY_METER';
        await sendMessengerReply(senderPsid, { text: "Enter Meter Number:" });
        return;
    }
    if (session.step === 'ELECTRICITY_METER') {
        session.data.meterNumber = text.trim();
        session.step = 'ELECTRICITY_AMOUNT';
        await sendMessengerReply(senderPsid, { text: "Enter amount for electricity token (NGN):" });
        return;
    }
    if (session.step === 'ELECTRICITY_AMOUNT') {
        session.data.amount = text.trim();
        delete userSessions[senderPsid];
        const pinToken = crypto.randomBytes(32).toString('hex');
        pendingPinTokens[pinToken] = { psid: senderPsid, service: 'electricity', disco: session.data.disco, meterNumber: session.data.meterNumber, amount: session.data.amount, expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0 };
        await sendMessengerButtonTemplate(senderPsid, { text: `Review Electricity:\nDISCO: ${session.data.disco.toUpperCase()}\nMeter: ${session.data.meterNumber}\nAmount: ₦${session.data.amount}`, buttonText: "🔐 Enter PIN Securely", url: `${APP_URL}/webhook/secure-pin-portal?token=${pinToken}` });
        return;
    }

    if (session.step === 'BULKSMS_RECIPIENTS') {
        session.data.recipients = text.trim();
        session.step = 'BULKSMS_SENDER';
        await sendMessengerReply(senderPsid, { text: "Enter Sender ID (Max 11 chars):" });
        return;
    }
    if (session.step === 'BULKSMS_SENDER') {
        session.data.senderId = text.trim();
        session.step = 'BULKSMS_MESSAGE';
        await sendMessengerReply(senderPsid, { text: "Enter your text message content:" });
        return;
    }
    if (session.step === 'BULKSMS_MESSAGE') {
        session.data.message = text;
        session.step = 'BULKSMS_AMOUNT';
        await sendMessengerReply(senderPsid, { text: "Enter total cost/amount for SMS (NGN):" });
        return;
    }
    if (session.step === 'BULKSMS_AMOUNT') {
        session.data.amount = text.trim();
        delete userSessions[senderPsid];
        const pinToken = crypto.randomBytes(32).toString('hex');
        pendingPinTokens[pinToken] = { psid: senderPsid, service: 'bulksms', recipients: session.data.recipients, senderId: session.data.senderId, message: session.data.message, amount: session.data.amount, expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0 };
        await sendMessengerButtonTemplate(senderPsid, { text: `Review Bulk SMS:\nSender: ${session.data.senderId}\nAmount: ₦${session.data.amount}`, buttonText: "🔐 Enter PIN Securely", url: `${APP_URL}/webhook/secure-pin-portal?token=${pinToken}` });
        return;
    }

    if (session.step === 'FUND_WALLET_AMOUNT') {
        const amount = text.trim();
        if (isNaN(amount) || Number(amount) < 100) {
            await sendMessengerReply(senderPsid, { text: "❌ Invalid amount. Minimum funding is ₦100. Enter valid amount:" });
            return;
        }
        session.data.amount = amount;
        delete userSessions[senderPsid];
        const pinToken = crypto.randomBytes(32).toString('hex');
        pendingPinTokens[pinToken] = { psid: senderPsid, service: 'fund_wallet', amount: session.data.amount, expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0 };
        await sendMessengerButtonTemplate(senderPsid, { text: `Review Wallet Funding:\nAmount: ₦${Number(session.data.amount).toLocaleString()}`, buttonText: "🔐 Enter PIN Securely", url: `${APP_URL}/webhook/secure-pin-portal?token=${pinToken}` });
        return;
    }

    delete userSessions[senderPsid];
    await sendMessengerReply(senderPsid, { text: "Session reset. Type 'menu' to view options." });
}

async function logoutAccount(senderPsid) {
    try {
        const linkRef = admin.database().ref(`messenger_links/${senderPsid}`);
        const linkSnap = await linkRef.once('value');
        if (!linkSnap.exists()) return "ℹ️ You are not logged into any account.";
        const userId = linkSnap.val().userId;
        if (userId) await admin.database().ref(`users/${userId}/messenger_psid`).remove();
        await linkRef.remove();
        return "🔒 Successfully logged out. Type 'menu' to log back in.";
    } catch (error) {
        return "❌ Error logging out.";                                   
    }
}                                                                                                                                               

async function getLinkedUserId(senderPsid) {                                                
    try {
        const linkSnap = await admin.database().ref(`messenger_links/${senderPsid}`).once('value');
        return (linkSnap.exists() && linkSnap.val().userId) ? linkSnap.val().userId : null;                                                                        
    } catch (e) { return null; }                                                                                   
}

async function checkBalance(senderPsid) {                                                   
    try {
        const userId = await getLinkedUserId(senderPsid);                                       
        if (!userId) return "❌ Account Not Linked. Login first.";
        const userSnap = await admin.database().ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) return "❌ User record not found.";
        const userData = userSnap.val();
        return `💰 Wallet Balance\nName: ${userData.name || 'User'}\nBalance: ₦${Number(userData.balance || 0).toLocaleString()}`;
    } catch (error) { return "❌ Failed to retrieve balance."; }
}

async function getTransactionHistory(senderPsid) {
    try {
        const userId = await getLinkedUserId(senderPsid);
        if (!userId) return "❌ Account Not Linked.";
        const txSnap = await admin.database().ref(`users/${userId}/transactions`).limitToLast(5).once('value');
        if (!txSnap.exists()) return "📜 No recent transaction history.";
        let historyMessage = "📜 Recent Transactions:\n\n";
        txSnap.forEach((childSnap) => {
            const tx = childSnap.val();
            historyMessage += `- [${tx.status?.toUpperCase() || 'SUCCESS'}] ${tx.type}: ₦${Number(tx.amount || 0).toLocaleString()}\n`;
        });
        return historyMessage;
    } catch (error) { return "❌ Failed to retrieve history."; }
}

async function sendMessengerReply(senderPsid, response) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, { recipient: { id: senderPsid }, message: response });
    } catch (err) { console.log("Error sending message."); }
}

async function sendMessengerButtonTemplate(senderPsid, payload) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: senderPsid },
            message: { attachment: { type: "template", payload: { template_type: "button", text: payload.text, buttons: [{ type: "web_url", url: payload.url, title: payload.buttonText, webview_height_ratio: "compact" }] } } }
        });
    } catch (err) { console.log("Error sending button template:", err.response?.data || err.message); }
}

module.exports = router;
