const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- FIREBASE INITIALIZATION ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
});
const db = admin.database();

const BILLSTACK_SECRET = process.env.BILLSTACK_SECRET;

// 1. ROUTE: GET VIRTUAL ACCOUNT (Now using UID)
app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, uid } = req.body;

    if (!uid) return res.status(400).send("User UID is required.");

    try {
        // Check if UID already has an account
        const userRef = db.ref(`users/${uid}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();

        if (userData && userData.account_number) {
            return res.json(userData);
        }

        // Request from Billstack
        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', {
            email: email,
            first_name: first_name,
            last_name: last_name,
            currency: "NGN"
        }, {
            headers: { Authorization: `Bearer ${BILLSTACK_SECRET}` }
        });

        const account = response.data.data;
        
        // SAVE TO UID FOLDER ONLY
        await userRef.update({
            account_number: account.account_number,
            bank_name: account.bank_name,
            account_name: account.account_name,
            email: email // Keep email inside the folder for webhook lookups
        });

        res.json(account);
    } catch (error) {
        console.error("Billstack Error:", error.response?.data || error.message);
        res.status(500).send("Error creating account");
    }
});

// 2. ROUTE: WEBHOOK (The "Money Receiver")
app.post('/webhook', async (req, res) => {
    const event = req.body;
    if (event.event === 'charge.success') {
        const customerEmail = event.data.customer.email;
        const amount = event.data.amount / 100; // Convert kobo to Naira

        // FIND UID BY EMAIL
        const usersRef = db.ref('users');
        const snapshot = await usersRef.orderByChild('email').equalTo(customerEmail).once('value');
        const users = snapshot.val();

        if (users) {
            const uid = Object.keys(users)[0];
            const balanceRef = db.ref(`users/${uid}/balance`);

            // Atomic increment
            await balanceRef.transaction((current) => (current || 0) + amount);
            console.log(`Funded ₦${amount} to UID: ${uid}`);
        }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
