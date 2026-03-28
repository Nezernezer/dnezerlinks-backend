const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Firebase Initialization
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
    }
} catch (e) { console.error("Firebase Init Fail"); }

const db = admin.database();

app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, phone } = req.body;
    console.log(`[Dnezerlinks] Request for ${email}`);

    try {
        // Try the 2026 'Reserved Accounts' path
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
                timeout: 10000 
            }
        );

        const accountData = {
            bank_name: response.data.data.bank_name || "9PSB",
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        // Save to Firebase (Silent background update)
        const safeEmail = email.replace(/\./g, ',');
        db.ref(`users/${safeEmail}`).update(accountData).catch(e => console.log("DB Update Fail"));

        res.json(accountData);

    } catch (error) {
        // This log will show us exactly why it's a 404 in the Render dashboard
        const details = error.response?.data || error.message;
        console.error("Billstack Raw Error:", JSON.stringify(details));
        res.status(500).json({ 
            error: "API Routing Error", 
            message: "The endpoint returned 404. Please check Billstack Dashboard for the current Base URL." 
        });
    }
});

app.listen(process.env.PORT || 10000);
