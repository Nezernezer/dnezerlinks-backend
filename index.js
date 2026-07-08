const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path'); // Added to locate the secret file safely

// Read the Secret File natively from Render's root folder
const serviceAccountPath = path.join(__dirname, 'firebase-credentials.json');

try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com" // Matches your database
        });
        console.log("✅ Firebase Admin Initialized perfectly via Secret File!");
    }
} catch (error) {
    console.error("❌ Firebase Admin initialization failed:", error.message);
}

const app = express();

// CORS
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));

// Public webhook route (before JSON parser)
app.use('/api/webhook', require('./routes/webhookRoutes'));

// JSON parser
app.use(express.json());

// Security gatekeeper
const securityGatekeeper = async (req, res, next) => {
    // GET requests, home route, data/cable validations, webhooks, and virtual account generation (/fund) bypass this check
    if (
        req.method === 'GET' ||
        req.path === '/' ||
        req.path.includes('/validate') ||
        req.path.includes('/webhook') ||
        req.path.includes('/validate-meter') ||
        req.path.includes('/users') ||
        req.path.includes('/fund')
    ) return next();

    // UPDATED: Destructure both uid and userId to avoid key mismatches from different frontends
    const { uid, userId, pin } = req.body;
    const activeUid = uid || userId;

    if (!activeUid || String(activeUid).includes('.')) {
        return res.status(400).json({ success: false, error: 'Invalid Session' });
    }

    try {
        // Querying transaction_pin or fallback pin from the user node using the resolved activeUid
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
