const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Use express.json() since we no longer need the raw buffer stream for HMAC body calculations!
router.post('/billstack', express.json(), async (req, res) => {
    const signature = req.headers['x-wiaxy-signature'] ||
                      req.headers['x-billstack-signature'] ||
                      req.headers['signature'];

    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature || !secret) {
        console.error("❌ Missing signature or secret key from incoming webhook header.");
        return res.status(401).send('Unauthorized');
    }

    try {
        // 1. Compute the MD5 equivalent of your secret key as stated in image 1000632523.jpg
        const expectedSignature = crypto.createHash('md5').update(secret).digest('hex');

        const incomingSigClean = signature.trim().toLowerCase();
        const expectedSigClean = expectedSignature.trim().toLowerCase();

        // 2. Strict Security Enforcement
        if (incomingSigClean !== expectedSigClean) {
            console.error("❌ Signature authentication failed!");
            return res.status(401).send('Invalid signature');
        }

        const eventData = req.body;
        console.log("✅ Webhook verified successfully. Event type:", eventData.event);

        if (eventData.event === 'PAYMENT_NOTIFICATION') {
            const { amount, merchant_reference } = eventData.data;

            // Extract the nested account_number as structured in image 1000632522.jpg
            const account_number = eventData.data.account ? eventData.data.account.account_number : null;

            let targetUid = null;

            console.log(`🔍 Mapping Reference: ${merchant_reference} | Acc No: ${account_number}`);

            // Method A: Native Prefix check
            if (merchant_reference && merchant_reference.startsWith('VA_')) {
                const parts = merchant_reference.split('_');
                targetUid = parts[1];
            }

            // Method B: Database Fallback indexing check
            if (!targetUid) {
                console.log(`🕵️ Reference is generic (${merchant_reference}). Searching user base profile trees...`);
                const usersSnapshot = await db.ref('users').once('value');
                const usersData = usersSnapshot.val() || {};

                for (const uid in usersData) {
                    const user = usersData[uid];

                    // Match by account number inside the assigned index
                    if (user.assigned_accounts && account_number && user.assigned_accounts[account_number]) {
                        targetUid = uid;
                        break;
                    }

                    // Look inside virtual accounts collection histories
                    if (user.virtual_accounts) {
                        const matchFound = Object.values(user.virtual_accounts).some(acc =>
                            acc.account_number === account_number ||
                            acc.reference === merchant_reference ||
                            acc.account_number === merchant_reference
                        );
                        if (matchFound) {
                            targetUid = uid;
                            break;
                        }
                    }
                }
            }

            if (!targetUid) {
                console.error(`❌ Data Mapping Failure: No account matches reference data entries.`);
                return res.status(404).send("User reference mapping failed");
            }

            console.log(`💰 Funding verified account UID: ${targetUid} with Amount: ₦${amount}`);

            // Update balance atomically
            await db.ref(`users/${targetUid}/balance`).transaction((currentBalance) => {
                return (parseFloat(currentBalance) || 0) + parseFloat(amount);
            });

            // === 🚀 ADDITION 1: Save transaction logs matching your tree structure ===
            const txRef = db.ref(`transactions/${targetUid}`).push();
            const timestamp = Date.now();

            await txRef.set({
                id: txRef.key,
                amount: parseFloat(amount),
                reference: merchant_reference,
                account_number: account_number,
                type: 'credit',
                status: 'success',
                timestamp: timestamp
            });

            // === 🚀 ADDITION 2: Send homepage real-time notification node ===
            await db.ref(`users/${targetUid}/notifications`).push({
                title: "Wallet Funded",
                message: `Your account has been successfully credited with ₦${amount}.`,
                read: false,
                timestamp: timestamp
            });

            return res.status(200).send("Processed");
        }

        return res.status(200).send("Event acknowledged");

    } catch (e) {
        console.error("🔥 Webhook processing crash:", e.message);
        return res.status(400).send("Parsing error");
    }
});

module.exports = router;
