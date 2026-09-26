const crypto = require('crypto');
const admin = require('firebase-admin');

const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Starts the Login flow – generates a secure token and returns the button payload
 */
function startLoginFlow(senderPsid, pendingAuthTokens, APP_URL) {
    const authToken = crypto.randomBytes(32).toString('hex');

    pendingAuthTokens[authToken] = {
        psid: senderPsid,
        action: 'login',
        expiresAt: Date.now() + TOKEN_EXPIRY_MS
    };

    return {
        text: "🔐 Click below to log in securely through our protected web portal (Link expires in 5 minutes):",
        buttonText: "🔐 Open Secure Login",
        url: APP_URL + '/webhook/secure-auth-portal?token=' + authToken
    };
}

/**
 * Starts the Create Account (Register) flow
 */
function startRegisterFlow(senderPsid, pendingAuthTokens, APP_URL) {
    const authToken = crypto.randomBytes(32).toString('hex');

    pendingAuthTokens[authToken] = {
        psid: senderPsid,
        action: 'register',
        expiresAt: Date.now() + TOKEN_EXPIRY_MS
    };

    return {
        text: "📝 Click below to register your account securely (Link expires in 5 minutes):",
        buttonText: "📝 Open Secure Registration",
        url: APP_URL + '/webhook/secure-auth-portal?token=' + authToken
    };
}

/**
 * Starts the Forgot Password flow
 */
function startForgotFlow(senderPsid, pendingAuthTokens, APP_URL) {
    const authToken = crypto.randomBytes(32).toString('hex');

    pendingAuthTokens[authToken] = {
        psid: senderPsid,
        action: 'forgot',
        expiresAt: Date.now() + TOKEN_EXPIRY_MS
    };

    return {
        text: "🔄 Click below to recover your password securely (Link expires in 5 minutes):",
        buttonText: "🔄 Reset Password",
        url: APP_URL + '/webhook/secure-auth-portal?token=' + authToken
    };
}

/**
 * Logout – removes messenger link
 */
async function doLogout(senderPsid) {
    try {
        await admin.database().ref('messenger_links/' + senderPsid).remove();
        return {
            text: '✅ You have been logged out of Messenger.\n\nType "menu" to start again or "1" to login.'
        };
    } catch (e) {
        return {
            text: '❌ Logout failed. Please try again.'
        };
    }
}

/**
 * Check if PSID is linked
 */
async function isLinked(senderPsid) {
    try {
        const snap = await admin.database().ref('messenger_links/' + senderPsid).once('value');
        return snap.exists() && !!snap.val().userId;
    } catch (e) {
        return false;
    }
}

module.exports = {
    startLoginFlow,
    startRegisterFlow,
    startForgotFlow,
    doLogout,
    isLinked
};
