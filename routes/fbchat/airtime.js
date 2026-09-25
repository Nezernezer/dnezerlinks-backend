const axios = require('axios');
const admin = require('firebase-admin');

const airtimeSessions = {};

async function handleAirtimeFlow(senderPsid, text, session) {
    const cleanText = text.trim();

    switch (session.step) {
        case 'AIRTIME_PHONE':
            if (cleanText.length < 11) {
                return { text: "❌ Please enter a valid 11-digit phone number for the airtime recharge:" };
            }
            session.data.phone = cleanText;
            session.step = 'AIRTIME_NETWORK';
            return {
                text: "📶 Select network provider:\n\n1. MTN\n2. Glo\n3. Airtel\n4. 9mobile\n\n(Reply with the number or name)"
            };

        case 'AIRTIME_NETWORK':
            const netMap = { '1': 'mtn', '2': 'glo', '3': 'airtel', '4': '9mobile' };
            const lowerNet = cleanText.toLowerCase();
            const selectedNetwork = netMap[lowerNet] || ['mtn', 'glo', 'airtel', '9mobile'].find(n => lowerNet.includes(n));

            if (!selectedNetwork) {
                return { text: "❌ Invalid network choice. Please select:\n1. MTN\n2. Glo\n3. Airtel\n4. 9mobile" };
            }

            session.data.network = selectedNetwork;
            // Hand off control to controlroom.js by setting step to AIRTIME_AMOUNT
            session.step = 'AIRTIME_AMOUNT';
            return { text: "💵 Enter the amount to recharge (Minimum ₦100):" };

        default:
            delete airtimeSessions[senderPsid];
            return { text: "Session expired. Type 'menu' to restart." };
    }
}

function startAirtimeFlow(senderPsid) {
    airtimeSessions[senderPsid] = {
        step: 'AIRTIME_PHONE',
        data: {}
    };
    return { text: "📱 Airtime Top-up\n\nEnter the recipient phone number:" };
}

function getAirtimeSession(senderPsid) {
    return airtimeSessions[senderPsid];
}

function clearAirtimeSession(senderPsid) {
    delete airtimeSessions[senderPsid];
}

module.exports = {
    startAirtimeFlow,
    handleAirtimeFlow,
    getAirtimeSession,
    clearAirtimeSession
};
