const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');
const airtimeChat = require('./airtime');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || 'https://dnezerlinks-backend.onrender.com';

const pendingPinTokens = {};
const PIN_TOKEN_EXPIRY_MS = 3 * 60 * 1000; // 3 minutes expiration

// Helper function to send messages back to Facebook Messenger
async function sendMessengerReply(senderPsid, responseMessage) {
    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: senderPsid },
            message: responseMessage
        });
    } catch (error) {
        console.error('Error sending message to Facebook:', error.response?.data || error.message);
    }
}

// Helper function to send Messenger Button Templates (Webview triggers)
async function sendMessengerButtonTemplate(senderPsid, payload) {
    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: senderPsid },
            message: {
                attachment: {
                    type: "template",
                    payload: {
                        template_type: "button",
                        text: payload.text,
                        buttons: [
                            {
                                type: "web_url",
                                url: payload.url,
                                title: payload.buttonText,
                                messenger_extensions: true,
                                webview_height_ratio: "compact"
                            }
                        ]
                    }
                }
            }
        });
    } catch (err) {
        console.error("Error sending button template:", err.response?.data || err.message);
    }
}

// Helper to get linked user ID from Firebase
async function getLinkedUserId(senderPsid) {
    try {
        const linkSnap = await admin.database().ref(`messenger_links/${senderPsid}`).once('value');
        if (linkSnap.exists() && linkSnap.val().userId) {
            return linkSnap.val().userId;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// 1. GET /webhook (Facebook Webhook Verification)
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

// 2. POST /webhook (Incoming Messenger Events)
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

// 3. GET /secure-pin-portal -> Serves the secure webview PIN interface
router.get('/secure-pin-portal', (req, res) => {
    const { token } = req.query;

    if (!token || !pendingPinTokens[token]) {
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Expired Link</title>
            <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:#fff;}</style></head>
            <body>
                <h2 style="color:#ef4444;">❌ Link Expired or Invalid</h2>
                <p>This transaction link has already been used, expired (3-minute limit), or is invalid. Please start a new request in Messenger.</p>
            </body>
            </html>
        `);
    }

    const sessionData = pendingPinTokens[token];

    if (Date.now() > sessionData.expiresAt) {
        delete pendingPinTokens[token];
        return res.status(400).send("<h3>❌ Link has expired (3 minutes exceeded). Please restart the transaction in Messenger.</h3>");
    }

    const { service, phone, network, amount } = sessionData;

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dnezerlinks Secure PIN Authorization</title>
            <script src="https://connect.facebook.net/en_US/messenger.Extensions.js" crossorigin="anonymous"></script>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; height: 100vh; }
                .card { background: #1e293b; padding: 24px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); width: 100%; max-width: 360px; text-align: center; }
                h3 { color: #f8fafc; margin-bottom: 8px; }
                p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
                .summary { background: #0f172a; padding: 12px; border-radius: 8px; margin-bottom: 16px; text-align: left; font-size: 13px; color: #cbd5e1; border: 1px solid #334155; }
                .summary b { color: #ffffff; }
                input[type="password"] { width: 100%; padding: 12px; font-size: 22px; text-align: center; letter-spacing: 8px; border: 1px solid #475569; border-radius: 8px; box-sizing: border-box; margin-bottom: 16px; outline: none; background: #0f172a; color: white; }
                input[type="password"]:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2); }
                button { background: #2563eb; color: white; border: none; width: 100%; padding: 12px; font-size: 16px; font-weight: 600; border-radius: 8px; cursor: pointer; }
                button:hover { background: #1d4ed8; }
                .loader { display: none; margin-top: 10px; font-size: 14px; color: #3b82f6; }
                .error-msg { color: #ef4444; font-size: 13px; margin-bottom: 12px; font-weight: 500; display: none; }
            </style>
        </head>
        <body>
            <div class="card">
                <h3>🔒 Authorize Transaction</h3>
                <p>Enter your 4-digit transaction PIN securely</p>

                <div class="summary">
                    <div><b>Service:</b> ${service.toUpperCase()}</div>
                    <div><b>Network:</b> ${network.toUpperCase()}</div>
                    <div><b>Phone:</b> ${phone}</div>
                    <div><b>Amount:</b> NGN ${Number(amount).toLocaleString()}</div>
                </div>

                <div id="errorMsg" class="error-msg"></div>

                <form id="pinForm">
                    <input type="hidden" name="token" id="tokenField" value="${token}">
                    <input type="password" id="pinInput" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required autocomplete="current-password" autofocus>
                    <button type="submit" id="submitBtn">Authorize & Pay</button>
                    <div class="loader" id="loader">Processing securely...</div>
                </form>
            </div>

            <script>
                function closeMessengerWindow() {
                    if (typeof MessengerExtensions !== 'undefined') {
                        MessengerExtensions.requestCloseBrowser(function success() {}, function error(err) {
                            window.close();
                        });
                    } else {
                        window.close();
                    }
                }

                document.getElementById('pinForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const pin = document.getElementById('pinInput').value;
                    const token = document.getElementById('tokenField').value;
                    const submitBtn = document.getElementById('submitBtn');
                    const loader = document.getElementById('loader');
                    const errorMsg = document.getElementById('errorMsg');

                    submitBtn.disabled = true;
                    submitBtn.style.opacity = '0.6';
                    loader.style.display = 'block';
                    errorMsg.style.display = 'none';

                    try {
                        const response = await fetch('./secure-pin-portal-submit', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token, pin })
                        });

                        const result = await response.json();

                        if (result.success || result.closeWindow) {
                            closeMessengerWindow();
                        } else {
                            loader.style.display = 'none';
                            submitBtn.disabled = false;
                            submitBtn.style.opacity = '1';
                            document.getElementById('pinInput').value = '';

                            errorMsg.innerText = result.message;
                            errorMsg.style.display = 'block';
                        }
                    } catch (err) {
                        loader.style.display = 'none';
                        submitBtn.disabled = false;
                        submitBtn.style.opacity = '1';
                        errorMsg.innerText = "Network error. Please try again.";
                        errorMsg.style.display = 'block';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// 4. POST /secure-pin-portal-submit -> AJAX JSON endpoint handling PIN validation, 3 attempts limit, and execution
router.post('/secure-pin-portal-submit', express.json(), async (req, res) => {
    const { token, pin } = req.body;

    if (!token || !pendingPinTokens[token]) {
        return res.json({ success: false, message: "❌ Link is invalid or has expired.", closeWindow: true });
    }

    const sessionData = pendingPinTokens[token];

    if (Date.now() > sessionData.expiresAt) {
        delete pendingPinTokens[token];
        return res.json({ success: false, message: "❌ Link has expired (3 minutes reached).", closeWindow: true });
    }

    const { psid, service, phone, network, amount } = sessionData;

    try {
        const userId = await getLinkedUserId(psid);
        if (!userId) {
            delete pendingPinTokens[token];
            return res.json({ success: false, message: "❌ Account not linked. Please log in first.", closeWindow: true });
        }

        const userSnap = await admin.database().ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            delete pendingPinTokens[token];
            return res.json({ success: false, message: "❌ User profile not found.", closeWindow: true });
        }

        const userData = userSnap.val();
        const correctPin = userData.pin || userData.transaction_pin;

        if (String(pin).trim() !== String(correctPin).trim()) {
            sessionData.attempts = (sessionData.attempts || 0) + 1;
            const attemptsLeft = 3 - sessionData.attempts;

            // On 3rd failed attempt, close window silently and drop error message to chat interface
            if (sessionData.attempts >= 3) {
                delete pendingPinTokens[token];
                await sendMessengerReply(psid, { 
                    text: "❌ Transaction cancelled: Too many incorrect PIN attempts (3/3). Please try again." 
                });

                return res.json({
                    success: false,
                    message: "Max attempts reached.",
                    closeWindow: true
                });
            }

            return res.json({
                success: false,
                message: `❌ Incorrect PIN. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining.`,
                closeWindow: false
            });
        }

        // Correct PIN -> Clear token and proceed with fulfillment
        delete pendingPinTokens[token];

        if (service === 'airtime') {
            const parsedAmount = parseFloat(amount);
            const networkMap = { 'mtn': '1', 'glo': '2', '9mobile': '3', 'airtel': '4' };
            const networkID = networkMap[network?.toLowerCase()] || network;

            const airtimeEndpoint = `${APP_URL}/api/airtime/buy`;
            const response = await axios.post(airtimeEndpoint, {
                uid: userId,
                phone: phone,
                amount: parsedAmount,
                networkID: networkID,
                pin: pin
            }, { timeout: 55000 });

            const resData = response.data;

            if (resData && resData.success) {
                // Successful transaction closes webview with no pop-up, and outputs success message to chat interface
                await sendMessengerReply(psid, {
                    text: `✅ Airtime Purchase Successful!\n\nNetwork: ${network.toUpperCase()}\nPhone: ${phone}\nAmount: NGN ${parsedAmount.toLocaleString()}`
                });

                return res.json({ success: true, closeWindow: true });
            } else {
                const errReason = resData.error || 'Transaction could not be completed.';
                await sendMessengerReply(psid, { text: `❌ Airtime Failed: ${errReason}` });
                return res.json({ success: false, closeWindow: true });
            }
        }

        return res.json({ success: true, closeWindow: true });

    } catch (error) {
        delete pendingPinTokens[token];
        const errReason = error.response?.data?.error || error.message || "Server error processing transaction.";
        await sendMessengerReply(psid, { text: `❌ Transaction Failed: ${errReason}` });
        return res.json({ success: false, closeWindow: true });
    }
});

// Handle incoming user messages asynchronously
async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();

    // 1. Check if user is currently inside an active airtime conversational flow session
    if (airtimeChat.getAirtimeSession && airtimeChat.getAirtimeSession(senderPsid)) {
        const session = airtimeChat.getAirtimeSession(senderPsid);
        
        // Intercept when airtime flow finishes amount/details input to dispatch secure webview token button
        if (session.step === 'AIRTIME_AMOUNT') {
            const amountNum = parseFloat(text.trim());
            if (isNaN(amountNum) || amountNum < 100) {
                await sendMessengerReply(senderPsid, { text: "❌ Invalid amount. Minimum airtime purchase is ₦100. Please enter a valid amount:" });
                return;
            }
            session.data.amount = amountNum;

            const linkSnap = await admin.database().ref(`messenger_links/${senderPsid}`).once('value');
            if (!linkSnap.exists()) {
                airtimeChat.clearAirtimeSession(senderPsid);
                await sendMessengerReply(senderPsid, { text: "❌ Your account is not linked. Please log in first." });
                return;
            }
            
            const userId = linkSnap.val().userId;
            airtimeChat.clearAirtimeSession(senderPsid);

            // Generate 3-minute expiring webview token
            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'airtime',
                userId,
                phone: session.data.phone,
                network: session.data.network,
                amount: session.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            const webviewUrl = `${APP_URL}/secure-pin-portal?token=${pinToken}`;

            await sendMessengerButtonTemplate(senderPsid, {
                text: `Review Airtime Details:\nNetwork: ${session.data.network.toUpperCase()}\nPhone: ${session.data.phone}\nAmount: ₦${session.data.amount.toLocaleString()}\n\nClick below to enter your PIN securely (Link expires in 3 minutes):`,
                buttonText: "🔐 Enter PIN Securely",
                url: webviewUrl
            });
            return;
        }

        const reply = await airtimeChat.handleAirtimeFlow(senderPsid, text, session);
        await sendMessengerReply(senderPsid, reply);
        return;
    }

    // 2. Trigger Airtime Flow if option 3 or 'airtime' is selected
    if (text === '3' || lowerText.includes('airtime')) {
        const initialReply = airtimeChat.startAirtimeFlow(senderPsid);
        await sendMessengerReply(senderPsid, initialReply);
        return;
    }

    // 3. Main Menu / Fallback handler
    if (lowerText.includes('menu') || lowerText.includes('start') || lowerText.includes('hi') || lowerText.includes('hello')) {
        await sendMessengerReply(senderPsid, { 
            text: "Welcome to Dnezerlinks!\n\n1. Check Balance\n2. Buy Data\n3. Buy Airtime\n4. Cable TV\n\nReply with a number or option." 
        });
        return;
    }

    // Default fallback
    await sendMessengerReply(senderPsid, { text: "I didn't quite get that. Type 'menu' to see available options." });
}

module.exports = router;
