const crypto = require('crypto');
const admin = require('firebase-admin');

const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MENU_FOOTER = '\n\nType 0 or menu for main menu.';

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

/**
 * ============================================================
 *  PROCESSING FUNCTIONS (moved from controlroom.js)
 *  These create users in Firebase Authentication
 * ============================================================
 */

/**
 * Process Login (from Secure Portal)
 * @param {string} psid - Messenger PSID
 * @param {object} data - { email, idToken }
 * @returns {object} { success: boolean, message: string }
 */
async function processLogin(psid, data) {
    const { email, idToken } = data;
    const cleanEmail = (email || '').toLowerCase().trim();

    if (!idToken) {
        return { success: false, message: '❌ Missing authentication token.' };
    }

    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        const authEmail = (decoded.email || '').toLowerCase();

        if (authEmail !== cleanEmail) {
            return { success: false, message: '❌ Email mismatch.' };
        }

        // Find user in Realtime Database by email
        const snapshot = await admin.database()
            .ref('users')
            .orderByChild('email')
            .equalTo(cleanEmail)
            .once('value');

        if (!snapshot.exists()) {
            // Fallback: try Auth UID as key
            const authUid = decoded.uid;
            const uidSnap = await admin.database().ref('users/' + authUid).once('value');

            if (uidSnap.exists()) {
                await admin.database().ref('messenger_links/' + psid).set({
                    userId: authUid,
                    email: cleanEmail,
                    linkedAt: new Date().toISOString()
                });
                await admin.database().ref('users/' + authUid + '/messenger_psid').set(psid);

                return {
                    success: true,
                    message: '✅ Successfully Logged In & Linked to ' + cleanEmail + '!' + MENU_FOOTER
                };
            }

            return { success: false, message: '❌ No account found with this email.' };
        }

        let userId = null;
        snapshot.forEach(function (child) {
            userId = child.key;
        });

        // Link Messenger
        await admin.database().ref('messenger_links/' + psid).set({
            userId: userId,
            email: cleanEmail,
            linkedAt: new Date().toISOString()
        });
        await admin.database().ref('users/' + userId + '/messenger_psid').set(psid);

        return {
            success: true,
            message: '✅ Successfully Logged In & Linked to ' + cleanEmail + '!' + MENU_FOOTER
        };
    } catch (authErr) {
        console.error('[processLogin] Error:', authErr);
        return { success: false, message: '❌ Incorrect password.' };
    }
}

/**
 * Process Register (from Secure Portal)
 * Creates user in Firebase Authentication + Realtime Database
 * @param {string} psid - Messenger PSID
 * @param {object} data - { name, phone, address, email, password, pin }
 * @returns {object} { success: boolean, message: string }
 */
async function processRegister(psid, data) {
    const { name, phone, address, email, password, pin } = data;
    const cleanEmail = (email || '').toLowerCase().trim();

    if (!name || !phone || !address || !cleanEmail || !password || password.length < 6 || !pin) {
        return { success: false, message: '❌ Please fill all fields correctly.' };
    }

    try {
        // Check if email already exists in Database
        const snapshot = await admin.database()
            .ref('users')
            .orderByChild('email')
            .equalTo(cleanEmail)
            .once('value');

        if (snapshot.exists()) {
            return { success: false, message: '❌ An account with this email already exists.' };
        }

        // ✅ CREATE USER IN FIREBASE AUTHENTICATION
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({
                email: cleanEmail,
                password: password,
                displayName: name
            });
        } catch (authErr) {
            console.error('[processRegister] Auth createUser error:', authErr);
            if (authErr.code === 'auth/email-already-exists') {
                return { success: false, message: '❌ An account with this email already exists.' };
            }
            return { success: false, message: '❌ Failed to create account. Please try again.' };
        }

        const userId = userRecord.uid; // Use Auth UID

        // Save profile to Realtime Database (no plain password)
        await admin.database().ref('users/' + userId).set({
            userId: userId,
            name: name,
            email: cleanEmail,
            phone: phone,
            address: address,
            pin: pin,
            transaction_pin: pin,
            balance: 0,
            account_status: 'active',
            messenger_psid: psid,
            createdAt: new Date().toISOString()
        });

        // Link Messenger
        await admin.database().ref('messenger_links/' + psid).set({
            userId: userId,
            email: cleanEmail,
            linkedAt: new Date().toISOString()
        });

        return {
            success: true,
            message: '🎉 Account Created & Linked Successfully!\nName: ' + name + '\nEmail: ' + cleanEmail + '\nBalance: ₦0.00' + MENU_FOOTER
        };
    } catch (err) {
        console.error('[processRegister] Unexpected error:', err);
        return { success: false, message: '❌ Error: ' + (err.message || 'Registration failed') };
    }
}

