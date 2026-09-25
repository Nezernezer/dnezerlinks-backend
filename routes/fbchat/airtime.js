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
            session.step = 'AIRTIME_AMOUNT';
            return { text: "💵 Enter the amount to recharge (Minimum ₦100):" };

        case 'AIRTIME_AMOUNT':
            const amountNum = parseFloat(cleanText);
            if (isNaN(amountNum) || amountNum < 100) {
                return { text: "❌ Invalid amount. Minimum airtime purchase is ₦100. Please enter a valid amount:" };
            }

            session.data.amount = amountNum;
            session.step = 'AIRTIME_PIN';
            return { text: "🔒 Enter your 4-digit transaction PIN to complete this purchase:" };

        case 'AIRTIME_PIN':
            const pin = cleanText;
            if (pin.length !== 4 || isNaN(pin)) {
                return { text: "❌ Invalid PIN format. Please enter your 4-digit transaction PIN:" };
            }

            session.data.pin = pin;

            const linkSnap = await admin.database().ref(`messenger_links/${senderPsid}`).once('value');
            if (!linkSnap.exists()) {
                delete airtimeSessions[senderPsid];
                return { text: "❌ Your account is not linked. Please log in first using option 1." };
            }

            const userId = linkSnap.val().userId;
            const networkMap = { "mtn": "1", "glo": "2", "9mobile": "3", "airtel": "4" };

            try {
                const backendUrl = process.env.APP_URL || 'https://dnezerlinks-backend.onrender.com';
                const response = await axios.post(`${backendUrl}/api/airtime/buy`, {
                    uid: userId,
                    phone: session.data.phone,
                    amount: session.data.amount,
                    networkID: networkMap[session.data.network],
                    pin: session.data.pin
                }, { timeout: 55000 });

                delete airtimeSessions[senderPsid];

                if (response.data && response.data.success) {
                    return { 
                        text: `✅ Airtime Purchase Successful!\n\nNetwork: ${session.data.network.toUpperCase()}\nPhone: ${session.data.phone}\nAmount: ₦${session.data.amount.toLocaleString()}\n\nType 'menu' for more options.` 
                    };
                } else {
                    return { text: `❌ Transaction Failed: ${response.data.error || 'Unknown error occurred.'}` };
                }

            } catch (error) {
                delete airtimeSessions[senderPsid];
                const errMsg = error.response?.data?.error || error.message || "Server connection failed.";
                return { text: `❌ Airtime Failed: ${errMsg}` };
            }

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
    return { text: "📱 **Airtime Top-up**\n\nEnter the recipient phone number:" };
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







