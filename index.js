const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Setup
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

console.log("✅ Server starting... Billstack key present:", !!process.env.BILLSTACK_SECRET_KEY);

// Test Route
app.get('/test', (req, res) => {
    res.json({
        status: "Backend is LIVE",
        time: new Date().toISOString(),
        billstack_key_set: !!process.env.BILLSTACK_SECRET_KEY
    });
});

// Main Route
app.post('/get-virtual-account', async (req, res) => {
    const { email, firstName, lastName, phone } = req.body;
    console.log("\n=== REQUEST RECEIVED ===");
    console.log("Email:", email);

    if (!email) return res.status(400).json({ error: "Email is required" });

    try {
        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();

        if (doc.exists && doc.data().accountNumber) {
            console.log("✅ Returning existing account");
            return res.json(doc.data());
        }

        console.log("Calling Billstack...");

        const payload = {
            email: email,
            firstName: firstName || "Dnezer",
            lastName: lastName || "User",
            phone: phone || "08000000000",
            reference: `dnezer_${Date.now()}`
        };

        const response = await axios.post(
            'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
            payload,
            {
                headers: {
                    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );

        console.log("Billstack Response:", JSON.stringify(response.data, null, 2));

        const billData = response.data?.data || response.data;

        const dataToSave = {
            bankName: billData.bank_name || billData.bankName || "PalmPay",
            accountNumber: billData.account_number || billData.accountNumber,
            accountName: billData.account_name || billData.accountName,
            walletBalance: doc.exists ? (doc.data().walletBalance || 0) : 0
        };

        await userRef.set(dataToSave, { merge: true });

        console.log("✅ SUCCESS - Account created:", dataToSave.accountNumber);
        res.json(dataToSave);

    } catch (e) {
        console.error("❌ ERROR:", e.message);
        if (e.response) console.error("Billstack details:", JSON.stringify(e.response.data, null, 2));
        res.status(500).json({ 
            error: "Failed to create virtual account",
            details: e.response ? e.response.data : e.message 
        });
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks Backend is ONLINE 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
