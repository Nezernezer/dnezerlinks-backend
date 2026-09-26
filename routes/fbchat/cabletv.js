// routes/fbchat/cabletv.js
const axios = require('axios');

// ---- CLEAN LOCAL REQUIRE OF CABLE PLANS ----
let localPlans = {};
try {
    const plansModule = require('./cable_plans');
    localPlans = plansModule.localPlans || plansModule;
    console.log('✅ Cable plans loaded successfully from local folder. Providers:', Object.keys(localPlans || {}));
} catch (err) {
    console.error('❌ CRITICAL: Could not load local cable_plans.js');
    console.error('Error details:', err.stack || err.message);
    localPlans = {};
}

const cableSessions = {};
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

const PROVIDERS = {
    '1': { id: '1', name: 'GOTV' },
    '2': { id: '2', name: 'DSTV' },
    '3': { id: '3', name: 'STARTIMES' },
    '4': { id: '4', name: 'SHOWMAX' },
    gotv: { id: '1', name: 'GOTV' },
    dstv: { id: '2', name: 'DSTV' },
    startimes: { id: '3', name: 'STARTIMES' },
    showmax: { id: '4', name: 'SHOWMAX' }
};

function getCableSession(psid) {
    const session = cableSessions[psid];
    if (!session) return null;
    if (Date.now() - session.lastActive > SESSION_TIMEOUT_MS) {
        delete cableSessions[psid];
        return null;
    }
    session.lastActive = Date.now();
    return session;
}

function clearCableSession(psid) {
    delete cableSessions[psid];
}

function startCableFlow(psid) {
    cableSessions[psid] = {
        step: 'CABLE_PROVIDER',
        data: { service: 'cable' },
        lastActive: Date.now()
    };
    return {
        text:
            '🛰️ Cable TV Subscription\n\n' +
            'Select Provider:\n\n' +
            '1. GOTV\n' +
            '2. DSTV\n' +
            '3. StarTimes\n' +
            '4. Showmax\n\n' +
            'Reply with 1-4 or the provider name.'
    };
}

async function handleCableFlow(psid, text, session, APP_URL) {
    try {
        const input = text.trim();

        // ========== STEP 1: Provider Selection ==========
        if (session.step === 'CABLE_PROVIDER') {
            const key = input.toLowerCase();
            const provider = PROVIDERS[key] || PROVIDERS[input];

            if (!provider) {
                return {
                    text: '❌ Invalid provider. Please reply with 1, 2, 3, 4 or GOTV / DSTV / StarTimes / Showmax:'
                };
            }

            const plans = localPlans[provider.id] || localPlans[Number(provider.id)] || [];

            if (!plans || plans.length === 0) {
                clearCableSession(psid);
                return {
                    text:
                        '❌ No packages available for this provider right now.\n\n' +
                        'Loaded providers: ' + (Object.keys(localPlans || {}).join(', ') || 'none') +
                        '\n\nType "menu" to go back.'
                };
            }

            session.data.providerID = provider.id;
            session.data.providerName = provider.name;
            session.step = 'CABLE_PLAN';
            session.data.plans = plans;

            let msg = 'Provider: ' + provider.name + '\n\nSelect Package:\n\n';
            plans.forEach(function (plan, index) {
                let cleanName = (plan.name || '').split(' - ₦')[0].trim();
                cleanName = cleanName.replace(/₦[\d,]+/g, '').trim();
                let finalPrice = Number(plan.price).toLocaleString();
                msg += (index + 1) + '. ' + cleanName + ' - ₦' + finalPrice + '\n';
            });
            msg += '\nReply with the number of the package.';

            return { text: msg };
        }

        // ========== STEP 2: Plan Selection ==========
        if (session.step === 'CABLE_PLAN') {
            const plans = session.data.plans || [];
            const index = parseInt(input, 10) - 1;

            if (isNaN(index) || index < 0 || index >= plans.length) {
                return {
                    text: '❌ Invalid package choice. Please reply with a valid number from the list:'
                };
            }

            const selectedPlan = plans[index];
            session.data.planID = selectedPlan.id;
            session.data.amount = selectedPlan.price;

            let cleanPlanName = (selectedPlan.name || '').split(' - ₦')[0].trim();
            cleanPlanName = cleanPlanName.replace(/₦[\d,]+/g, '').trim();
            session.data.planName = cleanPlanName;

            session.step = 'CABLE_IUC';
            return {
                text:
                    'Package: ' + cleanPlanName + '\n' +
                    'Amount: ₦' + Number(selectedPlan.price).toLocaleString() + '\n\n' +
                    'Enter IUC / SmartCard Number:'
            };
        }

        // ========== STEP 3: IUC Validation ==========
        if (session.step === 'CABLE_IUC') {
            const iuc = input.replace(/\s+/g, '');
            if (iuc.length < 8) {
                return { text: '❌ Invalid IUC. Please enter a valid SmartCard / IUC number:' };
            }

            session.data.iuc = iuc;

            try {
                const validateRes = await axios.post(
                    APP_URL + '/api/cabletv/validate',
                    {
                        iuc: iuc,
                        providerID: session.data.providerID
                    },
                    { timeout: 25000 }
                );

                if (!validateRes.data || !validateRes.data.success) {
                    return {
                        text:
                            '❌ ' + (validateRes.data.error || 'Invalid IUC/card number.') +
                            '\n\nPlease enter a correct IUC / SmartCard Number:'
                    };
                }

                const customerName = validateRes.data.customerName || 'Customer';
                session.data.customerName = customerName;

                return {
                    type: 'READY_FOR_PIN',
                    data: {
                        service: 'cable',
                        providerID: session.data.providerID,
                        providerName: session.data.providerName,
                        planID: session.data.planID,
                        planName: session.data.planName,
                        amount: session.data.amount,
                        iuc: session.data.iuc,
                        customerName: customerName
                    }
                };
            } catch (validationError) {
                console.error('Cable validation API error:', validationError.message);
                return {
                    text: '❌ Could not verify IUC right now. Please try again or type "menu".'
                };
            }
        }

        clearCableSession(psid);
        return { text: 'Session reset. Type "menu" to start over.' };

    } catch (error) {
        console.error('❌ Critical handleCableFlow error:', error);
        clearCableSession(psid);
        return {
            text: '❌ Something went wrong. Please type "menu" and try again.'
        };
    }
}

module.exports = {
    getCableSession,
    clearCableSession,
    startCableFlow,
    handleCableFlow
};
