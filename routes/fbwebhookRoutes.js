const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// Temporary in-memory session store for multi-step service flows (Airtime, Data, etc.)
// Format: { senderPsid: { step: 'AIRTIME_PHONE', data: { ... } } }
const userSessions = {};

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
                    console.log(`📩 Messenger Message from ${senderPsid}: ${incomingText}`);
                    
                    await handleUserMessage(senderPsid, incomingText);
                }
            }
        }
    } else {
        return res.sendStatus(404);
    }
});

// Handle incoming user commands and multi-step conversational flows
async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();
    const currentSession = userSessions[senderPsid];

    // Global reset / main menu triggers
    if (lowerText === 'menu' || lowerText === 'start' || lowerText === 'help' || lowerText === 'hi' || lowerText === 'hello') {
        delete userSessions[senderPsid]; // Clear any active session
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

    // Check if user is in an active multi-step session
    if (currentSession) {
        await handleSessionFlow(senderPsid, text, currentSession);
        return;
    }

    // Handle standard top-level menu selections
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
        // Start Airtime Multi-Step Flow
        userSessions[senderPsid] = { step: 'AIRTIME_PHONE', data: {} };
        await sendMessengerReply(senderPsid, { text: "Enter phone number for airtime recharge:" });
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

    // Direct text commands fallback
    if (lowerText.startsWith('login ') || lowerText.startsWith('link ')) {
        const email = text.split(' ')[1]?.trim();
        const replyText = email ? await linkAccount(senderPsid, email) : "Please provide your email. Example: login user@gmail.com";
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    // Default fallback if unknown text
    await sendMessengerReply(senderPsid, { 
        text: "Welcome to Dnezerlinks! Type 'menu' to see all available automated features and options." 
    });
}

// Handle multi-step conversational wizards (e.g., Airtime flow)
async function handleSessionFlow(senderPsid, text, session) {
    const lowerText = text.toLowerCase();

    // 1. LOGIN FLOW
    if (session.step === 'LOGIN_EMAIL') {
        delete userSessions[senderPsid];
        const replyText = await linkAccount(senderPsid, text.trim());
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    // 2. REGISTRATION FLOW
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
        delete userSessions[senderPsid];
        const replyText = await registerAccount(senderPsid, session.data.name, session.data.email, session.data.password);
        await sendMessengerReply(senderPsid, { text: replyText });
        return;
    }

    // 3. AIRTIME PURCHASE FLOW
    if (session.step === 'AIRTIME_PHONE') {
        session.data.phone = text.trim();
        session.step = 'AIRTIME_NETWORK';
        await sendMessengerReply(senderPsid, { 
            text: "Select network:\n1. MTN\n2. Glo\n3. 9mobile\n4. Airtel" 
        });
        return;
    }
    if (session.step === 'AIRTIME_NETWORK') {
        const netMap = { '1': 'MTN', '2': 'Glo', '3': '9mobile', '4': 'Airtel' };
        const network = netMap[text.trim()] || text.trim();
        session.data.network = network;
        session.step = 'AIRTIME_AMOUNT';
        await sendMessengerReply(senderPsid, { text: "Enter amount:" });
        return;
    }
    if (session.step === 'AIRTIME_AMOUNT') {
        session.data.amount = text.trim();
        session.step = 'AIRTIME_PIN';
        await sendMessengerReply(senderPsid, { text: "Enter pin:" });
        return;
    }
    if (session.step === 'AIRTIME_PIN') {
        session.data.pin = text.trim();
        session.step = 'AIRTIME_CONFIRM';
        await sendMessengerReply(senderPsid, { 
            text: `Review Transaction:\nNetwork: ${session.data.network}\nPhone: ${session.data.phone}\nAmount: ₦${session.data.amount}\n\nProceed to process?\n1. Yes\n2. No` 
        });
        return;
    }
    if (session.step === 'AIRTIME_CONFIRM') {
        const choice = lowerText;
        if (choice === '1' || choice === 'yes') {
            await sendMessengerReply(senderPsid, { text: "Processing your airtime request..." });
            
            // Execute actual VTU integration/database deduction here if needed
            setTimeout(async () => {
                await sendMessengerReply(senderPsid, { text: `Success! Airtime of ₦${session.data.amount} successfully sent to ${session.data.phone}.` });
            }, 1500);
        } else {
            await sendMessengerReply(senderPsid, { text: "Transaction cancelled. Type 'menu' to start over." });
        }
        delete userSessions[senderPsid];
        return;
    }

    delete userSessions[senderPsid];
    await sendMessengerReply(senderPsid, { text: "Session reset. Type 'menu' to view options." });
}

// Helper: Register new user
async function registerAccount(senderPsid, name, email, password) {
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

        return `Account Created & Linked Successfully!\nName: ${name}\nEmail: ${email}\nBalance: NGN 0.00\n\nType 'balance' anytime to check your wallet.`;
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
        console.error('Error sending message to Facebook Graph API:', err.response?.data || err.message);
    }
}

module.exports = router;
