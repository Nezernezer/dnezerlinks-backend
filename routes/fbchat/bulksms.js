const admin = require('firebase-admin');

const bulksmsSessions = {};

function startBulkSmsFlow(senderPsid) {
    bulksmsSessions[senderPsid] = {
        step: 'BULKSMS_SENDER',
        data: { service: 'bulksms' },
        lastActive: Date.now()
    };
    return {
        text: "📨 **Bulk SMS**\n\nEnter your **Sender ID** (max 11 characters):\n\nExample: JOHNDOE"
    };
}

function getBulkSmsSession(senderPsid) {
    return bulksmsSessions[senderPsid];
}

function clearBulkSmsSession(senderPsid) {
    delete bulksmsSessions[senderPsid];
}

function isUnicode(text) {
    const gsm7bitRegExp = /^[\x20-\x7E\xA1\xA3\xA4\xA5\xA7\xBF\xC4\xC5\xC6\xC7\xC9\xD1\xD2\xD3\xD4\xD5\xD6\xD8\xDC\xDF\xE0\xE1\xE2\xE3\xE4\xE5\xE6\xE7\xE8\xE9\xEA\xEB\xEC\xED\xEE\xEF\xF1\xF2\xF3\xF4\xF5\xF6\xF8\xF9\xFA\xFB\xFC\xFE\xDF\r\n]*$/;
    return !gsm7bitRegExp.test(text);
}

function calculateCost(message, recipients) {
    const unicode = isUnicode(message);
    const charsPerPage = unicode ? 70 : 160;
    const pages = message.length === 0 ? 0 : Math.ceil(message.length / charsPerPage);

    // Lagos time
    const lagosHour = parseInt(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'Africa/Lagos',
            hour: 'numeric',
            hour12: false
        }).format(new Date()),
        10
    );

    const ratePerPage = (lagosHour >= 8 && lagosHour < 20) ? 7 : 14;
    const totalRecipients = recipients.split(',').filter(n => n.trim().length >= 10).length;

    const totalCost = pages * ratePerPage * (totalRecipients || 1);

    return {
        pages,
        ratePerPage,
        totalRecipients,
        totalCost,
        encoding: unicode ? 'Unicode' : 'GSM'
    };
}

async function handleBulkSmsFlow(senderPsid, text, session) {
    const cleanText = text.trim();

    switch (session.step) {

        // ========== 1. SENDER ID ==========
        case 'BULKSMS_SENDER':
            if (cleanText.length === 0 || cleanText.length > 11) {
                return { text: "❌ Sender ID must be between 1 and 11 characters. Please try again:" };
            }

            session.data.senderName = cleanText.substring(0, 11);
            session.step = 'BULKSMS_RECIPIENTS';
            session.lastActive = Date.now();

            return {
                text: "📱 Enter recipient phone number(s).\n\nYou can send to multiple numbers by separating them with commas.\n\nExample:\n08012345678,07098765432"
            };

        // ========== 2. RECIPIENTS ==========
        case 'BULKSMS_RECIPIENTS':
            const numbers = cleanText.split(',').map(n => n.trim()).filter(n => n.length >= 10);

            if (numbers.length === 0) {
                return { text: "❌ No valid phone numbers found. Please enter at least one valid number:" };
            }

            session.data.recipients = numbers.join(',');
            session.data.recipientCount = numbers.length;
            session.step = 'BULKSMS_MESSAGE';
            session.lastActive = Date.now();

            return {
                text: `✅ ${numbers.length} recipient(s) accepted.\n\n✏️ Now type your message:`
            };

        // ========== 3. MESSAGE ==========
        case 'BULKSMS_MESSAGE':
            if (cleanText.length === 0) {
                return { text: "❌ Message cannot be empty. Please type your message:" };
            }

            session.data.message = cleanText;

            const costInfo = calculateCost(cleanText, session.data.recipients);

            session.data.pages = costInfo.pages;
            session.data.rate = costInfo.ratePerPage;
            session.data.totalCost = costInfo.totalCost;
            session.data.encoding = costInfo.encoding;

            // Ready for PIN
            return {
                step: 'READY_FOR_PIN',
                data: {
                    senderName: session.data.senderName,
                    recipients: session.data.recipients,
                    recipientCount: session.data.recipientCount,
                    message: session.data.message,
                    pages: costInfo.pages,
                    rate: costInfo.ratePerPage,
                    totalCost: costInfo.totalCost,
                    encoding: costInfo.encoding
                }
            };

        default:
            clearBulkSmsSession(senderPsid);
            return { text: "Session expired. Type 'menu' to restart." };
    }
}

module.exports = {
    startBulkSmsFlow,
    handleBulkSmsFlow,
    getBulkSmsSession,
    clearBulkSmsSession,
    calculateCost
};
