const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// FIXED Firebase Setup - Explicit default database
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
}

// Use explicit default database
const db = admin.firestore();   // This should be (default)

console.log("✅ Server starting... Billstack key present:", !!process.env.BILLSTACK_SECRET_KEY);

app.get('/test', (req, res) => {
    res.json({ 
        status: "LIVE", 
        billstack_key: !!process.env.BILLSTACK_SECRET_KEY 
    });
});

app.post('/get-virtual-account', async (req, res) => {
    const { email, firstName, lastName } = req.body;
    console.log("Request received for:", email);

    if (!email) return res.status(400).json({ error: "Email required" });

    try {
        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();
        console.log("Document exists:", doc.exists);

        if (doc.exists && doc.data().accountNumber) {
            console.log("Returning existing account");
            return res.json(doc.data());
        }

        console.log("Calling Billstack...");

        const payload = {
            email: email,
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
                },
                timeout: 25000
            }
        );

        console.log("Billstack response received");

        const billData = response.data?.data || response.data;

        const dataToSave = {
            bankName: billData.bank_name || billData.bankName || "PalmPay",
            accountNumber: billData.account_number || billData.accountNumber,
            accountName: billData.account_name || billData.accountName,
            walletBalance: 0
        };

        await userRef.set(dataToSave, { merge: true });
        console.log("✅ Account saved:", dataToSave.accountNumber);

        res.json(dataToSave);

    } catch (e) {
        console.error("ERROR:", e.message);
        if (e.response) console.error("Billstack details:", e.response.data);
        res.status(500).json({ 
            error: e.message,
            details: e.response ? e.response.data : null 
        });
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks Backend ONLINE'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on port', PORT));
