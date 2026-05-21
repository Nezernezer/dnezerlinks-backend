const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Firebase
try {
    if (!admin.apps.length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Admin Initialized");
    }
} catch (error) {
    console.error("❌ FIREBASE INIT ERROR:", error.message);
}

const app = express();

// Hardened CORS policy to prevent connection errors
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

/**
 * Optimized Security Gatekeeper
 * Fetches only the required PIN field to improve speed and reduce latency
 */
const securityGatekeeper = async (req, res, next) => {
    // 1. Bypass security for public/webhook/background tasks
    if (req.method === 'GET' || req.path === '/' || 
        req.path.includes('/webhook') || 
        req.path.includes('/account/fund') || 
        req.path.includes('/data/buy') ||
        req.path.includes('/validate')) {
        return next();
    }

    const { uid, pin } = req.body;
    if (!uid || String(uid).includes('.')) {
        return res.status(400).json({ success: false, error: 'Invalid Session' });
    }

    try {
        // Targeted read: Fetch ONLY the PIN field
        const pinSnapshot = await admin.database().ref(`users/${uid}/transaction_pin`).once('value');
        const altPinSnapshot = await admin.database().ref(`users/${uid}/pin`).once('value');
        const storedPin = pinSnapshot.val() || altPinSnapshot.val();

        if (!storedPin) {
            return res.status(404).json({ success: false, error: 'User PIN not set' });
        }

        if (String(storedPin).trim() !== String(pin || '').trim()) {
            return res.status(400).json({ success: false, error: 'Invalid PIN' });
        }

        next();
    } catch (e) {
        console.error("🚨 Gatekeeper DB Error:", e.message);
        res.status(500).json({ success: false, error: 'Authentication Error' });
    }
};

// Routing
app.use('/api', securityGatekeeper);
app.use('/api', require('./routes/api'));

app.get('/', (req, res) => res.send("Dnezerlinks API Online"));

// Global Error Handler to prevent process crashes
app.use((err, req, res, next) => {
    console.error("🔥 Global Error:", err.stack);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
