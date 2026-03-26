const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Setup
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
}
const db = admin.firestore();

console.log("✅ Server starting...");

app.get('/test', (req, res) => {
    res.json({ 
        status: "LIVE", 
        billstack_key: !!process.env.BILLSTACK_SECRET_KEY 
    });
});

app.post('/get-virtual-account', async (req, res) => {
    const { email, firstName, lastName } = req.body;
    console.log("Request for:", email);

    if (!email) return res.status(400).json({ error: "Email required" });

    try {
        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();

        if (doc.exists && doc.data().accountNumber) {
            return res.json(doc.data());
        }

        const payload = {
            email,
            firstName: firstName || "Dnezer",
            lastName: lastName || "User",
            phone: "08000000000",
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
                }
            }
        );

        const billData = response.data?.data || response.data;

        const dataToSave = {
            bankName: billData.bank_name || "PalmPay",
            accountNumber: billData.account_number,
            accountName: billData.account_name,
            walletBalance: 0
        };

        await userRef.set(dataToSave, { merge: true });
        console.log("Account created:", dataToSave.accountNumber);

        res.json(dataToSave);

    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) console.error("Billstack error:", e.response.data);
        res.status(500).json({ 
            error: e.message, 
            billstack: e.response?.data 
        });
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks Backend ONLINE'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on port', PORT));
