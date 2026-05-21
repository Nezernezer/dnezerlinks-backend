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

// CORS
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));

// --- IMPORTANT: Webhook route defined BEFORE express.json() ---
app.use('/api/webhook', require('./routes/webhookRoutes')); 

// Now apply JSON parsing for all other routes
app.use(express.json());

// Gatekeeper
const securityGatekeeper = async (req, res, next) => {
    if (req.method === 'GET' || req.path === '/' || req.path.includes('/data/buy') || req.path.includes('/validate')) return next();
    
    const { uid, pin } = req.body;
    if (!uid || String(uid).includes('.')) return res.status(400).json({ success: false, error: 'Invalid Session' });

    try {
        const pinSnapshot = await admin.database().ref(`users/${uid}/transaction_pin`).once('value');
        const altPinSnapshot = await admin.database().ref(`users/${uid}/pin`).once('value');
        const storedPin = pinSnapshot.val() || altPinSnapshot.val();
        if (!storedPin || String(storedPin).trim() !== String(pin || '').trim()) return res.status(400).json({ success: false, error: 'Invalid PIN' });
        next();
    } catch (e) { res.status(500).json({ success: false, error: 'Authentication Error' }); }
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
