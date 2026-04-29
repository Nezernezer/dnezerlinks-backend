const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const apiRoutes = require('./routes/api');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(require('./firebase-adminsdk.json')),
        databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
    });
}

const app = express();

app.use(cors({ origin: '*' }));
app.options('*', cors());
app.use(express.json());

// Unified Security Gatekeeper
const securityGatekeeper = async (req, res, next) => {
    // Skip check for root path or non-POST requests that don't have a UID
    if (req.path === '/' || req.method === 'GET') return next();

    const { uid, pin } = req.body;
    
    if (!uid) return res.status(400).json({ success: false, error: 'User ID is required' });

    try {
        const snapshot = await admin.database().ref('users/' + uid).once('value');
        const user = snapshot.val();

        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        // 1. KYC Check
        if ((user.kyc_status || '').toUpperCase() !== 'VERIFIED') {
            return res.json({ success: false, error: 'KYC_REQUIRED' });
        }

        // 2. PIN Existence Check
        const storedPin = user.transaction_pin || user.pin;
        if (!storedPin) {
            return res.json({ success: false, error: 'PIN_REQUIRED' });
        }

        // 3. PIN Verification (Only for purchase routes)
        if (req.path.includes('/buy') || req.path.includes('/pay')) {
            if (String(storedPin) !== String(pin)) {
                return res.status(400).json({ success: false, error: 'Invalid PIN' });
            }
        }
        
        next();
    } catch (e) { 
        console.error("Auth Gatekeeper Error:", e);
        res.status(500).json({ success: false, error: 'Authentication Error' }); 
    }
};

app.use('/api', securityGatekeeper);
app.use('/api', apiRoutes);

app.get('/', (req, res) => res.send("Dnezerlinks API is running."));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
