const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// 1. Firebase Admin Initialization
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Connected Successfully");
    } catch (e) {
        console.error("❌ Firebase Init Error:", e.message);
    }
}

const db = admin.database();

// 2. Health Check Route
app.get('/', (req, res) => {
    res.send("Dnezerlinks Backend is Live and Connected to Firebase.");
});

// 3. 2026 Billstack Reserved Account Route
app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, phone } = req.body;

    if (!email || !first_name || !last_name || !phone) {
        return res.status(400).json({ 
            error: "Missing KYC data", 
            message: "Email, first_name, last_name, and phone are mandatory in 2026." 
        });
    }

    try {
        console.log(`[Billstack] Processing reserved account for: ${email}`);

        const response = await axios.post('https://api.billstack.co/v1/reserved-accounts', 
            { 
                email,
                first_name,
                last_name,
                phone,
                currency: "NGN"
            }, 
            { 
                headers: { 
                    'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000 
            }
        );

        const accountData = {
            bank_name: response.data.data.bank_name || "9PSB",
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        // Update Firebase
        const safeEmail = email.replace(/\./g, ',');
        await db.ref(`users/${safeEmail}`).update(accountData);

        res.json(accountData);

    } catch (error) {
        const errMsg = error.response?.data?.message || error.message;
        console.error("❌ API Error:", errMsg);
        res.status(500).json({ error: "Provider Error", detail: errMsg });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Dnezerlinks Server running on port ${PORT}`));
