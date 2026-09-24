const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

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
        // Immediately acknowledge Meta to prevent timeout re-deliveries (stops message duplication)
        res.status(200).send('EVENT_RECEIVED');

        for (const entry of body.entry) {
            if (!entry.messaging) continue;
            
            for (const webhookEvent of entry.messaging) {
                // Process only user-sent text messages (ignore delivery receipts, read receipts, echoes)
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

// Handle incoming user commands across all Dnezerlinks features
async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();
    let replyText = "";

    if (lowerText === 'menu' || lowerText === 'start' || lowerText === 'help') {
        replyText = "🤖 *Dnezerlinks Messenger Services*\n\n" +
                    "Select a command to proceed:\n\n" +
                    "🔹 `register [Name] [Email] [Password]`\n   ┗ Create a new account\n" +
                    "🔹 `link [Email]`\n   ┗ Connect existing account\n" +
                    "🔹 `balance`\n   ┗ Check live wallet balance\n" +
                    "🔹 `airtime`\n   ┗ Airtime purchase guide\n" +
                    "🔹 `data`\n   ┗ Data bundle service info\n" +
                    "🔹 `cable`\n   ┗ Cable TV (DSTV/GOTV)\n" +
                    "🔹 `electricity`\n   ┗ Electricity bill tokens\n" +
                    "🔹 `bulksms`\n   ┗ Bulk SMS services\n" +
                    "🔹 `status`\n   ┗ Check account link status";
    }
    else if (lowerText.startsWith('register ')) {
        const parts = text.split(' ');
        if (parts.length < 4) {
            replyText = "❌ *Format Error*\nUse: `register YourName your@email.com password`";
        } else {
            replyText = await registerAccount(senderPsid, parts[1], parts[2], parts[3]);
        }
    }
    else if (lowerText.startsWith('link ')) {
        const email = text.split(' ')[1]?.trim();
        if (!email) {
            replyText = "❌ *Format Error*\nExample: `link user@gmail.com`";
        } else {
            replyText = await linkAccount(senderPsid, email);
        }
    }
    else if (lowerText === 'balance') {
        replyText = await checkBalance(senderPsid);
    }
    else if (lowerText === 'status') {
        const linkedUserId = await getLinkedUserId(senderPsid);
        if (linkedUserId) {
            replyText = `✅ Your Messenger is successfully linked to your Dnezerlinks account!`;
        } else {
            replyText = "⚠️ *Account Not Linked*\nType `link your-email@gmail.com` or register.";
        }
    }
    else if (lowerText === 'airtime') {
        replyText = "📶 *Airtime VTU Top-up*\nInstantly recharge any network (MTN, Airtel, Glo, 9mobile) with automated discounts directly from your Dnezerlinks wallet.";
    }
    else if (lowerText === 'data') {
        replyText = "🌐 *Data Bundles*\nAccess cheap SME and Corporate Gifting data packages directly via your web dashboard or API sync.";
    }
    else if (lowerText === 'cable') {
        replyText = "📺 *Cable TV Subscription*\nPay for DSTV, GOTV, and Startimes instantly with automated activation.";
    }
    else if (lowerText === 'electricity') {
        replyText = "⚡ *Electricity Bills*\nBuy prepaid/postpaid electricity tokens (AEDC, Ikeja Electric, Eko, PHED, etc.) securely.";
    }
    else if (lowerText === 'bulksms') {
        replyText = "📱 *Bulk SMS Messaging*\nBroadcast customized SMS messages instantly using your Dnezerlinks messaging balance.";
    }
    else {
        replyText = "👋 Welcome to Dnezerlinks!\nType `menu` to see all available automated features.";
    }

    await sendMessengerReply(senderPsid, { text: replyText });
}

// Helper: Register new user
async function registerAccount(senderPsid, name, email, password) {
    try {
        const usersRef = admin.database().ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');

        if (snapshot.exists()) {
            return `❌ An account with ${email} already exists.\nType \`link ${email}\` to connect it instead.`;
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

        return `🎉 *Account Created & Linked!*\n\nName: ${name}\nEmail: ${email}\nBalance: ₦0.00\n\nType \`balance\` anytime to check your wallet.`;
    } catch (error) {
        console.error("🔥 Registration Error:", error);
        return `❌ Registration failed. Please try again.`;
    }
}

// Helper: Link account
async function linkAccount(senderPsid, email) {
    try {
        const usersRef = admin.database().ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');

        if (!snapshot.exists()) {
            return `❌ No account found with ${email}.\nType \`register Name Email Password\` to create one.`;
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

        return `✅ *Account Linked Successfully!*\nType \`balance\` to view your wallet.`;
    } catch (error) {
        return `❌ An error occurred while linking. Please try again.`;
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
            return "⚠️ *Account Not Linked*\nType `link email@gmail.com` or `register Name Email Password`.";
        }

        const userSnap = await admin.database().ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return "❌ User record not found.";
        }

        const userData = userSnap.val();
        const balance = userData.balance !== undefined ? userData.balance : (userData.wallet_balance !== undefined ? userData.wallet_balance : 0);

        return `💰 *Dnezerlinks Wallet*\n\nName: ${userData.name || 'User'}\nBalance: ₦${Number(balance).toLocaleString()}`;
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
        console.error('🔥 Error sending message to Facebook Graph API:', err.response?.data || err.message);
    }
}

module.exports = router;
