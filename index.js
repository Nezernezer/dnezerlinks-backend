const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// 1. Firebase Admin Setup
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Admin Initialized");
    } catch (e) {
        console.error("❌ Firebase Init Error:", e.message);
    }
}

const db = admin.database();

// 2. The "Home" Route (Fixes the 404 you just saw)
app.get('/', (req, res) => {
    res.send("Dnezerlinks API is Online and Connected.");
});

// 3. The Virtual Account Route
app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, phone } = req.body;
    
    if (!email) return res.status(400).json({ error: "Email is required" });

    try {
        console.log(`Processing request for: ${email}`);

        // Hit the 2026 Billstack Reserved Account Endpoint
        const response = await axios.post('https://api.billstack.co/v1/reserved-accounts', 
            { 
                email: email,
                first_name: first_name || "Customer",
                last_name: last_name || "User",
                phone: phone || "08000000000",
                currency: "NGN"
            }, 
            { 
                headers: { 
                    'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 
            }
        );

        const accountData = {
            bank_name: response.data.data.bank_name || "9PSB",
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        // Save to Firebase
        const safeEmail = email.replace(/\./g, ',');
        await db.ref(`users/${safeEmail}`).update(accountData);

        res.json(accountData);

    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error("Billstack Error:", errorMsg);
        res.status(500).json({ error: "Integration Error", details: errorMsg });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
