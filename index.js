const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();

// 1. FIXED CORS: This allows your website to talk to Render without being blocked
app.use(cors({ origin: true }));
app.use(express.json());

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com/"
    });
}

const db = admin.database();
const encodeEmail = (email) => email.replace(/\./g, ',');

// 2. HEALTH CHECK: So you see a message instead of "Cannot GET"
app.get('/', (req, res) => {
    res.send("<h1>Dnezerlinks API is Online</h1><p>Status: Ready to generate accounts.</p>");
});

app.post('/get-virtual-account', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const safeEmail = encodeEmail(email);
    const userRef = db.ref(`users/${safeEmail}`);

    try {
        const snapshot = await userRef.once('value');
        if (snapshot.exists() && snapshot.val().account_number) {
            return res.json(snapshot.val());
        }

        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', 
        { email, currency: "NGN", bank_code: "999991" }, 
        { headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}` } });

        const accountData = {
            bank_name: response.data.data.bank_name,
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        await userRef.update(accountData);
        res.json(accountData);
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ error: "Provider Error: " + error.message });
    }
});

// 3. RENDER PORT FIX: Render uses process.env.PORT
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
