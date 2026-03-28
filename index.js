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
    const { email, first_name, last_name, phone } = req.body;
    
    try {
        const safeEmail = email.replace(/\./g, ',');
        const userRef = db.ref(`users/${safeEmail}`);

        // Try the NEW 2026 Reserved Account Endpoint
        const response = await axios.post('https://api.billstack.co/v1/reserved-accounts', 
            { 
                email: email,
                first_name: first_name || "Customer",
                last_name: last_name || "Dnezer",
                phone: phone || "08000000000",
                currency: "NGN"
            }, 
            { 
                headers: { 
                    'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 12000 
            }
        );

        const accountData = {
            bank_name: response.data.data.bank_name || "9PSB",
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        await userRef.update(accountData);
        res.json(accountData);

    } catch (error) {
        const apiError = error.response?.data?.message || error.message;
        console.error("Billstack Error:", apiError);
        res.status(500).json({ error: "API Error: " + apiError });
    }
});

app.listen(process.env.PORT || 10000);
