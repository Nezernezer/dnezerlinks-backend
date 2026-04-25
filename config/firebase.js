const admin = require('firebase-admin');
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
            databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
        });
    } catch (error) { console.error("Firebase Init Error"); }
}
module.exports = admin.database();
