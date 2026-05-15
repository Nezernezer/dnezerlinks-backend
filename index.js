const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Admin here as well to ensure it's available for the Gatekeeper
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
    });
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ================= SECURITY GATEKEEPER =================
const securityGatekeeper = async (req, res, next) => {
    if (req.method === 'GET' || req.path === '/') return next();

    // Bypass list for account generation
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
        
        // Match pin against stored value
        if (!user || String(user.pin) !== String(pin)) {
            return res.status(400).json({ success: false, error: "Invalid PIN" });
        }
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: "Auth Error" });
    }
};

app.use('/api', securityGatekeeper);
app.use('/api/account', require('./routes/accountRoutes'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Dnezerlinks Server active on ${PORT}`));
