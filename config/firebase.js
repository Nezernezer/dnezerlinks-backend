const admin = require('firebase-admin');

// ================= FIREBASE ADMIN INIT =================
if (!admin.apps.length) {
    try {
        // Ensure the Environment Variable name matches what you set in Render
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Admin Initialized Successfully");
    } catch (error) {
        console.error("❌ Firebase Init Error:", error.message);
    }
}

// Export the database instance for use in accountRoutes.js
const db = admin.database();
module.exports = db;
