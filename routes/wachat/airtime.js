const activeAirtimeSessions = {};

function getAirtimeSession(phone) {
    return activeAirtimeSessions[phone] || null;
}

function clearAirtimeSession(phone) {
    delete activeAirtimeSessions[phone];
}

function startAirtimeFlow(phone) {
    activeAirtimeSessions[phone] = {
        step: 'CHOOSE_NETWORK',
        data: {}
    };

    return {
        text:
            '📶 *Airtime Top-up*\n\n' +
            'Please select a network:\n\n' +
            '1. MTN\n' +
            '2. GLO\n' +
            '3. AIRTEL\n' +
            '4. 9MOBILE\n\n' +
            'Reply with a number (1-4):\n' +
            '(* = back, 0 = menu)'
    };
}

async function handleAirtimeFlow(phone, text, session) {
    const raw = text.trim();

    switch (session.step) {
        case 'CHOOSE_NETWORK': {
            const networks = { '1': 'MTN', '2': 'GLO', '3': 'AIRTEL', '4': '9MOBILE' };
            const selectedNetwork = networks[raw];

            if (!selectedNetwork) {
                return {
                    text: '❌ Invalid choice. Please reply with a number between 1 and 4 for the network:\n\n1. MTN\n2. GLO\n3. AIRTEL\n4. 9MOBILE'
                };
            }

            session.data.network = selectedNetwork;
            session.step = 'ENTER_PHONE';

            return {
                text: `📱 You selected *${selectedNetwork}*.\n\nPlease enter the recipient's phone number:`
            };
        }

        case 'ENTER_PHONE': {
            const cleanPhone = raw.replace(/\s+/g, '');
            if (!/^\d{11}$/.test(cleanPhone)) {
                return {
                    text: '❌ Invalid phone number. Please enter a valid 11-digit Nigerian phone number:'
                };
            }

            session.data.phone = cleanPhone;
            session.step = 'ENTER_AMOUNT';

            return {
                text: `💰 Enter the amount for airtime (e.g., 100 to 50000):`
            };
        }

        case 'ENTER_AMOUNT': {
            const amount = Number(raw);
            if (isNaN(amount) || amount < 50 || amount > 50000) {
                return {
                    text: '❌ Invalid amount. Please enter an amount between ₦50 and ₦50,000:'
                };
            }

            session.data.amount = amount;
            const net = session.data.network;
            const targetPhone = session.data.phone;

            return {
                type: 'READY_FOR_PIN',
                data: {
                    network: net,
                    phone: targetPhone,
                    amount: amount
                }
            };
        }

        default:
            clearAirtimeSession(phone);
            return { text: '❌ Session expired or unknown step. Type 0 for main menu.' };
    }
}

async function executePurchase(userId, sessionData, pin, appUrl) {
    const axios = require('axios');
    const admin = require('firebase-admin');

    const network = sessionData.network;
    const recipientPhone = sessionData.phone;
    const amount = Number(sessionData.amount);

    try {
        // Fetch user token or wallet details if needed for backend API call
        const userSnap = await admin.database().ref('users/' + userId).once('value');
        if (!userSnap.exists()) {
            return { success: false, message: '❌ User account not found.' };
        }
        const userData = userSnap.val();
        const currentBalance = Number(userData.balance || 0);

        if (currentBalance < amount) {
            return { success: false, message: `❌ Insufficient wallet balance. Your balance is ₦${currentBalance.toLocaleString()}. Please fund your wallet.` };
        }

        // Call your internal airtime purchase API endpoint
        const response = await axios.post(`${appUrl}/api/vtu/airtime`, {
            userId: userId,
            network: network.toLowerCase(),
            phone: recipientPhone,
            amount: amount,
            pin: pin
        });

        if (response.data && response.data.success) {
            return {
                success: true,
                message: `✅ *Airtime Purchase Successful!*\n\nNetwork: ${network}\nPhone: ${recipientPhone}\nAmount: ₦${amount.toLocaleString()}\n\nThank you for using Dnezerlinks!`
            };
        } else {
            return {
                success: false,
                message: `❌ Airtime purchase failed: ${response.data?.message || 'Unknown error'}`
            };
        }
    } catch (err) {
        console.error('Airtime Execution Error:', err.response?.data || err.message);
        return {
            success: false,
            message: `❌ Transaction failed: ${err.response?.data?.message || err.message}`
        };
    }
}

module.exports = {
    getAirtimeSession,
    clearAirtimeSession,
    startAirtimeFlow,
    handleAirtimeFlow,
    executePurchase
};
