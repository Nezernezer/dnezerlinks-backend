// routes/fbchat/fundwallet.js
const axios = require('axios');
const admin = require('firebase-admin');

const fundSessions = {};
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

const BANKS = [
    { key: 'palmpay',   label: 'Palmpay' },
    { key: '9psb',      label: '9PSB' },
    { key: 'safehaven', label: 'Safehaven' },
    { key: 'bankly',    label: 'Bankly' },
    { key: 'providus',  label: 'Providus' },
    { key: 'wema',      label: 'Wema' }
];

function matchBank(account, bankKey) {
    if (!account || !account.bank_name) return false;
    const bName = account.bank_name.toLowerCase();

    if (bankKey === '9psb') return bName.includes('9psb') || bName.includes('9 payment');
    if (bankKey === 'palmpay') return bName.includes('palmpay') || bName.includes('palm pay');
    if (bankKey === 'safehaven') return bName.includes('safehaven') || bName.includes('safe haven');
    if (bankKey === 'bankly') return bName.includes('bankly');
    if (bankKey === 'providus') return bName.includes('providus');
    if (bankKey === 'wema') return bName.includes('wema');

    return bName.includes(bankKey);
}

function getFundSession(psid) {
    const session = fundSessions[psid];
    if (!session) return null;
    if (Date.now() - session.lastActive > SESSION_TIMEOUT_MS) {
        delete fundSessions[psid];
        return null;
    }
    session.lastActive = Date.now();
    return session;
}

function clearFundSession(psid) {
    delete fundSessions[psid];
}

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

async function loadUserData(userId) {
    const snap = await admin.database().ref('users/' + userId).once('value');
    return snap.exists() ? snap.val() : null;
}

function formatExistingAccounts(virtualAccounts) {
    const list = virtualAccounts ? Object.values(virtualAccounts) : [];
    if (list.length === 0) return null;

    let text = 'Your Virtual Accounts:\n\n';
    list.forEach(function (acc, i) {
        text += (i + 1) + '. ' + (acc.bank_name || 'Bank') + '\n';
        text += '   Acct: ' + (acc.account_number || 'N/A') + '\n';
        text += '   Name: ' + (acc.account_name || 'N/A') + '\n\n';
    });
    return text;
}

function buildBankMenu() {
    let text = 'Create a new virtual account:\n\n';
    BANKS.forEach(function (b, i) {
        text += (i + 1) + '. ' + b.label + '\n';
    });
    text += '\nReply with the number (1-6) of the bank you want.';
    return text;
}

async function startFundWalletFlow(psid) {
    const userId = await getLinkedUserId(psid);
    if (!userId) {
        return {
            text: '❌ Account not linked.\nPlease login first (option 1) or create an account (option 2).'
        };
    }

    const userData = await loadUserData(userId);
    if (!userData) {
        return { text: '❌ User profile not found. Please login again.' };
    }

    const balance = Number(userData.balance || 0).toLocaleString();
    const virtualAccounts = userData.virtual_accounts_new || {};

    // Store session so user can choose a bank next
    fundSessions[psid] = {
        step: 'FUND_CHOOSE_BANK',
        data: {
            userId: userId,
            email: userData.email || '',
            name: userData.name || '',
            phone: userData.phone || '08000000000',
            virtualAccounts: virtualAccounts
        },
        lastActive: Date.now()
    };

    let msg = '💰 Fund Wallet\n\n';
    msg += 'Balance: ₦' + balance + '\n\n';

    const existingText = formatExistingAccounts(virtualAccounts);
    if (existingText) {
        msg += existingText;
        msg += 'You can transfer any amount to any of the accounts above and your wallet will be credited automatically.\n\n';
    } else {
        msg += 'You do not have any virtual account yet.\n\n';
    }

    msg += buildBankMenu();
    return { text: msg };
}

async function handleFundWalletFlow(psid, text, session, APP_URL) {
    try {
        const input = text.trim().toLowerCase();

        if (session.step === 'FUND_CHOOSE_BANK') {
            // Allow user to type "menu" or "back"
            if (input === 'menu' || input === 'back' || input === 'cancel') {
                clearFundSession(psid);
                return { text: 'Cancelled. Type "menu" to see options.' };
            }

            let selectedBank = null;
            const idx = parseInt(input, 10) - 1;

            if (!isNaN(idx) && idx >= 0 && idx < BANKS.length) {
                selectedBank = BANKS[idx];
            } else {
                selectedBank = BANKS.find(function (b) {
                    return b.key === input || b.label.toLowerCase() === input;
                });
            }

            if (!selectedBank) {
                return {
                    text: '❌ Invalid selection.\n\n' + buildBankMenu()
                };
            }

            // Check if user already has this bank
            const existingList = session.data.virtualAccounts
                ? Object.values(session.data.virtualAccounts)
                : [];

            const alreadyHas = existingList.find(function (acc) {
                return matchBank(acc, selectedBank.key);
            });

            if (alreadyHas) {
                clearFundSession(psid);
                return {
                    text:
                        '✅ You already have a ' + selectedBank.label + ' account:\n\n' +
                        'Bank: ' + (alreadyHas.bank_name || selectedBank.label) + '\n' +
                        'Account Number: ' + alreadyHas.account_number + '\n' +
                        'Account Name: ' + (alreadyHas.account_name || 'N/A') + '\n\n' +
                        'Transfer any amount to this account and your wallet will be credited automatically.\n\n' +
                        'Type "menu" to go back.'
                };
            }

            // Generate new account
            session.step = 'FUND_GENERATING';
            const userId = session.data.userId;
            const fullName = (session.data.name || 'Customer User').trim();
            const nameParts = fullName.split(/\s+/);
            const firstName = nameParts[0] || 'Customer';
            const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Client';

            try {
                const response = await axios.post(
                    APP_URL + '/api/account/fund',
                    {
                        uid: userId,
                        email: session.data.email,
                        first_name: firstName,
                        last_name: lastName,
                        phone: session.data.phone || '08000000000',
                        requested_bank: selectedBank.key
                    },
                    { timeout: 45000 }
                );

                clearFundSession(psid);

                if (response.data && response.data.success && response.data.account) {
                    const acc = response.data.account;
                    return {
                        text:
                            '✅ Virtual Account Created Successfully!\n\n' +
                            'Bank: ' + (acc.bank_name || selectedBank.label) + '\n' +
                            'Account Number: ' + acc.account_number + '\n' +
                            'Account Name: ' + (acc.account_name || 'N/A') + '\n\n' +
                            'Transfer any amount to this account and your wallet will be credited automatically.\n\n' +
                            'Type "menu" to go back.'
                    };
                } else {
                    return {
                        text:
                            '❌ Could not create account.\n' +
                            (response.data.message || response.data.error || 'Please try again later.') +
                            '\n\nType "menu" to go back.'
                    };
                }
            } catch (apiErr) {
                clearFundSession(psid);
                const errMsg =
                    (apiErr.response && apiErr.response.data && (apiErr.response.data.message || apiErr.response.data.error)) ||
                    apiErr.message ||
                    'Network error';
                return {
                    text: '❌ Failed to create account: ' + errMsg + '\n\nType "menu" to go back.'
                };
            }
        }

        clearFundSession(psid);
        return { text: 'Session ended. Type "menu" to start over.' };

    } catch (err) {
        console.error('handleFundWalletFlow error:', err);
        clearFundSession(psid);
        return { text: '❌ Something went wrong. Type "menu" and try again.' };
    }
}

module.exports = {
    getFundSession,
    clearFundSession,
    startFundWalletFlow,
    handleFundWalletFlow
};
