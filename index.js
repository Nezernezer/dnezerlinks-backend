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
    const payload = req.body;
    console.log("Incoming Webhook:", JSON.stringify(payload));

    // Match Billstack's specific event name from your screenshot
    if (payload.event === 'PAYMENT_NOTIFICATION') {
        const data = payload.data;
        const amount = Number(data.amount); 
        // Targeted path: data -> account -> account_number
        const accNo = String(data.account.account_number);

        try {
            const userQuery = await db.ref('users')
                .orderByChild('account_number')
                .equalTo(accNo)
                .once('value');
            
            if (userQuery.exists()) {
                const userData = userQuery.val();
                const uid = Object.keys(userData)[0];
                
                // Atomically update balance
                await db.ref(`users/${uid}/balance`).transaction((current) => {
                    return (current || 0) + amount;
                });

                console.log(`✅ SUCCESS: Credited ₦${amount} to UID: ${uid}`);
            } else {
                console.log(`❌ ERROR: No user found with account number: ${accNo}`);
            }
        } catch (err) {
            console.error("🔥 DATABASE ERROR:", err.message);
        }
    }
    
    // CRITICAL: Billstack needs a 200 OK to stop the "Status 0" error
    res.status(200).send('OK');
});

app.listen(process.env.PORT || 3000);
