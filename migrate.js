const admin = require("firebase-admin");

// Initialize Firebase Admin SDK using your key file
const serviceAccount = require("./dnezerlinks-firebase-adminsdk.json"); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com"
});

const db = admin.database();

async function runMigration() {
  console.log("⏳ Fetching all users from Realtime Database...");
  const usersRef = db.ref("users");
  
  try {
    const snapshot = await usersRef.once("value");
    const allUsers = snapshot.val();

    if (!allUsers) {
      console.log("❌ No users found to migrate.");
      process.exit(0);
    }

    const uids = Object.keys(allUsers);
    console.log(`📋 Found ${uids.length} total user records. Processing...`);

    let migratedCount = 0;

    for (const uid of uids) {
      const user = allUsers[uid];

      // Look for the old standalone account structure layout fields
      if (user.account_number && user.bank_name) {
        
        // Safety Check: Avoid duplicating if they already have this account inside the sub-node
        let alreadyMigrated = false;
        if (user.virtual_accounts) {
          alreadyMigrated = Object.values(user.virtual_accounts).some(acc => 
            acc.account_number === user.account_number
          );
        }

        if (alreadyMigrated) {
          console.log(`⏩ Skipping ${user.name || uid}: Account already existing inside sub-node.`);
          continue;
        }

        // Structure data cleanly to match your static boxes checking logic
        const newAccountData = {
          bank_name: user.bank_name,
          account_number: user.account_number,
          account_name: user.account_name || user.name || "Customer Account"
        };

        // Create a unique automatic push key node under users/UID/virtual_accounts
        const newRecordRef = db.ref(`users/${uid}/virtual_accounts`).push();
        await newRecordRef.set(newAccountData);
        
        console.log(`✅ Successfully migrated ${user.bank_name} for ${user.name || uid}`);
        migratedCount++;
      }
    }

    console.log(`\n🎉 Migration complete! Successfully upgraded ${migratedCount} accounts.`);
    process.exit(0);

  } catch (error) {
    console.error("❌ Critical migration failure error:", error);
    process.exit(1);
  }
}

runMigration();
