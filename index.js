const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

// Initialize Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
});
const db = admin.database();

// 1. WEBHOOK RECEIVER (Optimized for speed)
app.post('/webhook', async (req, res) => {
    // CRITICAL: Respond to Billstack immediately so Status 0 goes away
    res.status(200).send('OK');

    const payload = req.body;
    console.log("PAYLOAD:", JSON.stringify(payload));

    if (payload.event === 'PAYMENT_NOTIFICATION') {
        try {
            const accNo = String(payload.data.account.account_number);
            const amount = Number(payload.data.amount);

            // Find user by account_number
            const snapshot = await db.ref('users')
                .orderByChild('account_number')
                .equalTo(accNo)
                .once('value');
            
            if (snapshot.exists()) {
                const uid = Object.keys(snapshot.val())[0];
                await db.ref(`users/${uid}/balance`).transaction(curr => (curr || 0) + amount);
                console.log(`✅ Credited ${uid} with N${amount}`);
            } else {
                console.log(`❌ No user for account ${accNo}`);
            }
        } catch (err) {
            console.error("Internal Error:", err.message);
        }
    }
});

// 2. HEALTH CHECK (To test if Render is alive)
app.get('/', (req, res) => res.send('Backend is LIVE'));

app.listen(process.env.PORT || 3000);
