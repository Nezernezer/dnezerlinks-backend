const admin = require('firebase-admin');
const crypto = require('crypto');

const electricitySessions = {};

const DISCOS = [
    { id: '1', code: 'IKEDC', name: 'IKEDC (Ikeja)' },
    { id: '2', code: 'EKEDC', name: 'EKEDC (Eko)' },
    { id: '3', code: 'KEDCO', name: 'KEDCO (Kano)' },
    { id: '4', code: 'PHEDC', name: 'PHEDC (Port Harcourt)' },
    { id: '5', code: 'JEDC', name: 'JEDC (Jos)' },
    { id: '6', code: 'IBEDC', name: 'IBEDC (Ibadan)' },
    { id: '7', code: 'KAEDCO', name: 'KAEDCO (Kaduna)' },
    { id: '8', code: 'AEDC', name: 'AEDC (Abuja)' },
    { id: '9', code: 'BEDC', name: 'BEDC (Benin)' },
    { id: '10', code: 'EEDC', name: 'EEDC (Enugu)' },
    { id: '11', code: 'YEDC', name: 'YEDC (Yola)' }
];

function startElectricityFlow(senderPsid) {
    electricitySessions[senderPsid] = {
        step: 'ELECTRICITY_DISCO',
        data: { service: 'electricity' },
        lastActive: Date.now()
    };

    let text = "💡 **Electricity Bill Payment**\n\nSelect your Disco:\n\n";
    DISCOS.forEach(d => {
        text += d.id + ". " + d.name + "\n";
    });
    text += "\nReply with the number (1-11):";

    return { text };
}

function getElectricitySession(senderPsid) {
    return electricitySessions[senderPsid];
}

function clearElectricitySession(senderPsid) {
    delete electricitySessions[senderPsid];
}

async function handleElectricityFlow(senderPsid, text, session) {
    const cleanText = text.trim();

    switch (session.step) {

        // ========== STEP 1: SELECT DISCO ==========
        case 'ELECTRICITY_DISCO':
            const selected = DISCOS.find(d => d.id === cleanText || d.code.toLowerCase() === cleanText.toLowerCase());
            if (!selected) {
                return { text: "❌ Invalid choice. Please reply with a number from 1 to 11." };
            }

            session.data.disco = selected.code;
            session.data.discoName = selected.name;
            session.step = 'ELECTRICITY_METER_TYPE';
            session.lastActive = Date.now();

            return {
                text: "Select Meter Type:\n\n1. Prepaid\n2. Postpaid\n\nReply with 1 or 2:"
            };

        // ========== STEP 2: METER TYPE ==========
        case 'ELECTRICITY_METER_TYPE':
            let meterType = null;
            if (cleanText === '1' || cleanText.toLowerCase() === 'prepaid') {
                meterType = 'Prepaid';
            } else if (cleanText === '2' || cleanText.toLowerCase() === 'postpaid') {
                meterType = 'Postpaid';
            }

            if (!meterType) {
                return { text: "❌ Invalid choice. Reply with 1 (Prepaid) or 2 (Postpaid):" };
            }

            session.data.meterType = meterType;
            session.step = 'ELECTRICITY_METER_NUMBER';
            session.lastActive = Date.now();

            return { text: "🔢 Enter your Meter Number:" };

        // ========== STEP 3: METER NUMBER ==========
        case 'ELECTRICITY_METER_NUMBER':
            if (cleanText.length < 8) {
                return { text: "❌ Meter number seems too short. Please enter a valid meter number:" };
            }

            session.data.meterNumber = cleanText;
            session.step = 'ELECTRICITY_AMOUNT';
            session.lastActive = Date.now();

            return { text: "💵 Enter the amount to pay (Minimum ₦1,000):" };

        // ========== STEP 4: AMOUNT ==========
        case 'ELECTRICITY_AMOUNT':
            const amountNum = parseFloat(cleanText);
            if (isNaN(amountNum) || amountNum < 1000) {
                return { text: "❌ Invalid amount. Minimum electricity payment is ₦1,000. Please enter a valid amount:" };
            }

            session.data.amount = amountNum;
            // We will handle the final step (PIN link) in controlroom.js
            return { step: 'READY_FOR_PIN' };

        default:
            clearElectricitySession(senderPsid);
            return { text: "Session expired. Type 'menu' to restart." };
    }
}

module.exports = {
    startElectricityFlow,
    handleElectricityFlow,
    getElectricitySession,
    clearElectricitySession,
    DISCOS
};
