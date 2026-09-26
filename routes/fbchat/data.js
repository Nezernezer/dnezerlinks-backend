// routes/fbchat/data.js
const path = require('path');

// ---- SAFE LOAD OF PLANS ----
let groupedPlans = {};
try {
    const plansModule = require('../../public/data/plans');
    groupedPlans = plansModule.groupedPlans || plansModule || {};
    console.log('✅ Plans loaded successfully. Networks:', Object.keys(groupedPlans));
} catch (err1) {
    try {
        const plansModule = require(path.join(__dirname, '../../public/data/plans'));
        groupedPlans = plansModule.groupedPlans || plansModule || {};
        console.log('✅ Plans loaded via fallback path. Networks:', Object.keys(groupedPlans));
    } catch (err2) {
        console.error('❌ CRITICAL: Could not load plans.js');
        console.error('Error 1:', err1.message);
        console.error('Error 2:', err2.message);
        groupedPlans = {};
    }
}

const dataSessions = {};
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

const NETWORK_MAP = {
    '1': 'mtn',
    '2': 'glo',
    '3': '9mobile',
    '4': 'airtel',
    mtn: 'mtn',
    glo: 'glo',
    '9mobile': '9mobile',
    airtel: 'airtel'
};

const NETWORK_ID_MAP = {
    mtn: '1',
    glo: '2',
    '9mobile': '3',
    airtel: '4'
};

function getDataSession(psid) {
    const session = dataSessions[psid];
    if (!session) return null;
    if (Date.now() - session.lastActive > SESSION_TIMEOUT_MS) {
        delete dataSessions[psid];
        return null;
    }
    session.lastActive = Date.now();
    return session;
}

function clearDataSession(psid) {
    delete dataSessions[psid];
}

function startDataFlow(psid) {
    dataSessions[psid] = {
        step: 'DATA_PHONE',
        data: { service: 'data' },
        lastActive: Date.now()
    };
    return {
        text: '📶 Data Subscription\n\nEnter the phone number to receive data:'
    };
}

async function handleDataFlow(psid, text, session) {
    try {
        const input = text.trim();

        // ========== STEP 1: Phone ==========
        if (session.step === 'DATA_PHONE') {
            let phone = input.replace(/\D/g, '');
            if (phone.length < 10 || phone.length > 14) {
                return { text: '❌ Invalid phone number. Please enter a valid Nigerian number (e.g. 08123456789):' };
            }
            if (!phone.startsWith('0') && phone.length === 10) {
                phone = '0' + phone;
            }
            session.data.phone = phone;
            session.step = 'DATA_NETWORK';
            return {
                text:
                    'Select Network:\n\n' +
                    '1. MTN\n' +
                    '2. Glo\n' +
                    '3. 9mobile\n' +
                    '4. Airtel\n\n' +
                    'Reply with 1-4 or the network name.'
            };
        }

        // ========== STEP 2: Network ==========
        if (session.step === 'DATA_NETWORK') {
            const key = input.toLowerCase();
            const network = NETWORK_MAP[key] || NETWORK_MAP[input];

            if (!network) {
                return {
                    text: '❌ Invalid network. Please reply with 1, 2, 3, 4 or MTN / Glo / 9mobile / Airtel:'
                };
            }

            if (!groupedPlans || !groupedPlans[network]) {
                console.error('No plans found for network:', network);
                console.error('Available networks:', Object.keys(groupedPlans || {}));
                clearDataSession(psid);
                return {
                    text: '❌ Data plans are currently unavailable. Please try again later or contact support.\n\nType "menu" to go back.'
                };
            }

            session.data.network = network;
            session.step = 'DATA_TYPE';

            const categories = Object.keys(groupedPlans[network]);

            if (categories.length === 0) {
                clearDataSession(psid);
                return { text: '❌ No data plans available for this network right now.' };
            }

            let msg = 'Network: ' + network.toUpperCase() + '\n\nSelect Data Type:\n\n';
            categories.forEach(function (cat, i) {
                msg += (i + 1) + '. ' + cat + '\n';
            });
            msg += '\nReply with the number of the data type.';

            session.data.categories = categories;
            return { text: msg };
        }

        // ========== STEP 3: Data Type ==========
        if (session.step === 'DATA_TYPE') {
            const categories = session.data.categories || [];
            const idx = parseInt(input, 10) - 1;

            let selectedCategory = null;
            if (!isNaN(idx) && idx >= 0 && idx < categories.length) {
                selectedCategory = categories[idx];
            } else {
                selectedCategory = categories.find(function (c) {
                    return c.toLowerCase() === input.toLowerCase();
                });
            }

            if (!selectedCategory) {
                return {
                    text: '❌ Invalid selection. Please reply with a valid number from the list:'
                };
            }

            session.data.dataType = selectedCategory;
            session.step = 'DATA_PLAN';

            const plans = (groupedPlans[session.data.network] &&
                           groupedPlans[session.data.network][selectedCategory]) || [];

            if (plans.length === 0) {
                clearDataSession(psid);
                return { text: '❌ No plans found in this category.' };
            }

            let msg = 'Data Type: ' + selectedCategory + '\n\nSelect Plan:\n\n';
            plans.forEach(function (plan, i) {
                // Remove original price from the name
                var cleanName = (plan.name || '').split(' - ₦')[0].trim();
                var finalPrice = Number(plan.price).toLocaleString();
                msg += (i + 1) + '. ' + cleanName + ' - ₦' + finalPrice + '\n';
            });
            msg += '\nReply with the number of the plan.';

            session.data.plans = plans;
            return { text: msg };
        }

        // ========== STEP 4: Data Plan ==========
        if (session.step === 'DATA_PLAN') {
            const plans = session.data.plans || [];
            const idx = parseInt(input, 10) - 1;

            if (isNaN(idx) || idx < 0 || idx >= plans.length) {
                return {
                    text: '❌ Invalid plan. Please reply with a valid number from the list:'
                };
            }

            const selectedPlan = plans[idx];

            // Clean name only (no original price)
            const cleanPlanName = (selectedPlan.name || '').split(' - ₦')[0].trim();

            return {
                type: 'READY_FOR_PIN',
                data: {
                    service: 'data',
                    phone: session.data.phone,
                    network: session.data.network,
                    networkID: NETWORK_ID_MAP[session.data.network],
                    planId: selectedPlan.id,
                    amount: selectedPlan.price,          // final price with profit
                    planName: cleanPlanName              // clean name only
                }
            };
        }

        // Fallback
        clearDataSession(psid);
        return { text: 'Session reset. Type "menu" to start over.' };

    } catch (err) {
        console.error('❌ handleDataFlow error:', err);
        clearDataSession(psid);
        return {
            text: '❌ Something went wrong while processing your request. Please type "menu" and try again.'
        };
    }
}

module.exports = {
    getDataSession,
    clearDataSession,
    startDataFlow,
    handleDataFlow,
    NETWORK_ID_MAP
};
