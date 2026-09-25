const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || 'https://api.dlinks.name.ng'; 

const userSessions = {};
const pendingPinTokens = {}; 

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes inactivity timeout
const PIN_TOKEN_EXPIRY_MS = 5 * 60 * 1000;  // 5 minutes webview token expiry

// 1. GET /webhook -> Facebook Webhook Verification
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

// 2. POST /webhook -> Incoming Messenger messages
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
        return res.status(400).send("<h3>❌ Link has expired. Please restart the transaction in Messenger.</h3>");
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
                    <input type="hidden" name="token" id="tokenField" value="${token}">
                    <input type="password" id="pinInput" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required autocomplete="current-password" autofocus>
                    <button type="submit" id="submitBtn">Authorize & Pay</button>
                    <div class="loader" id="loader">Processing transaction securely...</div>
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

// 4. POST /secure-pin-portal-submit -> AJAX JSON endpoint handling PIN validation & silent closure
router.post('/secure-pin-portal-submit', express.json(), async (req, res) => {
    const { token, pin } = req.body;

    if (!token || !pendingPinTokens[token]) {
        return res.json({ success: false, message: "❌ Link is invalid or has already expired.", closeWindow: true });
    }

    const sessionData = pendingPinTokens[token];

    if (Date.now() > sessionData.expiresAt) {
        delete pendingPinTokens[token];
        return res.json({ success: false, message: "❌ Link has expired. Please restart your transaction.", closeWindow: true });
    }

    const { psid, service, phone, network, amount } = sessionData;

    try {
        const userId = await getLinkedUserId(psid);
        if (!userId) {
            delete pendingPinTokens[token];
            return res.json({ success: false, message: "❌ Account not linked. Please log in on Messenger.", closeWindow: true });
        }

        const userSnap = await admin.database().ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            delete pendingPinTokens[token];
            return res.json({ success: false, message: "❌ User profile not found.", closeWindow: true });
        }

        const userData = userSnap.val();
        const correctPin = userData.pin || userData.transaction_pin;

        // Validate PIN
        if (pin !== correctPin) {
            sessionData.attempts = (sessionData.attempts || 0) + 1;
            const attemptsLeft = 3 - sessionData.attempts;

            if (sessionData.attempts >= 3) {
                delete pendingPinTokens[token];
                delete userSessions[psid]; 

                const failureMenuText = 
                    "❌ Incorrect PIN entered 3 times. Transaction failed and cancelled for security.\n\n" +
                    "Welcome back to Dnezerlinks! Type 'menu' or select an option to restart:\n\n" +
                    "1. Login\n2. Create Account\n3. Airtime Top-up\n4. Data Bundles\n5. Cable TV\n6. Electricity Bills\n7. Bulk SMS\n8. Check Wallet Balance\n9. Check Account Status";

                await sendMessengerReply(psid, { text: failureMenuText });

                return res.json({ 
                    success: false, 
                    message: "Max attempts reached.", 
                    closeWindow: true 
                });
            }

            return res.json({ 
                success: false, 
                message: `❌ Invalid PIN. Try again (${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} left).`, 
                closeWindow: false 
            });
        }

        // Correct PIN -> Immediately expire/delete token
        delete pendingPinTokens[token];
        delete userSessions[psid];

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
                await sendMessengerReply(psid, { 
                    text: `✅ Airtime Purchase Successful!\n\nNetwork: ${network.toUpperCase()}\nPhone: ${phone}\nAmount: NGN ${parsedAmount.toLocaleString()}` 
                });

                return res.json({ success: true });
            } else {
                const errReason = resData.error || 'Transaction could not be completed.';
                await sendMessengerReply(psid, { text: `❌ Airtime Failed: ${errReason}` });
                return res.json({ success: false, closeWindow: true });
            }
        }

        return res.json({ success: true });

    } catch (error) {
        delete pendingPinTokens[token];
        const errReason = error.response?.data?.error || error.message || "Server error processing transaction.";
        await sendMessengerReply(psid, { text: `❌ Transaction Failed: ${errReason}` });
        return res.json({ success: false, closeWindow: true });
    }
});

