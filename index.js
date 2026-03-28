const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();

// --- FIXED CORS CONFIG ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
    } catch (e) { console.error("Firebase Init Error"); }
}
const db = admin.database();

app.get('/', (req, res) => res.send("Dnezerlinks Backend is Live."));

app.post('/webhook', async (req, res) => {
    const event = req.body;
    if (event.event === 'charge.success' || event.status === 'success') {
        const { email, amount } = event.data;
        const safeEmail = email.replace(/\./g, ',');
        try {
            await db.ref(`users/${safeEmail}`).child('balance').transaction((current) => (current || 0) + parseFloat(amount));
            return res.status(200).send('Webhook Received');
        } catch (error) { return res.status(500).send('Internal Error'); }
    }
    res.status(200).send('Event ignored');
});

app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, phone } = req.body;
    const payload = {
        email, firstName: first_name, lastName: last_name, phone,
        reference: `REF-${Date.now()}`,
        bank: "PALMPAY"
    };
    try {
        const response = await axios.post('https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
        payload,
        { headers: { 'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}` } });
        
        const accountInfo = response.data.data.account[0];
        const accountData = {
            bank_name: accountInfo.bank_name,
            account_number: accountInfo.account_number,
            account_name: accountInfo.account_name
        };
        const safeEmail = email.replace(/\./g, ',');
        await db.ref(`users/${safeEmail}`).update(accountData);
        res.json(accountData);
    } catch (error) {
        res.status(500).json({ error: "Provider Error", detail: error.response?.data?.message || error.message });
    }
});

app.listen(process.env.PORT || 10000);
