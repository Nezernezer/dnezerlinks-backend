const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- 1. FIREBASE SETUP ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
});
const db = admin.database();
const BILLSTACK_SECRET = process.env.BILLSTACK_SECRET;

// --- 2. ROUTE: CREATE/GET VIRTUAL ACCOUNT ---
app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, uid } = req.body;
    if (!uid) return res.status(400).send("UID Required");

    try {
        const userRef = db.ref(`users/${uid}`);
        const snap = await userRef.once('value');
        const userData = snap.val() || {};

        // If account already exists, return it
        if (userData.account_number) return res.json(userData);

        // Request new account from Billstack
        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', {
            email, first_name, last_name, currency: "NGN"
        }, {
            headers: { Authorization: `Bearer ${BILLSTACK_SECRET}` }
        });

        const account = response.data.data;
        
        // Save to UID folder (Include email for the webhook to find this UID later)
        await userRef.update({
            account_number: account.account_number,
            bank_name: account.bank_name,
            account_name: account.account_name,
            email: email, 
            balance: userData.balance || 0
        });

        res.json(account);
    } catch (err) {
        res.status(500).send("Account Generation Failed");
    }
});

// --- 3. ROUTE: WEBHOOK (THE MONEY RECEIVER) ---
app.post('/webhook', async (req, res) => {
    const { event, data } = req.body;
    if (event === 'charge.success') {
        const email = data.customer.email;
        const amount = data.amount / 100;

        // Search for the UID that owns this email
        const userQuery = await db.ref('users').orderByChild('email').equalTo(email).once('value');
        const userMatch = userQuery.val();

        if (userMatch) {
            const uid = Object.keys(userMatch)[0];
            await db.ref(`users/${uid}/balance`).transaction(curr => (curr || 0) + amount);
            console.log(`Successfully funded ${uid} with ₦${amount}`);
        }
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 3000);
