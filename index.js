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
        console.log("Firebase Admin Initialized");
    }
} catch (error) {
    console.error("FIREBASE INIT ERROR:", error.message);
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// The Smarter Gatekeeper
const securityGatekeeper = async (req, res, next) => {
    // 1. Allow all GET requests
    if (req.method === 'GET') return next();

    // 2. Allow IUC/Smartcard verification WITHOUT UID or PIN
    if (req.path.includes('/validate') || req.path.includes('/verify')) {
        return next();
    }

    // 3. For ALL other requests (Buying/Paying), strictly check UID and PIN
    const { uid, pin } = req.body;
    
    if (!uid) {
        return res.status(400).json({ success: false, error: 'Auth Error: Session Missing' });
    }

    try {
        const snapshot = await admin.database().ref('users/' + uid).once('value');
        const user = snapshot.val();
        
        if (!user) return res.status(404).json({ success: false, error: 'Account not found' });
        
        // Check KYC
        if ((user.kyc_status || '').toUpperCase() !== 'VERIFIED') {
            return res.json({ success: false, error: 'KYC_REQUIRED' });
        }

        // Check PIN existence
        const storedPin = user.transaction_pin || user.pin;
        if (!storedPin) return res.json({ success: false, error: 'PIN_REQUIRED' });

        // Check PIN correctness (for buying)
        if (req.path.includes('/buy') || req.path.includes('/pay')) {
            if (String(storedPin) !== String(pin)) {
                return res.status(400).json({ success: false, error: 'Invalid PIN' });
            }
        }
        
        next();
    } catch (e) {
        console.error("Gatekeeper Critical Error:", e);
        res.status(500).json({ success: false, error: 'Server Auth Error' });
    }
};

// Apply Gatekeeper and Routes
app.use('/api', securityGatekeeper);
app.use('/api/cabletv', require('./routes/cabletvRoutes'));
app.use('/api/data', require('./routes/dataRoutes'));
app.use('/api/airtime', require('./routes/airtimeRoutes'));

app.get('/', (req, res) => res.send("Dnezerlinks API Online"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
