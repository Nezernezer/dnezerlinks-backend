// config/firebase.js
const admin = require('firebase-admin');

function getServiceAccount() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable not set");

    // Some platforms (like Render) escape newlines as \n in env vars
    // Replace literal \n with actual newline characters
    const cleaned = raw.replace(/\\n/g, '\n');

    try {
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", e.message);
        // Log first 200 chars for debugging
        console.error("JSON starts with:", cleaned.substring(0, 200));
        throw e;
    }
}

// Initialize only once
if (!admin.apps.length) {
    try {
        const serviceAccount = getServiceAccount();
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
        console.log("✅ Firebase Admin initialized successfully");
    } catch (error) {
        console.error("❌ Firebase Admin initialization failed:", error.message);
        process.exit(1);  // Stop the server if credentials are bad
    }
}

module.exports = admin.database();
