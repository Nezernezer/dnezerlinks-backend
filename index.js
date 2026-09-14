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

// CORS Configuration
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'x-billstack-signature'] }));

// 1. GLOBAL JSON PARSER MUST COME FIRST so req.body is universally available
app.use(express.json({ type: ['application/json', 'text/plain', 'application/vnd.api+json'] }));
app.use(express.urlencoded({ extended: true }));

// Firebase Auth token extractor middleware for sendmoney and other routes
const extractUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
        } catch (e) {
            // Ignore invalid token, let downstream logic handle missing sessions
        }
    }
    next();
};

app.use(extractUser);

// 2. Public webhook and account routes mounted explicitly
app.use('/api/webhook', require('./routes/webhookRoutes'));
app.use('/api/billstack/webhook', require('./routes/webhookRoutes'));
app.use('/api/account', require('./routes/accountRoutes'));
app.use('/api/sendmoney', require('./routes/sendmoneyRoutes'));

// Security gatekeeper for authenticated user actions
const securityGatekeeper = async (req, res, next) => {
    if (
        req.method === 'GET' ||
        req.path === '/' ||
        req.path.includes('/validate') ||
        req.path.includes('/webhook') ||
        req.path.includes('/search-user') ||
        req.path.includes('/validate-meter') ||
        req.path.includes('/users') ||
        req.path.includes('/fund') ||
        req.path.includes('/sendmoney')
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
