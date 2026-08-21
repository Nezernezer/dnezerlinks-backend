const { onRequest } = require("firebase-functions/v2/https");
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'firebase-credentials.json');

try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Admin Initialized perfectly via Secret File!");
    }
} catch (error) {
    console.error("❌ Firebase Admin initialization failed:", error.message);
}

const app = express();

// CORS
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));

// 1. GLOBAL JSON PARSER MUST COME FIRST so req.body is universally available
app.use(express.json());

// 2. Public webhook route & Billstack prefix bridge
app.use('/api/webhook', require('./routes/webhookRoutes'));
app.use('/api/billstack/webhook', require('./routes/webhookRoutes'));

// Security gatekeeper
const securityGatekeeper = async (req, res, next) => {
    if (
        req.method === 'GET' ||
        req.path === '/' ||
        req.path.includes('/validate') ||
        req.path.includes('/webhook') ||
        req.path.includes('/validate-meter') ||
        req.path.includes('/users') ||
        req.path.includes('/fund')
    ) return next();

    const { uid, userId, pin } = req.body;
    const activeUid = uid || userId;

    if (!activeUid || String(activeUid).includes('.')) {
        return res.status(400).json({ success: false, error: 'Invalid Session' });
    }

    try {
        const pinSnapshot = await admin.database().ref(`users/${activeUid}/transaction_pin`).once('value');
        const altPinSnapshot = await admin.database().ref(`users/${activeUid}/pin`).once('value');
        const storedPin = pinSnapshot.val() || altPinSnapshot.val();

        if (!storedPin || String(storedPin).trim() !== String(pin || '').trim()) {
            return res.status(400).json({ success: false, error: 'Invalid PIN' });
        }
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'Authentication Error' });
    }
};

app.use('/api', securityGatekeeper);
app.use('/api', require('./routes/api'));

app.get('/', (req, res) => res.send("Dnezerlinks API Online"));

app.use((err, req, res, next) => {
    console.error("🔥 Global Error:", err.stack);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// Export as a Firebase Cloud Function (replaces app.listen)
exports.api = onRequest(app);
