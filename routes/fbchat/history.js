// routes/fbchat/history.js
const admin = require('firebase-admin');

const HISTORY_LIMIT = 10; // show last 10 in chat (Messenger message length limit)

async function getLinkedUserId(psid) {
    try {
        const linkSnap = await admin.database().ref('messenger_links/' + psid).once('value');
        if (linkSnap.exists() && linkSnap.val().userId) {
            return linkSnap.val().userId;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function formatDate(timestamp, fallBackDateString) {
    if (timestamp && !isNaN(timestamp) && Number(timestamp) > 0) {
        const d = new Date(Number(timestamp));
        if (!isNaN(d.getTime())) {
            return d.toLocaleString('en-NG', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }
    }
    return fallBackDateString || 'Recently';
}

function parseMeta(tx) {
    try {
        const desc = String(tx.description || tx.desc || '').toUpperCase();
        const serviceNode = String(tx.service || '').toUpperCase();
        const typeNode = String(tx.type || '').toUpperCase();

        let data = {
            service: 'Transaction',
            network: '',
            phone: tx.target_details || tx.targetDetails || tx.recipientName ||
                   tx.senderName || tx.phone || tx.mobile_number || tx.number ||
                   tx.iuc || tx.meterNumber || 'N/A',
            type: (typeNode === 'CREDIT' || tx.type === 'credit') ? 'Credit' : 'Debit'
        };

        if (
            typeNode === 'EXAM PIN' ||
            serviceNode.includes('WAEC') || serviceNode.includes('NECO') ||
            serviceNode.includes('NABTEB') || serviceNode.includes('JAMB') ||
            desc.includes('EXAM PIN') || desc.includes('WAEC') || desc.includes('NECO')
        ) {
            data.service = 'Exam PIN';
        } else if (typeNode === 'RECHARGE PIN' || serviceNode.includes('PIN') || desc.includes('VOUCHER')) {
            data.service = 'Recharge PIN';
        } else if (desc.includes('AIRTIME') || serviceNode.includes('AIRTIME')) {
            data.service = 'Airtime';
        } else if (desc.includes('DATA') || serviceNode.includes('DATA')) {
            data.service = 'Data';
        } else if (serviceNode.includes('CABLE') || desc.includes('CABLE') || desc.includes('GOTV') || desc.includes('DSTV')) {
            data.service = 'Cable TV';
        } else if (serviceNode.includes('ELECTRIC') || desc.includes('ELECTRIC') || desc.includes('METER')) {
            data.service = 'Electricity';
        } else if (desc.includes('SMS') || serviceNode.includes('SMS')) {
            data.service = 'Bulk SMS';
        } else if (data.type === 'Credit' || desc.includes('WALLET') || desc.includes('FUNDED') || desc.includes('DEPOSIT')) {
            data.service = 'Wallet Funding';
            data.type = 'Credit';
        } else if (serviceNode) {
            data.service = tx.service;
        }

        if (serviceNode.includes('MTN') || desc.includes('MTN') || tx.network === '1' || tx.network === 1) data.network = 'MTN';
        else if (serviceNode.includes('GLO') || desc.includes('GLO') || tx.network === '2' || tx.network === 2) data.network = 'GLO';
        else if (serviceNode.includes('9MOBILE') || desc.includes('9MOBILE') || tx.network === '3') data.network = '9MOBILE';
        else if (serviceNode.includes('AIRTEL') || desc.includes('AIRTEL') || tx.network === '4') data.network = 'AIRTEL';

        return data;
    } catch (e) {
        return { service: 'Transaction', network: '', phone: 'N/A', type: 'Debit' };
    }
}

async function getTransactionHistory(psid) {
    try {
        const userId = await getLinkedUserId(psid);

        if (!userId) {
            return {
                text:
                    '❌ Your Messenger is not linked to any account.\n\n' +
                    'Please login (option 1) or create an account (option 2) first.'
            };
        }

        const snap = await admin.database().ref('transactions/' + userId).once('value');

        if (!snap.exists()) {
            return {
                text:
                    '📜 Transaction History\n\n' +
                    'No transactions found yet.\n\n' +
                    'Type "menu" to go back.'
            };
        }

        const records = [];
        snap.forEach(function (child) {
            const val = child.val();
            if (!val) return;

            let sortTime = 0;
            if (val.timestamp && !isNaN(val.timestamp)) {
                sortTime = Number(val.timestamp);
            } else if (val.date) {
                const parsed = new Date(val.date);
                sortTime = isNaN(parsed.getTime()) ? 0 : parsed.getTime();
            }

            records.push({
                id: child.key,
                ...val,
                sortTime: sortTime
            });
        });

        records.sort(function (a, b) {
            return b.sortTime - a.sortTime;
        });

        const recent = records.slice(0, HISTORY_LIMIT);

        let msg = '📜 *Transaction History*\n';
        msg += '(Showing last ' + recent.length + ' of ' + records.length + ')\n\n';

        recent.forEach(function (tx, i) {
            const meta = parseMeta(tx);
            const isCredit = meta.type === 'Credit';
            const sign = isCredit ? '+' : '-';
            const amount = sign + '₦' + Number(tx.amount || 0).toLocaleString();
            const status = String(tx.status || 'successful').toUpperCase();
            const dateStr = formatDate(tx.timestamp, tx.date);

            msg += (i + 1) + '. ' + meta.service + '\n';
            msg += '   ' + amount + ' | ' + status + '\n';
            if (meta.network) msg += '   Network: ' + meta.network + '\n';
            if (meta.phone && meta.phone !== 'N/A') msg += '   Target: ' + meta.phone + '\n';
            msg += '   Date: ' + dateStr + '\n';
            if (tx.reference) msg += '   Ref: ' + String(tx.reference).substring(0, 20) + '\n';
            msg += '\n';
        });

        msg += 'Type "menu" to go back.\n';
        msg += 'For full history & receipts, use the web dashboard.';

        return { text: msg };
    } catch (err) {
        console.error('History error:', err);
        return {
            text: '❌ Unable to load transaction history right now. Please try again later.'
        };
    }
}

module.exports = {
    getTransactionHistory
};
