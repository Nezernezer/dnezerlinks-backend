const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');

// Initialize Firebase Admin (Using your Render Env Variable)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(express.json());

// Main Route: Get or Create Virtual Account
app.post('/sync-account', async (req, res) => {
    const { email, firstName, lastName, phone } = req.body;

    try {
        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();

        // 1. If user already has an account number, just return it
        if (doc.exists && doc.data().accountNumber) {
            return res.json({ status: "exists", data: doc.data() });
        }

        // 2. If no account exists, call Billstack v2
        console.log(`Creating PalmPay account for: ${email}`);
        const billstackReq = await axios.post(
            'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
            { 
                email, 
                reference: `DNEZER_${Date.now()}`, 
                firstName: firstName || "User", 
                lastName: lastName || "Customer", 
                phone: phone || "08000000000", 
                bank: "PALMPAY" 
            },
            { headers: { 'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}` } }
        );

        const account = billstackReq.data.data.account[0];

        // 3. Save to Firebase (merging with existing data if any)
        const userData = {
            email,
            firstName: firstName || "User",
            walletBalance: doc.exists ? doc.data().walletBalance : 0,
            bankName: account.bank_name,
            accountNumber: account.account_number,
            accountName: account.account_name
        };

        await userRef.set(userData, { merge: true });

        res.json({ status: "created", data: userData });
    } catch (error) {
        console.error("Sync Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Provisioning failed" });
    }
});

// Webhook for Auto-Funding
app.post('/webhook', async (req, res) => {
    const event = req.body;
    if (event.event === 'payment.success') {
        const email = event.data.customer.email;
        const amountNaira = event.data.amount / 100;
        await db.collection('users').doc(email).update({
            walletBalance: admin.firestore.FieldValue.increment(amountNaira)
        });
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Dnezerlinks Backend v2.1 Live'));
// Last Update: Thu Mar 26 07:47:10 WAT 2026
// Last Update: Thu Mar 26 08:24:57 WAT 2026
