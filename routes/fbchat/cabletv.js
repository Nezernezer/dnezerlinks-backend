// routes/fbchat/cabletv.js
const path = require('path');
const axios = require('axios');
const fs = require('fs');

// ---- SAFE LOAD OF CABLE PLANS ----
let localPlans = {};

function tryLoadPlans() {
    const possiblePaths = [
        path.join(__dirname, '../../public/cable/cable_plans.js'),
        path.join(__dirname, '../../../public/cable/cable_plans.js'),
        path.join(process.cwd(), 'public/cable/cable_plans.js'),
        path.join(process.cwd(), 'routes/../public/cable/cable_plans.js')
    ];

    for (let i = 0; i < possiblePaths.length; i++) {
        const p = possiblePaths[i];
        try {
            if (fs.existsSync(p)) {
                // Clear cache so we always get fresh data
                delete require.cache[require.resolve(p)];
                const mod = require(p);
                const plans = mod.localPlans || mod || {};
                if (plans && (plans['1'] || plans['2'] || plans[1] || plans[2])) {
                    console.log('✅ Cable plans loaded from:', p);
                    console.log('   Providers found:', Object.keys(plans));
                    return plans;
                }
            }
        } catch (e) {
            console.log('⚠️ Failed path', p, '→', e.message);
        }
    }
    return null;
}

localPlans = tryLoadPlans() || {};

if (!Object.keys(localPlans).length) {
    console.error('❌ CRITICAL: cable_plans.js could not be loaded. Check file location and module.exports');
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

        // ========== STEP 1: Provider ==========
        if (session.step === 'CABLE_PROVIDER') {
            const key = input.toLowerCase();
            const provider = PROVIDERS[key] || PROVIDERS[input];

            if (!provider) {
                return {
                    text: '❌ Invalid provider. Please reply with 1, 2, 3, 4 or GOTV / DSTV / StarTimes / Showmax:'
                };
            }

            // Support both string and number keys
            const plans = localPlans[provider.id] || localPlans[Number(provider.id)] || [];

            console.log('Selected provider:', provider.id, '→ plans found:', plans.length);

            if (!plans || plans.length === 0) {
                clearCableSession(psid);
                return {
                    text:
                        '❌ No packages available for this provider right now.\n\n' +
                        'Available providers in system: ' + (Object.keys(localPlans).join(', ') || 'none') +
                        '\n\nType "menu" to go back.'
                };
            }

            session.data.providerID = provider.id;
            session.data.providerName = provider.name;
            session.step = 'CABLE_PLAN';
            session.data.plans = plans;

            let msg = 'Provider: ' + provider.name + '\n\nSelect Package:\n\n';
            plans.forEach(function (plan, i) {
                var cleanName = (plan.name || '').split(' - ₦')[0].trim();
                cleanName = cleanName.replace(/₦[\d,]+/g, '').trim();
                var finalPrice = Number(plan.price).toLocaleString();
                msg += (i + 1) + '. ' + cleanName + ' - ₦' + finalPrice + '\n';
            });
            msg += '\nReply with the number of the package.';

            return { text: msg };
        }

        // ========== STEP 2: Plan ==========
        if (session.step === 'CABLE_PLAN') {
            const plans = session.data.plans || [];
            const idx = parseInt(input, 10) - 1;

            if (isNaN(idx) || idx < 0 || idx >= plans.length) {
                return {
                    text: '❌ Invalid package. Please reply with a valid number from the list:'
                };
            }

            const selectedPlan = plans[idx];
            session.data.planID = selectedPlan.id;
            session.data.amount = selectedPlan.price;

            var cleanPlanName = (selectedPlan.name || '').split(' - ₦')[0].trim();
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

        // ========== STEP 3: IUC + Validate ==========
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
            } catch (valErr) {
                console.error('Cable validate error:', valErr.message);
                return {
                    text: '❌ Could not verify IUC right now. Please try again or type "menu".'
                };
            }
        }

        clearCableSession(psid);
        return { text: 'Session reset. Type "menu" to start over.' };

    } catch (err) {
        console.error('❌ handleCableFlow error:', err);
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
