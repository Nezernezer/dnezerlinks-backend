// ~/dnezerlinks/index.js - UPDATED
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

try {
    if (!admin.apps.length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("Firebase Admin Initialized");
    }
} catch (error) {
    console.error("FIREBASE INIT ERROR:", error.message);
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Improved Security Gatekeeper
const securityGatekeeper = async (req, res, next) => {
    // 1. Standard GET requests and root path bypass security
    if (req.method === 'GET' || req.path === '/') return next();

    // 2. CRITICAL FIX: Skip PIN check for Webhooks and Account Generation
    // Billstack cannot provide a PIN, and account setup is a background task.
    if (req.path.includes('/webhook') || req.path.includes('/account/fund') || req.path.includes('/validate')) {
        return next();
    }

    const { uid, pin } = req.body;

    // Sanitize UID
    if (!uid || String(uid).includes('.')) {
        return res.status(400).json({ success: false, error: 'Invalid Session: Please re-login' });
    }

    try {
        const snapshot = await admin.database().ref('users/' + uid).once('value');
        const user = snapshot.val();

        if (!user) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const storedPin = user.transaction_pin || user.pin;

        if (!storedPin || String(storedPin).trim() !== String(pin || '').trim()) {
            return res.status(400).json({ success: false, error: 'Invalid PIN' });
        }

        req.user = user;
        next();
    } catch (e) {
        console.error("Gatekeeper Error:", e.message);
        res.status(500).json({ success: false, error: 'Authentication Error' });
    }
};

// Routing
app.use('/api', securityGatekeeper);
app.use('/api', require('./routes/api'));

app.get('/', (req, res) => res.send("Dnezerlinks API Online"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
