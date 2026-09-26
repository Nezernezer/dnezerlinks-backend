const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');
const airtimeChat = require('./airtime');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// ========== TEMPORARY HARD-CODED ==========
const APP_URL = 'https://api.dlinks.name.ng';
console.log('Forced APP_URL →', APP_URL);
// =========================================

const pendingPinTokens = {};
const PIN_TOKEN_EXPIRY_MS = 5 * 60 * 1000;

// ========== HELPERS ==========

async function sendMessengerReply(senderPsid, response) {
    try {
        await axios.post(
            'https://graph.facebook.com/v19.0/me/messages?access_token=' + PAGE_ACCESS_TOKEN,
            {
                recipient: { id: senderPsid },
                message: response
            }
        );
    } catch (err) {
        console.error('Error sending message:', err.response?.data || err.message);
    }
}

async function sendSecurePinLink(senderPsid, network, phone, amount, pinToken) {
    // Safe string concatenation (no template literals)
    const webviewUrl = APP_URL + '/webhook/secure-pin-portal?token=' + pinToken;

    console.log('====== DEBUG URL ======');
    console.log('APP_URL     →', APP_URL);
    console.log('webviewUrl  →', webviewUrl);
    console.log('=======================');

    const reviewText =
        'Review Airtime Transaction:\n\n' +
        '• Network: ' + network.toUpperCase() + '\n' +
        '• Phone: ' + phone + '\n' +
        '• Amount: ₦' + Number(amount).toLocaleString() + '\n\n' +
        '🔐 Enter your PIN securely (link expires in 5 minutes):';

    // 1. Try button first
    try {
        await axios.post(
            'https://graph.facebook.com/v19.0/me/messages?access_token=' + PAGE_ACCESS_TOKEN,
            {
                recipient: { id: senderPsid },
                message: {
                    attachment: {
                        type: 'template',
                        payload: {
                            template_type: 'button',
                            text: reviewText,
                            buttons: [
                                {
                                    type: 'web_url',
                                    url: webviewUrl,
                                    title: '🔐 Enter PIN Securely',
                                    webview_height_ratio: 'compact'
                                }
                            ]
                        }
                    }
                }
            }
        );
        console.log('✅ Button sent successfully');
        return;
    } catch (err) {
        console.log('Button failed → falling back to plain text link');
        console.error('Button error:', err.response?.data || err.message);
    }

    // 2. Fallback – plain text link
    await sendMessengerReply(senderPsid, {
        text: reviewText + '\n\n' + webviewUrl
    });
}

async function getLinkedUserId(senderPsid) {
    try {
        const linkSnap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
        if (linkSnap.exists() && linkSnap.val().userId) {
            return linkSnap.val().userId;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ========== WEBHOOK ROUTES ==========

router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
            console.log('✅ Facebook Webhook Verified Successfully.');
            return res.status(200).send(challenge);
        }
        return res.sendStatus(403);
    }
    return res.sendStatus(400);
});

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

