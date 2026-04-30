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

// The Smarter Gatekeeper (Fixed for PIN and Validation)
const securityGatekeeper = async (req, res, next) => {
    if (req.method === 'GET') return next();
    if (req.path.includes('/validate') || req.path.includes('/verify')) return next();

    const { uid, pin } = req.body;
    if (!uid || uid.includes('.')) {
        return res.status(400).json({ success: false, error: 'Invalid Session: Please re-login' });
    }

    try {
        const snapshot = await admin.database().ref('users/' + uid).once('value');
        const user = snapshot.val();
        if (!user) return res.status(404).json({ success: false, error: 'Account not found' });
        
        if ((user.kyc_status || '').toUpperCase() !== 'VERIFIED') return res.json({ success: false, error: 'KYC_REQUIRED' });

        const storedPin = user.transaction_pin || user.pin;
        if (!storedPin) return res.json({ success: false, error: 'PIN_REQUIRED' });

        if (req.path.includes('/buy') || req.path.includes('/pay')) {
            if (Number(storedPin) !== Number(pin)) {
                return res.status(400).json({ success: false, error: 'Invalid PIN' });
            }
        }
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Auth Error' });
    }
};

// --- ROUTES ---
app.use('/api', securityGatekeeper);
app.use('/api/data', require('./routes/dataRoutes'));
app.use('/api/airtime', require('./routes/airtimeRoutes'));
app.use('/api/cabletv', require('./routes/cabletvRoutes'));

app.get('/', (req, res) => res.send("Dnezerlinks API Online"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
