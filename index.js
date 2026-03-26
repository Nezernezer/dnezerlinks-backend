const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com/`
        });
        console.log("Connected to Realtime Database: " + serviceAccount.project_id);
    } catch (err) {
        console.error("Firebase Init Error:", err.message);
    }
}

const db = admin.database();

// Helper to sanitize emails for RTDB (replace . with ,)
const encodeEmail = (email) => email.replace(/\./g, ',');

app.post('/get-virtual-account', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const safeEmail = encodeEmail(email);
    const userRef = db.ref(`users/${safeEmail}`);

    try {
        // 1. Check if account already exists in Database
        const snapshot = await userRef.once('value');
        if (snapshot.exists() && snapshot.val().account_number) {
            console.log("Account found in cache for:", email);
            return res.json(snapshot.val());
        }

        // 2. If not, request from Billstack
        console.log("Requesting new account from Billstack...");
        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', 
        { 
            email: email, 
            currency: "NGN", 
            bank_code: "999991" // PalmPay
        }, 
        { 
            headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}` } 
        });

        const accountData = {
            bank_name: response.data.data.bank_name,
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name,
            updatedAt: new Date().toISOString()
        };

        // 3. Save to Realtime Database
        await userRef.update(accountData);
        console.log("New account saved for:", email);
        
        res.json(accountData);
    } catch (error) {
        console.error("Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Provider or Database Error" });
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks RTDB Backend is LIVE 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
