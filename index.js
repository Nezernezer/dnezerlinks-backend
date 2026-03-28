const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// DIAGNOSTIC LOGGING
console.log("--- NODE STARTUP ---");

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // TRY THIS EXACT URL: It includes the region most common for new projects
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Initialized");
    } catch (err) {
        console.error("❌ Init Error:", err.message);
    }
}

const db = admin.database();

app.get('/', (req, res) => res.send("Dnezerlinks API Online"));

app.post('/get-virtual-account', async (req, res) => {
    const { email } = req.body;
    console.log(`[1] Request for: ${email}`);

    try {
        const safeEmail = email.replace(/\./g, ',');
        const userRef = db.ref(`users/${safeEmail}`);

        console.log("[2] Attempting DB Read...");
        
        // Timeout protection: if DB doesn't answer in 4s, move to Billstack anyway
        const snapshot = await Promise.race([
            userRef.once('value'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('DB_TIMEOUT')), 4000))
        ]).catch(e => {
            console.log("⚠️ DB Timed out or failed, skipping to API...");
            return null;
        });

        if (snapshot && snapshot.exists() && snapshot.val().account_number) {
            console.log("[3] Found in DB");
            return res.json(snapshot.val());
        }

        console.log("[4] Calling Billstack...");
        const response = await axios.post('https://api.billstack.co/v1/virtual-accounts', 
            { email, currency: "NGN", bank_code: "999991" }, 
            { headers: { Authorization: `Bearer ${process.env.BILLSTACK_SECRET_KEY}` }, timeout: 10000 }
        );

        const accountData = {
            bank_name: response.data.data.bank_name,
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name
        };

        console.log("[5] Saving to DB...");
        await userRef.update(accountData).catch(e => console.log("⚠️ Failed to save to DB, but sending response."));

        res.json(accountData);
    } catch (error) {
        console.error("❌ Process Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(process.env.PORT || 10000, () => console.log("🚀 Server Ready"));
