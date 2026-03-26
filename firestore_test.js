const admin = require('firebase-admin');

// 1. Initialize with your Render Environment Variable (Simulated)
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase SDK Initialized");
} catch (e) {
    console.error("❌ Firebase Init Failed: Check your FIREBASE_SERVICE_ACCOUNT JSON");
    process.exit(1);
}

const db = admin.firestore();

async function checkConnection() {
    try {
        console.log("⏳ Attempting to read Firestore...");
        // 2. Try to fetch the 'users' collection
        const snapshot = await db.collection('users').limit(1).get();
        console.log("✅ Firestore Connection SUCCESS!");
        console.log(`📊 Found ${snapshot.size} users in your database.`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Firestore Connection FAILED!");
        console.error("Error Detail:", error.message);
        process.exit(1);
    }
}

checkConnection();
