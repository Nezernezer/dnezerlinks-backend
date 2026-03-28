const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // Updated URL: Ensure there is no trailing slash and matches your console exactly
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("Firebase Admin Initialized");
    } catch (e) { console.error("Init Error:", e.message); }
}

const db = admin.database();

app.get('/', (req, res) => res.send("Dnezerlinks API Online"));

app.post('/get-virtual-account', async (req, res) => {
    const { email } = req.body;
    try {
        const safeEmail = email.replace(/\./g, ',');
        const userRef = db.ref(`users/${safeEmail}`);

        // If the DB is being slow, we SKIP it and go straight to Billstack 
        // to ensure the user gets their account number!
        let existingData = null;
        try {
            const snapshot = await Promise.race([
                userRef.once('value'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);
            existingData = snapshot.val();
        } catch (e) {
            console.log("Database fetch timed out, bypassing to Billstack...");
        }

        if (existingData && existingData.account_number) {
            return res.json(existingData);
        }

        // Call Billstack directly
        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', 
            { email, currency: "NGN", bank_code: "999991" }, 
            { 
                headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}` },
                timeout: 10000 
            }
        );

        const accountData = {
            bank_name: response.data.data.bank_name,
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        // Save to DB in the background (don't wait for it)
        userRef.update(accountData).catch(err => console.error("Late DB Update Fail:", err.message));

        res.json(accountData);
    } catch (error) {
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

app.listen(process.env.PORT || 10000);
