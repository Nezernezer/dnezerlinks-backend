const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// ================= FIREBASE ADMIN INIT =================
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Admin Initialized");
    } catch (error) {
        console.error("❌ Firebase Init Error:", error.message);
    }
}

const app = express();

// ================= MIDDLEWARE =================
app.use(cors({ origin: '*' }));
app.use(express.json());

// ================= SECURITY GATEKEEPER =================
const securityGatekeeper = async (req, res, next) => {
    if (req.method === 'GET' || req.path === '/') return next();

    // Bypass list for Dnezerlinks account generation and webhooks
    const bypassRoutes = ['/account/fund', '/webhook/billstack'];
    
    if (bypassRoutes.includes(req.path)) {
        console.log(`[Gatekeeper] Bypassing security for: ${req.path}`);
        return next();
    }

    const { uid, pin } = req.body;
    if (!uid) return res.status(401).json({ success: false, error: "Session expired" });

    try {
        const snap = await admin.database().ref(`users/${uid}`).once('value');
        const user = snap.val();
        
        // Flexible PIN check for other transaction routes
        const storedPin = String(user?.transaction_pin || user?.pin || "").trim();
        const providedPin = String(pin || "").trim();

        if (!storedPin || storedPin !== providedPin) {
            return res.status(400).json({ success: false, error: "Invalid PIN" });
        }
        
        req.user = user;
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: "Authentication Error" });
    }
};

// ================= ROUTE REGISTRATION =================
app.use('/api', securityGatekeeper);
app.use('/api/account', require('./routes/accountRoutes'));
app.use('/api/webhook', require('./routes/webhookRoutes'));

app.get('/', (req, res) => res.send('Dnezerlinks API Active'));

// ================= START SERVER =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Dnezerlinks Server started on port ${PORT}`);
});
