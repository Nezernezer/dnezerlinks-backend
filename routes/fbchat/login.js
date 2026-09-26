const crypto = require('crypto');

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

module.exports = {
    startLoginFlow,
    startRegisterFlow,
    startForgotFlow
};
