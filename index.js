const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const cabletvRoutes = require('./routes/cabletvRoutes');

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
app.options('*', cors());
app.use(express.json());

const securityGatekeeper = async (req, res, next) => {
    // 1. Skip check for GET requests (like the home page)
    if (req.method === 'GET' || req.path === '/') return next();

    // 2. Skip check for VALIDATION endpoints
    // This allows IUC check to work without needing a UID or PIN yet
    if (req.path.includes('/validate') || req.path.includes('/verify')) {
        return next();
    }

    // 3. Strict checks for everything else (Purchase/Buy)
    const { uid, pin } = req.body;
    if (!uid) return res.status(400).json({ success: false, error: 'User ID is required' });

    try {
        const snapshot = await admin.database().ref('users/' + uid).once('value');
        const user = snapshot.val();
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        
        if ((user.kyc_status || '').toUpperCase() !== 'VERIFIED') {
            return res.json({ success: false, error: 'KYC_REQUIRED' });
        }

        const storedPin = user.transaction_pin || user.pin;
        if (!storedPin) return res.json({ success: false, error: 'PIN_REQUIRED' });

        if (req.originalUrl.includes('/buy') || req.originalUrl.includes('/pay')) {
            if (String(storedPin) !== String(pin)) {
                return res.status(400).json({ success: false, error: 'Invalid PIN' });
            }
        }
        next();
    } catch (e) {
        console.error("Gatekeeper Error:", e);
        res.status(500).json({ success: false, error: 'Auth Error' });
    }
};

app.use('/api', securityGatekeeper);
app.use('/api/cabletv', cabletvRoutes);

app.get('/', (req, res) => res.send("Dnezerlinks API is running."));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
