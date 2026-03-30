const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
});
const db = admin.database();

app.post('/get-virtual-account', async (req, res) => {
    const { email, first_name, last_name, uid } = req.body;
    try {
        const response = await axios.post('https://api.billstack.co/v2/virtual-accounts', 
        { email, first_name, last_name, currency: "NGN" },
        { headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET}` } });
        
        const account = response.data.data;
        await db.ref(`users/${uid}`).update({
            account_number: account.account_number,
            bank_name: account.bank_name,
            account_name: account.account_name
        });
        res.json(account);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(process.env.PORT || 3000);
