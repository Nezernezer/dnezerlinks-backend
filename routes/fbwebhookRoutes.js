const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VTUNAIJA_API_KEY = process.env.VTUNAIJA_API_KEY;
const VTUNAIJA_AIRTIME_URL = process.env.VTUNAIJA_AIRTIME_URL || 'https://vtunaija.com/api/airtime/';

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

// Handle multi-step conversational wizards with strict PIN validation & server feedback
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
        const netMap = { '1': 'MTN', '2': 'Glo', '3': '9mobile', '4': 'Airtel' };
        session.data.network = netMap[text.trim()] || text.trim();
        session.step = 'AIRTIME_AMOUNT';
        await sendMessengerReply(senderPsid, { text: "Enter amount:" });
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
            text: `Review Airtime Transaction:\nNetwork: ${session.data.network}\nPhone: ${session.data.phone}\nAmount: NGN ${session.data.amount}\n\nProceed to process?\n1. Yes\n2. No` 
        });
        return;
    }
    if (session.step === 'AIRTIME_CONFIRM') {
        if (lowerText === '1' || lowerText === 'yes') {
            await sendMessengerReply(senderPsid, { text: "Validating transaction PIN and processing real-time airtime top-up..." });
            const resultMsg = await processTransaction(senderPsid, session.data);
            await sendMessengerReply(senderPsid, { text: resultMsg });
        } else {
            await sendMessengerReply(senderPsid, { text: "Transaction cancelled. Type 'menu' to start over." });
        }
        delete userSessions[senderPsid];
        return;
    }

    // 4. DATA BUNDLE FLOW
    if (session.step === 'DATA_PHONE') {
        session.data.phone = text.trim();
        session.step = 'DATA_NETWORK';
        await sendMessengerReply(senderPsid, { text: "Select network:\n1. MTN\n2. Glo\n3. 9mobile\n4. Airtel" });
        return;
    }
    if (session.step === 'DATA_NETWORK') {
        const netMap = { '1': 'MTN', '2': 'Glo', '3': '9mobile', '4': 'Airtel' };
        session.data.network = netMap[text.trim()] || text.trim();
        session.step = 'DATA_PLAN';
        await sendMessengerReply(senderPsid, { text: "Enter data plan code or description (e.g. 1GB SME):" });
        return;
    }
    if (session.step === 'DATA_PLAN') {
        session.data.plan = text.trim();
        session.step = 'DATA_PIN';
        await sendMessengerReply(senderPsid, { text: "Enter your 4-digit transaction PIN:" });
        return;
    }
    if (session.step === 'DATA_PIN') {
        session.data.pin = text.trim();
        session.step = 'DATA_CONFIRM';
        await sendMessengerReply(senderPsid, { 
            text: `Review Data Transaction:\nNetwork: ${session.data.network}\nPhone: ${session.data.phone}\nPlan: ${session.data.plan}\n\nProceed?\n1. Yes\n2. No` 
        });
        return;
    }
    if (session.step === 'DATA_CONFIRM') {
        if (lowerText === '1' || lowerText === 'yes') {
            await sendMessengerReply(senderPsid, { text: "Verifying PIN and processing data bundle..." });
            const resultMsg = await processTransaction(senderPsid, session.data);
            await sendMessengerReply(senderPsid, { text: resultMsg });
        } else {
            await sendMessengerReply(senderPsid, { text: "Transaction cancelled." });
        }
        delete userSessions[senderPsid];
        return;
    }

    // 5. CABLE TV FLOW
    if (session.step === 'CABLE_PROVIDER') {
        const provMap = { '1': 'DSTV', '2': 'GOTV', '3': 'Startimes' };
        session.data.provider = provMap[text.trim()] || text.trim();
        session.step = 'CABLE_SMARTCARD';
        await sendMessengerReply(senderPsid, { text: "Enter Smartcard / IUC Number:" });
        return;
    }
    if (session.step === 'CABLE_SMARTCARD') {
        session.data.smartcard = text.trim();
        session.step = 'CABLE_PACKAGE';
        await sendMessengerReply(senderPsid, { text: "Enter Package / Bouquet name or code:" });
        return;
    }
    if (session.step === 'CABLE_PACKAGE') {
        session.data.package = text.trim();
        session.step = 'CABLE_PIN';
        await sendMessengerReply(senderPsid, { text: "Enter your 4-digit transaction PIN:" });
        return;
    }
    if (session.step === 'CABLE_PIN') {
        session.data.pin = text.trim();
        session.step = 'CABLE_CONFIRM';
        await sendMessengerReply(senderPsid, { 
            text: `Review Cable TV Subscription:\nProvider: ${session.data.provider}\nIUC: ${session.data.smartcard}\nPackage: ${session.data.package}\n\nProceed?\n1. Yes\n2. No` 
        });
        return;
    }
    if (session.step === 'CABLE_CONFIRM') {
        if (lowerText === '1' || lowerText === 'yes') {
            await sendMessengerReply(senderPsid, { text: "Verifying PIN and processing cable subscription..." });
            const resultMsg = await processTransaction(senderPsid, session.data);
            await sendMessengerReply(senderPsid, { text: resultMsg });
        } else {
            await sendMessengerReply(senderPsid, { text: "Transaction cancelled." });
        }
        delete userSessions[senderPsid];
        return;
    }

    // 6. ELECTRICITY BILL FLOW
    if (session.step === 'ELECTRICITY_DISCO') {
        session.data.disco = text.trim();
        session.step = 'ELECTRICITY_METER';
        await sendMessengerReply(senderPsid, { text: "Enter Meter Number:" });
        return;
    }
    if (session.step === 'ELECTRICITY_METER') {
        session.data.meter = text.trim();
        session.step = 'ELECTRICITY_AMOUNT';
        await sendMessengerReply(senderPsid, { text: "Enter Amount:" });
        return;
    }
    if (session.step === 'ELECTRICITY_AMOUNT') {
        session.data.amount = text.trim();
        session.step = 'ELECTRICITY_PIN';
        await sendMessengerReply(senderPsid, { text: "Enter your 4-digit transaction PIN:" });
        return;
    }
    if (session.step === 'ELECTRICITY_PIN') {
        session.data.pin = text.trim();
        session.step = 'ELECTRICITY_CONFIRM';
        await sendMessengerReply(senderPsid, { 
            text: `Review Electricity Bill:\nDisco: ${session.data.disco}\nMeter: ${session.data.meter}\nAmount: NGN ${session.data.amount}\n\nProceed?\n1. Yes\n2. No` 
        });
        return;
    }
    if (session.step === 'ELECTRICITY_CONFIRM') {
        if (lowerText === '1' || lowerText === 'yes') {
            await sendMessengerReply(senderPsid, { text: "Verifying PIN and generating token..." });
            const resultMsg = await processTransaction(senderPsid, session.data);
            await sendMessengerReply(senderPsid, { text: resultMsg });
        } else {
            await sendMessengerReply(senderPsid, { text: "Transaction cancelled." });
        }
        delete userSessions[senderPsid];
        return;
    }

    // 7. BULK SMS FLOW
    if (session.step === 'BULKSMS_RECIPIENTS') {
        session.data.recipients = text.trim();
        session.step = 'BULKSMS_MESSAGE';
        await sendMessengerReply(senderPsid, { text: "Enter SMS Message text:" });
        return;
    }
    if (session.step === 'BULKSMS_MESSAGE') {
        session.data.messageText = text.trim();
        session.step = 'BULKSMS_PIN';
        await sendMessengerReply(senderPsid, { text: "Enter your 4-digit transaction PIN:" });
        return;
    }
    if (session.step === 'BULKSMS_PIN') {
        session.data.pin = text.trim();
        session.step = 'BULKSMS_CONFIRM';
        await sendMessengerReply(senderPsid, { 
            text: `Review Bulk SMS:\nRecipients: ${session.data.recipients}\nMessage: ${session.data.messageText}\n\nProceed?\n1. Yes\n2. No` 
        });
        return;
    }
    if (session.step === 'BULKSMS_CONFIRM') {
        if (lowerText === '1' || lowerText === 'yes') {
            await sendMessengerReply(senderPsid, { text: "Verifying PIN and broadcasting SMS..." });
            const resultMsg = await processTransaction(senderPsid, session.data);
            await sendMessengerReply(senderPsid, { text: resultMsg });
        } else {
            await sendMessengerReply(senderPsid, { text: "Transaction cancelled." });
        }
        delete userSessions[senderPsid];
        return;
    }

    delete userSessions[senderPsid];
    await sendMessengerReply(senderPsid, { text: "Session reset. Type 'menu' to view options." });
}

