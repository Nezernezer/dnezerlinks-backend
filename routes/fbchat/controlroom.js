const airtimeChat = require('./airtime');

// Inside handleUserMessage function, inside your option evaluation blocks:
if (text === '3' || lowerText.includes('airtime')) {
    const initialReply = airtimeChat.startAirtimeFlow(senderPsid);
    await sendMessengerReply(senderPsid, initialReply);
    return;
}

// Inside your main routing dispatch handler (before fallback checks):
if (airtimeChat.getAirtimeSession(senderPsid)) {
    const session = airtimeChat.getAirtimeSession(senderPsid);
    const reply = await airtimeChat.handleAirtimeFlow(senderPsid, text, session);
    await sendMessengerReply(senderPsid, reply);
    return;
}
