// routes/fbchat/exampin.js
const axios = require('axios');

const examSessions = {};
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

const EXAMS = [
    { key: 'waec',    label: 'WAEC PIN',           price: 3500 },
    { key: 'neco',    label: 'NECO PIN',           price: 1200 },
    { key: 'nabteb',  label: 'NABTEB PIN',         price: 1500 },
    { key: 'jamb',    label: 'JAMB PIN',           price: 4500 },
    { key: 'waecreg', label: 'WAEC Registration',  price: 18000 },
    { key: 'nbais',   label: 'NBAIS PIN',          price: 3500 }
];

function getExamSession(psid) {
    const session = examSessions[psid];
    if (!session) return null;
    if (Date.now() - session.lastActive > SESSION_TIMEOUT_MS) {
        delete examSessions[psid];
        return null;
    }
    session.lastActive = Date.now();
    return session;
}

function clearExamSession(psid) {
    delete examSessions[psid];
}

function startExamFlow(psid) {
    examSessions[psid] = {
        step: 'EXAM_TYPE',
        data: { service: 'exampin' },
        lastActive: Date.now()
    };

    let msg = '📝 Exam PIN Purchase\n\nSelect Exam:\n\n';
    EXAMS.forEach(function (e, i) {
        msg += (i + 1) + '. ' + e.label + ' - ₦' + e.price.toLocaleString() + '\n';
    });
    msg += '\nReply with 1-6.';
    return { text: msg };
}

async function handleExamFlow(psid, text, session) {
    try {
        const input = text.trim();

        if (session.step === 'EXAM_TYPE') {
            const idx = parseInt(input, 10) - 1;
            let selected = null;

            if (!isNaN(idx) && idx >= 0 && idx < EXAMS.length) {
                selected = EXAMS[idx];
            } else {
                selected = EXAMS.find(function (e) {
                    return e.key === input.toLowerCase() || e.label.toLowerCase().indexOf(input.toLowerCase()) !== -1;
                });
            }

            if (!selected) {
                return { text: '❌ Invalid selection. Reply with 1-6.' };
            }

            session.data.examType = selected.key;
            session.data.examLabel = selected.label;
            session.data.unitPrice = selected.price;
            session.step = 'EXAM_QTY';

            return {
                text:
                    'Exam: ' + selected.label + '\n' +
                    'Unit Price: ₦' + selected.price.toLocaleString() + '\n\n' +
                    'Enter quantity (1-5):'
            };
        }

        if (session.step === 'EXAM_QTY') {
            const qty = parseInt(input, 10);
            if (isNaN(qty) || qty < 1 || qty > 5) {
                return { text: '❌ Invalid quantity. Enter a number between 1 and 5:' };
            }

            session.data.quantity = qty;
            session.data.amount = session.data.unitPrice * qty;

            return {
                type: 'READY_FOR_PIN',
                data: {
                    service: 'exampin',
                    examType: session.data.examType,
                    examLabel: session.data.examLabel,
                    quantity: qty,
                    amount: session.data.amount
                }
            };
        }

        clearExamSession(psid);
        return { text: 'Session reset. Type "menu" to start over.' };
    } catch (err) {
        console.error('handleExamFlow error:', err);
        clearExamSession(psid);
        return { text: '❌ Something went wrong. Type "menu" and try again.' };
    }
}

/**
 * Execute exam PIN purchase after PIN is verified
 */
async function executePurchase(userId, sessionData, pin, APP_URL) {
    const { examType, examLabel, quantity, amount } = sessionData;

    try {
        const response = await axios.post(APP_URL + '/api/exampin/buy', {
            uid: userId,
            examType,
            quantity,
            pin
        }, { timeout: 55000 });

        if (response.data && response.data.success) {
            let msg =
                '✅ Exam PIN Purchase Successful!\n\n' +
                'Exam: ' + (examLabel || examType) + '\n' +
                'Quantity: ' + quantity + '\n' +
                'Amount: ₦' + Number(amount).toLocaleString() + '\n\n' +
                'PIN: ' + (response.data.pin || 'N/A') + '\n' +
                'Serial: ' + (response.data.serial || 'N/A') + '\n\n' +
                'Save this message securely.';
            return { success: true, message: msg };
        }
        return {
            success: false,
            message: '❌ Exam PIN Failed: ' + (response.data?.error || 'Unknown error')
        };
    } catch (err) {
        return {
            success: false,
            message: '❌ Exam PIN Failed: ' + (err.response?.data?.error || err.message)
        };
    }
}

module.exports = {
    getExamSession,
    clearExamSession,
    startExamFlow,
    handleExamFlow,
    executePurchase
};
