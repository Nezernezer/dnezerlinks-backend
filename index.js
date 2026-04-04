const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(cors({ origin: '*' }));

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
});
const db = admin.database();

app.post('/webhook', async (req, res) => {
    const secret = process.env.BILLSTACK_SECRET_KEY;
    const signature = req.headers['x-billstack-signature'];
    if (!signature) return res.status(400).send('No signature');

    const hash = crypto.createHmac('sha512', secret).update(req.rawBody).digest('hex');
    if (hash !== signature) return res.status(401).send('Unauthorized');

    res.status(200).send('OK');
    const payload = req.body;
    if (payload.event === 'PAYMENT_NOTIFICATION' || payload.event === 'TRANSACTION_SUCCESS') {
        try {
            const rawAccNo = payload.data.account.account_number;
            const amount = Number(payload.data.amount);
            const netAmount = amount * 0.98;
            const usersRef = db.ref('users');
            let snapshot = await usersRef.orderByChild('account_number').equalTo(String(rawAccNo)).once('value');
            if (!snapshot.exists()) snapshot = await usersRef.orderByChild('account_number').equalTo(Number(rawAccNo)).once('value');

            if (snapshot.exists()) {
                const uid = Object.keys(snapshot.val())[0];
                await db.ref(`users/${uid}/balance`).transaction(c => (Number(c) || 0) + netAmount);
                await db.ref(`notifications/${uid}`).push({
                    message: `Your wallet credited with ₦${netAmount.toLocaleString()}`,
                    timestamp: Date.now(),
                    read: false
                });
            }
        } catch (err) { console.error("WEBHOOK ERROR:", err.message); }
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks Backend is Online'));
app.listen(process.env.PORT || 3000);
