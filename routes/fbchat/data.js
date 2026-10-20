// routes/fbchat/data.js
const path = require('path');
const axios = require('axios');

// ---- SAFE LOAD OF PLANS ----
let groupedPlans = {};
let extractDuration = null;

try {
    const plansModule = require('../../public/data/plans');
    groupedPlans = plansModule.groupedPlans || {};
    extractDuration = plansModule.extractDuration;
    console.log('✅ Plans loaded successfully. Networks:', Object.keys(groupedPlans));
} catch (err1) {
    try {
        const plansModule = require(path.join(__dirname, '../../public/data/plans'));
        groupedPlans = plansModule.groupedPlans || {};
        extractDuration = plansModule.extractDuration;
        console.log('✅ Plans loaded via fallback path. Networks:', Object.keys(groupedPlans));
    } catch (err2) {
        console.error('❌ CRITICAL: Could not load plans.js');
        console.error('Error 1:', err1.message);
        console.error('Error 2:', err2.message);
        groupedPlans = {};
    }
}

// Fallback extractDuration (in case plans.js doesn't export it)
if (typeof extractDuration !== 'function') {
    extractDuration = function (name) {
        const matches = name.match(/\((\d+\s*Days?)\)/gi);
        if (matches && matches.length > 0) {
            return matches[matches.length - 1]
                .replace(/[()]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }
        if (/weekly/i.test(name)) return '7 Days';
        if (/monthly/i.test(name)) return '30 Days';
        if (/2-Month/i.test(name)) return '60 Days';
        if (/3-Month/i.test(name)) return '90 Days';
        if (/365 Days|1 Year/i.test(name)) return '365 Days';
        if (/120 Days/i.test(name)) return '120 Days';
        return 'Other';
    };
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

        // ===== STEP 1: Phone =====
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

        // ===== STEP 2: Network → show durations =====
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
                clearDataSession(psid);
                return {
                    text: '❌ Data plans are currently unavailable. Please try again later or contact support.\n\nType "menu" to go back.'
                };
            }

            session.data.network = network;
            session.step = 'DATA_DURATION';

            // Collect unique durations
            const durationSet = {};
            Object.values(groupedPlans[network]).forEach(plans => {
                plans.forEach(plan => {
                    const dur = extractDuration(plan.name);
                    durationSet[dur] = true;
                });
            });

            const durations = Object.keys(durationSet).sort((a, b) => {
                return (parseInt(a) || 999) - (parseInt(b) || 999);
            });

            if (durations.length === 0) {
                clearDataSession(psid);
                return { text: '❌ No data plans available for this network right now.' };
            }

            let msg = 'Network: ' + network.toUpperCase() + '\n\nSelect Duration:\n\n';
            durations.forEach((d, i) => {
                msg += (i + 1) + '. ' + d + '\n';
            });
            msg += '\nReply with the number of the duration.';

            session.data.durations = durations;
            return { text: msg };
        }

        // ===== STEP 3: Duration → show plans =====
        if (session.step === 'DATA_DURATION') {
            const durations = session.data.durations || [];
            const idx = parseInt(input, 10) - 1;

            let selectedDuration = null;
            if (!isNaN(idx) && idx >= 0 && idx < durations.length) {
                selectedDuration = durations[idx];
            } else {
                selectedDuration = durations.find(d => d.toLowerCase() === input.toLowerCase());
            }

            if (!selectedDuration) {
                return { text: '❌ Invalid selection. Please reply with a valid number from the list:' };
            }

            session.data.duration = selectedDuration;
            session.step = 'DATA_PLAN';

            // Collect all plans that match this duration (across all categories)
            let matching = [];
            Object.values(groupedPlans[session.data.network]).forEach(plans => {
                plans.forEach(plan => {
                    if (extractDuration(plan.name) === selectedDuration) {
                        matching.push(plan);
                    }
                });
            });

            // Sort by price
            matching.sort((a, b) => a.price - b.price);

            if (matching.length === 0) {
                clearDataSession(psid);
                return { text: '❌ No plans found for this duration.' };
            }

            let msg = 'Duration: ' + selectedDuration + '\n\nSelect Plan:\n\n';
            matching.forEach((plan, i) => {
                const cleanName = (plan.name || '').split(' - ₦')[0].trim();
                const category = plan.category || '';
                const finalPrice = Number(plan.price).toLocaleString();
                // Format: 1.5GB (3 Days) Corporate - ₦1,620
                msg += (i + 1) + '. ' + cleanName + ' ' + category + ' - ₦' + finalPrice + '\n';
            });
            msg += '\nReply with the number of the plan.';

            session.data.plans = matching;
            return { text: msg };
        }

        // ===== STEP 4: Plan selected =====
        if (session.step === 'DATA_PLAN') {
            const plans = session.data.plans || [];
            const idx = parseInt(input, 10) - 1;

            if (isNaN(idx) || idx < 0 || idx >= plans.length) {
                return { text: '❌ Invalid plan. Please reply with a valid number from the list:' };
            }

            const selectedPlan = plans[idx];
            const cleanPlanName = (selectedPlan.name || '').split(' - ₦')[0].trim();
            const category = selectedPlan.category || '';

            return {
                type: 'READY_FOR_PIN',
                data: {
                    service: 'data',
                    phone: session.data.phone,
                    network: session.data.network,
                    networkID: NETWORK_ID_MAP[session.data.network],
                    planId: selectedPlan.id,
                    amount: selectedPlan.price,
                    planName: cleanPlanName + (category ? ' ' + category : '')
                }
            };
        }

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

/**
 * Execute data purchase after PIN is verified
 */
async function executePurchase(userId, sessionData, pin, APP_URL) {
    const { phone, network, networkID, planId, amount, planName } = sessionData;
    const parsedAmount = parseFloat(amount);
    const finalNetworkID = networkID || NETWORK_ID_MAP[(network || '').toLowerCase()] || network;

    try {
        const response = await axios.post(APP_URL + '/api/data/buy', {
            uid: userId,
            phone,
            dataPlan: planId,
            networkID: String(finalNetworkID),
            amount: parsedAmount,
            pin
        }, { timeout: 55000 });

        if (response.data && response.data.success) {
            return {
                success: true,
                message:
                    '✅ Data Purchase Successful!\n\n' +
                    'Network: ' + (network || '').toUpperCase() + '\n' +
                    'Phone: ' + phone + '\n' +
                    'Plan: ' + (planName || planId) + '\n' +
                    'Amount: ₦' + parsedAmount.toLocaleString()
            };
        }
        return {
            success: false,
            message: '❌ Data Failed: ' + (response.data?.error || 'Unknown error')
        };
    } catch (err) {
        return {
            success: false,
            message: '❌ Data Failed: ' + (err.response?.data?.error || err.message)
        };
    }
}

module.exports = {
    getDataSession,
    clearDataSession,
    startDataFlow,
    handleDataFlow,
    executePurchase,
    NETWORK_ID_MAP
};
