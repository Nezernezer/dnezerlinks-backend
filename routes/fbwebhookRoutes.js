const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto'); // Built-in Node.js module for generating random tokens

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL || 'https://api.dlinks.name.ng'; 

// In-memory session store with inactivity tracking & expiring tokens
const userSessions = {};
const pendingPinTokens = {}; // Stores temporary, single-use transaction tokens { tokenValue: { data, expiresAt } }

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes inactivity timeout
const PIN_TOKEN_EXPIRY_MS = 5 * 60 * 1000;  // 5 minutes webview token expiry

// 1. GET /webhook -> Used by Facebook to verify your URL
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
            console.log('✅ Facebook Webhook Verified Successfully.');
            return res.status(200).send(challenge);
        } else {
            console.log('❌ Facebook Webhook Verification Failed: Token mismatch');
            return res.sendStatus(403);
        }
    }
    return res.sendStatus(400);
});

// 2. POST /webhook -> Cleanly processes incoming user messages
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
                    console.log(`📩 Messenger Message from ${senderPsid} received.`);
                    
                    await handleUserMessage(senderPsid, incomingText);
                }
            }
        }
    } else {
        return res.sendStatus(404);
    }
});

// 3. GET /secure-pin-portal -> Serves the secure webview form using a one-time token
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
                <p>This transaction link has already been used, expired after 5 minutes, or is invalid. Please start a new request in Messenger.</p>
            </body>
            </html>
        `);
    }

    const sessionData = pendingPinTokens[token];

    // Check if token expired
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
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; height: 100vh; }
                .card { background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 360px; text-align: center; }
                h3 { color: #1e293b; margin-bottom: 8px; }
                p { color: #64748b; font-size: 14px; margin-bottom: 20px; }
                .summary { background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 20px; text-align: left; font-size: 13px; color: #334155; }
                .summary b { color: #0f172a; }
                input[type="password"] { width: 100%; padding: 12px; font-size: 18px; text-align: center; letter-spacing: 4px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; margin-bottom: 16px; outline: none; }
                input[type="password"]:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
                button { background: #2563eb; color: white; border: none; width: 100%; padding: 12px; font-size: 16px; font-weight: 600; border-radius: 8px; cursor: pointer; }
                button:hover { background: #1d4ed8; }
                .loader { display: none; margin-top: 10px; font-size: 14px; color: #2563eb; }
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

                <form id="pinForm" action="./secure-pin-portal-submit" method="POST">
                    <input type="hidden" name="token" value="${token}">
                    
                    <input type="password" name="pin" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required autocomplete="current-password" autofocus>
                    <button type="submit" id="submitBtn">Authorize & Pay</button>
                    <div class="loader" id="loader">Processing transaction securely...</div>
                </form>
            </div>

            <script>
                document.getElementById('pinForm').addEventListener('submit', function() {
                    document.getElementById('submitBtn').disabled = true;
                    document.getElementById('submitBtn').style.opacity = '0.6';
                    document.getElementById('loader').style.display = 'block';
                });
            </script>
        </body>
        </html>
    `);
});

