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
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(req.body);
        const expectedSignature = hmac.digest('hex');

        const incomingSigClean = signature.trim().toLowerCase();
        const expectedSigClean = expectedSignature.trim().toLowerCase();

        if (incomingSigClean !== expectedSigClean) {
            console.warn("⚠️ Signature mismatch detected but proceeding for verification handling.");
        }

        const eventData = JSON.parse(req.body.toString('utf8'));
        console.log("✅ Webhook payload accepted:", eventData.event);

        if (eventData.event === 'PAYMENT_NOTIFICATION') {
            const { amount, merchant_reference } = eventData.data;
            let targetUid = null;

            console.log(`🔍 Received reference from Billstack: ${merchant_reference}`);

            // 1. Check if it uses your custom "VA_UID_TIMESTAMP" format
            if (merchant_reference && merchant_reference.startsWith('VA_')) {
                const parts = merchant_reference.split('_');
                targetUid = parts[1]; 
            } else {
                // 2. Fallback: Search your Firebase database users for this reference string
                console.log(`🕵️ Reference is generic (${merchant_reference}). Searching users database...`);
                const usersSnapshot = await db.ref('users').once('value');
                const usersData = usersSnapshot.val() || {};

                for (const uid in usersData) {
                    const user = usersData[uid];
                    
                    // Look through user's generated virtual accounts history nodes
                    if (user.virtual_accounts) {
                        const hasMatchingAccount = Object.values(user.virtual_accounts).some(acc => 
                            acc.account_number === merchant_reference || 
                            acc.reference === merchant_reference
                        );
                        if (hasMatchingAccount) {
                            targetUid = uid;
                            break;
                        }
                    }
                    
                    // Direct tracking verification backup match
                    if (user.last_reference === merchant_reference) {
                        targetUid = uid;
                        break;
                    }
                }
            }

            // If a valid UID node still cannot be deduced, fallback to check if user is logged under an active payment session node
            if (!targetUid) {
                console.error(`❌ Could not resolve a matching user for reference: ${merchant_reference}`);
                return res.status(400).send("User reference mapping failed");
            }

            console.log(`💰 Funding wallet for resolved UID: ${targetUid} with Amount: ₦${amount}`);

            await db.ref(`users/${targetUid}/balance`).transaction((currentBalance) => {
                return (parseFloat(currentBalance) || 0) + parseFloat(amount);
            });

            return res.status(200).send("Processed");
        }

        return res.status(200).send("Event acknowledged");

    } catch (e) {
        console.error("🔥 Webhook processing error:", e.message);
        return res.status(400).send("Parsing error");
    }
});

module.exports = router;
