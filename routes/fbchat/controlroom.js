const express = require('express');
const router = express.Router();
const axios = require('axios');
const airtimeChat = require('./airtime');

// Helper function to send messages back to Facebook Messenger
async function sendMessengerReply(senderPsid, responseMessage) {
    try {
        const accessToken = process.env.PAGE_ACCESS_TOKEN;
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`, {
            recipient: { id: senderPsid },
            message: responseMessage
        });
    } catch (error) {
        console.error('Error sending message to Facebook:', error.response?.data || error.message);
    }
}

// Handle incoming user messages asynchronously
async function handleUserMessage(senderPsid, text) {
    const lowerText = text.toLowerCase();

    // 1. Check if user is currently inside an active airtime session
    if (airtimeChat.getAirtimeSession(senderPsid)) {
        const session = airtimeChat.getAirtimeSession(senderPsid);
        const reply = await airtimeChat.handleAirtimeFlow(senderPsid, text, session);
        await sendMessengerReply(senderPsid, reply);
        return;
    }

    // 2. Trigger Airtime Flow if option 3 or 'airtime' is selected
    if (text === '3' || lowerText.includes('airtime')) {
        const initialReply = airtimeChat.startAirtimeFlow(senderPsid);
        await sendMessengerReply(senderPsid, initialReply);
        return;
    }

    // 3. Main Menu / Fallback handler
    if (lowerText.includes('menu') || lowerText.includes('start') || lowerText.includes('hi')) {
        await sendMessengerReply(senderPsid, { 
            text: "Welcome to Dnezerlinks!\n\n1. Check Balance\n2. Buy Data\n3. Buy Airtime\n4. Cable TV\n\nReply with a number or option." 
        });
        return;
    }

    // Default fallback
    await sendMessengerReply(senderPsid, { text: "I didn't quite get that. Type 'menu' to see available options." });
}

// 1. GET /webhook (Facebook Webhook Verification)
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

// 2. POST /webhook (Incoming Messenger Events)
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

module.exports = router;
