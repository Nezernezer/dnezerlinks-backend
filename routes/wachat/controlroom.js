const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');

const airtimeChat = require('../fbchat/airtime');
const loginChat = require('../fbchat/login');
const dataChat = require('../fbchat/data');
const fundChat = require('../fbchat/fundwallet');
const cableChat = require('../fbchat/cabletv');
const electricityChat = require('../fbchat/electricity');
const bulksmsChat = require('../fbchat/bulksms');
const historyChat = require('../fbchat/history');
const examChat = require('../fbchat/exampin');
const rechargePinChat = require('../fbchat/rechargepin');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

let APP_URL = process.env.APP_URL || 'https://api.dlinks.name.ng';
APP_URL = APP_URL.trim().replace(/\/+$/, '');
if (!APP_URL.startsWith('http')) {
    APP_URL = 'https://' + APP_URL;
}
console.log('Using APP_URL →', APP_URL);

const pendingPinTokens = {};
const pendingAuthTokens = {};
const pendingFreeLogin = {};      
const pendingFreeRegister = {};   

const PIN_TOKEN_EXPIRY_MS = 5 * 60 * 1000;
const TOKEN_EXPIRY_MS = 5 * 60 * 1000;

const MENU_FOOTER = '\n\nType 0 or menu for main menu.';
const DELETE_PIN_REMINDER = '\n\n⚠️ Please delete all the four digits pin you entered above.';

// ========== HELPERS ==========

async function sendWhatsAppReply(recipientPhone, response) {
    try {
        let messagePayload = {
            messaging_product: 'whatsapp',
            to: recipientPhone
        };

        if (typeof response === 'string') {
            messagePayload.text = { body: response };
        } else if (response.text) {
            messagePayload.text = { body: response.text };
        }

        await axios.post(
            `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages?access_token=${WHATSAPP_TOKEN}`,
            messagePayload
        );
    } catch (err) {
        console.error('Error sending WhatsApp message:', err.response?.data || err.message);
    }
}

function clearAllSessions(phone) {
    try { airtimeChat.clearAirtimeSession(phone); } catch (e) {}
    try { dataChat.clearDataSession(phone); } catch (e) {}
    try { cableChat.clearCableSession(phone); } catch (e) {}
    try { electricityChat.clearElectricitySession(phone); } catch (e) {}
    try { bulksmsChat.clearBulkSmsSession(phone); } catch (e) {}
    try { fundChat.clearFundSession(phone); } catch (e) {}
    try { examChat.clearExamSession(phone); } catch (e) {}
    try { rechargePinChat.clearRechargePinSession(phone); } catch (e) {}
    delete pendingFreeLogin[phone];
    delete pendingFreeRegister[phone];
}

