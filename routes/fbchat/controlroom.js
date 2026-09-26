const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');

const airtimeChat = require('./airtime');
const loginChat = require('./login');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// ========== SAFE APP_URL FROM RENDER ENVIRONMENT ==========
let APP_URL = process.env.APP_URL || 'https://api.dlinks.name.ng';
APP_URL = APP_URL.trim().replace(/\/+$/, ''); // remove trailing slash
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
        // Fallback
        await sendMessengerReply(senderPsid, {
            text: payload.text + '\n\n' + payload.url
        });
    }
}

async function sendSecurePinLink(senderPsid, network, phone, amount, pinToken) {
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

// ========== SECURE AUTH PORTAL (Login / Register / Forgot) ==========
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
                snapshot.forEach(function(child) { userId = child.key; });

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

    const service = sessionData.service;
    const phone = sessionData.phone;
    const network = sessionData.network;
    const amount = sessionData.amount;

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
                    <div><b>Network:</b> ${network.toUpperCase()}</div>
                    <div><b>Phone:</b> ${phone}</div>
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
    const amount = sessionData.amount;

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

        return res.json({ success: true });
    } catch (error) {
        delete pendingPinTokens[token];
        await sendMessengerReply(psid, { text: '❌ Transaction Failed: ' + (error.message || 'Server error') });
        return res.json({ success: false, closeWindow: true });
    }
});

// ========== MESSAGE HANDLER ==========

async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();

    // Active airtime session
    const session = airtimeChat.getAirtimeSession(senderPsid);
    if (session) {
        if (session.step === 'AIRTIME_AMOUNT') {
            const amountNum = parseFloat(text.trim());
            if (isNaN(amountNum) || amountNum < 100) {
                await sendMessengerReply(senderPsid, { text: '❌ Invalid amount. Minimum is ₦100:' });
                return;
            }

            session.data.amount = amountNum;

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
                phone: session.data.phone,
                network: session.data.network,
                amount: session.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            await sendSecurePinLink(senderPsid, session.data.network, session.data.phone, session.data.amount, pinToken);
            return;
        }

        const reply = await airtimeChat.handleAirtimeFlow(senderPsid, text, session);
        await sendMessengerReply(senderPsid, reply);
        return;
    }

    // 1. Login
    if (text === '1' || lowerText === 'login') {
        const payload = loginChat.startLoginFlow(senderPsid, pendingAuthTokens, APP_URL);
        await sendMessengerButtonTemplate(senderPsid, payload);
        return;
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

    // 10. Forgot Password
    if (text === '10' || lowerText === 'forgot' || lowerText === 'reset') {
        const payload = loginChat.startForgotFlow(senderPsid, pendingAuthTokens, APP_URL);
        await sendMessengerButtonTemplate(senderPsid, payload);
        return;
    }

    // Menu
    if (lowerText === 'menu' || lowerText === 'start' || lowerText === 'hi' || lowerText === 'hello') {
        await sendMessengerReply(senderPsid, {
            text: 'Welcome to Dnezerlinks!\n\n1. Login\n2. Create Account\n3. Airtime Top-up\n4. Data Bundles\n5. Cable TV\n6. Electricity Bills\n7. Bulk SMS\n8. Check Wallet Balance\n9. Check Account Status\n10. Forgot Password\n\nReply with a number.'
        });
        return;
    }

    await sendMessengerReply(senderPsid, {
        text: 'I didn\'t get that. Type \'menu\' to see options.'
    });
}

module.exports = router;
