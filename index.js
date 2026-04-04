const express = require('express');
const admin = require('firebase-admin');
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

app.post('/webhook', async (req, res) => {
    res.status(200).send('OK');
    const payload = req.body;
    const txRef = payload.data && (payload.data.reference || payload.data.transaction_id);

    if (payload.event === 'PAYMENT_NOTIFICATION' || payload.event === 'TRANSACTION_SUCCESS') {
        try {
            if (txRef) {
                const txCheck = await db.ref(`processed_transactions/${txRef}`).once('value');
                if (txCheck.exists()) {
                    console.log(`[DUPLICATE] Transaction ${txRef} already processed. Skipping.`);
                    return;
                }
            }

            const rawAccNo = payload.data.account.account_number;
            const amount = Number(payload.data.amount);
            const netAmount = amount * 0.98;

            const usersRef = db.ref('users');
            let snapshot = await usersRef.orderByChild('account_number').equalTo(String(rawAccNo)).once('value');
            if (!snapshot.exists()) {
                snapshot = await usersRef.orderByChild('account_number').equalTo(Number(rawAccNo)).once('value');
            }

            if (snapshot.exists()) {
                const uid = Object.keys(snapshot.val())[0];
                if (txRef) {
                    await db.ref(`processed_transactions/${txRef}`).set({
                        uid: uid,
                        amount: netAmount,
                        timestamp: Date.now()
                    });
                }
                await db.ref(`users/${uid}/balance`).transaction((current) => {
                    return (Number(current) || 0) + netAmount;
                });
                await db.ref(`notifications/${uid}`).push({
                    message: `your wallet has been credited through your account number with ₦${netAmount.toLocaleString()}`,
                    timestamp: Date.now(),
                    read: false
                });
            }
        } catch (err) {
            console.error("WEBHOOK ERROR:", err.message);
        }
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks Backend is Online'));
app.listen(process.env.PORT || 3000);