/**
 * Process Forgot Password (from Secure Portal)
 * @param {string} psid - Messenger PSID
 * @param {object} data - { email }
 * @returns {object} { success: boolean, message: string }
 */
async function processForgot(psid, data) {
    const cleanEmail = (data.email || '').toLowerCase().trim();

    if (!cleanEmail) {
        return { success: false, message: '❌ Please enter a valid email.' };
    }

    try {
        const snapshot = await admin.database()
            .ref('users')
            .orderByChild('email')
            .equalTo(cleanEmail)
            .once('value');

        if (!snapshot.exists()) {
            return { success: false, message: '❌ No account matches this email.' };
        }

        await admin.auth().generatePasswordResetLink(cleanEmail);

        return {
            success: true,
            message: '🔄 Password Reset Instructions sent to ' + cleanEmail + '. Check your inbox/spam.' + MENU_FOOTER
        };
    } catch (err) {
        console.error('[processForgot] Error:', err);
        return { success: false, message: '❌ Error: ' + (err.message || 'Failed to send reset link') };
    }
}

/**
 * Process Free Mode Register (chat-based registration)
 * Creates user in Firebase Authentication + Realtime Database
 * @param {string} psid - Messenger PSID
 * @param {object} data - { name, phone, address, email, password, pin }
 * @returns {object} { success: boolean, message: string }
 */
async function processFreeModeRegister(psid, data) {
    const { name, phone, address, email, password, pin } = data;
    const cleanEmail = (email || '').toLowerCase().trim();

    try {
        // Check if email already exists
        const snapshot = await admin.database()
            .ref('users')
            .orderByChild('email')
            .equalTo(cleanEmail)
            .once('value');

        if (snapshot.exists()) {
            return {
                success: false,
                message:
                    '❌ An account with this email already exists.\n\n' +
                    '⚠️ Please delete the email, password and PIN you entered above.' + MENU_FOOTER
            };
        }

        // ✅ CREATE USER IN FIREBASE AUTHENTICATION
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({
                email: cleanEmail,
                password: password,
                displayName: name
            });
        } catch (authErr) {
            console.error('[processFreeModeRegister] Auth createUser error:', authErr);
            if (authErr.code === 'auth/email-already-exists') {
                return {
                    success: false,
                    message:
                        '❌ An account with this email already exists.\n\n' +
                        '⚠️ Please delete the sensitive information you entered.' + MENU_FOOTER
                };
            }
            return {
                success: false,
                message: '❌ Failed to create account. Please try again later.' + MENU_FOOTER
            };
        }

        const userId = userRecord.uid;

        // Save profile (no plain password)
        await admin.database().ref('users/' + userId).set({
            userId: userId,
            name: name,
            email: cleanEmail,
            phone: phone,
            address: address,
            pin: pin,
            transaction_pin: pin,
            balance: 0,
            account_status: 'active',
            messenger_psid: psid,
            createdAt: new Date().toISOString()
        });

        // Link Messenger
        await admin.database().ref('messenger_links/' + psid).set({
            userId: userId,
            email: cleanEmail,
            linkedAt: new Date().toISOString()
        });

        return {
            success: true,
            message:
                '🎉 Account Created & Linked Successfully!\n\n' +
                'Name: ' + name + '\n' +
                'Email: ' + cleanEmail + '\n' +
                'Balance: ₦0.00\n\n' +
                '⚠️ Please delete the email, password and PIN you entered above for your security.' + MENU_FOOTER
        };
    } catch (err) {
        console.error('[processFreeModeRegister] Unexpected error:', err);
        return {
            success: false,
            message:
                '❌ Registration failed. Please try again.\n\n' +
                '⚠️ Please delete the sensitive information you entered above.' + MENU_FOOTER
        };
    }
}

