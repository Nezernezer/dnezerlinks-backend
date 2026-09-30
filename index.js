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

// Body parsers
app.use(express.json({ type: ['application/json', 'text/plain', 'application/vnd.api+json'] }));
app.use(express.urlencoded({ extended: true }));

// Optional Firebase Auth token extractor
const extractUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
        } catch (e) {
            // ignore invalid token
        }
    }
    next();
};
app.use(extractUser);

// Explicit public mounts
app.use('/api/webhook', require('./routes/webhookRoutes'));
app.use('/api/billstack/webhook', require('./routes/webhookRoutes'));
app.use('/api/account', require('./routes/accountRoutes'));
app.use('/api/sendmoney', require('./routes/sendmoneyRoutes'));
app.use('/webhook', require('./routes/fbchat/controlroom'));

// ====================== SECURITY GATEKEEPER ======================
// PIN is checked for /bulksms and all other protected routes
const securityGatekeeper = async (req, res, next) => {
    console.log("Gatekeeper →", req.method, req.path);

    // Only these paths skip the PIN check
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
        // /bulksms is NOT excluded → PIN will be checked
    ) {
        return next();
    }

    const { uid, userId, pin } = req.body || {};
    const activeUid = uid || userId;

    console.log("Gatekeeper PIN check → uid:", activeUid, "pin received:", !!pin);

    if (!activeUid || String(activeUid).includes('.')) {
        console.log("Gatekeeper rejected: Invalid Session");
        return res.status(400).json({ success: false, error: 'Invalid Session' });
    }

    if (!pin) {
        console.log("Gatekeeper rejected: PIN missing");
        return res.status(400).json({ success: false, error: 'PIN is required' });
    }

    try {
        const pinSnap = await admin.database().ref(`users/${activeUid}/transaction_pin`).once('value');
        const altPinSnap = await admin.database().ref(`users/${activeUid}/pin`).once('value');
        const storedPin = pinSnap.val() || altPinSnap.val();

        if (!storedPin || String(storedPin).trim() !== String(pin).trim()) {
            console.log("Gatekeeper rejected: Invalid PIN");
            return res.status(400).json({ success: false, error: 'Invalid PIN' });
        }

        console.log("Gatekeeper → PIN OK, continuing to route");
        next();
    } catch (e) {
        console.error("Gatekeeper error:", e.message);
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
