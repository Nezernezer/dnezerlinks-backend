// routes/reconciliationRoutes.js
const admin = require('firebase-admin');
const axios = require('axios');

const reconciliationGatekeeper = async (req, res, next) => {
    // Intercept identification keys on any request sent by any frontend
    const { uid, userId } = req.body || {};
    const activeUid = uid || userId;

    // If request contains no user context metadata, bypass quietly
    if (!activeUid) {
        return next();
    }

    try {
        const db = admin.database();
        const userTxSnap = await db.ref(`transactions/${activeUid}`).once('value');

        if (userTxSnap.exists()) {
            const transactions = userTxSnap.val();
            const userRef = db.ref(`users/${activeUid}/balance`);
            const now = Date.now();

            for (const txKey in transactions) {
                const tx = transactions[txKey];

                // Target only transactions currently stuck in 'pending' status
                if (tx.status === 'pending') {
                    
                    // Skip checking if transaction was created less than 2 minutes (120000ms) ago
                    if (tx.timestamp && (now - tx.timestamp < 120000)) {
                        continue; 
                    }

                    console.log(`🛡️ Gatekeeper Sync: Resolving stuck ${tx.service || 'transaction'} (${txKey}) for UID: ${activeUid}`);

                    try {
                        const targetReference = tx.reference || txKey;
                        
                        // Executing status verification against your working endpoint string path
                        const checkResponse = await axios.get(
                            `https://vtunaija.com.ng/api/queryTransaction/index.php?transaction_id=${targetReference}`,
                            {
                                headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` },
                                timeout: 10000 
                            }
                        );

                        if (checkResponse && checkResponse.data) {
                            const apiStatus = checkResponse.data.Status || checkResponse.data.status;
                            const oldAmount = parseFloat(tx.amount);

                            if (apiStatus === "successful" || apiStatus === "success") {
                                await db.ref(`transactions/${activeUid}/${txKey}`).update({ status: "successful" });
                                console.log(`✅ Sync Complete: Transaction ${txKey} marked successful.`);
                            } else if (apiStatus === "failed" || apiStatus === "fail") {
                                await userRef.transaction(currentBalance => (currentBalance || 0) + oldAmount);
                                await db.ref(`transactions/${activeUid}/${txKey}`).update({ status: "failed" });
                                console.log(`❌ Sync Complete: Transaction ${txKey} failed. Refunded ${oldAmount}.`);
                            }
                        }
                    } catch (err) {
                        console.error(`⚠️ Sync skipped for ${txKey}:`, err.message);
                    }
                }
            }
        }
    } catch (globalErr) {
        console.error("❌ Reconciliation gatekeeper error:", globalErr.message);
    }

    // Always bubble down immediately to continue user workflow execution smoothly
    next();
};

module.exports = reconciliationGatekeeper;