// Handle incoming user messages with session timeout checks
async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();
    const now = Date.now();
    let currentSession = userSessions[senderPsid];

    if (currentSession && (now - currentSession.lastActive > SESSION_TIMEOUT_MS)) {
        delete userSessions[senderPsid];
        await sendMessengerReply(senderPsid, { 
            text: "⏳ Your previous session timed out due to inactivity. All pending actions have been cancelled safely. Please type 'menu' to start over whenever you're ready!" 
        });
        return;
    }

    if (currentSession) {
        currentSession.lastActive = now;
    }

    if (lowerText === 'menu' || lowerText === 'start' || lowerText === 'help' || lowerText === 'hi' || lowerText === 'hello') {
        delete userSessions[senderPsid];
        const welcomeMenu = 
            "Welcome to Dnezerlinks!\n\n" +
            "Dnezerlinks is your trusted automated platform for instant Virtual Top-Up (VTU) services. Buy cheap airtime, data bundles, cable TV subscriptions, electricity tokens, and bulk SMS securely from your wallet.\n\n" +
            "Please select an option to proceed:\n\n" +
            "1. Login (Connect existing account)\n" +
            "2. Create Account (Register new account)\n" +
            "3. Airtime Top-up\n" +
            "4. Data Bundles\n" +
            "5. Cable TV (DSTV / GOTV)\n" +
            "6. Electricity Bills\n" +
            "7. Bulk SMS\n" +
            "8. Check Wallet Balance\n" +
            "9. Check Account Status";

        await sendMessengerReply(senderPsid, { text: welcomeMenu });
        return;
    }

    if (currentSession) {
        await handleSessionFlow(senderPsid, text, currentSession);
        return;
    }

    if (text === '1') {
        userSessions[senderPsid] = { step: 'LOGIN_EMAIL', lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Please enter your account email address (Example: user@gmail.com):" });
        return;
    }
    if (text === '2') {
        userSessions[senderPsid] = { step: 'REGISTER_NAME', lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Let's create your account. Please enter your Full Name:" });
        return;
    }
    if (text === '3') {
        userSessions[senderPsid] = { step: 'AIRTIME_PHONE', data: { service: 'airtime' }, lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Enter phone number for airtime recharge:" });
        return;
    }
    if (text === '4') {
        userSessions[senderPsid] = { step: 'DATA_PHONE', data: { service: 'data' }, lastActive: now };
        await sendMessengerReply(senderPsid, { text: "Enter phone number for data bundle:" });
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
    if (text === '9' || lowerText === 'status') {
        const linkedUserId = await getLinkedUserId(senderPsid);
        const replyText = linkedUserId 
            ? "Your Messenger is successfully linked to your Dnezerlinks account!" 
            : "Account not linked yet. Select option 1 to Login or option 2 to Create Account.";
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    if (lowerText.startsWith('login ') || lowerText.startsWith('link ')) {
        const email = text.split(' ')[1]?.trim();
        const replyText = email ? await verifyAndLoginAccount(senderPsid, email, null) : "Please provide your email. Example: login user@gmail.com";
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    await sendMessengerReply(senderPsid, { 
        text: "Welcome to Dnezerlinks! Type 'menu' to see all available automated features and options." 
    });
}

async function handleSessionFlow(senderPsid, text, session) {
    if (session.step === 'LOGIN_EMAIL') {
        session.data = { email: text.trim().toLowerCase() };
        session.step = 'LOGIN_PASSWORD';
        await sendMessengerReply(senderPsid, { text: "Please enter your account password:" });
        return;
    }

    if (session.step === 'LOGIN_PASSWORD') {
        const email = session.data.email;
        const password = text.trim();
        delete userSessions[senderPsid];
        const replyText = await verifyAndLoginAccount(senderPsid, email, password);
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    if (session.step === 'REGISTER_NAME') {
        session.data.name = text.trim();
        session.step = 'REGISTER_EMAIL';
        await sendMessengerReply(senderPsid, { text: "Great! Now enter your email address:" });
        return;
    }
    if (session.step === 'REGISTER_EMAIL') {
        session.data.email = text.trim().toLowerCase();
        session.step = 'REGISTER_PASSWORD';
        await sendMessengerReply(senderPsid, { text: "Now enter your secure account password:" });
        return;
    }
    if (session.step === 'REGISTER_PASSWORD') {
        session.data.password = text.trim();
        session.step = 'REGISTER_PIN';
        await sendMessengerReply(senderPsid, { text: "Set a 4-digit Transaction PIN for authorizing purchases:" });
        return;
    }
    if (session.step === 'REGISTER_PIN') {
        session.data.pin = text.trim();
        delete userSessions[senderPsid];
        const replyText = await registerAccount(senderPsid, session.data.name, session.data.email, session.data.password, session.data.pin);
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

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

        pendingPinTokens[pinToken] = {
            psid: senderPsid,
            service: 'airtime',
            phone: session.data.phone,
            network: session.data.network,
            amount: session.data.amount,
            expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
            attempts: 0
        };

        await sendMessengerButtonTemplate(senderPsid, {
            text: `Review Airtime Transaction:\nNetwork: ${session.data.network.toUpperCase()}\nPhone: ${session.data.phone}\nAmount: NGN ${session.data.amount}\n\nClick below to enter your PIN securely (Link expires in 5 minutes):`,
            buttonText: "🔐 Enter PIN Securely",
            url: `${APP_URL}/webhook/secure-pin-portal?token=${pinToken}`
        });
        return;
    }

    delete userSessions[senderPsid];
    await sendMessengerReply(senderPsid, { text: "Session reset. Type 'menu' to view options." });
}

async function registerAccount(senderPsid, name, email, password, pin) {
    try {
        const cleanEmail = email.toLowerCase();
        const usersRef = admin.database().ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(cleanEmail).once('value');

        if (snapshot.exists()) {
            return `An account with ${cleanEmail} already exists. Type 'login' or use option 1 to connect it instead.`;
        }

        const newUserRef = usersRef.push();
        const userId = newUserRef.key;

        await newUserRef.set({
            userId: userId,
            name: name,
            email: cleanEmail,
            password: password,
            pin: pin,
            transaction_pin: pin,
            balance: 0,
            messenger_psid: senderPsid,
            createdAt: new Date().toISOString()
        });

        await admin.database().ref(`messenger_links/${senderPsid}`).set({
            userId: userId,
            email: cleanEmail,
            linkedAt: new Date().toISOString()
        });

        return `Account Created & Linked Successfully!\nName: ${name}\nEmail: ${cleanEmail}\nPIN Secured: [HIDDEN]\nBalance: NGN 0.00\n\nType 'balance' anytime to check your wallet.`;
    } catch (error) {
        return "Registration failed. Please try again.";
    }
}

async function verifyAndLoginAccount(senderPsid, email, password) {
    try {
        const cleanEmail = email.toLowerCase();
        const usersRef = admin.database().ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(cleanEmail).once('value');

        if (!snapshot.exists()) {
            return `❌ No account found with ${cleanEmail}. Select option 2 to create a new account.`;
        }

        let userId = null;
        let userData = null;
        snapshot.forEach((childSnapshot) => {
            userId = childSnapshot.key;
            userData = childSnapshot.val();
        });

        if (password && userData.password !== password) {
            return "❌ Incorrect password. Please type 'menu' and select option 1 to try logging in again.";
        }

        await admin.database().ref(`messenger_links/${senderPsid}`).set({
            userId: userId,
            email: cleanEmail,
            linkedAt: new Date().toISOString()
        });

        await admin.database().ref(`users/${userId}/messenger_psid`).set(senderPsid);

        return "✅ Account Logged In & Linked Successfully! Type 'balance' or 'menu' to view your options.";
    } catch (error) {
        return "❌ An error occurred while logging in. Please try again.";
    }
}

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

async function checkBalance(senderPsid) {
    try {
        const userId = await getLinkedUserId(senderPsid);
        if (!userId) {
            return "❌ Account Not Linked. Select option 1 to Login or option 2 to Create Account.";
        }

        const userSnap = await admin.database().ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return "❌ User record not found.";
        }

        const userData = userSnap.val();
        const balance = userData.balance !== undefined ? userData.balance : 0;

        return `💰 Dnezerlinks Wallet Balance\n\nName: ${userData.name || 'User'}\nBalance: NGN ${Number(balance).toLocaleString()}`;
    } catch (error) {
        return "❌ Failed to retrieve balance.";
    }
}

async function sendMessengerReply(senderPsid, response) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                recipient: { id: senderPsid },
                message: response
            }
        );
    } catch (err) {
        console.log("Error sending message to Facebook Graph API.");
    }
}

async function sendMessengerButtonTemplate(senderPsid, payload) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
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
                                    webview_height_ratio: "compact"
                                }
                            ]
                        }
                    }
                }
            }
        );
    } catch (err) {
        console.log("Error sending button template:", err.response?.data || err.message);
    }
}

module.exports = router;