// Secure PIN Portal
router.get('/secure-pin-portal', (req, res) => {
    const token = req.query.token;

    if (!token || !pendingPinTokens[token]) {
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Expired Link</title>
            <style>body{font-family:sans-serif;text-align:center;padding:50px;background:#f8fafc;color:#1e293b;}</style></head>
            <body>
                <h2 style="color:#dc2626;">❌ Link Expired or Invalid</h2>
                <p>This transaction link has already been used, expired, or is invalid. Please start a new request in Messenger.</p>
            </body>
            </html>
        `);
    }

    const sessionData = pendingPinTokens[token];

    if (Date.now() > sessionData.expiresAt) {
        delete pendingPinTokens[token];
        return res.status(400).send('<h3>❌ Link has expired. Please restart the transaction in Messenger.</h3>');
    }

    const service = sessionData.service;
    const phone = sessionData.phone;
    const network = sessionData.network;
    const amount = sessionData.amount;

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dnezerlinks Secure PIN</title>
            <script src="https://connect.facebook.net/en_US/messenger.Extensions.js" crossorigin="anonymous"></script>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; height: 100vh; }
                .card { background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 360px; text-align: center; }
                h3 { color: #1e293b; margin-bottom: 8px; }
                p { color: #64748b; font-size: 14px; margin-bottom: 20px; }
                .summary { background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 16px; text-align: left; font-size: 13px; color: #334155; }
                .summary b { color: #0f172a; }
                input[type="password"] { width: 100%; padding: 12px; font-size: 18px; text-align: center; letter-spacing: 4px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; margin-bottom: 16px; outline: none; }
                input[type="password"]:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
                button { background: #2563eb; color: white; border: none; width: 100%; padding: 12px; font-size: 16px; font-weight: 600; border-radius: 8px; cursor: pointer; }
                button:hover { background: #1d4ed8; }
                .loader { display: none; margin-top: 10px; font-size: 14px; color: #2563eb; }
                .error-msg { color: #dc2626; font-size: 13px; margin-bottom: 12px; font-weight: 500; display: none; }
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
                    <input type="hidden" id="tokenField" value="${token}">
                    <input type="password" id="pinInput" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required autofocus>
                    <button type="submit" id="submitBtn">Authorize & Pay</button>
                    <div class="loader" id="loader">Processing securely...</div>
                </form>
            </div>
            <script>
                function closeMessengerWindow() {
                    if (typeof MessengerExtensions !== 'undefined') {
                        MessengerExtensions.requestCloseBrowser(function() {}, function() { window.close(); });
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
                            body: JSON.stringify({ token: token, pin: pin })
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
                        errorMsg.innerText = 'Network error. Please try again.';
                        errorMsg.style.display = 'block';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// PIN Submit
router.post('/secure-pin-portal-submit', express.json(), async (req, res) => {
    const token = req.body.token;
    const pin = req.body.pin;

    if (!token || !pendingPinTokens[token]) {
        return res.json({ success: false, message: '❌ Link is invalid or has already expired.', closeWindow: true });
    }

    const sessionData = pendingPinTokens[token];

    if (Date.now() > sessionData.expiresAt) {
        delete pendingPinTokens[token];
        return res.json({ success: false, message: '❌ Link has expired. Please restart your transaction.', closeWindow: true });
    }

    const psid = sessionData.psid;
    const service = sessionData.service;
    const phone = sessionData.phone;
    const network = sessionData.network;
    const amount = sessionData.amount;

    try {
        const userId = await getLinkedUserId(psid);
        if (!userId) {
            delete pendingPinTokens[token];
            return res.json({ success: false, message: '❌ Account not linked. Please log in first.', closeWindow: true });
        }

        const userSnap = await admin.database().ref('users/' + userId).once('value');
        if (!userSnap.exists()) {
            delete pendingPinTokens[token];
            return res.json({ success: false, message: '❌ User profile not found.', closeWindow: true });
        }

        const userData = userSnap.val();
        const correctPin = userData.pin || userData.transaction_pin;

        if (String(pin).trim() !== String(correctPin).trim()) {
            sessionData.attempts = (sessionData.attempts || 0) + 1;
            const attemptsLeft = 3 - sessionData.attempts;

            if (sessionData.attempts >= 3) {
                delete pendingPinTokens[token];
                await sendMessengerReply(psid, {
                    text: '❌ Incorrect PIN entered 3 times. Transaction cancelled for security.\n\nType \'menu\' to start over.'
                });
                return res.json({ success: false, message: 'Max attempts reached.', closeWindow: true });
            }

            return res.json({
                success: false,
                message: '❌ Invalid PIN. Try again (' + attemptsLeft + ' attempt' + (attemptsLeft > 1 ? 's' : '') + ' left).',
                closeWindow: false
            });
        }

        delete pendingPinTokens[token];

        if (service === 'airtime') {
            const parsedAmount = parseFloat(amount);
            const networkMap = { 'mtn': '1', 'glo': '2', '9mobile': '3', 'airtel': '4' };
            const networkID = networkMap[network.toLowerCase()] || network;

            const airtimeEndpoint = APP_URL + '/api/airtime/buy';
            const response = await axios.post(airtimeEndpoint, {
                uid: userId,
                phone: phone,
                amount: parsedAmount,
                networkID: networkID,
                pin: pin
            }, { timeout: 55000 });

            const resData = response.data;

            if (resData && resData.success) {
                await sendMessengerReply(psid, {
                    text: '✅ Airtime Purchase Successful!\n\nNetwork: ' + network.toUpperCase() + '\nPhone: ' + phone + '\nAmount: NGN ' + parsedAmount.toLocaleString()
                });
                return res.json({ success: true });
            } else {
                const errReason = resData.error || 'Transaction could not be completed.';
                await sendMessengerReply(psid, { text: '❌ Airtime Failed: ' + errReason });
                return res.json({ success: false, closeWindow: true });
            }
        }

        return res.json({ success: true });

    } catch (error) {
        delete pendingPinTokens[token];
        const errReason = (error.response && error.response.data && error.response.data.error) || error.message || 'Server error processing transaction.';
        await sendMessengerReply(psid, { text: '❌ Transaction Failed: ' + errReason });
        return res.json({ success: false, closeWindow: true });
    }
});

// ========== MESSAGE HANDLER ==========

async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();

    const session = airtimeChat.getAirtimeSession(senderPsid);

    if (session) {
        if (session.step === 'AIRTIME_AMOUNT') {
            const amountNum = parseFloat(text.trim());

            if (isNaN(amountNum) || amountNum < 100) {
                await sendMessengerReply(senderPsid, {
                    text: '❌ Invalid amount. Minimum airtime purchase is ₦100. Please enter a valid amount:'
                });
                return;
            }

            session.data.amount = amountNum;

            const linkSnap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
            if (!linkSnap.exists()) {
                airtimeChat.clearAirtimeSession(senderPsid);
                await sendMessengerReply(senderPsid, {
                    text: '❌ Your account is not linked. Please log in first (option 1).'
                });
                return;
            }

            airtimeChat.clearAirtimeSession(senderPsid);

            const pinToken = crypto.randomBytes(32).toString('hex');

            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'airtime',
                phone: session.data.phone,
                network: session.data.network,
                amount: session.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(
                senderPsid,
                session.data.network,
                session.data.phone,
                session.data.amount,
                pinToken
            );

            return;
        }

        try {
            const reply = await airtimeChat.handleAirtimeFlow(senderPsid, text, session);
            await sendMessengerReply(senderPsid, reply);
        } catch (err) {
            console.error('Airtime flow error:', err);
            await sendMessengerReply(senderPsid, {
                text: '❌ Something went wrong. Please type \'menu\' and try again.'
            });
        }
        return;
    }

    if (text === '3' || lowerText.indexOf('airtime') !== -1) {
        const initialReply = airtimeChat.startAirtimeFlow(senderPsid);
        await sendMessengerReply(senderPsid, initialReply);
        return;
    }

    if (lowerText.indexOf('menu') !== -1 || lowerText.indexOf('start') !== -1 || lowerText.indexOf('hi') !== -1 || lowerText.indexOf('hello') !== -1) {
        await sendMessengerReply(senderPsid, {
            text: 'Welcome to Dnezerlinks!\n\n1. Login\n2. Create Account\n3. Airtime Top-up\n4. Data Bundles\n5. Cable TV\n6. Electricity Bills\n7. Bulk SMS\n8. Check Wallet Balance\n9. Check Account Status\n10. Forgot Password\n11. Log Out\n12. Fund Wallet\n13. Transaction History\n\nReply with a number.'
        });
        return;
    }

    await sendMessengerReply(senderPsid, {
        text: 'I didn\'t quite get that. Type \'menu\' to see available options.'
    });
}

module.exports = router;
