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

// ========== SAFE APP_URL FROM RENDER ENVIRONMENT ==========
let APP_URL = process.env.APP_URL || 'https://api.dlinks.name.ng';
APP_URL = APP_URL.trim().replace(/\/+$/, '');
if (!APP_URL.startsWith('http')) {
    APP_URL = 'https://' + APP_URL;
}
console.log('Using APP_URL →', APP_URL);
// ==========================================================

const pendingPinTokens = {};
const pendingAuthTokens = {};

const PIN_TOKEN_EXPIRY_MS = 5 * 60 * 1000;
const TOKEN_EXPIRY_MS = 5 * 60 * 1000;

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

async function sendSecurePinLink(senderPsid, network, phone, amount, pinToken, extra = {}) {
    const webviewUrl = APP_URL + '/webhook/secure-pin-portal?token=' + pinToken;

    let reviewText = '';

    if (extra.service === 'data') {
        reviewText =
            'Review Data Transaction:\n\n' +
            '• Network: ' + network.toUpperCase() + '\n' +
            '• Phone: ' + phone + '\n' +
            '• Plan: ' + (extra.planName || '') + '\n' +
            '• Amount: ₦' + Number(amount).toLocaleString() + '\n\n' +
            '🔐 Enter your PIN securely (link expires in 5 minutes):';
    } else if (extra.service === 'electricity') {
        reviewText =
            'Review Electricity Payment:\n\n' +
            '• Disco: ' + (extra.discoName || network) + '\n' +
            '• Meter Type: ' + (extra.meterType || '') + '\n' +
            '• Meter No: ' + phone + '\n' +
            '• Amount: ₦' + Number(amount).toLocaleString() + '\n\n' +
            '🔐 Enter your PIN securely (link expires in 5 minutes):';
    } else if (extra.service === 'bulksms') {
        reviewText =
            'Review Bulk SMS:\n\n' +
            '• Sender ID: ' + (extra.senderName || '') + '\n' +
            '• Recipients: ' + (extra.recipientCount || 0) + '\n' +
            '• Pages: ' + (extra.pages || 0) + ' (' + (extra.encoding || 'GSM') + ')\n' +
            '• Rate: ₦' + (extra.rate || 0) + ' per page\n' +
            '• Total Cost: ₦' + Number(amount).toLocaleString() + '\n\n' +
            'Message Preview:\n"' + (extra.messagePreview || '') + '"\n\n' +
            '🔐 Enter your PIN securely (link expires in 5 minutes):';
    } else if (extra.service === 'cable') {
        reviewText =
            'Review Cable TV Transaction:\n\n' +
            '• Provider: ' + (extra.providerName || network) + '\n' +
            '• Package: ' + (extra.planName || '') + '\n' +
            '• IUC: ' + (extra.iuc || phone) + '\n' +
            '• Customer: ' + (extra.customerName || '') + '\n' +
            '• Amount: ₦' + Number(amount).toLocaleString() + '\n\n' +
            '🔐 Enter your PIN securely (link expires in 5 minutes):';
    } else if (extra.service === 'exampin') {
        reviewText =
            'Review Exam PIN Purchase:\n\n' +
            '• Exam: ' + (extra.examLabel || network) + '\n' +
            '• Quantity: ' + (extra.quantity || 1) + '\n' +
            '• Amount: ₦' + Number(amount).toLocaleString() + '\n\n' +
            '🔐 Enter your PIN securely (link expires in 5 minutes):';
    } else if (extra.service === 'rechargepin') {
        reviewText =
            'Review Recharge PIN:\n\n' +
            '• Network: ' + network + '\n' +
            '• Denomination: ₦' + (extra.denomination || amount) + '\n' +
            '• Quantity: ' + (extra.qty || 1) + '\n' +
            '• Brand: ' + (extra.brandName || 'Dnezerlinks') + '\n' +
            '• Total: ₦' + Number(amount).toLocaleString() + '\n\n' +
            '🔐 Enter your PIN securely (link expires in 5 minutes):';
    } else {
        reviewText =
            'Review Airtime Transaction:\n\n' +
            '• Network: ' + network.toUpperCase() + '\n' +
            '• Phone: ' + phone + '\n' +
            '• Amount: ₦' + Number(amount).toLocaleString() + '\n\n' +
            '🔐 Enter your PIN securely (link expires in 5 minutes):';
    }

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
        console.log('✅ PIN Button sent');
        return;
    } catch (err) {
        console.log('PIN Button failed → falling back to text link');
    }

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
    const cleanEmail = email ? email.toLowerCase().trim() : '';

    try {
        if (action === 'login') {
            if (!idToken) {
                return res.json({ success: false, message: '❌ Missing authentication token.' });
            }

            try {
                const decoded = await admin.auth().verifyIdToken(idToken);
                const authEmail = (decoded.email || '').toLowerCase();

                if (authEmail !== cleanEmail) {
                    return res.json({ success: false, message: '❌ Email mismatch.' });
                }

                const snapshot = await admin.database().ref('users').orderByChild('email').equalTo(cleanEmail).once('value');
                if (!snapshot.exists()) {
                    return res.json({ success: false, message: '❌ No account found with this email.' });
                }

                let userId = null;
                snapshot.forEach(function (child) { userId = child.key; });

                await admin.database().ref('messenger_links/' + psid).set({
                    userId: userId,
                    email: cleanEmail,
                    linkedAt: new Date().toISOString()
                });
                await admin.database().ref('users/' + userId + '/messenger_psid').set(psid);

                delete pendingAuthTokens[token];
                await sendMessengerReply(psid, { text: '✅ Successfully Logged In & Linked to ' + cleanEmail + '!' });
                return res.json({ success: true });
            } catch (authErr) {
                return res.json({ success: false, message: '❌ Incorrect password.' });
            }
        }

        if (action === 'register') {
            if (!name || !phone || !address || !cleanEmail || !password || password.length < 6 || !pin) {
                return res.json({ success: false, message: '❌ Please fill all fields correctly.' });
            }

            const snapshot = await admin.database().ref('users').orderByChild('email').equalTo(cleanEmail).once('value');
            if (snapshot.exists()) {
                return res.json({ success: false, message: '❌ An account with this email already exists.' });
            }

            const newUserRef = admin.database().ref('users').push();
            const userId = newUserRef.key;

            await newUserRef.set({
                userId: userId,
                name: name,
                email: cleanEmail,
                phone: phone,
                address: address,
                password: password.trim(),
                pin: pin,
                transaction_pin: pin,
                balance: 0,
                account_status: 'active',
                messenger_psid: psid,
                createdAt: new Date().toISOString()
            });

            await admin.database().ref('messenger_links/' + psid).set({
                userId: userId,
                email: cleanEmail,
                linkedAt: new Date().toISOString()
            });

            delete pendingAuthTokens[token];
            await sendMessengerReply(psid, {
                text: '🎉 Account Created & Linked Successfully!\nName: ' + name + '\nEmail: ' + cleanEmail + '\nBalance: ₦0.00'
            });
            return res.json({ success: true });
        }

        if (action === 'forgot') {
            const snapshot = await admin.database().ref('users').orderByChild('email').equalTo(cleanEmail).once('value');
            if (!snapshot.exists()) {
                return res.json({ success: false, message: '❌ No account matches this email.' });
            }

            await admin.auth().generatePasswordResetLink(cleanEmail);
            delete pendingAuthTokens[token];
            await sendMessengerReply(psid, {
                text: '🔄 Password Reset Instructions sent to ' + cleanEmail + '. Check your inbox/spam.'
            });
            return res.json({ success: true });
        }

        return res.json({ success: false, message: '❌ Invalid action.' });
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
                    ${pages ? `<div><b>Pages:</b> \( {pages} ( \){encoding})</div>` : ''}
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
    const phone = sessionData.phone;
    const network = sessionData.network;
    const amount = sessionData.amount || sessionData.totalCost;

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
                await sendMessengerReply(psid, { text: '❌ Too many wrong PIN attempts. Transaction cancelled.' });
                return res.json({ success: false, message: 'Max attempts', closeWindow: true });
            }

            return res.json({
                success: false,
                message: '❌ Invalid PIN. ' + attemptsLeft + ' attempt(s) left',
                closeWindow: false
            });
        }

        delete pendingPinTokens[token];

        // ========== AIRTIME ==========
        if (service === 'airtime') {
            const parsedAmount = parseFloat(amount);
            const networkMap = { mtn: '1', glo: '2', '9mobile': '3', airtel: '4' };
            const networkID = networkMap[network.toLowerCase()] || network;

            const response = await axios.post(APP_URL + '/api/airtime/buy', {
                uid: userId,
                phone: phone,
                amount: parsedAmount,
                networkID: networkID,
                pin: pin
            }, { timeout: 55000 });

            if (response.data && response.data.success) {
                await sendMessengerReply(psid, {
                    text: '✅ Airtime Purchase Successful!\n\nNetwork: ' + network.toUpperCase() + '\nPhone: ' + phone + '\nAmount: ₦' + parsedAmount.toLocaleString()
                });
                return res.json({ success: true });
            } else {
                await sendMessengerReply(psid, { text: '❌ Airtime Failed: ' + (response.data.error || 'Unknown error') });
                return res.json({ success: false, closeWindow: true });
            }
        }

        // ========== DATA ==========
        if (service === 'data') {
            const parsedAmount = parseFloat(amount);
            const planId = sessionData.planId;
            const networkID = sessionData.networkID || dataChat.NETWORK_ID_MAP[network.toLowerCase()] || network;

            const response = await axios.post(APP_URL + '/api/data/buy', {
                uid: userId,
                phone: phone,
                dataPlan: planId,
                networkID: String(networkID),
                amount: parsedAmount,
                pin: pin
            }, { timeout: 55000 });

            if (response.data && response.data.success) {
                await sendMessengerReply(psid, {
                    text:
                        '✅ Data Purchase Successful!\n\n' +
                        'Network: ' + network.toUpperCase() + '\n' +
                        'Phone: ' + phone + '\n' +
                        'Plan: ' + (sessionData.planName || planId) + '\n' +
                        'Amount: ₦' + parsedAmount.toLocaleString()
                });
                return res.json({ success: true });
            } else {
                await sendMessengerReply(psid, {
                    text: '❌ Data Failed: ' + (response.data.error || 'Unknown error')
                });
                return res.json({ success: false, closeWindow: true });
            }
        }

        // ========== CABLE TV ==========
        if (service === 'cable') {
            const parsedAmount = parseFloat(amount);
            const providerID = sessionData.providerID;
            const planID = sessionData.planID;
            const iuc = sessionData.iuc;

            try {
                const response = await axios.post(APP_URL + '/api/cabletv/pay', {
                    uid: userId,
                    iuc: iuc,
                    providerID: String(providerID),
                    planID: String(planID),
                    amount: parsedAmount,
                    pin: pin
                }, { timeout: 60000 });

                if (response.data && response.data.success) {
                    await sendMessengerReply(psid, {
                        text:
                            '✅ Cable TV Subscription Successful!\n\n' +
                            'Provider: ' + (sessionData.providerName || '') + '\n' +
                            'Package: ' + (sessionData.planName || planID) + '\n' +
                            'IUC: ' + iuc + '\n' +
                            'Customer: ' + (sessionData.customerName || '') + '\n' +
                            'Amount: ₦' + parsedAmount.toLocaleString()
                    });
                    return res.json({ success: true });
                } else {
                    await sendMessengerReply(psid, {
                        text: '❌ Cable TV Failed: ' + (response.data.error || 'Unknown error')
                    });
                    return res.json({ success: false, closeWindow: true });
                }
            } catch (err) {
                const errMsg = err.response?.data?.error || err.message || 'Server error';
                await sendMessengerReply(psid, { text: '❌ Cable TV Failed: ' + errMsg });
                return res.json({ success: false, closeWindow: true });
            }
        }

        // ========== ELECTRICITY ==========
        if (service === 'electricity') {
            const parsedAmount = parseFloat(amount);

            try {
                const response = await axios.post(APP_URL + '/api/electricity/pay', {
                    uid: userId,
                    meterNumber: sessionData.meterNumber,
                    amount: parsedAmount,
                    tokenType: sessionData.meterType,
                    disco: sessionData.disco,
                    pin: pin
                }, { timeout: 60000 });

                if (response.data && response.data.success) {
                    let msg = '✅ Electricity Payment Successful!\n\n';
                    msg += 'Disco: ' + (sessionData.disco || '') + '\n';
                    msg += 'Meter: ' + (sessionData.meterNumber || '') + '\n';
                    msg += 'Type: ' + (sessionData.meterType || '') + '\n';
                    msg += 'Amount: ₦' + parsedAmount.toLocaleString() + '\n';
                    if (response.data.token) {
                        msg += '\n🔑 Token: ' + response.data.token;
                    }
                    await sendMessengerReply(psid, { text: msg });
                    return res.json({ success: true });
                } else {
                    await sendMessengerReply(psid, {
                        text: '❌ Electricity Failed: ' + (response.data.error || 'Unknown error')
                    });
                    return res.json({ success: false, closeWindow: true });
                }
            } catch (err) {
                const errMsg = err.response?.data?.error || err.message || 'Server error';
                await sendMessengerReply(psid, { text: '❌ Electricity Failed: ' + errMsg });
                return res.json({ success: false, closeWindow: true });
            }
        }

        // ========== BULK SMS ==========
        if (service === 'bulksms') {
            try {
                const response = await axios.post(APP_URL + '/api/bulksms/send-sms', {
                    uid: userId,
                    recipient: sessionData.recipients,
                    message: sessionData.message,
                    senderName: sessionData.senderName,
                    pin: pin
                }, { timeout: 65000 });

                if (response.data && response.data.success) {
                    let msg = '✅ Bulk SMS Sent Successfully!\n\n';
                    msg += 'Sender: ' + sessionData.senderName + '\n';
                    msg += 'Recipients: ' + sessionData.recipientCount + '\n';
                    msg += 'Pages: ' + sessionData.pages + '\n';
                    msg += 'Cost: ₦' + Number(sessionData.amount).toLocaleString();
                    await sendMessengerReply(psid, { text: msg });
                    return res.json({ success: true });
                } else {
                    await sendMessengerReply(psid, {
                        text: '❌ Bulk SMS Failed: ' + (response.data.error || 'Unknown error')
                    });
                    return res.json({ success: false, closeWindow: true });
                }
            } catch (err) {
                const errMsg = err.response?.data?.error || err.message || 'Server error';
                await sendMessengerReply(psid, { text: '❌ Bulk SMS Failed: ' + errMsg });
                return res.json({ success: false, closeWindow: true });
            }
        }

        // ========== EXAM PIN ==========
        if (service === 'exampin') {
            try {
                const response = await axios.post(APP_URL + '/api/exampin/buy', {
                    uid: userId,
                    examType: sessionData.examType,
                    quantity: sessionData.quantity,
                    pin: pin
                }, { timeout: 55000 });

                if (response.data && response.data.success) {
                    let msg = '✅ Exam PIN Purchase Successful!\n\n';
                    msg += 'Exam: ' + (sessionData.examLabel || sessionData.examType) + '\n';
                    msg += 'Quantity: ' + sessionData.quantity + '\n';
                    msg += 'Amount: ₦' + Number(sessionData.amount).toLocaleString() + '\n\n';
                    msg += 'PIN: ' + (response.data.pin || 'N/A') + '\n';
                    msg += 'Serial: ' + (response.data.serial || 'N/A') + '\n\n';
                    msg += 'Save this message securely.';
                    await sendMessengerReply(psid, { text: msg });
                    return res.json({ success: true });
                } else {
                    await sendMessengerReply(psid, {
                        text: '❌ Exam PIN Failed: ' + (response.data.error || 'Unknown error')
                    });
                    return res.json({ success: false, closeWindow: true });
                }
            } catch (err) {
                const errMsg = err.response?.data?.error || err.message || 'Server error';
                await sendMessengerReply(psid, { text: '❌ Exam PIN Failed: ' + errMsg });
                return res.json({ success: false, closeWindow: true });
            }
        }

        // ========== RECHARGE PIN ==========
        if (service === 'rechargepin') {
            try {
                const response = await axios.post(APP_URL + '/api/rechargepin/generate', {
                    uid: userId,
                    network: sessionData.network,
                    amount: sessionData.amount,
                    qty: sessionData.qty,
                    brandName: sessionData.brandName || 'Dnezerlinks',
                    pin: pin
                }, { timeout: 65000 });

                if (response.data && response.data.success) {
                    const pins = response.data.pins || [];
                    let msg = '✅ Recharge PINs Generated!\n\n';
                    msg += 'Network: ' + sessionData.network + '\n';
                    msg += 'Denomination: ₦' + sessionData.amount + '\n';
                    msg += 'Quantity: ' + sessionData.qty + '\n';
                    msg += 'Brand: ' + (sessionData.brandName || 'Dnezerlinks') + '\n\n';

                    pins.slice(0, 15).forEach(function (p, i) {
                        msg += (i + 1) + '. PIN: ' + (p.pin || '') + ' | SN: ' + (p.serial || 'N/A') + '\n';
                    });
                    if (pins.length > 15) {
                        msg += '\n...and ' + (pins.length - 15) + ' more. Check web dashboard for full list.';
                    }
                    msg += '\n\nSave this message securely.';

                    await sendMessengerReply(psid, { text: msg });
                    return res.json({ success: true });
                } else {
                    await sendMessengerReply(psid, {
                        text: '❌ Recharge PIN Failed: ' + (response.data.error || 'Unknown error')
                    });
                    return res.json({ success: false, closeWindow: true });
                }
            } catch (err) {
                const errMsg = err.response?.data?.error || err.message || 'Server error';
                await sendMessengerReply(psid, { text: '❌ Recharge PIN Failed: ' + errMsg });
                return res.json({ success: false, closeWindow: true });
            }
        }

        return res.json({ success: true });
    } catch (error) {
        delete pendingPinTokens[token];
        const errMsg = error.response?.data?.error || error.message || 'Server error';
        await sendMessengerReply(psid, { text: '❌ Transaction Failed: ' + errMsg });
        return res.json({ success: false, closeWindow: true });
    }
});

