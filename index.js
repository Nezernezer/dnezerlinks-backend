const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Setup - Fixed for "5 NOT_FOUND" error
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
}

const db = admin.firestore();

console.log("✅ Server starting... Billstack key present:", !!process.env.BILLSTACK_SECRET_KEY);

// Test Route
app.get('/test', (req, res) => {
    res.json({
        status: "Backend is LIVE",
        time: new Date().toISOString(),
        billstack_key_set: !!process.env.BILLSTACK_SECRET_KEY,
        firestore_ready: true
    });
});

// Main Virtual Account Route
app.post('/get-virtual-account', async (req, res) => {
    const { email, firstName, lastName, phone } = req.body;
    console.log("\n=== /get-virtual-account REQUEST ===");
    console.log("Email:", email);

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    try {
        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();
        console.log("Firestore doc exists:", doc.exists);

        if (doc.exists && doc.data().accountNumber) {
            console.log("✅ Returning existing account");
            return res.json(doc.data());
        }

        console.log("Calling Billstack with bank: PALMPAY...");

        const payload = {
            email: email,
            firstName: firstName || "Dnezer",
            lastName: lastName || "User",
            phone: phone || "08000000000",
            reference: `dnezer_${Date.now()}`,
            bank: "PALMPAY"                     // Required by Billstack
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
        console.log("✅ Account saved successfully:", dataToSave.accountNumber);

        res.json(dataToSave);

    } catch (e) {
        console.error("❌ FULL ERROR:", e.message);
        if (e.response) {
            console.error("Billstack Error:", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("Other error (Firestore/Admin):", e.code || e);
        }
        res.status(500).json({
            error: "Failed to create virtual account",
            details: e.message,
            code: e.code || null
        });
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks Backend is ONLINE 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