// 4. POST /secure-pin-portal-submit -> Processes transaction and invalidates token permanently
router.post('/secure-pin-portal-submit', express.urlencoded({ extended: true }), async (req, res) => {
    const { token, pin } = req.body;

    // Strict validation: Token must exist and be valid
    if (!token || !pendingPinTokens[token] || !pin) {
        return res.send(`<h3>❌ Authorization Failed: Link is invalid or has already been used.</h3>`);
    }

    const sessionData = pendingPinTokens[token];

    // Immediately delete the token so it cannot be reused (One-Time Use Enforcement)
    delete pendingPinTokens[token];

    if (Date.now() > sessionData.expiresAt) {
        return res.send(`<h3>❌ Authorization Failed: Link has expired. Please restart your transaction.</h3>`);
    }

    const { psid, service, phone, network, amount } = sessionData;

    try {
        const userId = await getLinkedUserId(psid);
        if (!userId) {
            return res.send("<h3>❌ Account Not Linked. Please log in on Messenger first.</h3>");
        }

        if (service === 'airtime') {
            const parsedAmount = parseFloat(amount);
            const networkMap = { 'mtn': '1', 'glo': '2', '9mobile': '3', 'airtel': '4' };
            const networkID = networkMap[network?.toLowerCase()] || network;

            const airtimeEndpoint = `${APP_URL}/api/airtime/buy`;
            console.log(`📡 Processing secure one-time token airtime request for UID: ${userId}`);

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

                return res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Success</title>
                    <style>body{font-family:sans-serif;text-align:center;padding:40px;background:#f8fafc;color:#1e293b;}</style></head>
                    <body>
                        <h2 style="color:#16a34a;">✅ Airtime Successful!</h2>
                        <p>Your transaction was processed successfully. This link is now permanently expired. You can close this window and return to Messenger.</p>
                    </body>
                    </html>
                `);
            } else {
                const errReason = resData.error || 'Transaction could not be completed.';
                await sendMessengerReply(psid, { text: `❌ Airtime Failed: ${errReason}` });
                return res.send(`<h3>❌ Transaction Failed</h3><p>${errReason}</p>`);
            }
        }

        return res.send(`<h3>✅ Request Recorded Successfully.</h3>`);

    } catch (error) {
        const errReason = error.response?.data?.error || error.message || "Server error processing transaction.";
        console.error("Webview PIN submission error.");
        await sendMessengerReply(psid, { text: `❌ Transaction Failed: ${errReason}` });
        return res.send(`<h3>❌ Transaction Failed</h3><p>${errReason}</p>`);
    }
});

// Handle incoming user commands with session timeout checks
async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();
    const now = Date.now();
    let currentSession = userSessions[senderPsid];

    // Check for Inactivity Timeout
    if (currentSession && (now - currentSession.lastActive > SESSION_TIMEOUT_MS)) {
        delete userSessions[senderPsid];
        await sendMessengerReply(senderPsid, { 
            text: "⏳ Your previous session timed out due to inactivity. All pending actions have been cancelled safely. Please type 'menu' to start over whenever you're ready!" 
        });
        return;
    }

    // Update active timestamp for current session
    if (currentSession) {
        currentSession.lastActive = now;
    }

    // Global reset / main menu triggers
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

    // Top-level menu routing (Initialize with timestamp)
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
        const replyText = email ? await linkAccount(senderPsid, email) : "Please provide your email. Example: login user@gmail.com";
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    await sendMessengerReply(senderPsid, { 
        text: "Welcome to Dnezerlinks! Type 'menu' to see all available automated features and options." 
    });
}

// Handle multi-step conversational wizards
async function handleSessionFlow(senderPsid, text, session) {
    const lowerText = text.toLowerCase();

    if (session.step === 'LOGIN_EMAIL') {
        delete userSessions[senderPsid];
        const replyText = await linkAccount(senderPsid, text.trim());
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
        session.data.email = text.trim();
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

    // AIRTIME PURCHASE FLOW (Generates secure random token that expires in 5 minutes)
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
        delete userSessions[senderPsid]; // Clear chat session as we transition to secure web token portal

        // Generate a cryptographically strong random token
        const pinToken = crypto.randomBytes(32).toString('hex');

        // Store transaction payload securely on server with 5-minute expiry
        pendingPinTokens[pinToken] = {
            psid: senderPsid,
            service: 'airtime',
            phone: session.data.phone,
            network: session.data.network,
            amount: session.data.amount,
            expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS
        };

        // Send a secure button containing only the random token parameter (No sensitive parameters in URL)
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

// Helper: Register new user with PIN
async function registerAccount(senderPsid, name, email, password, pin) {
    try {
        const usersRef = admin.database().ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');

        if (snapshot.exists()) {
            return `An account with ${email} already exists. Type 'login ${email}' to connect it instead.`;
        }

        const newUserRef = usersRef.push();
        const userId = newUserRef.key;

        await newUserRef.set({
            userId: userId,
            name: name,
            email: email,
            password: password,
            pin: pin,
            transaction_pin: pin,
            balance: 0,
            messenger_psid: senderPsid,
            createdAt: new Date().toISOString()
        });

        await admin.database().ref(`messenger_links/${senderPsid}`).set({
            userId: userId,
            email: email,
            linkedAt: new Date().toISOString()
        });

        return `Account Created & Linked Successfully!\nName: ${name}\nEmail: ${email}\nPIN Secured: [HIDDEN]\nBalance: NGN 0.00\n\nType 'balance' anytime to check your wallet.`;
    } catch (error) {
        console.error("Registration Error.");
        return "Registration failed. Please try again.";
    }
}

// Helper: Link account (Login)
async function linkAccount(senderPsid, email) {
    try {
        const usersRef = admin.database().ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');

        if (!snapshot.exists()) {
            return `No account found with ${email}. Select option 2 to create a new account.`;
        }

        let userId = null;
        snapshot.forEach((childSnapshot) => {
            userId = childSnapshot.key;
        });

        await admin.database().ref(`messenger_links/${senderPsid}`).set({
            userId: userId,
            email: email,
            linkedAt: new Date().toISOString()
        });

        await admin.database().ref(`users/${userId}/messenger_psid`).set(senderPsid);

        return "Account Logged In & Linked Successfully! Type 'balance' or 'menu' to view your options.";
    } catch (error) {
        return "An error occurred while linking. Please try again.";
    }
}

// Helper: Get linked user ID
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

// Helper: Check balance
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

// Helper: Send reply to Facebook
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

// Helper: Send Facebook Button Template (Secure Webview Pop-up)
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
