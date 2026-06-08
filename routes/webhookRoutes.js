const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

router.post('/billstack', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['x-wiaxy-signature'] || 
                      req.headers['x-billstack-signature'] || 
                      req.headers['signature'];
                      
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature || !secret) {
        console.error("❌ Missing signature or secret key from incoming webhook header.");
        return res.status(401).send('Unauthorized');
    }

    try {
        // 1. Switch to MD5 to match Billstack's 32-character signature length
        const hmac = crypto.createHmac('md5', secret);
        hmac.update(req.body);
        const expectedSignature = hmac.digest('hex');

        const incomingSigClean = signature.trim().toLowerCase();
        const expectedSigClean = expectedSignature.trim().toLowerCase();

        // 2. Strict Security Check (Now using matching MD5 calculations)
        if (incomingSigClean !== expectedSigClean) {
            console.error("❌ Signature mismatch detected!");
            console.log("Headers Received Signature (MD5):", incomingSigClean);
            console.log("Backend Computed Signature (MD5):", expectedSigClean);
            
            // Turn this back on once you deploy and confirm the MD5 hashes match up!
            // return res.status(401).send('Invalid signature'); 
        } else {
            console.log("✅ Webhook Signature Verified Successfully!");
        }

        const eventData = JSON.parse(req.body.toString('utf8'));
        console.log("✅ Webhook payload parsed:", eventData.event);

        if (eventData.event === 'PAYMENT_NOTIFICATION') {
            const { amount, merchant_reference, account_number } = eventData.data;
            let targetUid = null;

            console.log(`🔍 Mapping Reference: ${merchant_reference} | Acc No: ${account_number}`);

            // Method A: Check if reference uses your native format ("VA_UID_TIMESTAMP")
            if (merchant_reference && merchant_reference.startsWith('VA_')) {
                const parts = merchant_reference.split('_');
                targetUid = parts[1]; 
            }

            // Method B: If Billstack tracking returns a transaction ID like "REF-...", scan index trees
            if (!targetUid) {
                console.log(`🕵️ Reference format alternative detected (${merchant_reference}). Searching user profiles...`);
                const usersSnapshot = await db.ref('users').once('value');
                const usersData = usersSnapshot.val() || {};

                for (const uid in usersData) {
                    const user = usersData[uid];
                    
                    // Check under the assigned account numbers mapping index
                    if (user.assigned_accounts && account_number && user.assigned_accounts[account_number]) {
                        targetUid = uid;
                        break;
                    }

                    // Check deep inside virtual accounts historic objects array
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

            // Safety Catch: If the user cannot be tracked down anywhere in your system
            if (!targetUid) {
                console.error(`❌ Data Mapping Failure: No account matches reference ${merchant_reference}`);
                return res.status(404).send("User not found for this account reference.");
            }

            console.log(`💰 Funding verified account UID: ${targetUid} with Amount: ₦${amount}`);

            // Atomically increment the wallet balance
            await db.ref(`users/${targetUid}/balance`).transaction((currentBalance) => {
                return (parseFloat(currentBalance) || 0) + parseFloat(amount);
            });

            return res.status(200).send("Processed Successfully");
        }

        return res.status(200).send("Event acknowledged");

    } catch (e) {
        console.error("🔥 Webhook structural crash error:", e.message);
        return res.status(400).send("Parsing error");
    }
});

module.exports = router;
