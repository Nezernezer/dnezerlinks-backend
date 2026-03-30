const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' })); // Allows your Firebase site to talk to Render

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
});
const db = admin.database();
const BILLSTACK_SECRET = process.env.BILLSTACK_SECRET;

app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, uid } = req.body;
    if (!uid) return res.status(400).send("UID is required");

    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        let userData = snap.val() || {};

        if (userData.account_number) return res.json(userData);

        const response = await axios.post('https://api.billstack.co/v2/virtual-accounts', {
            email, first_name, last_name, currency: "NGN"
        }, {
            headers: { Authorization: `Bearer ${BILLSTACK_SECRET}` }
        });

        const account = response.data.data;
        await userRef.update({
            account_number: account.account_number,
            bank_name: account.bank_name,
            account_name: account.account_name,
            email: email, 
            balance: userData.balance || 0
        });
        res.json(account);
    } catch (err) {
        res.status(500).json({ error: err.message, details: err.response?.data });
    }
});

app.post('/webhook', async (req, res) => {
    const { event, data } = req.body;
    if (event === 'charge.success') {
        const email = data.customer.email;
        const amount = data.amount / 100;
        const userQuery = await db.ref('users').orderByChild('email').equalTo(email).once('value');
        const userMatch = userQuery.val();
        if (userMatch) {
            const uid = Object.keys(userMatch)[0];
            await db.ref(`users/${uid}/balance`).transaction(c => (c || 0) + amount);
        }
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 3000);
