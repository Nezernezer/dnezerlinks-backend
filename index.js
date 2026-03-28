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
    } catch (e) { console.error("Firebase Init Error"); }
}
const db = admin.database();

app.get('/', (req, res) => res.send("Dnezerlinks Backend is Live."));

// --- NEW WEBHOOK ROUTE ---
app.post('/webhook', async (req, res) => {
    const event = req.body;

    // Verify this is a successful charge/payment event
    if (event.event === 'charge.success' || event.status === 'success') {
        const { email, amount } = event.data;
        const safeEmail = email.replace(/\./g, ',');

        try {
            const userRef = db.ref(`users/${safeEmail}`);
            
            // Atomically increment the user's balance in Firebase
            await userRef.child('balance').transaction((currentBalance) => {
                return (currentBalance || 0) + parseFloat(amount);
            });

            console.log(`✅ Funded ${email} with NGN ${amount}`);
            return res.status(200).send('Webhook Received');
        } catch (error) {
            console.error("Webhook Database Error:", error.message);
            return res.status(500).send('Internal Error');
        }
    }

    res.status(200).send('Event ignored');
});

app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, phone } = req.body;

    const payload = {
        email: email,
        firstName: first_name,
        lastName: last_name,
        phone: phone,
        reference: `REF-${Date.now()}`,
        bank: "PALMPAY"
    };

    try {
        const response = await axios.post('https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
        payload,
        {
            headers: {
                'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });

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
        console.error("Billstack Error:", error.response?.data || error.message);
        res.status(500).json({
            error: "Provider Error",
            detail: error.response?.data?.message || "Check if PalmPay is enabled on your dashboard."
        });
    }
});

app.listen(process.env.PORT || 10000);
