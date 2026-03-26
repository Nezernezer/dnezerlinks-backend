const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// FIXED Firebase Setup - Handles "5 NOT_FOUND" error
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
}

const db = admin.firestore();  // Default database

console.log("✅ Server starting... Billstack key:", !!process.env.BILLSTACK_SECRET_KEY);

// Test route
app.get('/test', (req, res) => {
    res.json({
        status: "Backend is LIVE",
        time: new Date().toISOString(),
        billstack_key_set: !!process.env.BILLSTACK_SECRET_KEY
    });
});

// Virtual Account Route
app.post('/get-virtual-account', async (req, res) => {
    const { email, firstName, lastName, phone } = req.body;
    console.log("\n=== REQUEST ===", { email });

    if (!email) return res.status(400).json({ error: "Email required" });

    try {
        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();
        console.log("Firestore doc exists:", doc.exists);

        if (doc.exists && doc.data().accountNumber) {
            console.log("✅ Existing account found");
            return res.json(doc.data());
        }

        console.log("Creating new account on Billstack...");

        const payload = {
            email,
            firstName: firstName || "Dnezer",
            lastName: lastName || "User",
            phone: phone || "08000000000",
            reference: `dnezer_${Date.now()}`,
            bank: "PALMPAY"
        };

        const response = await axios.post(
            'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
            payload,
            {
                headers: {
                    Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 25000
            }
        );

        console.log("Billstack Success:", JSON.stringify(response.data, null, 2));

        const billData = response.data?.data || response.data;

        const dataToSave = {
            bankName: billData.bank_name || billData.bankName || "PalmPay",
            accountNumber: billData.account_number || billData.accountNumber,
            accountName: billData.account_name || billData.accountName,
            walletBalance: doc.exists ? (doc.data().walletBalance || 0) : 0
        };

        await userRef.set(dataToSave, { merge: true });
        console.log("✅ Saved to Firestore:", dataToSave.accountNumber);

        res.json(dataToSave);

    } catch (e) {
        console.error("❌ ERROR:", e.message);
        if (e.response) console.error("Billstack:", JSON.stringify(e.response.data, null, 2));
        res.status(500).json({
            error: "Failed to create virtual account",
            details: e.message,
            billstack: e.response ? e.response.data : null
        });
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks Backend is ONLINE 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
