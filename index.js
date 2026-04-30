const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const cabletvRoutes = require('./routes/cabletvRoutes');

// Initialize Firebase Admin with Error Handling
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
    console.log("Check if FIREBASE_SERVICE_ACCOUNT variable is valid JSON");
}

const app = express();
app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

// Security Gatekeeper
const securityGatekeeper = async (req, res, next) => {
    if (req.path === '/' || req.method === 'GET') return next();
    const { uid, pin } = req.body;
    if (!uid) return res.status(400).json({ success: false, error: 'User ID is required' });

    try {
        const snapshot = await admin.database().ref('users/' + uid).once('value');
        const user = snapshot.val();
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        if ((user.kyc_status || '').toUpperCase() !== 'VERIFIED') return res.json({ success: false, error: 'KYC_REQUIRED' });
        
        const storedPin = user.transaction_pin || user.pin;
        if (!storedPin) return res.json({ success: false, error: 'PIN_REQUIRED' });

        if (req.originalUrl.includes('/buy') || req.originalUrl.includes('/pay')) {
            if (String(storedPin) !== String(pin)) return res.status(400).json({ success: false, error: 'Invalid PIN' });
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