async function getLinkedUserId(senderPhone) {
    try {
        const linkSnap = await admin.database().ref('whatsapp_links/' + senderPhone).once('value');
        if (linkSnap.exists() && linkSnap.val().userId) {
            return linkSnap.val().userId;
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function showMainMenu(senderPhone) {
    clearAllSessions(senderPhone);
    const linked = await loginChat.isLinked(senderPhone);
    const option1 = linked ? '1. Logout' : '1. Login';

    await sendWhatsAppReply(senderPhone, {
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

async function requireLink(senderPhone) {
    const userId = await getLinkedUserId(senderPhone);
    if (!userId) {
        await sendWhatsAppReply(senderPhone, {
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

async function sendSecurePinLink(senderPhone, network, phone, amount, pinToken, extra = {}) {
    pendingPinTokens[pinToken].awaitingFreeModeChoice = true;
    pendingPinTokens[pinToken].network = network;
    pendingPinTokens[pinToken].phone = phone;
    pendingPinTokens[pinToken].amount = amount;
    pendingPinTokens[pinToken].extra = extra || {};

    await sendWhatsAppReply(senderPhone, {
        text:
            '🔐 Before entering your PIN:\n\n' +
            'Are you using data saver / web view currently?\n\n' +
            '1. No\n' +
            '2. Yes\n\n' +
            'Reply with 1 or 2:'
    });
}

async function processFreeModePin(senderPhone, pin, sessionData, token) {
    const phoneKey = sessionData.phoneKey;
    const service = sessionData.service;

    try {
        const userId = await getLinkedUserId(phoneKey);
        if (!userId) {
            delete pendingPinTokens[token];
            await sendWhatsAppReply(phoneKey, { text: '❌ Account not linked.' + MENU_FOOTER });
            return;
        }

        const userSnap = await admin.database().ref('users/' + userId).once('value');
        if (!userSnap.exists()) {
            delete pendingPinTokens[token];
            await sendWhatsAppReply(phoneKey, { text: '❌ User not found.' + MENU_FOOTER });
            return;
        }

        const userData = userSnap.val();
        const correctPin = userData.pin || userData.transaction_pin;

        if (String(pin).trim() !== String(correctPin).trim()) {
            sessionData.attempts = (sessionData.attempts || 0) + 1;
            const attemptsLeft = 3 - sessionData.attempts;

            if (sessionData.attempts >= 3) {
                delete pendingPinTokens[token];
                await sendWhatsAppReply(phoneKey, {
                    text: '❌ Too many wrong PIN attempts. Transaction cancelled.' + MENU_FOOTER
                });
                return;
            }

            await sendWhatsAppReply(phoneKey, {
                text: '❌ Invalid PIN. ' + attemptsLeft + ' attempt(s) left.\n\nPlease enter your 4-digit PIN again:'
            });
            return;
        }

        delete pendingPinTokens[token];

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
            await sendWhatsAppReply(phoneKey, {
                text: '❌ Unknown service.' + DELETE_PIN_REMINDER + MENU_FOOTER
            });
            return;
        }

        const result = await executor(userId, sessionData, pin, APP_URL);
        await sendWhatsAppReply(phoneKey, {
            text: result.message + DELETE_PIN_REMINDER + MENU_FOOTER
        });
    } catch (error) {
        delete pendingPinTokens[token];
        await sendWhatsAppReply(phoneKey, {
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
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ WhatsApp Webhook Verified Successfully.');
            return res.status(200).send(challenge);
        }
        return res.sendStatus(403);
    }
    return res.sendStatus(400);
});

router.post('/', async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        res.sendStatus(200);

        try {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            if (value?.messages) {
                const messageObj = value.messages[0];
                const senderPhone = messageObj.from;
                const incomingText = messageObj.text?.body ? messageObj.text.body.trim() : '';

                if (incomingText) {
                    await handleUserMessage(senderPhone, incomingText);
                }
            }
        } catch (err) {
            console.error('❌ WhatsApp Webhook Error:', err);
        }
    } else {
        return res.sendStatus(404);
    }
});

// ========== SECURE AUTH PORTAL ==========
router.get('/secure-auth-portal', (req, res) => {
    const token = req.query.token;

    if (!token || !pendingAuthTokens[token]) {
        return res.status(400).send('<h3>❌ Link Expired or Invalid. Please restart in WhatsApp.</h3>');
    }

    const sessionData = pendingAuthTokens[token];
    if (Date.now() > sessionData.expiresAt) {
        delete pendingAuthTokens[token];
        return res.status(400).send('<h3>❌ Link Expired. Please restart in WhatsApp.</h3>');
    }

    const action = sessionData.action;
    let title = 'Dnezerlinks Access';
    let htmlForm = '';

    if (action === 'login') {
        title = 'Login to Dnezerlinks';
        htmlForm = `
            <h3>🔐 Account Login</h3>
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
                            window.close();
                        } else {
                            loader.style.display = 'none';
                            btn.disabled = false;
                            err.innerText = result.message;
                            err.style.display = 'block';
                        }
                    } catch (ex) {
                        loader.style.display = 'none';
                        btn.disabled = false;
                        err.innerText = ex.message || 'Network / Auth error';
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

    const phoneKey = sessionData.phoneKey;

    try {
        let result;
        if (action === 'login') {
            result = await loginChat.processLogin(phoneKey, { email, idToken });
        } else if (action === 'register') {
            result = await loginChat.processRegister(phoneKey, { name, phone, address, email, password: req.body.password, pin });
        } else if (action === 'forgot') {
            result = await loginChat.processForgot(phoneKey, { email });
        } else {
            return res.json({ success: false, message: '❌ Invalid action.' });
        }

        if (result.success) {
            delete pendingAuthTokens[token];
            await sendWhatsAppReply(phoneKey, { text: result.message });
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

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Secure PIN</title>
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
                <div style="text-align:left;background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px">
                    <div><b>Service:</b> ${service.toUpperCase()}</div>
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
                            window.close();
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

    const phoneKey = sessionData.phoneKey;
    const service = sessionData.service;

    try {
        const userId = await getLinkedUserId(phoneKey);
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
                await sendWhatsAppReply(phoneKey, { text: '❌ Too many wrong PIN attempts. Transaction cancelled.' + MENU_FOOTER });
                return res.json({ success: false, message: 'Max attempts', closeWindow: true });
            }

            return res.json({
                success: false,
                message: '❌ Invalid PIN. ' + attemptsLeft + ' attempt(s) left',
                closeWindow: false
            });
        }

        delete pendingPinTokens[token];

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
            await sendWhatsAppReply(phoneKey, { text: '❌ Unknown service.' + MENU_FOOTER });
            return res.json({ success: false, closeWindow: true });
        }

        const result = await executor(userId, sessionData, pin, APP_URL);
        await sendWhatsAppReply(phoneKey, { text: result.message + MENU_FOOTER });
        return res.json({ success: result.success, closeWindow: true });
    } catch (error) {
        delete pendingPinTokens[token];
        const errMsg = error.response?.data?.error || error.message || 'Server error';
        await sendWhatsAppReply(phoneKey, { text: '❌ Transaction Failed: ' + errMsg + MENU_FOOTER });
        return res.json({ success: false, closeWindow: true });
    }
});

// ========== MESSAGE HANDLER ==========

async function handleUserMessage(senderPhone, text) {
    const lowerText = text.toLowerCase().trim();
    const raw = text.trim();

    if (raw === '0' || lowerText === 'menu' || lowerText === 'start' || lowerText === 'hi' || lowerText === 'hello') {
        await showMainMenu(senderPhone);
        return;
    }

    if (raw === '#' || lowerText === 'stop' || lowerText === 'cancel' || lowerText === 'abort') {
        clearAllSessions(senderPhone);
        Object.keys(pendingPinTokens).forEach(t => {
            if (pendingPinTokens[t].phoneKey === senderPhone) delete pendingPinTokens[t];
        });
        delete pendingFreeLogin[senderPhone];
        delete pendingFreeRegister[senderPhone];
        await sendWhatsAppReply(senderPhone, { text: '🛑 Transaction cancelled.' + MENU_FOOTER });
        await showMainMenu(senderPhone);
        return;
    }

    if (raw === '*') {
        if (airtimeChat.getAirtimeSession(senderPhone)) {
            airtimeChat.clearAirtimeSession(senderPhone);
            await sendWhatsAppReply(senderPhone, airtimeChat.startAirtimeFlow(senderPhone));
            return;
        }
        if (dataChat.getDataSession(senderPhone)) {
            dataChat.clearDataSession(senderPhone);
            await sendWhatsAppReply(senderPhone, dataChat.startDataFlow(senderPhone));
            return;
        }
        if (cableChat.getCableSession(senderPhone)) {
            cableChat.clearCableSession(senderPhone);
            await sendWhatsAppReply(senderPhone, cableChat.startCableFlow(senderPhone));
            return;
        }
        if (electricityChat.getElectricitySession(senderPhone)) {
            electricityChat.clearElectricitySession(senderPhone);
            await sendWhatsAppReply(senderPhone, electricityChat.startElectricityFlow(senderPhone));
            return;
        }
        if (bulksmsChat.getBulkSmsSession(senderPhone)) {
            bulksmsChat.clearBulkSmsSession(senderPhone);
            await sendWhatsAppReply(senderPhone, bulksmsChat.startBulkSmsFlow(senderPhone));
            return;
        }
        if (fundChat.getFundSession(senderPhone)) {
            fundChat.clearFundSession(senderPhone);
            await sendWhatsAppReply(senderPhone, await fundChat.startFundWalletFlow(senderPhone));
            return;
        }
        if (examChat.getExamSession(senderPhone)) {
            examChat.clearExamSession(senderPhone);
            await sendWhatsAppReply(senderPhone, examChat.startExamFlow(senderPhone));
            return;
        }
        if (rechargePinChat.getRechargePinSession(senderPhone)) {
            rechargePinChat.clearRechargePinSession(senderPhone);
            await sendWhatsAppReply(senderPhone, rechargePinChat.startRechargePinFlow(senderPhone));
            return;
        }
        await showMainMenu(senderPhone);
        return;
    }

    // ===== PIN TOKEN HANDLER =====
    const pinTokenMatch = Object.keys(pendingPinTokens).find(t => {
        const d = pendingPinTokens[t];
        return d.phoneKey === senderPhone && (d.awaitingFreeModeChoice || d.awaitingChatPin) && Date.now() < d.expiresAt;
    });

    if (pinTokenMatch) {
        const sessionData = pendingPinTokens[pinTokenMatch];

        if (sessionData.awaitingFreeModeChoice) {
            sessionData.awaitingFreeModeChoice = false;
            const webviewUrl = APP_URL + '/webhook/secure-pin-portal?token=' + pinTokenMatch;

            await sendWhatsAppReply(senderPhone, {
                text:
                    '🔐 Click the secure link below to enter your PIN:\n\n' +
                    webviewUrl +
                    '\n\n(Link expires in 5 minutes)\n(Type # or cancel to abort)'
            });
            return;
        }
    }

    // ===== LOGIN FLOW =====
    if (pendingFreeLogin[senderPhone]) {
        const session = pendingFreeLogin[senderPhone];
        if (Date.now() > session.expiresAt) {
            delete pendingFreeLogin[senderPhone];
            await sendWhatsAppReply(senderPhone, { text: '⏳ Session expired.' + MENU_FOOTER });
            return;
        }

        if (session.step === 'ASK_EMAIL') {
            session.email = raw.toLowerCase().trim();
            session.step = 'ASK_PASSWORD';
            await sendWhatsAppReply(senderPhone, { text: 'Please enter your login password:' });
            return;
        }

        if (session.step === 'ASK_PASSWORD') {
            const email = session.email;
            const password = raw;
            delete pendingFreeLogin[senderPhone];
            const result = await loginChat.processFreeModeLogin(senderPhone, { email, password });
            await sendWhatsAppReply(senderPhone, { text: result.message });
            return;
        }
    }

    // ===== REGISTER FLOW =====
    if (pendingFreeRegister[senderPhone]) {
        const session = pendingFreeRegister[senderPhone];
        if (Date.now() > session.expiresAt) {
            delete pendingFreeRegister[senderPhone];
            await sendWhatsAppReply(senderPhone, { text: '⏳ Session expired.' + MENU_FOOTER });
            return;
        }

        if (session.step === 'ASK_NAME') {
            session.name = raw;
            session.step = 'ASK_PHONE';
            await sendWhatsAppReply(senderPhone, { text: 'Please enter your Phone Number:' });
            return;
        }
        if (session.step === 'ASK_PHONE') {
            session.phone = raw;
            session.step = 'ASK_ADDRESS';
            await sendWhatsAppReply(senderPhone, { text: 'Please enter your Home Address:' });
            return;
        }
        if (session.step === 'ASK_ADDRESS') {
            session.address = raw;
            session.step = 'ASK_EMAIL';
            await sendWhatsAppReply(senderPhone, { text: 'Please enter your Email Address:' });
            return;
        }
        if (session.step === 'ASK_EMAIL') {
            session.email = raw.toLowerCase().trim();
            session.step = 'ASK_PASSWORD';
            await sendWhatsAppReply(senderPhone, { text: 'Please enter a Password (minimum 6 characters):' });
            return;
        }
        if (session.step === 'ASK_PASSWORD') {
            session.password = raw;
            session.step = 'ASK_PIN';
            await sendWhatsAppReply(senderPhone, { text: 'Please enter a 4-digit Transaction PIN:' });
            return;
        }
        if (session.step === 'ASK_PIN') {
            const { name, phone, address, email, password } = session;
            const pin = raw;
            delete pendingFreeRegister[senderPhone];
            const result = await loginChat.processFreeModeRegister(senderPhone, { name, phone, address, email, password, pin });
            await sendWhatsAppReply(senderPhone, { text: result.message });
            return;
        }
    }

    // ===== ACTIVE AIRTIME SESSION (Using airtime.js) =====
    const airtimeSession = airtimeChat.getAirtimeSession(senderPhone);
    if (airtimeSession) {
        const result = await airtimeChat.handleAirtimeFlow(senderPhone, text, airtimeSession);

        if (result && result.type === 'READY_FOR_PIN') {
            airtimeChat.clearAirtimeSession(senderPhone);

            if (!(await requireLink(senderPhone))) return;

            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                phoneKey: senderPhone,
                service: 'airtime',
                phone: result.data.phone,
                network: result.data.network,
                amount: result.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(
                senderPhone,
                result.data.network,
                result.data.phone,
                result.data.amount,
                pinToken
            );
            return;
        }

        if (result && result.text) {
            await sendWhatsAppReply(senderPhone, result);
        }
        return;
    }

    // ===== ACTIVE ELECTRICITY SESSION =====
    const elecSession = electricityChat.getElectricitySession(senderPhone);
    if (elecSession) {
        const result = await electricityChat.handleElectricityFlow(senderPhone, text, elecSession);
        if (result && result.step === 'READY_FOR_PIN') {
            if (!(await requireLink(senderPhone))) { electricityChat.clearElectricitySession(senderPhone); return; }
            electricityChat.clearElectricitySession(senderPhone);
            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                phoneKey: senderPhone, service: 'electricity',
                disco: elecSession.data.disco, amount: elecSession.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0
            };
            await sendSecurePinLink(senderPhone, elecSession.data.disco, elecSession.data.meterNumber, elecSession.data.amount, pinToken);
            return;
        }
        if (result && result.text) await sendWhatsAppReply(senderPhone, result);
        return;
    }

    // ===== ACTIVE BULK SMS SESSION =====
    const bulksmsSession = bulksmsChat.getBulkSmsSession(senderPhone);
    if (bulksmsSession) {
        const result = await bulksmsChat.handleBulkSmsFlow(senderPhone, text, bulksmsSession);
        if (result && result.step === 'READY_FOR_PIN') {
            if (!(await requireLink(senderPhone))) { bulksmsChat.clearBulkSmsSession(senderPhone); return; }
            bulksmsChat.clearBulkSmsSession(senderPhone);
            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                phoneKey: senderPhone, service: 'bulksms', amount: result.data.totalCost,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0
            };
            await sendSecurePinLink(senderPhone, '', '', result.data.totalCost, pinToken);
            return;
        }
        if (result && result.text) await sendWhatsAppReply(senderPhone, result);
        return;
    }

    // ===== ACTIVE CABLE TV SESSION =====
    const cableSession = cableChat.getCableSession(senderPhone);
    if (cableSession) {
        const result = await cableChat.handleCableFlow(senderPhone, text, cableSession, APP_URL);
        if (result && result.type === 'READY_FOR_PIN') {
            cableChat.clearCableSession(senderPhone);
            if (!(await requireLink(senderPhone))) return;
            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                phoneKey: senderPhone, service: 'cable', amount: result.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0
            };
            await sendSecurePinLink(senderPhone, result.data.providerName, result.data.iuc, result.data.amount, pinToken);
            return;
        }
        if (result && result.text) await sendWhatsAppReply(senderPhone, result);
        return;
    }

    // ===== ACTIVE FUND WALLET SESSION =====
    const fundSession = fundChat.getFundSession(senderPhone);
    if (fundSession) {
        const result = await fundChat.handleFundWalletFlow(senderPhone, text, fundSession, APP_URL);
        if (result && result.text) await sendWhatsAppReply(senderPhone, result);
        return;
    }

    // ===== ACTIVE DATA SESSION =====
    const dataSession = dataChat.getDataSession(senderPhone);
    if (dataSession) {
        const result = await dataChat.handleDataFlow(senderPhone, text, dataSession);
        if (result && result.type === 'READY_FOR_PIN') {
            dataChat.clearDataSession(senderPhone);
            if (!(await requireLink(senderPhone))) return;
            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                phoneKey: senderPhone, service: 'data', amount: result.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0
            };
            await sendSecurePinLink(senderPhone, result.data.network, result.data.phone, result.data.amount, pinToken);
            return;
        }
        if (result && result.text) await sendWhatsAppReply(senderPhone, result);
        return;
    }

    // ===== ACTIVE EXAM PIN SESSION =====
    const examSession = examChat.getExamSession(senderPhone);
    if (examSession) {
        const result = await examChat.handleExamFlow(senderPhone, text, examSession);
        if (result && result.type === 'READY_FOR_PIN') {
            examChat.clearExamSession(senderPhone);
            if (!(await requireLink(senderPhone))) return;
            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                phoneKey: senderPhone, service: 'exampin', amount: result.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0
            };
            await sendSecurePinLink(senderPhone, result.data.examType, result.data.examLabel, result.data.amount, pinToken);
            return;
        }
        if (result && result.text) await sendWhatsAppReply(senderPhone, result);
        return;
    }

    // ===== ACTIVE RECHARGE PIN SESSION =====
    const rpinSession = rechargePinChat.getRechargePinSession(senderPhone);
    if (rpinSession) {
        const result = await rechargePinChat.handleRechargePinFlow(senderPhone, text, rpinSession);
        if (result && result.type === 'READY_FOR_PIN') {
            rechargePinChat.clearRechargePinSession(senderPhone);
            if (!(await requireLink(senderPhone))) return;
            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                phoneKey: senderPhone, service: 'rechargepin', amount: result.data.totalCost,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS, attempts: 0
            };
            await sendSecurePinLink(senderPhone, result.data.network, result.data.network, result.data.totalCost, pinToken);
            return;
        }
        if (result && result.text) await sendWhatsAppReply(senderPhone, result);
        return;
    }

    // ===== MENU OPTIONS =====

    if (raw === '1' || lowerText === 'login' || lowerText === 'logout') {
        const linked = await loginChat.isLinked(senderPhone);
        if (linked && (raw === '1' || lowerText === 'logout')) {
            const result = await loginChat.doLogout(senderPhone);
            await sendWhatsAppReply(senderPhone, { text: result.text + MENU_FOOTER });
            return;
        }
        if (!linked && (raw === '1' || lowerText === 'login')) {
            pendingFreeLogin[senderPhone] = { step: 'ASK_EMAIL', expiresAt: Date.now() + 5 * 60 * 1000 };
            await sendWhatsAppReply(senderPhone, { text: '🔐 Please enter your registered email address:' });
            return;
        }
    }

    if (raw === '2' || lowerText === 'register' || lowerText === 'signup') {
        pendingFreeRegister[senderPhone] = { step: 'ASK_NAME', expiresAt: Date.now() + 5 * 60 * 1000 };
        await sendWhatsAppReply(senderPhone, { text: '📝 Create Account\n\nPlease enter your Full Name:' });
        return;
    }

    const serviceTriggers =
        raw === '3' || raw === '4' || raw === '5' || raw === '6' || raw === '7' ||
        raw === '8' || raw === '9' || raw === '11' || raw === '12' || raw === '13' || raw === '14' ||
        lowerText.indexOf('airtime') !== -1 || lowerText.indexOf('data') !== -1 ||
        lowerText.indexOf('cable') !== -1 || lowerText.indexOf('electricity') !== -1 ||
        lowerText.indexOf('bulk') !== -1 || lowerText === 'balance' || lowerText === 'wallet' ||
        lowerText === 'status' || lowerText === 'fund' || lowerText === 'history' ||
        lowerText.indexOf('exam') !== -1 || lowerText.indexOf('recharge pin') !== -1;

    if (serviceTriggers) {
        if (!(await requireLink(senderPhone))) return;
    }

    // 3. Airtime
    if (raw === '3' || lowerText.indexOf('airtime') !== -1) {
        const initial = airtimeChat.startAirtimeFlow(senderPhone);
        await sendWhatsAppReply(senderPhone, initial);
        return;
    }

    // 4. Data
    if (raw === '4' || lowerText.indexOf('data') !== -1) {
        const initial = dataChat.startDataFlow(senderPhone);
        await sendWhatsAppReply(senderPhone, initial);
        return;
    }

    // 5. Cable TV
    if (raw === '5' || lowerText.indexOf('cable') !== -1) {
        const initial = cableChat.startCableFlow(senderPhone);
        await sendWhatsAppReply(senderPhone, initial);
        return;
    }

    // 6. Electricity
    if (raw === '6' || lowerText.indexOf('electricity') !== -1) {
        const initial = electricityChat.startElectricityFlow(senderPhone);
        await sendWhatsAppReply(senderPhone, initial);
        return;
    }

    // 7. Bulk SMS
    if (raw === '7' || lowerText.indexOf('bulk') !== -1) {
        const initial = bulksmsChat.startBulkSmsFlow(senderPhone);
        await sendWhatsAppReply(senderPhone, initial);
        return;
    }

    // 8. Wallet Balance
    if (raw === '8' || lowerText === 'balance' || lowerText === 'wallet') {
        try {
            const userId = await getLinkedUserId(senderPhone);
            const userSnap = await admin.database().ref('users/' + userId).once('value');
            const userData = userSnap.exists() ? userSnap.val() : {};
            const balance = userData.balance !== undefined ? Number(userData.balance) : 0;
            await sendWhatsAppReply(senderPhone, {
                text: '💰 Dnezerlinks Wallet Balance\n\nBalance: ₦' + balance.toLocaleString() + MENU_FOOTER
            });
        } catch (e) {
            await sendWhatsAppReply(senderPhone, { text: '❌ Unable to retrieve balance.' + MENU_FOOTER });
        }
        return;
    }

    // 9. Account Status
    if (raw === '9' || lowerText === 'status') {
        const userId = await getLinkedUserId(senderPhone);
        await sendWhatsAppReply(senderPhone, {
            text: userId ? '✅ WhatsApp is successfully linked to your account.' + MENU_FOOTER : '❌ Not linked.' + MENU_FOOTER
        });
        return;
    }

    // 11. Fund Wallet
    if (raw === '11' || lowerText === 'fund') {
        const initial = await fundChat.startFundWalletFlow(senderPhone);
        await sendWhatsAppReply(senderPhone, initial);
        return;
    }

    // 12. History
    if (raw === '12' || lowerText === 'history') {
        const result = await historyChat.getTransactionHistory(senderPhone);
        await sendWhatsAppReply(senderPhone, { text: (result.text || '') + MENU_FOOTER });
        return;
    }

    // 13. Exam PIN
    if (raw === '13' || lowerText.indexOf('exam') !== -1) {
        const initial = examChat.startExamFlow(senderPhone);
        await sendWhatsAppReply(senderPhone, initial);
        return;
    }

    // 14. Recharge PIN
    if (raw === '14' || lowerText.indexOf('recharge pin') !== -1) {
        const initial = rechargePinChat.startRechargePinFlow(senderPhone);
        await sendWhatsAppReply(senderPhone, initial);
        return;
    }

    await sendWhatsAppReply(senderPhone, { text: 'I didn\'t get that.' + MENU_FOOTER });
}

module.exports = router;

