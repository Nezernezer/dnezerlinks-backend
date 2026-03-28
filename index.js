const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
    } catch (e) { console.error("Firebase Init Fail"); }
}
const db = admin.database();

app.get('/', (req, res) => res.send("Dnezerlinks Backend is Live."));

app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, phone } = req.body;
    
    // List of possible 2026 Billstack endpoints
    const endpoints = [
        'https://api.billstack.co/v1/collections/reserved-accounts',
        'https://api.billstack.co/v1/virtual-accounts',
        'https://api.billstack.co/v1/reserved-accounts'
    ];

    for (let url of endpoints) {
        try {
            console.log(`Trying: ${url}`);
            const response = await axios.post(url, {
                email, first_name, last_name, phone,
                currency: "NGN"
            }, {
                headers: { 'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}` },
                timeout: 8000
            });

            if (response.data.data) {
                const account = response.data.data;
                const safeEmail = email.replace(/\./g, ',');
                await db.ref(`users/${safeEmail}`).update({
                    bank_name: account.bank_name || "9PSB",
                    account_number: account.account_number,
                    account_name: account.account_name
                });
                return res.json(account);
            }
        } catch (err) {
            console.log(`Failed ${url}: ${err.response?.status || err.message}`);
        }
    }

    res.status(500).json({ 
        error: "All Endpoints Failed", 
        detail: "Check Billstack Dashboard for your specific API Base URL." 
    });
});

app.listen(process.env.PORT || 10000);