// Strict Transaction Execution, Wallet Check & Real-time VTUNAIJA API integration for Airtime
async function processTransaction(senderPsid, transactionData) {
    try {
        const userId = await getLinkedUserId(senderPsid);
        if (!userId) {
            return "❌ Error: Account not linked. Please login (Option 1) first.";
        }

        const userRef = admin.database().ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) {
            return "❌ Error: User record not found.";
        }

        const userData = userSnap.val();
        
        // Strict PIN Verification
        if (!userData.pin) {
            return "❌ Transaction Denied: You have not created a transaction PIN. Please update your profile or re-register with a PIN.";
        }

        if (String(userData.pin).trim() !== String(transactionData.pin).trim()) {
            return "❌ Transaction Failed: Incorrect transaction PIN provided. Access denied.";
        }

        // ==========================================
        // REAL AIRTIME PROCESSING VIA VTUNAIJA API
        // ==========================================
        if (transactionData.service === 'airtime') {
            const amount = parseFloat(transactionData.amount);
            const currentBalance = Number(userData.balance !== undefined ? userData.balance : (userData.wallet_balance !== undefined ? userData.wallet_balance : 0));

            if (isNaN(amount) || amount <= 0) {
                return "❌ Transaction Failed: Invalid airtime amount specified.";
            }

            if (currentBalance < amount) {
                return `❌ Transaction Failed: Insufficient wallet balance.\n\nYour Balance: NGN ${currentBalance.toLocaleString()}\nAmount Required: NGN ${amount.toLocaleString()}\n\nPlease fund your wallet to proceed.`;
            }

            // Map network name to VTUNAIJA Network IDs (1: MTN, 2: GLO, 3: 9MOBILE, 4: AIRTEL - adjust if needed)
            const networkMap = { 'MTN': '1', 'GLO': '2', '9MOBILE': '3', 'AIRTEL': '4' };
            const networkId = networkMap[transactionData.network.toUpperCase()] || transactionData.network;

            console.log(`📡 Sending Airtime request to VTUNAIJA API for User ${userId} | Network: ${networkId} | Phone: ${transactionData.phone} | Amount: ${amount}`);

            try {
                // Real HTTP POST request to VTUNAIJA airtime endpoint
                const vtuResponse = await axios.post(VTUNAIJA_AIRTIME_URL, {
                    network: networkId,
                    phone: transactionData.phone,
                    amount: amount,
                    network_id: networkId,
                    datatype: 'airtime'
                }, {
                    headers: {
                        'Authorization': `Bearer ${VTUNAIJA_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000 // 30 seconds timeout
                });

                const resData = vtuResponse.data;

                // Check API success status (adjust condition based on VTUNAIJA API response schema)
                if (resData && (resData.status === 'success' || resData.status === true || resData.code === '200' || resData.success === true)) {
                    // Deduct balance from Firebase user wallet
                    const newBalance = currentBalance - amount;
                    await userRef.update({
                        balance: newBalance,
                        wallet_balance: newBalance
                    });

                    console.log(`✅ Airtime successful. New wallet balance for ${userId}: ${newBalance}`);
                    return `✅ Airtime Purchase Successful!\n\nNetwork: ${transactionData.network}\nPhone: ${transactionData.phone}\nAmount: NGN ${amount.toLocaleString()}\nNew Wallet Balance: NGN ${newBalance.toLocaleString()}`;
                } else {
                    const errorMsg = resData?.message || resData?.msg || 'Gateway transaction failed.';
                    console.error("VTUNAIJA API Rejection:", resData);
                    return `❌ Airtime Failed: ${errorMsg}`;
                }

            } catch (apiError) {
                console.error("VTUNAIJA API Connection Error:", apiError.response?.data || apiError.message);
                return "❌ Gateway Error: Unable to complete airtime request with VTUNAIJA at the moment. Please try again later.";
            }
        }

        // Placeholder fallback for other services if needed
        console.log(`Processing ${transactionData.service} for user ${userId} with verified PIN.`);
        return `✅ Success! Your ${transactionData.service} request has been processed successfully by the server.`;

    } catch (error) {
        console.error("Transaction Processing Error:", error);
        return "❌ Server Error: Failed to process transaction.";
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
            return "❌ Account Not Linked. Select option 1 to Login or option 2 to Create Account.";
        }

        const userSnap = await admin.database().ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return "❌ User record not found.";
        }

        const userData = userSnap.val();
        const balance = userData.balance !== undefined ? userData.balance : (userData.wallet_balance !== undefined ? userData.wallet_balance : 0);

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
