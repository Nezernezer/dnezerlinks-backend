const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

try {
    if (!admin.apps.length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("Firebase Admin Initialized");
    }
} catch (error) {
    console.error("FIREBASE INIT ERROR:", error.message);
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const securityGatekeeper = async (req, res, next) => {
    if (req.method === 'GET' || req.path === '/') return next();
    
    // ALLOW CABLE VALIDATION WITHOUT UID
    if (req.path.includes('/validate') || req.path.includes('/verify')) return next();

    const { uid, pin } = req.body;

    // Reject emails as UIDs
    if (!uid || String(uid).includes('.')) {
        return res.status(400).json({ success: false, error: 'Invalid Session: Please re-login' });
    }

    try {
        const snapshot = await admin.database().ref('users/' + uid).once('value');
        const user = snapshot.val();
        if (!user) return res.status(404).json({ success: false, error: 'Account not found' });

        const storedPin = user.transaction_pin || user.pin;
        if (!storedPin) return res.json({ success: false, error: 'PIN_REQUIRED' });

        // Force both to strings and trim for the comparison
        if (String(storedPin).trim() !== String(pin).trim()) {
            return res.status(400).json({ success: false, error: 'Invalid PIN' });
        }
        
        next();
    } catch (e) {
        console.error("Gatekeeper Error:", e);
        res.status(500).json({ success: false, error: 'Auth Error' });
    }
};

app.use('/api', securityGatekeeper);
app.use('/api/cabletv', require('./routes/cabletvRoutes'));
app.use('/api/data', require('./routes/dataRoutes'));
app.use('/api/airtime', require('./routes/airtimeRoutes'));

app.get('/', (req, res) => res.send("Dnezerlinks API Online"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
