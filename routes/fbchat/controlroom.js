const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');

const airtimeChat = require('./airtime');
const loginChat = require('./login');
const dataChat = require('./data');
const fundChat = require('./fundwallet');
const cableChat = require('./cabletv');
const electricityChat = require('./electricity');
const bulksmsChat = require('./bulksms');
const historyChat = require('./history');
const examChat = require('./exampin');
const rechargePinChat = require('./rechargepin');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

let APP_URL = process.env.APP_URL || 'https://api.dlinks.name.ng';
APP_URL = APP_URL.trim().replace(/\/+$/, '');
if (!APP_URL.startsWith('http')) {
    APP_URL = 'https://' + APP_URL;
}
console.log('Using APP_URL →', APP_URL);

const pendingPinTokens = {};
const pendingAuthTokens = {};
const pendingFreeLogin = {};      // Free Mode login sessions
const pendingFreeRegister = {};   // Free Mode register sessions

const PIN_TOKEN_EXPIRY_MS = 5 * 60 * 1000;
const TOKEN_EXPIRY_MS = 5 * 60 * 1000;

const MENU_FOOTER = '\n\nType 0 or menu for main menu.';
const DELETE_PIN_REMINDER = '\n\n⚠️ Please delete all the four digits pin you entered above.';

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

async function sendMessengerButtonTemplate(senderPsid, payload) {
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
                            text: payload.text,
                            buttons: [
                                {
                                    type: 'web_url',
                                    url: payload.url,
                                    title: payload.buttonText,
                                    webview_height_ratio: 'compact'
                                }
                            ]
                        }
                    }
                }
            }
        );
        console.log('✅ Button sent →', payload.url);
    } catch (err) {
        console.error('Button error:', err.response?.data || err.message);
        await sendMessengerReply(senderPsid, {
            text: payload.text + '\n\n' + payload.url
        });
    }
}

