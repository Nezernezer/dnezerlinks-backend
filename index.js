const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// ================= FIREBASE INIT =================
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

// ================= MIDDLEWARE =================
app.use(cors({ origin: '*' }));
app.use(express.json());

// ================= SECURITY GATEKEEPER =================
const securityGatekeeper = async (req, res, next) => {
    // Allow GET routes and root
    if (req.method === 'GET' || req.path === '/') {
        return next();
    }

    // ================= BYPASS ROUTES =================
    // We must include the full path including /api prefix
    const bypassRoutes = [
        '/api/webhook/billstack',
        '/api/account/fund'
    ];

    if (bypassRoutes.includes(req.path)) {
        console.log(`[Gatekeeper] Bypassing security for: ${req.path}`);
        return next();
    }

    // ================= PROTECTED ROUTES LOGIC =================
    const { uid, pin } = req.body;

    if (!uid || String(uid).includes('.')) {
        return res.status(400).json({
            success: false,
            error: 'Invalid Session: Please re-login'
        });
    }

    try {
        const snapshot = await admin.database().ref(`users/${uid}`).once('value');
        const user = snapshot.val();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Account not found'
            });
        }

        // Validate PIN for financial services (Airtime, Data, etc.)
        const storedPin = user.transaction_pin || user.pin;
        if (!storedPin || String(storedPin).trim() !== String(pin || '').trim()) {
            return res.status(400).json({
                success: false,
                error: 'Invalid PIN'
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error("Gatekeeper Error:", error.message);
        return res.status(500).json({
            success: false,
            error: 'Authentication Error'
        });
    }
};

// ================= ROUTES =================
app.use('/api', securityGatekeeper);
app.use('/api', require('./routes/api'));

// ================= HEALTH CHECK =================
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        timestamp: Date.now()
    });
});

// ================= ROOT =================
app.get('/', (req, res) => {
    res.send('Dnezerlinks API Online');
});

// ================= START SERVER =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log('✅ Webhook URL: https://dnezerlinks-backend.onrender.com/api/webhook/billstack');
});
