const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// 1. Initialize Firebase with a TRY/CATCH to prevent startup crashes
try {
    if (!admin.apps.length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // Ensure this URL matches your Firebase Dashboard EXACTLY
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
    }
} catch (e) { console.error("Firebase Init Error:", e.message); }

const db = admin.database();

app.get('/', (req, res) => res.send("Dnezerlinks API is Online"));

app.post('/get-virtual-account', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    try {
        const safeEmail = email.replace(/\./g, ',');
        const userRef = db.ref(`users/${safeEmail}`);

        // 2. Wrap DB read in a 5-second timeout
        console.log("Checking Database...");
        const snapshot = await Promise.race([
            userRef.once('value'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase Timeout')), 5000))
        ]);

        if (snapshot && snapshot.exists() && snapshot.val().account_number) {
            return res.json(snapshot.val());
        }

        // 3. Wrap Billstack call in a 10-second timeout
        console.log("Requesting account from Billstack...");
        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', 
            { email, currency: "NGN", bank_code: "999991" }, 
            { 
                headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}` },
                timeout: 10000 
            }
        ).catch(err => {
            throw new Error("Billstack is currently unavailable or Key is invalid.");
        });

        const accountData = {
            bank_name: response.data.data.bank_name,
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        // 4. Update DB (don't 'await' this so the user gets the response immediately)
        userRef.update(accountData).catch(e => console.error("DB Update Failed:", e.message));

        res.json(accountData);

    } catch (error) {
        console.error("CRASH PREVENTED:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(process.env.PORT || 10000);
