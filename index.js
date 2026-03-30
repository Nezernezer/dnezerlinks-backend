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

// Health Check (To see if server is alive)
app.get('/', (req, res) => res.send('Dnezerlinks Backend is Online'));

app.post('/webhook', async (req, res) => {
    const payload = req.body;
    console.log("PAYLOAD RECEIVED:", JSON.stringify(payload));

    // From your screenshot: payload.event is "PAYMENT_NOTIFICATION"
    if (payload.event === 'PAYMENT_NOTIFICATION') {
        try {
            // Path from your screenshot: data -> account -> account_number
            const accNo = String(payload.data.account.account_number);
            const amount = Number(payload.data.amount);

            const userQuery = await db.ref('users')
                .orderByChild('account_number')
                .equalTo(accNo)
                .once('value');
            
            if (userQuery.exists()) {
                const snapshot = userQuery.val();
                const uid = Object.keys(snapshot)[0];
                
                await db.ref(`users/${uid}/balance`).transaction((current) => {
                    return (current || 0) + amount;
                });
                console.log(`SUCCESS: Credited ${uid} with N${amount}`);
            } else {
                console.log(`NOT FOUND: No user with account ${accNo}`);
            }
        } catch (err) {
            console.error("LOGIC ERROR:", err.message);
        }
    }
    // Billstack MUST get this 200 to change "Status 0" to "Success"
    res.status(200).json({ status: 'success' });
});

app.listen(process.env.PORT || 3000);