function clearAllSessions(psid) {
    try { airtimeChat.clearAirtimeSession(psid); } catch (e) {}
    try { dataChat.clearDataSession(psid); } catch (e) {}
    try { cableChat.clearCableSession(psid); } catch (e) {}
    try { electricityChat.clearElectricitySession(psid); } catch (e) {}
    try { bulksmsChat.clearBulkSmsSession(psid); } catch (e) {}
    try { fundChat.clearFundSession(psid); } catch (e) {}
    try { examChat.clearExamSession(psid); } catch (e) {}
    try { rechargePinChat.clearRechargePinSession(psid); } catch (e) {}
    delete pendingFreeLogin[psid];
    delete pendingFreeRegister[psid];
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

async function showMainMenu(senderPsid) {
    clearAllSessions(senderPsid);
    const linked = await loginChat.isLinked(senderPsid);
    const option1 = linked ? '1. Logout' : '1. Login';

    await sendMessengerReply(senderPsid, {
        text:
            'Welcome to Dnezerlinks!\n\n' +
            option1 + '\n' +
            '2. Create Account\n' +
            '3. Airtime Top-up\n' +
            '4. Data Bundles\n' +
            '5. Cable TV\n' +
            '6. Electricity Bills\n' +
            '7. Bulk SMS\n' +
            '8. Check Wallet Balance\n' +
            '9. Check Account Status\n' +
            '10. Forgot Password\n' +
            '11. Fund Wallet\n' +
            '12. Transaction History\n' +
            '13. Exam PIN\n' +
            '14. Recharge PIN\n\n' +
            'Reply with a number.\n' +
            '(During a transaction: * = back, 0 = menu, # / stop / cancel = abort)'
    });
}

async function requireLink(senderPsid) {
    const userId = await getLinkedUserId(senderPsid);
    if (!userId) {
        await sendMessengerReply(senderPsid, {
            text:
                'ℹ️ This service requires a linked account.\n\n' +
                'Please:\n' +
                '• Type 1 to Login\n' +
                '• Type 2 to Create Account\n\n' +
                'Type 0 for main menu.'
        });
        return false;
    }
    return true;
}

// ========== TWO-WAY PIN SYSTEM ==========

async function sendSecurePinLink(senderPsid, network, phone, amount, pinToken, extra = {}) {
    pendingPinTokens[pinToken].awaitingFreeModeChoice = true;
    pendingPinTokens[pinToken].network = network;
    pendingPinTokens[pinToken].phone = phone;
    pendingPinTokens[pinToken].amount = amount;
    pendingPinTokens[pinToken].extra = extra || {};

    await sendMessengerReply(senderPsid, {
        text:
            '🔐 Before entering your PIN:\n\n' +
            'Are you using Facebook / Messenger *Free Mode* currently?\n\n' +
            '1. No, I\'m not using Free Mode\n' +
            '2. Yes, I\'m using Free Mode\n\n' +
            'Reply with 1 or 2:'
    });
}

async function processFreeModePin(senderPsid, pin, sessionData, token) {
    const psid = sessionData.psid;
    const service = sessionData.service;

    try {
        const userId = await getLinkedUserId(psid);
        if (!userId) {
            delete pendingPinTokens[token];
            await sendMessengerReply(psid, { text: '❌ Account not linked.' + MENU_FOOTER });
            return;
        }

        const userSnap = await admin.database().ref('users/' + userId).once('value');
        if (!userSnap.exists()) {
            delete pendingPinTokens[token];
            await sendMessengerReply(psid, { text: '❌ User not found.' + MENU_FOOTER });
            return;
        }

        const userData = userSnap.val();
        const correctPin = userData.pin || userData.transaction_pin;

        if (String(pin).trim() !== String(correctPin).trim()) {
            sessionData.attempts = (sessionData.attempts || 0) + 1;
            const attemptsLeft = 3 - sessionData.attempts;

            if (sessionData.attempts >= 3) {
                delete pendingPinTokens[token];
                await sendMessengerReply(psid, {
                    text: '❌ Too many wrong PIN attempts. Transaction cancelled.' + MENU_FOOTER
                });
                return;
            }

            await sendMessengerReply(psid, {
                text: '❌ Invalid PIN. ' + attemptsLeft + ' attempt(s) left.\n\nPlease enter your 4-digit PIN again:'
            });
            return;
        }

        delete pendingPinTokens[token];

        // Dispatch to the correct service module
        const executors = {
            airtime: airtimeChat.executePurchase,
            data: dataChat.executePurchase,
            cable: cableChat.executePurchase,
            electricity: electricityChat.executePurchase,
            bulksms: bulksmsChat.executePurchase,
            exampin: examChat.executePurchase,
            rechargepin: rechargePinChat.executePurchase
        };

        const executor = executors[service];
        if (!executor) {
            await sendMessengerReply(psid, {
                text: '❌ Unknown service.' + DELETE_PIN_REMINDER + MENU_FOOTER
            });
            return;
        }

        const result = await executor(userId, sessionData, pin, APP_URL);
        await sendMessengerReply(psid, {
            text: result.message + DELETE_PIN_REMINDER + MENU_FOOTER
        });
    } catch (error) {
        delete pendingPinTokens[token];
        await sendMessengerReply(psid, {
            text: '❌ Transaction Failed: ' + (error.message || 'Server error') + DELETE_PIN_REMINDER + MENU_FOOTER
        });
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

// ========== SECURE AUTH PORTAL ==========
router.get('/secure-auth-portal', (req, res) => {
    const token = req.query.token;

    if (!token || !pendingAuthTokens[token]) {
        return res.status(400).send('<h3>❌ Link Expired or Invalid. Please restart in Messenger.</h3>');
    }

    const sessionData = pendingAuthTokens[token];
    if (Date.now() > sessionData.expiresAt) {
        delete pendingAuthTokens[token];
        return res.status(400).send('<h3>❌ Link Expired. Please restart in Messenger.</h3>');
    }

    const action = sessionData.action;
    let title = 'Dnezerlinks Access';
    let htmlForm = '';

    if (action === 'login') {
        title = 'Login to Dnezerlinks';
        htmlForm = `
            <h3>🔐 Account Login</h3>
            <p>Enter your credentials safely below</p>
            <form id="authForm">
                <input type="email" id="email" placeholder="Email Address" required><br>
                <input type="password" id="password" placeholder="Password" required><br>
                <button type="submit" id="submitBtn">Login Securely</button>
            </form>
        `;
    } else if (action === 'register') {
        title = 'Create Account';
        htmlForm = `
            <h3>📝 Account Registration</h3>
            <p>Fill out your signup details</p>
            <form id="authForm">
                <input type="text" id="name" placeholder="Full Name" required><br>
                <input type="tel" id="phone" placeholder="Phone Number" required><br>
                <input type="text" id="address" placeholder="Home Address" required><br>
                <input type="email" id="email" placeholder="Email Address" required><br>
                <input type="password" id="password" placeholder="Password (min 6 chars)" required><br>
                <input type="password" id="pin" pattern="[0-9]{4}" maxlength="4" placeholder="4-Digit Transaction PIN" required><br>
                <button type="submit" id="submitBtn">Sign Up Securely</button>
            </form>
        `;
    } else if (action === 'forgot') {
        title = 'Reset Password';
        htmlForm = `
            <h3>🔄 Password Recovery</h3>
            <p>Enter your registered account email</p>
            <form id="authForm">
                <input type="email" id="email" placeholder="Account Email" required><br>
                <button type="submit" id="submitBtn">Send Reset Link</button>
            </form>
        `;
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <script src="https://connect.facebook.net/en_US/messenger.Extensions.js"></script>
            <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
            <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
            <style>
                body{font-family:sans-serif;background:#f4f6f9;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
                .card{background:#fff;padding:24px;border-radius:12px;width:100%;max-width:360px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.1)}
                input{width:100%;padding:12px;margin-bottom:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px}
                button{background:#2563eb;color:#fff;border:none;width:100%;padding:12px;font-size:15px;border-radius:8px;font-weight:600}
                .error{color:#dc2626;display:none;margin-bottom:12px}
                .loader{display:none;margin-top:10px;color:#2563eb}
            </style>
        </head>
        <body>
            <div class="card">
                <div id="errorMsg" class="error"></div>
                ${htmlForm}
                <div class="loader" id="loader">Processing...</div>
            </div>
            <script>
                const firebaseConfig = {
                    apiKey: "AIzaSyAXWh3ls4yEANmGy4g7xZ8jlBN0KoFC5yc",
                    authDomain: "dnezerlinks.firebaseapp.com",
                    databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com",
                    projectId: "dnezerlinks-vtu"
                };
                firebase.initializeApp(firebaseConfig);

                function closeWindow() {
                    if (typeof MessengerExtensions !== 'undefined') {
                        MessengerExtensions.requestCloseBrowser(() => {}, () => window.close());
                    } else {
                        window.close();
                    }
                }

                document.getElementById('authForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const token = "${token}";
                    const action = "${action}";
                    const email = document.getElementById('email') ? document.getElementById('email').value.trim() : '';
                    const password = document.getElementById('password') ? document.getElementById('password').value : '';
                    const name = document.getElementById('name') ? document.getElementById('name').value.trim() : '';
                    const phone = document.getElementById('phone') ? document.getElementById('phone').value.trim() : '';
                    const address = document.getElementById('address') ? document.getElementById('address').value.trim() : '';
                    const pin = document.getElementById('pin') ? document.getElementById('pin').value.trim() : '';

                    const btn = document.getElementById('submitBtn');
                    const loader = document.getElementById('loader');
                    const err = document.getElementById('errorMsg');

                    btn.disabled = true;
                    loader.style.display = 'block';
                    err.style.display = 'none';

                    try {
                        let body = { token, action, email, password, name, phone, address, pin };

                        if (action === 'login') {
                            const userCred = await firebase.auth().signInWithEmailAndPassword(email, password);
                            const idToken = await userCred.user.getIdToken();
                            body.idToken = idToken;
                            delete body.password;
                        }

                        const res = await fetch('./secure-auth-portal-submit', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                        const result = await res.json();

                        if (result.success) {
                            closeWindow();
                        } else {
                            loader.style.display = 'none';
                            btn.disabled = false;
                            err.innerText = result.message;
                            err.style.display = 'block';
                        }
                    } catch (ex) {
                        loader.style.display = 'none';
                        btn.disabled = false;
                        const msg = (ex.code === 'auth/wrong-password' || ex.code === 'auth/user-not-found' ||
                                     ex.code === 'auth/invalid-credential' || ex.code === 'auth/invalid-login-credentials')
                                    ? '❌ Incorrect password.'
                                    : (ex.message || 'Network / Auth error');
                        err.innerText = msg;
                        err.style.display = 'block';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

router.post('/secure-auth-portal-submit', express.json(), async (req, res) => {
    const token = req.body.token;
    const action = req.body.action;
    const email = req.body.email;
    const password = req.body.password;
    const name = req.body.name;
    const phone = req.body.phone;
    const address = req.body.address;
    const pin = req.body.pin;
    const idToken = req.body.idToken;

    if (!token || !pendingAuthTokens[token]) {
        return res.json({ success: false, message: '❌ Link expired or invalid.' });
    }

    const sessionData = pendingAuthTokens[token];
    if (Date.now() > sessionData.expiresAt) {
        delete pendingAuthTokens[token];
        return res.json({ success: false, message: '❌ Link expired.' });
    }

    const psid = sessionData.psid;

    try {
        let result;

        if (action === 'login') {
            result = await loginChat.processLogin(psid, { email, idToken });
        } else if (action === 'register') {
            result = await loginChat.processRegister(psid, { name, phone, address, email, password, pin });
        } else if (action === 'forgot') {
            result = await loginChat.processForgot(psid, { email });
        } else {
            return res.json({ success: false, message: '❌ Invalid action.' });
        }

        if (result.success) {
            delete pendingAuthTokens[token];
            await sendMessengerReply(psid, { text: result.message });
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: result.message });
        }
    } catch (e) {
        return res.json({ success: false, message: '❌ Error: ' + e.message });
    }
});

// ========== SECURE PIN PORTAL ==========
router.get('/secure-pin-portal', (req, res) => {
    const token = req.query.token;

    if (!token || !pendingPinTokens[token]) {
        return res.status(400).send('<h3>❌ Link Expired or Invalid</h3>');
    }

    const sessionData = pendingPinTokens[token];
    if (Date.now() > sessionData.expiresAt) {
        delete pendingPinTokens[token];
        return res.status(400).send('<h3>❌ Link has expired</h3>');
    }

    const service = sessionData.service || '';
    const phone = sessionData.phone || sessionData.meterNumber || '';
    const network = sessionData.network || sessionData.disco || '';
    const amount = sessionData.amount || sessionData.totalCost || 0;
    const planName = sessionData.planName || '';
    const meterType = sessionData.meterType || '';
    const customerName = sessionData.customerName || '';
    const iuc = sessionData.iuc || '';
    const senderName = sessionData.senderName || '';
    const recipientCount = sessionData.recipientCount || 0;
    const pages = sessionData.pages || 0;
    const encoding = sessionData.encoding || '';
    const examLabel = sessionData.examLabel || '';
    const quantity = sessionData.quantity || sessionData.qty || '';
    const brandName = sessionData.brandName || '';

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Secure PIN</title>
            <script src="https://connect.facebook.net/en_US/messenger.Extensions.js"></script>
            <style>
                body{font-family:sans-serif;background:#f4f6f9;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
                .card{background:#fff;padding:24px;border-radius:12px;width:100%;max-width:360px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.1)}
                input{width:100%;padding:12px;font-size:18px;text-align:center;letter-spacing:4px;margin-bottom:16px;border:1px solid #cbd5e1;border-radius:8px}
                button{background:#2563eb;color:#fff;border:none;width:100%;padding:12px;font-size:16px;border-radius:8px;font-weight:600}
                .error{color:#dc2626;display:none;margin-bottom:12px}
            </style>
        </head>
        <body>
            <div class="card">
                <h3>🔒 Authorize Transaction</h3>
                <p>Enter your 4-digit PIN</p>
                <div style="text-align:left;background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px">
                    <div><b>Service:</b> ${service.toUpperCase()}</div>
                    ${network ? `<div><b>Network/Disco:</b> ${network.toUpperCase()}</div>` : ''}
                    ${phone ? `<div><b>Phone/Meter:</b> ${phone}</div>` : ''}
                    ${planName ? `<div><b>Plan:</b> ${planName}</div>` : ''}
                    ${meterType ? `<div><b>Meter Type:</b> ${meterType}</div>` : ''}
                    ${customerName ? `<div><b>Customer:</b> ${customerName}</div>` : ''}
                    ${iuc ? `<div><b>IUC:</b> ${iuc}</div>` : ''}
                    ${senderName ? `<div><b>Sender ID:</b> ${senderName}</div>` : ''}
                    ${recipientCount ? `<div><b>Recipients:</b> ${recipientCount}</div>` : ''}
                    ${pages ? `<div><b>Pages:</b> ${pages} (${encoding})</div>` : ''}
                    ${examLabel ? `<div><b>Exam:</b> ${examLabel}</div>` : ''}
                    ${quantity ? `<div><b>Quantity:</b> ${quantity}</div>` : ''}
                    ${brandName ? `<div><b>Brand:</b> ${brandName}</div>` : ''}
                    <div><b>Amount:</b> ₦${Number(amount).toLocaleString()}</div>
                </div>
                <div id="errorMsg" class="error"></div>
                <form id="pinForm">
                    <input type="hidden" id="tokenField" value="${token}">
                    <input type="password" id="pinInput" maxlength="4" pattern="[0-9]{4}" placeholder="••••" required autofocus>
                    <button type="submit">Authorize & Pay</button>
                </form>
            </div>
            <script>
                document.getElementById('pinForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const pin = document.getElementById('pinInput').value;
                    const token = document.getElementById('tokenField').value;
                    try {
                        const res = await fetch('./secure-pin-portal-submit', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({token, pin})
                        });
                        const result = await res.json();
                        if (result.success || result.closeWindow) {
                            if (typeof MessengerExtensions !== 'undefined') {
                                MessengerExtensions.requestCloseBrowser(() => {}, () => window.close());
                            } else {
                                window.close();
                            }
                        } else {
                            document.getElementById('errorMsg').innerText = result.message;
                            document.getElementById('errorMsg').style.display = 'block';
                            document.getElementById('pinInput').value = '';
                        }
                    } catch (err) {
                        document.getElementById('errorMsg').innerText = 'Network error';
                        document.getElementById('errorMsg').style.display = 'block';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

router.post('/secure-pin-portal-submit', express.json(), async (req, res) => {
    const token = req.body.token;
    const pin = req.body.pin;

    if (!token || !pendingPinTokens[token]) {
        return res.json({ success: false, message: '❌ Link expired', closeWindow: true });
    }

    const sessionData = pendingPinTokens[token];
    if (Date.now() > sessionData.expiresAt) {
        delete pendingPinTokens[token];
        return res.json({ success: false, message: '❌ Link expired', closeWindow: true });
    }

    const psid = sessionData.psid;
    const service = sessionData.service;

    try {
        const userId = await getLinkedUserId(psid);
        if (!userId) {
            delete pendingPinTokens[token];
            return res.json({ success: false, message: '❌ Account not linked', closeWindow: true });
        }

        const userSnap = await admin.database().ref('users/' + userId).once('value');
        if (!userSnap.exists()) {
            delete pendingPinTokens[token];
            return res.json({ success: false, message: '❌ User not found', closeWindow: true });
        }

        const userData = userSnap.val();
        const correctPin = userData.pin || userData.transaction_pin;

        if (String(pin).trim() !== String(correctPin).trim()) {
            sessionData.attempts = (sessionData.attempts || 0) + 1;
            const attemptsLeft = 3 - sessionData.attempts;

            if (sessionData.attempts >= 3) {
                delete pendingPinTokens[token];
                await sendMessengerReply(psid, { text: '❌ Too many wrong PIN attempts. Transaction cancelled.' + MENU_FOOTER });
                return res.json({ success: false, message: 'Max attempts', closeWindow: true });
            }

            return res.json({
                success: false,
                message: '❌ Invalid PIN. ' + attemptsLeft + ' attempt(s) left',
                closeWindow: false
            });
        }

        delete pendingPinTokens[token];

        // Dispatch to the correct service module
        const executors = {
            airtime: airtimeChat.executePurchase,
            data: dataChat.executePurchase,
            cable: cableChat.executePurchase,
            electricity: electricityChat.executePurchase,
            bulksms: bulksmsChat.executePurchase,
            exampin: examChat.executePurchase,
            rechargepin: rechargePinChat.executePurchase
        };

        const executor = executors[service];
        if (!executor) {
            await sendMessengerReply(psid, { text: '❌ Unknown service.' + MENU_FOOTER });
            return res.json({ success: false, closeWindow: true });
        }

        const result = await executor(userId, sessionData, pin, APP_URL);
        await sendMessengerReply(psid, { text: result.message + MENU_FOOTER });
        return res.json({ success: result.success, closeWindow: true });
    } catch (error) {
        delete pendingPinTokens[token];
        const errMsg = error.response?.data?.error || error.message || 'Server error';
        await sendMessengerReply(psid, { text: '❌ Transaction Failed: ' + errMsg + MENU_FOOTER });
        return res.json({ success: false, closeWindow: true });
    }
});

// ========== MESSAGE HANDLER ==========

async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase().trim();
    const raw = text.trim();

    // 0 / menu / hi / hello → main menu
    if (raw === '0' || lowerText === 'menu' || lowerText === 'start' || lowerText === 'hi' || lowerText === 'hello') {
        await showMainMenu(senderPsid);
        return;
    }

    // # / stop / cancel → abort
    if (raw === '#' || lowerText === 'stop' || lowerText === 'cancel' || lowerText === 'abort') {
        clearAllSessions(senderPsid);
        Object.keys(pendingPinTokens).forEach(t => {
            if (pendingPinTokens[t].psid === senderPsid) delete pendingPinTokens[t];
        });
        delete pendingFreeLogin[senderPsid];
        delete pendingFreeRegister[senderPsid];
        await sendMessengerReply(senderPsid, { text: '🛑 Transaction cancelled.' + MENU_FOOTER });
        await showMainMenu(senderPsid);
        return;
    }

    // * → restart current flow or main menu
    if (raw === '*') {
        if (airtimeChat.getAirtimeSession(senderPsid)) {
            airtimeChat.clearAirtimeSession(senderPsid);
            await sendMessengerReply(senderPsid, airtimeChat.startAirtimeFlow(senderPsid));
            return;
        }
        if (dataChat.getDataSession(senderPsid)) {
            dataChat.clearDataSession(senderPsid);
            await sendMessengerReply(senderPsid, dataChat.startDataFlow(senderPsid));
            return;
        }
        if (cableChat.getCableSession(senderPsid)) {
            cableChat.clearCableSession(senderPsid);
            await sendMessengerReply(senderPsid, cableChat.startCableFlow(senderPsid));
            return;
        }
        if (electricityChat.getElectricitySession(senderPsid)) {
            electricityChat.clearElectricitySession(senderPsid);
            await sendMessengerReply(senderPsid, electricityChat.startElectricityFlow(senderPsid));
            return;
        }
        if (bulksmsChat.getBulkSmsSession(senderPsid)) {
            bulksmsChat.clearBulkSmsSession(senderPsid);
            await sendMessengerReply(senderPsid, bulksmsChat.startBulkSmsFlow(senderPsid));
            return;
        }
        if (fundChat.getFundSession(senderPsid)) {
            fundChat.clearFundSession(senderPsid);
            await sendMessengerReply(senderPsid, await fundChat.startFundWalletFlow(senderPsid));
            return;
        }
        if (examChat.getExamSession(senderPsid)) {
            examChat.clearExamSession(senderPsid);
            await sendMessengerReply(senderPsid, examChat.startExamFlow(senderPsid));
            return;
        }
        if (rechargePinChat.getRechargePinSession(senderPsid)) {
            rechargePinChat.clearRechargePinSession(senderPsid);
            await sendMessengerReply(senderPsid, rechargePinChat.startRechargePinFlow(senderPsid));
            return;
        }
        await showMainMenu(senderPsid);
        return;
    }

    // ===== FREE MODE CHOICE & CHAT PIN ENTRY =====
    const freeModeToken = Object.keys(pendingPinTokens).find(t => {
        const d = pendingPinTokens[t];
        return d.psid === senderPsid && (d.awaitingFreeModeChoice || d.awaitingChatPin) && Date.now() < d.expiresAt;
    });

    if (freeModeToken) {
        const sessionData = pendingPinTokens[freeModeToken];

        if (sessionData.awaitingFreeModeChoice) {
            if (raw === '1' || lowerText === 'no') {
                sessionData.awaitingFreeModeChoice = false;
                const webviewUrl = APP_URL + '/webhook/secure-pin-portal?token=' + freeModeToken;

                await sendMessengerReply(senderPsid, {
                    text:
                        '🔐 Click the secure link below to enter your PIN:\n\n' +
                        webviewUrl +
                        '\n\n(Link expires in 5 minutes)\n(Type # or cancel to abort)'
                });
                return;
            }

            if (raw === '2' || lowerText === 'yes') {
                sessionData.awaitingFreeModeChoice = false;
                sessionData.awaitingChatPin = true;

                await sendMessengerReply(senderPsid, {
                    text:
                        '⚠️ You selected Free Mode.\n\n' +
                        'Please enter your 4-digit Transaction PIN now.\n\n' +
                        'After the transaction is processed, please *delete* the PIN you typed above for your security.'
                });
                return;
            }

            await sendMessengerReply(senderPsid, {
                text: 'Please reply with 1 (No Free Mode) or 2 (Yes Free Mode):'
            });
            return;
        }

        if (sessionData.awaitingChatPin && /^\d{4}$/.test(raw)) {
            await processFreeModePin(senderPsid, raw, sessionData, freeModeToken);
            return;
        }

        if (sessionData.awaitingChatPin) {
            await sendMessengerReply(senderPsid, {
                text: 'Please enter a valid 4-digit PIN:'
            });
            return;
        }
    }

    // ===== FREE MODE LOGIN FLOW =====
    if (pendingFreeLogin[senderPsid]) {
        const session = pendingFreeLogin[senderPsid];

        if (Date.now() > session.expiresAt) {
            delete pendingFreeLogin[senderPsid];
            await sendMessengerReply(senderPsid, {
                text: '⏳ Login session expired. Please type 1 to start again.' + MENU_FOOTER
            });
            return;
        }

        if (session.step === 'ASK_FREE_MODE') {
            if (raw === '1' || lowerText === 'no') {
                delete pendingFreeLogin[senderPsid];
                const payload = loginChat.startLoginFlow(senderPsid, pendingAuthTokens, APP_URL);
                await sendMessengerReply(senderPsid, {
                    text: payload.text + '\n\n' + payload.url
                });
                return;
            }

            if (raw === '2' || lowerText === 'yes') {
                session.step = 'ASK_EMAIL';
                await sendMessengerReply(senderPsid, {
                    text:
                        'Please enter your registered email address:\n\n' +
                        '⚠️ After processing, please delete the email you typed above.'
                });
                return;
            }

            await sendMessengerReply(senderPsid, { text: 'Please reply with 1 or 2:' });
            return;
        }

        if (session.step === 'ASK_EMAIL') {
            if (!raw.includes('@') || raw.length < 6) {
                await sendMessengerReply(senderPsid, { text: '❌ Please enter a valid email address:' });
                return;
            }
            session.email = raw.toLowerCase().trim();
            session.step = 'ASK_PASSWORD';
            await sendMessengerReply(senderPsid, {
                text:
                    'Please enter your login password:\n\n' +
                    '⚠️ After processing, please delete the password you typed above.'
            });
            return;
        }

        if (session.step === 'ASK_PASSWORD') {
            const email = session.email;
            const password = raw;
            delete pendingFreeLogin[senderPsid];

            // Process Free Mode login via login.js
            const result = await loginChat.processFreeModeLogin(senderPsid, { email, password });
            await sendMessengerReply(senderPsid, { text: result.message });
            return;
        }
    }

    // ===== FREE MODE REGISTER FLOW =====
    if (pendingFreeRegister[senderPsid]) {
        const session = pendingFreeRegister[senderPsid];

        if (Date.now() > session.expiresAt) {
            delete pendingFreeRegister[senderPsid];
            await sendMessengerReply(senderPsid, {
                text: '⏳ Registration session expired. Please type 2 to start again.' + MENU_FOOTER
            });
            return;
        }

        if (session.step === 'ASK_FREE_MODE') {
            if (raw === '1' || lowerText === 'no') {
                delete pendingFreeRegister[senderPsid];
                const payload = loginChat.startRegisterFlow(senderPsid, pendingAuthTokens, APP_URL);
                await sendMessengerReply(senderPsid, {
                    text: payload.text + '\n\n' + payload.url
                });
                return;
            }

            if (raw === '2' || lowerText === 'yes') {
                session.step = 'ASK_NAME';
                await sendMessengerReply(senderPsid, {
                    text: 'Please enter your Full Name:'
                });
                return;
            }

            await sendMessengerReply(senderPsid, { text: 'Please reply with 1 or 2:' });
            return;
        }

        if (session.step === 'ASK_NAME') {
            if (raw.length < 2) {
                await sendMessengerReply(senderPsid, { text: '❌ Please enter a valid name:' });
                return;
            }
            session.name = raw;
            session.step = 'ASK_PHONE';
            await sendMessengerReply(senderPsid, { text: 'Please enter your Phone Number:' });
            return;
        }

        if (session.step === 'ASK_PHONE') {
            if (raw.length < 10) {
                await sendMessengerReply(senderPsid, { text: '❌ Please enter a valid phone number:' });
                return;
            }
            session.phone = raw;
            session.step = 'ASK_ADDRESS';
            await sendMessengerReply(senderPsid, { text: 'Please enter your Home Address:' });
            return;
        }

        if (session.step === 'ASK_ADDRESS') {
            if (raw.length < 5) {
                await sendMessengerReply(senderPsid, { text: '❌ Please enter a valid address:' });
                return;
            }
            session.address = raw;
            session.step = 'ASK_EMAIL';
            await sendMessengerReply(senderPsid, {
                text:
                    'Please enter your Email Address:\n\n' +
                    '⚠️ After processing, please delete the email you typed.'
            });
            return;
        }

        if (session.step === 'ASK_EMAIL') {
            if (!raw.includes('@') || raw.length < 6) {
                await sendMessengerReply(senderPsid, { text: '❌ Please enter a valid email address:' });
                return;
            }
            session.email = raw.toLowerCase().trim();
            session.step = 'ASK_PASSWORD';
            await sendMessengerReply(senderPsid, {
                text:
                    'Please enter a Password (minimum 6 characters):\n\n' +
                    '⚠️ After processing, please delete the password you typed.'
            });
            return;
        }

        if (session.step === 'ASK_PASSWORD') {
            if (raw.length < 6) {
                await sendMessengerReply(senderPsid, { text: '❌ Password must be at least 6 characters:' });
                return;
            }
            session.password = raw;
            session.step = 'ASK_PIN';
            await sendMessengerReply(senderPsid, {
                text:
                    'Please enter a 4-digit Transaction PIN:\n\n' +
                    '⚠️ After processing, please delete the PIN you typed.'
            });
            return;
        }

        if (session.step === 'ASK_PIN') {
            if (!/^\d{4}$/.test(raw)) {
                await sendMessengerReply(senderPsid, { text: '❌ Please enter a valid 4-digit PIN:' });
                return;
            }

            const { name, phone, address, email, password } = session;
            const pin = raw;
            delete pendingFreeRegister[senderPsid];

            // Process Free Mode registration via login.js
            const result = await loginChat.processFreeModeRegister(senderPsid, {
                name, phone, address, email, password, pin
            });

            await sendMessengerReply(senderPsid, { text: result.message });
            return;
        }
    }

    // ===== ACTIVE AIRTIME SESSION =====
    const airtimeSession = airtimeChat.getAirtimeSession(senderPsid);
    if (airtimeSession) {
        const result = await airtimeChat.handleAirtimeFlow(senderPsid, text, airtimeSession);

        if (result && result.type === 'READY_FOR_PIN') {
            airtimeChat.clearAirtimeSession(senderPsid);

            if (!(await requireLink(senderPsid))) return;

            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'airtime',
                phone: result.data.phone,
                network: result.data.network,
                amount: result.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(
                senderPsid,
                result.data.network,
                result.data.phone,
                result.data.amount,
                pinToken
            );
            return;
        }

        if (result && result.text) {
            await sendMessengerReply(senderPsid, result);
        }
        return;
    }

    // ===== ACTIVE ELECTRICITY SESSION =====
    const elecSession = electricityChat.getElectricitySession(senderPsid);
    if (elecSession) {
        const result = await electricityChat.handleElectricityFlow(senderPsid, text, elecSession);

        if (result && result.step === 'READY_FOR_PIN') {
            if (!(await requireLink(senderPsid))) {
                electricityChat.clearElectricitySession(senderPsid);
                return;
            }

            electricityChat.clearElectricitySession(senderPsid);

            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'electricity',
                disco: elecSession.data.disco,
                discoName: elecSession.data.discoName,
                meterType: elecSession.data.meterType,
                meterNumber: elecSession.data.meterNumber,
                amount: elecSession.data.amount,
                phone: elecSession.data.meterNumber,
                network: elecSession.data.disco,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(
                senderPsid,
                elecSession.data.disco,
                elecSession.data.meterNumber,
                elecSession.data.amount,
                pinToken,
                {
                    service: 'electricity',
                    discoName: elecSession.data.discoName,
                    meterType: elecSession.data.meterType
                }
            );
            return;
        }

        if (result && result.text) {
            await sendMessengerReply(senderPsid, result);
        }
        return;
    }

    // ===== ACTIVE BULK SMS SESSION =====
    const bulksmsSession = bulksmsChat.getBulkSmsSession(senderPsid);
    if (bulksmsSession) {
        const result = await bulksmsChat.handleBulkSmsFlow(senderPsid, text, bulksmsSession);

        if (result && result.step === 'READY_FOR_PIN') {
            if (!(await requireLink(senderPsid))) {
                bulksmsChat.clearBulkSmsSession(senderPsid);
                return;
            }

            bulksmsChat.clearBulkSmsSession(senderPsid);

            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'bulksms',
                senderName: result.data.senderName,
                recipients: result.data.recipients,
                recipientCount: result.data.recipientCount,
                message: result.data.message,
                pages: result.data.pages,
                rate: result.data.rate,
                amount: result.data.totalCost,
                encoding: result.data.encoding,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            const messagePreview = result.data.message.length > 80
                ? result.data.message.substring(0, 80) + '...'
                : result.data.message;

            await sendSecurePinLink(
                senderPsid,
                '',
                '',
                result.data.totalCost,
                pinToken,
                {
                    service: 'bulksms',
                    senderName: result.data.senderName,
                    recipientCount: result.data.recipientCount,
                    pages: result.data.pages,
                    rate: result.data.rate,
                    encoding: result.data.encoding,
                    messagePreview: messagePreview
                }
            );
            return;
        }

        if (result && result.text) {
            await sendMessengerReply(senderPsid, result);
        }
        return;
    }

    // ===== ACTIVE CABLE TV SESSION =====
    const cableSession = cableChat.getCableSession(senderPsid);
    if (cableSession) {
        const result = await cableChat.handleCableFlow(senderPsid, text, cableSession, APP_URL);

        if (result && result.type === 'READY_FOR_PIN') {
            cableChat.clearCableSession(senderPsid);

            if (!(await requireLink(senderPsid))) return;

            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'cable',
                providerID: result.data.providerID,
                providerName: result.data.providerName,
                planID: result.data.planID,
                planName: result.data.planName,
                amount: result.data.amount,
                iuc: result.data.iuc,
                customerName: result.data.customerName,
                phone: result.data.iuc,
                network: result.data.providerName,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(
                senderPsid,
                result.data.providerName,
                result.data.iuc,
                result.data.amount,
                pinToken,
                {
                    service: 'cable',
                    providerName: result.data.providerName,
                    planName: result.data.planName,
                    iuc: result.data.iuc,
                    customerName: result.data.customerName
                }
            );
            return;
        }

        if (result && result.text) {
            await sendMessengerReply(senderPsid, result);
        }
        return;
    }

    // ===== ACTIVE FUND WALLET SESSION =====
    const fundSession = fundChat.getFundSession(senderPsid);
    if (fundSession) {
        const result = await fundChat.handleFundWalletFlow(senderPsid, text, fundSession, APP_URL);
        if (result && result.text) {
            await sendMessengerReply(senderPsid, result);
        }
        return;
    }

    // ===== ACTIVE DATA SESSION =====
    const dataSession = dataChat.getDataSession(senderPsid);
    if (dataSession) {
        const result = await dataChat.handleDataFlow(senderPsid, text, dataSession);

        if (result && result.type === 'READY_FOR_PIN') {
            dataChat.clearDataSession(senderPsid);

            if (!(await requireLink(senderPsid))) return;

            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'data',
                phone: result.data.phone,
                network: result.data.network,
                networkID: result.data.networkID,
                planId: result.data.planId,
                amount: result.data.amount,
                planName: result.data.planName,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(
                senderPsid,
                result.data.network,
                result.data.phone,
                result.data.amount,
                pinToken,
                { service: 'data', planName: result.data.planName }
            );
            return;
        }

        if (result && result.text) {
            await sendMessengerReply(senderPsid, result);
        }
        return;
    }

    // ===== ACTIVE EXAM PIN SESSION =====
    const examSession = examChat.getExamSession(senderPsid);
    if (examSession) {
        const result = await examChat.handleExamFlow(senderPsid, text, examSession);

        if (result && result.type === 'READY_FOR_PIN') {
            examChat.clearExamSession(senderPsid);

            if (!(await requireLink(senderPsid))) return;

            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'exampin',
                examType: result.data.examType,
                examLabel: result.data.examLabel,
                quantity: result.data.quantity,
                amount: result.data.amount,
                phone: result.data.examLabel,
                network: result.data.examType,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(
                senderPsid,
                result.data.examType,
                result.data.examLabel,
                result.data.amount,
                pinToken,
                {
                    service: 'exampin',
                    examLabel: result.data.examLabel,
                    quantity: result.data.quantity
                }
            );
            return;
        }

        if (result && result.text) {
            await sendMessengerReply(senderPsid, result);
        }
        return;
    }

    // ===== ACTIVE RECHARGE PIN SESSION =====
    const rpinSession = rechargePinChat.getRechargePinSession(senderPsid);
    if (rpinSession) {
        const result = await rechargePinChat.handleRechargePinFlow(senderPsid, text, rpinSession);

        if (result && result.type === 'READY_FOR_PIN') {
            rechargePinChat.clearRechargePinSession(senderPsid);

            if (!(await requireLink(senderPsid))) return;

            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'rechargepin',
                network: result.data.network,
                amount: result.data.amount,
                qty: result.data.qty,
                totalCost: result.data.totalCost,
                brandName: result.data.brandName,
                phone: result.data.network,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(
                senderPsid,
                result.data.network,
                result.data.network,
                result.data.totalCost,
                pinToken,
                {
                    service: 'rechargepin',
                    denomination: result.data.amount,
                    qty: result.data.qty,
                    brandName: result.data.brandName
                }
            );
            return;
        }

        if (result && result.text) {
            await sendMessengerReply(senderPsid, result);
        }
        return;
    }

    // ===== MENU OPTIONS =====

    // 1. Login OR Logout (dynamic)
    if (raw === '1' || lowerText === 'login' || lowerText === 'logout') {
        const linked = await loginChat.isLinked(senderPsid);

        if (linked && (raw === '1' || lowerText === 'logout')) {
            const result = await loginChat.doLogout(senderPsid);
            await sendMessengerReply(senderPsid, { text: result.text + MENU_FOOTER });
            return;
        }

        if (!linked && (raw === '1' || lowerText === 'login')) {
            pendingFreeLogin[senderPsid] = {
                step: 'ASK_FREE_MODE',
                expiresAt: Date.now() + 5 * 60 * 1000
            };

            await sendMessengerReply(senderPsid, {
                text:
                    '🔐 Login\n\n' +
                    'Are you currently using Facebook / Messenger *Free Mode*?\n\n' +
                    '1. No, I\'m not using Free Mode\n' +
                    '2. Yes, I\'m using Free Mode\n\n' +
                    'Reply with 1 or 2:'
            });
            return;
        }

        if (linked && lowerText === 'login') {
            await sendMessengerReply(senderPsid, {
                text: '✅ You are already logged in.\nType "1" to logout or "0" for menu.' + MENU_FOOTER
            });
            return;
        }

        if (!linked && lowerText === 'logout') {
            await sendMessengerReply(senderPsid, {
                text: 'ℹ️ You are not logged in.\nType "1" to login.' + MENU_FOOTER
            });
            return;
        }
    }

    // 2. Create Account
    if (raw === '2' || lowerText === 'register' || lowerText === 'signup') {
        pendingFreeRegister[senderPsid] = {
            step: 'ASK_FREE_MODE',
            expiresAt: Date.now() + 5 * 60 * 1000
        };

        await sendMessengerReply(senderPsid, {
            text:
                '📝 Create Account\n\n' +
                'Are you currently using Facebook / Messenger *Free Mode*?\n\n' +
                '1. No, I\'m not using Free Mode\n' +
                '2. Yes, I\'m using Free Mode\n\n' +
                'Reply with 1 or 2:'
        });
        return;
    }

    // 10. Forgot Password
    if (raw === '10' || lowerText === 'forgot' || lowerText === 'reset') {
        const payload = loginChat.startForgotFlow(senderPsid, pendingAuthTokens, APP_URL);
        await sendMessengerReply(senderPsid, {
            text: payload.text + '\n\n' + payload.url
        });
        return;
    }

    // All other services require linked account
    const serviceTriggers =
        raw === '3' || raw === '4' || raw === '5' || raw === '6' || raw === '7' ||
        raw === '8' || raw === '9' || raw === '11' || raw === '12' || raw === '13' || raw === '14' ||
        lowerText.indexOf('airtime') !== -1 || lowerText.indexOf('data') !== -1 ||
        lowerText.indexOf('cable') !== -1 || lowerText === 'dstv' || lowerText === 'gotv' ||
        lowerText.indexOf('electricity') !== -1 || lowerText.indexOf('disco') !== -1 ||
        lowerText.indexOf('bulk') !== -1 || lowerText.indexOf('sms') !== -1 ||
        lowerText === 'balance' || lowerText === 'wallet' || lowerText === 'status' ||
        lowerText === 'fund' || lowerText === 'fund wallet' ||
        lowerText === 'history' || lowerText === 'transactions' ||
        lowerText.indexOf('exam') !== -1 || lowerText === 'waec' || lowerText === 'neco' ||
        lowerText.indexOf('recharge pin') !== -1 || lowerText === 'rechargepin';

    if (serviceTriggers) {
        if (!(await requireLink(senderPsid))) return;
    }

    // 3. Airtime
    if (raw === '3' || lowerText.indexOf('airtime') !== -1) {
        const initial = airtimeChat.startAirtimeFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 4. Data Bundles
    if (raw === '4' || lowerText.indexOf('data') !== -1) {
        const initial = dataChat.startDataFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 5. Cable TV
    if (raw === '5' || lowerText.indexOf('cable') !== -1 || lowerText === 'dstv' || lowerText === 'gotv') {
        const initial = cableChat.startCableFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 6. Electricity
    if (raw === '6' || lowerText.indexOf('electricity') !== -1 || lowerText.indexOf('disco') !== -1) {
        const initial = electricityChat.startElectricityFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 7. Bulk SMS
    if (raw === '7' || lowerText.indexOf('bulk') !== -1 || lowerText.indexOf('sms') !== -1) {
        const initial = bulksmsChat.startBulkSmsFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 8. Check Wallet Balance
    if (raw === '8' || lowerText === 'balance' || lowerText === 'wallet') {
        try {
            const userId = await getLinkedUserId(senderPsid);
            const userSnap = await admin.database().ref('users/' + userId).once('value');

            if (!userSnap.exists()) {
                await sendMessengerReply(senderPsid, {
                    text: '❌ Account record not found. Please contact support.' + MENU_FOOTER
                });
                return;
            }

            const userData = userSnap.val();
            const balance = userData.balance !== undefined ? Number(userData.balance) : 0;
            const name = userData.name || 'User';

            await sendMessengerReply(senderPsid, {
                text:
                    '💰 Dnezerlinks Wallet Balance\n\n' +
                    'Name: ' + name + '\n' +
                    'Balance: ₦' + balance.toLocaleString() + MENU_FOOTER
            });
        } catch (err) {
            console.error('Balance check error:', err);
            await sendMessengerReply(senderPsid, {
                text: '❌ Unable to retrieve wallet balance at the moment. Please try again later.' + MENU_FOOTER
            });
        }
        return;
    }

    // 9. Check Account Status
    if (raw === '9' || lowerText === 'status' || lowerText === 'account status') {
        try {
            const userId = await getLinkedUserId(senderPsid);

            if (userId) {
                const userSnap = await admin.database().ref('users/' + userId).once('value');
                const userData = userSnap.exists() ? userSnap.val() : {};
                const name = userData.name || 'User';
                const email = userData.email || 'Not available';

                await sendMessengerReply(senderPsid, {
                    text:
                        '✅ Account Status\n\n' +
                        'Your Messenger is successfully linked to a Dnezerlinks account.\n\n' +
                        'Name: ' + name + '\n' +
                        'Email: ' + email + MENU_FOOTER
                });
            }
        } catch (err) {
            console.error('Status check error:', err);
            await sendMessengerReply(senderPsid, {
                text: '❌ Unable to check account status right now. Please try again later.' + MENU_FOOTER
            });
        }
        return;
    }

    // 11. Fund Wallet
    if (raw === '11' || lowerText === 'fund' || lowerText === 'fund wallet') {
        const initial = await fundChat.startFundWalletFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 12. Transaction History
    if (raw === '12' || lowerText === 'history' || lowerText === 'transactions') {
        const result = await historyChat.getTransactionHistory(senderPsid);
        await sendMessengerReply(senderPsid, { text: (result.text || '') + MENU_FOOTER });
        return;
    }

    // 13. Exam PIN
    if (raw === '13' || lowerText.indexOf('exam') !== -1 || lowerText === 'waec' || lowerText === 'neco') {
        const initial = examChat.startExamFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 14. Recharge PIN
    if (raw === '14' || lowerText.indexOf('recharge pin') !== -1 || lowerText === 'rechargepin') {
        const initial = rechargePinChat.startRechargePinFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    await sendMessengerReply(senderPsid, {
        text: 'I didn\'t get that.' + MENU_FOOTER
    });
}

module.exports = router;
