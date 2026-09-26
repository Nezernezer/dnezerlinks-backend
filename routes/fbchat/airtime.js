const admin = require('firebase-admin');

const airtimeSessions = {};

function startAirtimeFlow(senderPsid) {
    airtimeSessions[senderPsid] = {
        step: 'AIRTIME_PHONE',
        data: { service: 'airtime' },
        lastActive: Date.now()
    };
    return { text: "📱 **Airtime Top-up**\n\nEnter the recipient phone number:" };
}

function getAirtimeSession(senderPsid) {
    return airtimeSessions[senderPsid];
}

function clearAirtimeSession(senderPsid) {
    delete airtimeSessions[senderPsid];
}

async function handleAirtimeFlow(senderPsid, text, session) {
    const cleanText = text.trim();

    switch (session.step) {
        case 'AIRTIME_PHONE':
            if (cleanText.length < 10) {
                return { text: "❌ Please enter a valid phone number for the airtime recharge:" };
            }
            session.data.phone = cleanText;
            session.step = 'AIRTIME_NETWORK';
            session.lastActive = Date.now();
            return {
                text: "📶 Select network provider:\n\n1. MTN\n2. Glo\n3. 9mobile\n4. Airtel\n\n(Reply with the number or name)"
            };

        case 'AIRTIME_NETWORK':
            const netMap = { '1': 'mtn', '2': 'glo', '3': '9mobile', '4': 'airtel' };
            const lowerNet = cleanText.toLowerCase();
            const selectedNetwork = netMap[cleanText] || ['mtn', 'glo', '9mobile', 'airtel'].find(n => lowerNet.includes(n));

            if (!selectedNetwork) {
                return { text: "❌ Invalid network choice. Please select:\n1. MTN\n2. Glo\n3. 9mobile\n4. Airtel" };
            }

            session.data.network = selectedNetwork;
            session.step = 'AIRTIME_AMOUNT';
            session.lastActive = Date.now();
            return { text: "💵 Enter the amount to recharge (Minimum ₦100):" };

        default:
            clearAirtimeSession(senderPsid);
            return { text: "Session expired. Type 'menu' to restart." };
    }
}

module.exports = {
    startAirtimeFlow,
    handleAirtimeFlow,
    getAirtimeSession,
    clearAirtimeSession
};
