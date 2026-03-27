const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// SAFE INITIALIZATION
let db;
try {
    if (!admin.apps.length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com/"
        });
        console.log("✅ Firebase Admin Connected");
    }
    db = admin.database();
} catch (e) {
    console.error("❌ CRITICAL FIREBASE INIT ERROR:", e.message);
}

const encodeEmail = (email) => email.replace(/\./g, ',');

app.get('/', (req, res) => res.send("Dnezerlinks API Online"));

app.post('/get-virtual-account', async (req, res) => {
    const { email } = req.body;
    console.log(`Processing request for: ${email}`);

    if (!db) return res.status(500).json({ error: "Database not initialized" });

    try {
        const safeEmail = encodeEmail(email);
        const userRef = db.ref(`users/${safeEmail}`);

        // Try to fetch with a 5-second timeout
        const snapshot = await Promise.race([
            userRef.once('value'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase Timeout')), 5000))
        ]);

        if (snapshot.exists() && snapshot.val().account_number) {
            return res.json(snapshot.val());
        }

        // Call Billstack
        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', 
            { email, currency: "NGN", bank_code: "999991" }, 
            { 
                headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}` },
                timeout: 8000 
            }
        );

        const accountData = {
            bank_name: response.data.data.bank_name,
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        await userRef.update(accountData);
        res.json(accountData);

    } catch (error) {
        console.error("Operation Failed:", error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Dnezerlinks running on port ${PORT}`));
