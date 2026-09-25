const admin = require('firebase-admin');
const crypto = require('crypto');

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

/**
 * Handles the conversational steps for airtime.
 * When the amount is entered, it generates a secure token and returns
 * a button template payload (the main file will send it).
 */
async function handleAirtimeFlow(senderPsid, text, session, pendingPinTokens, PIN_TOKEN_EXPIRY_MS, APP_URL) {
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

        case 'AIRTIME_AMOUNT':
            const amountNum = parseFloat(cleanText);
            if (isNaN(amountNum) || amountNum < 100) {
                return { text: "❌ Invalid amount. Minimum airtime purchase is ₦100. Please enter a valid amount:" };
            }

            session.data.amount = amountNum;

            // Check if account is linked
            const linkSnap = await admin.database().ref(`messenger_links/${senderPsid}`).once('value');
            if (!linkSnap.exists()) {
                clearAirtimeSession(senderPsid);
                return { text: "❌ Your account is not linked. Please log in first (option 1)." };
            }

            // Clear conversational session
            clearAirtimeSession(senderPsid);

            // Generate secure 5-minute token
            const pinToken = crypto.randomBytes(32).toString('hex');

            pendingPinTokens[pinToken] = {
                psid: senderPsid,
                service: 'airtime',
                phone: session.data.phone,
                network: session.data.network,
                amount: session.data.amount,
                expiresAt: Date.now() + PIN_TOKEN_EXPIRY_MS,
                attempts: 0
            };

            // Return button template payload (main file will send it)
            return {
                attachment: {
                    type: "template",
                    payload: {
                        template_type: "button",
                        text: `Review Airtime Transaction:\n\n• Network: ${session.data.network.toUpperCase()}\n• Phone: \( {session.data.phone}\n• Amount: ₦ \){session.data.amount.toLocaleString()}\n\nClick below to enter your PIN securely (Link expires in 5 minutes):`,
                        buttons: [
                            {
                                type: "web_url",
                                url: `\( {APP_URL}/webhook/secure-pin-portal?token= \){pinToken}`,
                                title: "🔐 Enter PIN Securely",
                                webview_height_ratio: "compact"
                            }
                        ]
                    }
                }
            };

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
