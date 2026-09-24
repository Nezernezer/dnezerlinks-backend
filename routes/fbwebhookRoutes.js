const express = require('express');
const router = express.Router();
const axios = require('axios');

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

// 2. POST /webhook -> Used by Facebook to receive incoming messages/clicks
router.post('/', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        for (const entry of body.entry) {
            const webhookEvent = entry.messaging ? entry.messaging[0] : null;
            if (webhookEvent) {
                const senderPsid = webhookEvent.sender.id;
                console.log(`📩 Incoming Messenger Event from PSID: ${senderPsid}`);

                if (webhookEvent.message && webhookEvent.message.text) {
                    const incomingText = webhookEvent.message.text.trim();
                    await handleUserMessage(senderPsid, incomingText);
                }
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    } else {
        return res.sendStatus(404);
    }
});

// Helper function to handle text commands from users
async function handleUserMessage(senderPsid, text) {
    let replyText = `Welcome to Dnezerlinks! You said: "${text}". Our automated messenger services are connecting to your account.`;

    const lowerText = text.toLowerCase();
    if (lowerText === 'menu' || lowerText === 'start') {
        replyText = "Main Menu:\n1. Type 'balance' to check your wallet\n2. Type 'data' to purchase data bundles\n3. Type 'airtime' to buy airtime";
    } else if (lowerText === 'balance') {
        replyText = "To check your balance, please link your Dnezerlinks account first.";
    }

    await sendMessengerReply(senderPsid, { text: replyText });
}

// Helper function to send messages back to Meta Graph API
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