/**
 * Process Free Mode Login (chat-based login)
 * Authenticates via Firebase Auth REST API and links Messenger
 * @param {string} psid - Messenger PSID
 * @param {object} data - { email, password }
 * @returns {object} { success: boolean, message: string }
 */
async function processFreeModeLogin(psid, data) {
    const axios = require('axios');
    const email = (data.email || '').toLowerCase().trim();
    const password = data.password || '';

    try {
        const FIREBASE_API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyAXWh3ls4yEANmGy4g7xZ8jlBN0KoFC5yc';

        console.log('[FreeLogin] Attempting Auth for:', email);

        const authRes = await axios.post(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
            {
                email: email,
                password: password,
                returnSecureToken: true
            },
            {
                timeout: 15000,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        console.log('[FreeLogin] Auth success, localId:', authRes.data?.localId);

        if (!authRes.data || !authRes.data.localId) {
            return {
                success: false,
                message:
                    '❌ Incorrect password.\n\n' +
                    '⚠️ Please delete the email and password you entered above.' + MENU_FOOTER
            };
        }

        // Look up user in Realtime Database by email
        const snapshot = await admin.database()
            .ref('users')
            .orderByChild('email')
            .equalTo(email)
            .once('value');

        if (!snapshot.exists()) {
            // Fallback: try Auth UID as key
            const authUid = authRes.data.localId;
            const uidSnap = await admin.database().ref('users/' + authUid).once('value');

            if (uidSnap.exists()) {
                await admin.database().ref('messenger_links/' + psid).set({
                    userId: authUid,
                    email: email,
                    linkedAt: new Date().toISOString()
                });
                await admin.database().ref('users/' + authUid + '/messenger_psid').set(psid);

                return {
                    success: true,
                    message:
                        '✅ Successfully Logged In & Linked to ' + email + '!\n\n' +
                        '⚠️ Please delete the email and password you entered above for your security.' + MENU_FOOTER
                };
            }

            return {
                success: false,
                message:
                    '❌ No account found with this email in the system.\n\n' +
                    '⚠️ Please delete the email and password you entered above.' + MENU_FOOTER
            };
        }

        let userId = null;
        snapshot.forEach(child => {
            userId = child.key;
        });

        // Link Messenger
        await admin.database().ref('messenger_links/' + psid).set({
            userId: userId,
            email: email,
            linkedAt: new Date().toISOString()
        });
        await admin.database().ref('users/' + userId + '/messenger_psid').set(psid);

        return {
            success: true,
            message:
                '✅ Successfully Logged In & Linked to ' + email + '!\n\n' +
                '⚠️ Please delete the email and password you entered above for your security.' + MENU_FOOTER
        };
    } catch (err) {
        const firebaseError = err.response?.data || err.message;
        console.error('[FreeLogin] FULL ERROR →', JSON.stringify(firebaseError, null, 2));

        const errorMsg = (err.response?.data?.error?.message || err.message || '').toUpperCase();
        let userMsg = '❌ Login failed. Please try again.';

        if (
            errorMsg.includes('INVALID_PASSWORD') ||
            errorMsg.includes('EMAIL_NOT_FOUND') ||
            errorMsg.includes('INVALID_LOGIN_CREDENTIALS') ||
            errorMsg.includes('INVALID_EMAIL') ||
            errorMsg.includes('USER_DISABLED')
        ) {
            userMsg = '❌ Incorrect email or password.';
        } else if (
            errorMsg.includes('API_KEY_INVALID') ||
            errorMsg.includes('API KEY NOT VALID') ||
            errorMsg.includes('PERMISSION_DENIED') ||
            errorMsg.includes('REQUESTS FROM THIS') ||
            errorMsg.includes('BLOCKED')
        ) {
            userMsg = '❌ Server Auth configuration error. Contact support.';
            console.error('[FreeLogin] Likely cause: Firebase Web API key is restricted. Set FIREBASE_WEB_API_KEY in env.');
        }

        return {
            success: false,
            message:
                userMsg + '\n\n' +
                '⚠️ Please delete the email and password you entered above.' + MENU_FOOTER
        };
    }
}

module.exports = {
    startLoginFlow,
    startRegisterFlow,
    startForgotFlow,
    doLogout,
    isLinked,
    processLogin,
    processRegister,
    processForgot,
    processFreeModeRegister,
    processFreeModeLogin
};
