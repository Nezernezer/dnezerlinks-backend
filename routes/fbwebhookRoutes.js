const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// Import your existing modular service handlers
const { handleAirtimeFlow } = require('./airtimeRoutes');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const userSessions = {};

// GET /webhook -> Verify URL with Facebook
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
            console.log('Facebook Webhook Verified Successfully.');
            return res.status(200).send(challenge);
        } else {
            console.log('Facebook Webhook Verification Failed: Token mismatch');
            return res.sendStatus(403);
        }
    }
    return res.sendStatus(400);
});

// POST /webhook -> Process incoming messages
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
                    console.log(`Messenger Message from ${senderPsid}: ${incomingText}`);
                    
                    await handleUserMessage(senderPsid, incomingText);
                }
            }
        }
    } else {
        return res.sendStatus(404);
    }
});

// Handle incoming user commands and delegate appropriately
async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();
    const currentSession = userSessions[senderPsid];

    // Main Menu Trigger
    if (lowerText === 'menu' || lowerText === 'start' || lowerText === 'help' || lowerText === 'hi' || lowerText === 'hello') {
        delete userSessions[senderPsid];
        const welcomeMenu = 
            "Welcome to Dnezerlinks!\n\n" +
            "Dnezerlinks is your trusted automated platform for instant Virtual Top-Up (VTU) services. Buy cheap airtime, data bundles, cable TV subscriptions, electricity tokens, and bulk SMS securely from your wallet.\n\n" +
            "Please select an option to proceed:\n\n" +
            "1. Login\n" +
            "2. Create Account\n" +
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

    // Delegate session flows based on active service
    if (currentSession) {
        if (currentSession.data && currentSession.data.service === 'airtime') {
            await handleAirtimeFlow(senderPsid, text, currentSession, sendMessengerReply, (psid) => delete userSessions[psid]);
            return;
        }
        await handleGeneralSessionFlow(senderPsid, text, currentSession);
        return;
    }

    // Top-Level Menu Selection (1 to 9)
    if (text === '1') {
        userSessions[senderPsid] = { step: 'LOGIN_EMAIL' };
        await sendMessengerReply(senderPsid, { text: "Please enter your account email address (Example: user@gmail.com):" });
        return;
    }
    if (text === '2') {
        userSessions[senderPsid] = { step: 'REGISTER_NAME' };
        await sendMessengerReply(senderPsid, { text: "Let's create your account. Please enter your Full Name:" });
        return;
    }
    if (text === '3') {
        // Route to Airtime Module
        userSessions[senderPsid] = { step: 'AIRTIME_PHONE', data: { service: 'airtime' } };
        await sendMessengerReply(senderPsid, { text: "Enter phone number for airtime recharge:" });
        return;
    }
    if (text === '4') {
        userSessions[senderPsid] = { step: 'DATA_PHONE', data: { service: 'data' } };
        await sendMessengerReply(senderPsid, { text: "Enter phone number for data bundle:" });
        return;
    }
    if (text === '5') {
        userSessions[senderPsid] = { step: 'CABLE_PROVIDER', data: { service: 'cable' } };
        await sendMessengerReply(senderPsid, { text: "Select Cable TV Provider:\n1. DSTV\n2. GOTV\n3. Startimes" });
        return;
    }
    if (text === '6') {
        userSessions[senderPsid] = { step: 'ELECTRICITY_DISCO', data: { service: 'electricity' } };
        await sendMessengerReply(senderPsid, { text: "Enter Electricity Distribution Company (e.g., AEDC, Ikeja Electric, Eko, PHED):" });
        return;
    }
    if (text === '7') {
        userSessions[senderPsid] = { step: 'BULKSMS_RECIPIENTS', data: { service: 'bulksms' } };
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

// General session flows for Login and Registration
async function handleGeneralSessionFlow(senderPsid, text, session) {
    if (session.step === 'LOGIN_EMAIL') {
        delete userSessions[senderPsid];
        const replyText = await linkAccount(senderPsid, text.trim());
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    if (session.step === 'REGISTER_NAME') {
        session.data = session.data || {};
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

    delete userSessions[senderPsid];
    await sendMessengerReply(senderPsid, { text: "Session reset. Type 'menu' to view options." });
}

// Helper: Register new user
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
            wallet_balance: 0,
            messenger_psid: senderPsid,
            createdAt: new Date().toISOString()
        });

        await admin.database().ref(`messenger_links/${senderPsid}`).set({
            userId: userId,
            email: email,
            linkedAt: new Date().toISOString()
        });

        return `Account Created & Linked Successfully!\nName: ${name}\nEmail: ${email}\nPIN Secured: Yes\nBalance: NGN 0.00\n\nType 'balance' anytime to check your wallet.`;
    } catch (error) {
        console.error("Registration Error:", error);
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
            return "Account Not Linked. Select option 1 to Login or option 2 to Create Account.";
        }

        const userSnap = await admin.database().ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return "User record not found.";
        }

        const userData = userSnap.val();
        const balance = userData.balance !== undefined ? userData.balance : (userData.wallet_balance !== undefined ? userData.wallet_balance : 0);

        return `Dnezerlinks Wallet Balance\n\nName: ${userData.name || 'User'}\nBalance: NGN ${Number(balance).toLocaleString()}`;
    } catch (error) {
        return "Failed to retrieve balance.";
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
        console.log("Error sending message to Facebook Graph API:", err.response?.data || err.message);
    }
}

module.exports = router;
