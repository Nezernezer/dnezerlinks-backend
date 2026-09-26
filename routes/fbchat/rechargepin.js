// routes/fbchat/rechargepin.js
const pinSessions = {};
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

const NETWORKS = ['MTN', 'GLO', 'AIRTEL', '9MOBILE'];
const DENOMINATIONS = [100, 200, 500, 1000];

function getRechargePinSession(psid) {
    const session = pinSessions[psid];
    if (!session) return null;
    if (Date.now() - session.lastActive > SESSION_TIMEOUT_MS) {
        delete pinSessions[psid];
        return null;
    }
    session.lastActive = Date.now();
    return session;
}

function clearRechargePinSession(psid) {
    delete pinSessions[psid];
}

function startRechargePinFlow(psid) {
    pinSessions[psid] = {
        step: 'RPIN_NETWORK',
        data: { service: 'rechargepin' },
        lastActive: Date.now()
    };

    return {
        text:
            '🎫 Recharge PIN\n\nSelect Network:\n\n' +
            '1. MTN\n' +
            '2. GLO\n' +
            '3. AIRTEL\n' +
            '4. 9MOBILE\n\n' +
            'Reply with 1-4.'
    };
}

async function handleRechargePinFlow(psid, text, session) {
    try {
        const input = text.trim();

        // STEP 1: Network
        if (session.step === 'RPIN_NETWORK') {
            const idx = parseInt(input, 10) - 1;
            let network = null;

            if (!isNaN(idx) && idx >= 0 && idx < NETWORKS.length) {
                network = NETWORKS[idx];
            } else {
                network = NETWORKS.find(function (n) {
                    return n.toLowerCase() === input.toLowerCase();
                });
            }

            if (!network) {
                return { text: '❌ Invalid network. Reply with 1-4 or MTN/GLO/AIRTEL/9MOBILE:' };
            }

            session.data.network = network;
            session.step = 'RPIN_AMOUNT';

            let msg = 'Network: ' + network + '\n\nSelect Denomination:\n\n';
            DENOMINATIONS.forEach(function (d, i) {
                msg += (i + 1) + '. ₦' + d + '\n';
            });
            msg += '\nReply with 1-4.';
            return { text: msg };
        }

        // STEP 2: Amount
        if (session.step === 'RPIN_AMOUNT') {
            const idx = parseInt(input, 10) - 1;
            let amount = null;

            if (!isNaN(idx) && idx >= 0 && idx < DENOMINATIONS.length) {
                amount = DENOMINATIONS[idx];
            } else {
                amount = DENOMINATIONS.find(function (d) {
                    return String(d) === input;
                });
            }

            if (!amount) {
                return { text: '❌ Invalid amount. Reply with 1-4 or 100/200/500/1000:' };
            }

            session.data.amount = amount;
            session.step = 'RPIN_QTY';

            return {
                text:
                    'Network: ' + session.data.network + '\n' +
                    'Denomination: ₦' + amount + '\n\n' +
                    'Enter quantity (1-50):'
            };
        }

        // STEP 3: Quantity
        if (session.step === 'RPIN_QTY') {
            const qty = parseInt(input, 10);
            if (isNaN(qty) || qty < 1 || qty > 50) {
                return { text: '❌ Invalid quantity. Enter a number between 1 and 50:' };
            }

            session.data.qty = qty;
            session.data.totalCost = session.data.amount * qty;
            session.step = 'RPIN_BRAND';

            return {
                text:
                    'Total: ₦' + session.data.totalCost.toLocaleString() + '\n\n' +
                    'Enter brand name for the voucher (or type "skip" for default "Dnezerlinks"):'
            };
        }

        // STEP 4: Brand name
        if (session.step === 'RPIN_BRAND') {
            let brand = input;
            if (brand.toLowerCase() === 'skip' || brand === '') {
                brand = 'Dnezerlinks';
            }
            if (brand.length > 25) brand = brand.substring(0, 25);

            session.data.brandName = brand;

            return {
                type: 'READY_FOR_PIN',
                data: {
                    service: 'rechargepin',
                    network: session.data.network,
                    amount: session.data.amount,
                    qty: session.data.qty,
                    totalCost: session.data.totalCost,
                    brandName: brand
                }
            };
        }

        clearRechargePinSession(psid);
        return { text: 'Session reset. Type "menu" to start over.' };
    } catch (err) {
        console.error('handleRechargePinFlow error:', err);
        clearRechargePinSession(psid);
        return { text: '❌ Something went wrong. Type "menu" and try again.' };
    }
}

module.exports = {
    getRechargePinSession,
    clearRechargePinSession,
    startRechargePinFlow,
    handleRechargePinFlow
};