// ========== MESSAGE HANDLER ==========

async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();

    // ===== ACTIVE AIRTIME SESSION =====
    const airtimeSession = airtimeChat.getAirtimeSession(senderPsid);
    if (airtimeSession) {
        if (airtimeSession.step === 'AIRTIME_AMOUNT') {
            const amountNum = parseFloat(text.trim());
            if (isNaN(amountNum) || amountNum < 100) {
                await sendMessengerReply(senderPsid, { text: '❌ Invalid amount. Minimum is ₦100:' });
                return;
            }

            airtimeSession.data.amount = amountNum;

            const linkSnap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
            if (!linkSnap.exists()) {
                airtimeChat.clearAirtimeSession(senderPsid);
                await sendMessengerReply(senderPsid, { text: '❌ Account not linked. Please login first (option 1).' });
                return;
            }

            airtimeChat.clearAirtimeSession(senderPsid);

            const pinToken = crypto.randomBytes(32).toString('hex');
            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'airtime',
                phone: airtimeSession.data.phone,
                network: airtimeSession.data.network,
                amount: airtimeSession.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(
                senderPsid,
                airtimeSession.data.network,
                airtimeSession.data.phone,
                airtimeSession.data.amount,
                pinToken
            );
            return;
        }

        const reply = await airtimeChat.handleAirtimeFlow(senderPsid, text, airtimeSession);
        await sendMessengerReply(senderPsid, reply);
        return;
    }

    // ===== ACTIVE ELECTRICITY SESSION =====
    const elecSession = electricityChat.getElectricitySession(senderPsid);
    if (elecSession) {
        const result = await electricityChat.handleElectricityFlow(senderPsid, text, elecSession);

        if (result && result.step === 'READY_FOR_PIN') {
            const linkSnap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
            if (!linkSnap.exists()) {
                electricityChat.clearElectricitySession(senderPsid);
                await sendMessengerReply(senderPsid, {
                    text: '❌ Account not linked. Please login first (option 1).'
                });
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
            const linkSnap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
            if (!linkSnap.exists()) {
                bulksmsChat.clearBulkSmsSession(senderPsid);
                await sendMessengerReply(senderPsid, {
                    text: '❌ Account not linked. Please login first (option 1).'
                });
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

            const linkSnap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
            if (!linkSnap.exists()) {
                await sendMessengerReply(senderPsid, {
                    text: '❌ Account not linked. Please login first (option 1).'
                });
                return;
            }

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

            const linkSnap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
            if (!linkSnap.exists()) {
                await sendMessengerReply(senderPsid, {
                    text: '❌ Account not linked. Please login first (option 1).'
                });
                return;
            }

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

            const linkSnap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
            if (!linkSnap.exists()) {
                await sendMessengerReply(senderPsid, {
                    text: '❌ Account not linked. Please login first (option 1).'
                });
                return;
            }

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

            const linkSnap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
            if (!linkSnap.exists()) {
                await sendMessengerReply(senderPsid, {
                    text: '❌ Account not linked. Please login first (option 1).'
                });
                return;
            }

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
    if (text === '1' || lowerText === 'login' || lowerText === 'logout') {
        const linked = await loginChat.isLinked(senderPsid);

        if (linked && (text === '1' || lowerText === 'logout')) {
            const result = await loginChat.doLogout(senderPsid);
            await sendMessengerReply(senderPsid, result);
            return;
        }

        if (!linked && (text === '1' || lowerText === 'login')) {
            const payload = loginChat.startLoginFlow(senderPsid, pendingAuthTokens, APP_URL);
            await sendMessengerButtonTemplate(senderPsid, payload);
            return;
        }

        if (linked && lowerText === 'login') {
            await sendMessengerReply(senderPsid, {
                text: '✅ You are already logged in.\nType "1" to logout or "menu" for options.'
            });
            return;
        }

        if (!linked && lowerText === 'logout') {
            await sendMessengerReply(senderPsid, {
                text: 'ℹ️ You are not logged in.\nType "1" to login.'
            });
            return;
        }
    }

    // 2. Create Account
    if (text === '2' || lowerText === 'register' || lowerText === 'signup') {
        const payload = loginChat.startRegisterFlow(senderPsid, pendingAuthTokens, APP_URL);
        await sendMessengerButtonTemplate(senderPsid, payload);
        return;
    }

    // 3. Airtime
    if (text === '3' || lowerText.indexOf('airtime') !== -1) {
        const initial = airtimeChat.startAirtimeFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 4. Data Bundles
    if (text === '4' || lowerText.indexOf('data') !== -1) {
        const initial = dataChat.startDataFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 5. Cable TV
    if (text === '5' || lowerText.indexOf('cable') !== -1 || lowerText === 'dstv' || lowerText === 'gotv') {
        const initial = cableChat.startCableFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 6. Electricity
    if (text === '6' || lowerText.indexOf('electricity') !== -1 || lowerText.indexOf('disco') !== -1) {
        const initial = electricityChat.startElectricityFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 7. Bulk SMS
    if (text === '7' || lowerText.indexOf('bulk') !== -1 || lowerText.indexOf('sms') !== -1) {
        const initial = bulksmsChat.startBulkSmsFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 8. Check Wallet Balance
    if (text === '8' || lowerText === 'balance' || lowerText === 'wallet') {
        try {
            const userId = await getLinkedUserId(senderPsid);

            if (!userId) {
                await sendMessengerReply(senderPsid, {
                    text:
                        '❌ Your Messenger is not linked to any Dnezerlinks account yet.\n\n' +
                        'Please login first (option 1) or create an account (option 2) to view your wallet balance.'
                });
                return;
            }

            const userSnap = await admin.database().ref('users/' + userId).once('value');

            if (!userSnap.exists()) {
                await sendMessengerReply(senderPsid, {
                    text: '❌ Account record not found. Please contact support.'
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
                    'Balance: ₦' + balance.toLocaleString() + '\n\n' +
                    'Type "menu" to return to main options.'
            });
        } catch (err) {
            console.error('Balance check error:', err);
            await sendMessengerReply(senderPsid, {
                text: '❌ Unable to retrieve wallet balance at the moment. Please try again later.'
            });
        }
        return;
    }

    // 9. Check Account Status
    if (text === '9' || lowerText === 'status' || lowerText === 'account status') {
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
                        'Email: ' + email + '\n\n' +
                        'You can now use all services (Airtime, Data, Electricity, Bulk SMS, etc).'
                });
            } else {
                await sendMessengerReply(senderPsid, {
                    text:
                        'ℹ️ Account Status\n\n' +
                        'Your Messenger is currently not linked to any Dnezerlinks account.\n\n' +
                        'To enjoy full access to our services, please:\n\n' +
                        '1. Type 1 to Login\n' +
                        '2. Type 2 to Create a new Account\n\n' +
                        'We look forward to serving you!'
                });
            }
        } catch (err) {
            console.error('Status check error:', err);
            await sendMessengerReply(senderPsid, {
                text: '❌ Unable to check account status right now. Please try again later.'
            });
        }
        return;
    }

    // 10. Forgot Password
    if (text === '10' || lowerText === 'forgot' || lowerText === 'reset') {
        const payload = loginChat.startForgotFlow(senderPsid, pendingAuthTokens, APP_URL);
        await sendMessengerButtonTemplate(senderPsid, payload);
        return;
    }

    // 11. Fund Wallet
    if (text === '11' || lowerText === 'fund' || lowerText === 'fund wallet') {
        const initial = await fundChat.startFundWalletFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 12. Transaction History
    if (text === '12' || lowerText === 'history' || lowerText === 'transactions') {
        const result = await historyChat.getTransactionHistory(senderPsid);
        await sendMessengerReply(senderPsid, result);
        return;
    }

    // 13. Exam PIN
    if (text === '13' || lowerText.indexOf('exam') !== -1 || lowerText === 'waec' || lowerText === 'neco') {
        const initial = examChat.startExamFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // 14. Recharge PIN
    if (text === '14' || lowerText.indexOf('recharge pin') !== -1 || lowerText === 'rechargepin') {
        const initial = rechargePinChat.startRechargePinFlow(senderPsid);
        await sendMessengerReply(senderPsid, initial);
        return;
    }

    // Menu (dynamic option 1)
    if (lowerText === 'menu' || lowerText === 'start' || lowerText === 'hi' || lowerText === 'hello') {
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
                'Reply with a number.'
        });
        return;
    }

    await sendMessengerReply(senderPsid, {
        text: 'I didn\'t get that. Type \'menu\' to see options.'
    });
}

module.exports = router;
