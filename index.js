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
    
    if (payload.event === 'PAYMENT_NOTIFICATION' || payload.event === 'TRANSACTION_SUCCESS') {
        try {
            const data = payload.data;
            const reference = data.reference || data.tx_ref || data.id; 
            
            if (!reference) return console.error("No reference found");

            // --- DUPLICATE CHECK START ---
            const processedRef = db.ref(`processed_payments/${reference}`);
            const check = await processedRef.once('value');
            
            if (check.exists()) {
                console.log(`Duplicate detected: ${reference}. Skipping.`);
                return;
            }
            // --- DUPLICATE CHECK END ---

            const rawAccNo = data.account.account_number;
            const amount = Number(data.amount);
            const netAmount = amount * 0.98;

            const usersRef = db.ref('users');
            let snapshot = await usersRef.orderByChild('account_number').equalTo(String(rawAccNo)).once('value');
            if (!snapshot.exists()) {
                snapshot = await usersRef.orderByChild('account_number').equalTo(Number(rawAccNo)).once('value');
            }

            if (snapshot.exists()) {
                const uid = Object.keys(snapshot.val())[0];

                // Save reference immediately to block duplicates
                await processedRef.set({
                    uid,
                    amount,
                    timestamp: admin.database.ServerValue.TIMESTAMP
                });

                await db.ref(`users/${uid}/balance`).transaction((current) => {
                    return (Number(current) || 0) + netAmount;
                });

                await db.ref(`notifications/${uid}`).push({
                    message: `Wallet credited: ₦${netAmount.toLocaleString()} (Ref: ${reference})`,
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
