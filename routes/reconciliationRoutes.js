
const admin = require('firebase-admin');
const axios = require('axios');

const reconciliationGatekeeper = async (req, res, next) => {
    const { uid, userId } = req.body || {};
    const activeUid = uid || userId;

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

                if (tx.status === 'pending') {
                    // 2-minute safety guard window
                    if (tx.timestamp && (now - tx.timestamp < 120000)) {
                        continue;
                    }

                    console.log(`🛡️ Gatekeeper Sync: Reconciling transaction reference (${tx.reference || txKey})`);

                    try {
                        const targetReference = tx.reference || txKey;

                        // Query VTUNaija using the pre-mapped tracking key
                        const checkResponse = await axios.get(
                            `https://vtunaija.com.ng/api/queryTransaction/index.php?transaction_id=${targetReference}`,
                            {
                                headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` },
                                timeout: 10000
                            }
                        );

                        if (checkResponse && checkResponse.data) {
                            const apiStatus = String(checkResponse.data.Status || checkResponse.data.status || "").toLowerCase();
                            const apiResponse = String(checkResponse.data.api_response || "").toLowerCase();
                            const oldAmount = parseFloat(tx.amount);

                            if (apiStatus === "successful" || apiStatus === "success") {
                                // Double-check if balance was already deducted, deduct only if it wasn't.
                                // If your design debits at reconciliation phase, update here:
                                await db.ref(`transactions/${activeUid}/${txKey}`).update({ status: "successful" });
                                console.log(`✅ Automated Sync Success for ${txKey}`);

                            } else if (apiStatus === "failed" || apiStatus === "fail") {
                                // Safe automatic wallet refund
                                await userRef.transaction(currentBalance => (currentBalance || 0) + oldAmount);
                                await db.ref(`transactions/${activeUid}/${txKey}`).update({ status: "failed" });
                                console.log(`❌ Automated Sync Fail: Refunded ₦${oldAmount}`);

                            } else if (apiResponse.includes("not found") || apiResponse.includes("invalid")) {
                                // 🤖 AUTO-REFUND SAFETY CRADLE:
                                // If VTUNaija returns "not found", the request timed out BEFORE it reached their platform.
                                // It never dropped into their database, meaning it is safe to auto-fail and refund.
                                await userRef.transaction(currentBalance => (currentBalance || 0) + oldAmount);
                                await db.ref(`transactions/${activeUid}/${txKey}`).update({ status: "failed" });
                                console.log(`🤖 Auto-Clean: Request never hit provider. Refunded ₦${oldAmount}`);
                            }
                        }
                    } catch (err) {
                        console.error(`⚠️ Individual sync tracking failed for ${txKey}:`, err.message);
                    }
                }
            }
        }
    } catch (globalErr) {
        console.error("❌ Reconciliation gatekeeper failure:", globalErr.message);
    }

    next();
};

module.exports = reconciliationGatekeeper;
