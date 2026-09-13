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
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-billstack-signature']
}));

app.use(express.json({ type: ['application/json', 'text/plain', 'application/vnd.api+json'] }));
app.use(express.urlencoded({ extended: true }));

// Public webhooks + virtual account generation
app.use('/api/webhook', require('./routes/webhookRoutes'));
app.use('/api/billstack/webhook', require('./routes/webhookRoutes'));
app.use('/api/account', require('./routes/accountRoutes'));

// ─────────────────────────────────────────────
// Security Gatekeeper
// ─────────────────────────────────────────────
const securityGatekeeper = async (req, res, next) => {
    // Completely public paths (including recipient search)
    if (
        req.method === 'GET' ||
        req.path === '/' ||
        req.path.includes('/validate') ||
        req.path.includes('/webhook') ||
        req.path.includes('/validate-meter') ||
        req.path.includes('/users') ||
        req.path.includes('/fund') ||
        req.path.includes('/search-user') // <-- Excluded from token check entirely
    ) {
        return next();
    }

    // 1. Must be logged in (valid Firebase ID token)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Please login first' });
    }

    let decoded;
    try {
        const token = authHeader.split('Bearer ')[1];
        decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    // 2. Routes that only need login (NO PIN)
    if (
        req.path.includes('/balance')
    ) {
        return next();
    }

    // 3. Money-moving routes → require PIN and strict authentication
    const { uid, userId, pin } = req.body;
    const activeUid = uid || userId || decoded.uid;

    if (!activeUid || String(activeUid).includes('.')) {
        return res.status(400).json({ success: false, error: 'Invalid Session' });
    }

    // Prevent UID spoofing
    if (activeUid !== decoded.uid) {
        return res.status(403).json({ success: false, error: 'UID mismatch' });
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
