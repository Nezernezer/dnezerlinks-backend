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
    if (req.method === 'GET' || req.path === '/') {
        return next();
    }

    // Fix: Remove the /api prefix here because app.use('/api') already consumes it
    const bypassRoutes = [
        '/webhook/billstack',
        '/account/fund',
        '/fund' // Adding this just in case
    ];

    if (bypassRoutes.includes(req.path)) {
        console.log(`[Gatekeeper] Bypassing security for: ${req.path}`);
        return next();
    }

    const { uid, pin } = req.body;

    if (!uid) {
        return res.status(400).json({ success: false, error: 'Invalid Session' });
    }

    try {
        const snapshot = await admin.database().ref(`users/${uid}`).once('value');
        const user = snapshot.val();

        if (!user) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        // Flexible PIN check: Handles both 'transaction_pin' and 'pin'
        const storedPin = String(user.transaction_pin || user.pin || "").trim();
        const providedPin = String(pin || "").trim();

        if (!storedPin || storedPin !== providedPin) {
            console.log(`[Gatekeeper] PIN Mismatch for ${uid}`);
            return res.status(400).json({ success: false, error: 'Invalid PIN' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("Gatekeeper Error:", error.message);
        return res.status(500).json({ success: false, error: 'Authentication Error' });
    }
};

// ================= ROUTES =================
// The Gatekeeper is applied to everything under /api
app.use('/api', securityGatekeeper);
app.use('/api', require('./routes/api'));

// ================= HEALTH CHECK & ROOT =================
app.get('/health', (req, res) => res.json({ success: true }));
app.get('/', (req, res) => res.send('Dnezerlinks API Online'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Dnezerlinks Server started on port ${PORT}`);
});
