const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
// Points to your backend URL (e.g., https://dnezerlinks-backend.onrender.com or http://localhost:10000)
const APP_URL = process.env.APP_URL || 'http://localhost:10000'; 

// In-memory session store for multi-step transaction flows
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

    // Check if user is in an active multi-step session
    if (currentSession) {
        await handleSessionFlow(senderPsid, text, currentSession);
        return;
    }

    // Top-level menu routing
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

// Handle multi-step conversational wizards
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

    // 3. AIRTIME PURCHASE FLOW
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
        session.step = 'AIRTIME_PIN';
        await sendMessengerReply(senderPsid, { text: "Enter your 4-digit transaction PIN:" });
        return;
    }
    if (session.step === 'AIRTIME_PIN') {
        session.data.pin = text.trim();
        session.step = 'AIRTIME_CONFIRM';
        await sendMessengerReply(senderPsid, { 
            text: `Review Airtime Transaction:\nNetwork: ${session.data.network.toUpperCase()}\nPhone: ${session.data.phone}\nAmount: NGN ${session.data.amount}\n\nProceed to process?\n1. Yes\n2. No` 
        });
        return;
    }
    if (session.step === 'AIRTIME_CONFIRM') {
        if (lowerText === '1' || lowerText === 'yes') {
            await sendMessengerReply(senderPsid, { text: "Processing airtime top-up..." });
            const resultMsg = await processTransaction(senderPsid, session.data);
            await sendMessengerReply(senderPsid, { text: resultMsg });
        } else {
            await sendMessengerReply(senderPsid, { text: "Transaction cancelled. Type 'menu' to start over." });
        }
        delete userSessions[senderPsid];
        return;
    }

    delete userSessions[senderPsid];
    await sendMessengerReply(senderPsid, { text: "Session reset. Type 'menu' to view options." });
}

// Process transaction by routing airtime requests to your internal /api/airtime/buy endpoint
async function processTransaction(senderPsid, transactionData) {
    try {
        const userId = await getLinkedUserId(senderPsid);
        if (!userId) {
            return "❌ Error: Account not linked. Please login (Option 1) first.";
        }

        if (transactionData.service === 'airtime') {
            const amount = parseFloat(transactionData.amount);

            if (isNaN(amount) || amount < 100) {
                return "❌ Transaction Failed: Minimum airtime amount is NGN 100.";
            }

            // Match network ID mappings used on your frontend airtime index.html
            const networkMap = { 'mtn': '1', 'glo': '2', '9mobile': '3', 'airtel': '4' };
            const networkID = networkMap[transactionData.network.toLowerCase()] || transactionData.network;

            const airtimeEndpoint = `${APP_URL}/api/airtime/buy`;

            console.log(`📡 Routing Messenger airtime request to internal endpoint: ${airtimeEndpoint} for UID: ${userId}`);

            // Forward payload to your airtimeRoutes.js endpoint
            const response = await axios.post(airtimeEndpoint, {
                uid: userId,
                phone: transactionData.phone,
                amount: amount,
                networkID: networkID,
                pin: transactionData.pin
            }, {
                timeout: 55000
            });

            const resData = response.data;

            if (resData && resData.success) {
                return `✅ Airtime Purchase Successful!\n\nNetwork: ${transactionData.network.toUpperCase()}\nPhone: ${transactionData.phone}\nAmount: NGN ${amount.toLocaleString()}`;
            } else {
                return `❌ Airtime Failed: ${resData.error || 'Transaction could not be completed.'}`;
            }
        }

        return `✅ Success! Your ${transactionData.service} request has been recorded.`;

    } catch (error) {
        console.error("Internal Airtime Route Routing Error:", error.response?.data || error.message);
        const errorMsg = error.response?.data?.error || error.message || "Failed to process airtime.";
        return `❌ Airtime Failed: ${errorMsg}`;
    }
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
            transaction_pin: pin, // support both fields
            balance: 0,
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
        console.log("Error sending message to Facebook Graph API:", err.response?.data || err.message);
    }
}

module.exports = router;
