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
    // 1. Send 200 immediately to keep Billstack happy
    res.status(200).send('OK');

    const payload = req.body;
    if (payload.event === 'PAYMENT_NOTIFICATION') {
        try {
            const rawAccNo = payload.data.account.account_number;
            const amount = Number(payload.data.amount);

            // 2. Search for the user (checking both String and Number types)
            const usersRef = db.ref('users');
            
            // Try searching as String first
            let snapshot = await usersRef.orderByChild('account_number').equalTo(String(rawAccNo)).once('value');
            
            // If not found, try searching as Number
            if (!snapshot.exists()) {
                snapshot = await usersRef.orderByChild('account_number').equalTo(Number(rawAccNo)).once('value');
            }

            if (snapshot.exists()) {
                const uid = Object.keys(snapshot.val())[0];
                
                // 3. Atomically update the balance
                await db.ref(`users/${uid}/balance`).transaction((current) => {
                    return (Number(current) || 0) + amount;
                });
                console.log(`✅ SUCCESS: Credited ${uid} with N${amount}`);
            } else {
                console.log(`❌ NOT FOUND: No user with account ${rawAccNo}`);
            }
        } catch (err) {
            console.error("WEBHOOK ERROR:", err.message);
        }
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks Backend is Online'));
app.listen(process.env.PORT || 3000);
