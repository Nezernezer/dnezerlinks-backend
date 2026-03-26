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

// THE ROUTE THAT WAS FAILING
app.post('/get-virtual-account', async (req, res) => {
    const { email } = req.body;
    try {
        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();
        if (doc.exists && doc.data().account_number) return res.json(doc.data());

        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', 
        { email, currency: "NGN", bank_code: "999991" }, 
        { headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}` } });

        const data = {
            bank_name: response.data.data.bank_name,
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };
        await userRef.set(data, { merge: true });
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.send('Dnezerlinks Backend is ONLINE 🚀'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server Live'));
