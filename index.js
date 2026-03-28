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
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
    } catch (e) { console.error("Firebase Init Error"); }
}

const db = admin.database();

app.post('/get-virtual-account', async (req, res) => {
    const { email } = req.body;
    try {
        const safeEmail = email.replace(/\./g, ',');
        const userRef = db.ref(`users/${safeEmail}`);

        // Try the 2026 "Collections" endpoint which is the current 9PSB/Billstack standard
        const response = await axios.post('https://api.billstack.co/v1/collections/virtual-account', 
            { 
                email: email,
                currency: "NGN",
                bank_code: "999991" 
            }, 
            { 
                headers: { 
                    'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 
            }
        );

        const accountData = {
            bank_name: response.data.data.bank_name || "9PSB/PalmPay",
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        userRef.update(accountData).catch(e => console.log("DB Update Background Fail"));
        res.json(accountData);

    } catch (error) {
        // If this STILL returns 404, the Billstack API Key is likely for an older version
        const apiError = error.response?.data?.message || error.message;
        console.error("Billstack Error:", apiError);
        res.status(500).json({ error: "API Error: " + apiError });
    }
});

app.listen(process.env.PORT || 10000);
