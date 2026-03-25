const axios = require('axios');
const admin = require('firebase-admin');

// 1. Initialize Firebase (Uses the key you put in Render)
// For local testing in Termux, ensure you have your serviceAccount.json file
const serviceAccount = require('./serviceAccount.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function createForMe() {
    const email = "YOUR_EMAIL_HERE@gmail.com"; // Put your logged-in email here
    
    try {
        console.log("Calling Billstack...");
        const response = await axios.post(
            'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
            {
                email: email,
                reference: `DNEZER_${Date.now()}`,
                firstName: "Ahmad",
                lastName: "Naziru",
                phone: "09012345678",
                bank: "PALMPAY"
            },
            {
                headers: { 'Authorization': 'Bearer YOUR_BILLSTACK_SECRET_KEY' }
            }
        );

        const account = response.data.data.account[0];

        // 2. Save to Firestore
        await db.collection('users').doc(email).set({
            email: email,
            firstName: "Ahmad",
            walletBalance: 0,
            bankName: account.bank_name,
            accountNumber: account.account_number,
            accountName: account.account_name
        });

        console.log("Success! Refresh your fund-wallet.html now.");
    } catch (error) {
        console.error("Error:", error.response?.data || error.message);
    }
}

createForMe();
