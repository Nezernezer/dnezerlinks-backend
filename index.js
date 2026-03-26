const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // UPDATED TO MATCH YOUR SCREENSHOT:
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com/"
        });
        console.log("Connected to Dnezerlinks Main Database");
    } catch (err) {
        console.error("Firebase Init Error:", err.message);
    }
}

const db = admin.database();
const encodeEmail = (email) => email.replace(/\./g, ',');

app.post('/get-virtual-account', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const safeEmail = encodeEmail(email);
    const userRef = db.ref(`users/${safeEmail}`);

    try {
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();

        // If account already exists, return it
        if (userData && userData.account_number) {
            return res.json(userData);
        }

        // Request from Billstack
        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', 
        { email, currency: "NGN", bank_code: "999991" }, 
        { headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}` } });

        const newAccount = {
            bank_name: response.data.data.bank_name,
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        // SAVE DIRECTLY INTO YOUR 'users' FOLDER
        await userRef.update(newAccount);
        res.json(newAccount);

    } catch (error) {
        res.status(500).json({ error: "Database/Provider Error" });
    }
});

app.listen(process.env.PORT || 3000);
