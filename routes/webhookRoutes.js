// =========================================================================
// BILLSTACK WEBHOOK ROUTE (DEFENSIVE ERROR-PROOFED VERSION + ₦70 FIRST FUNDING BONUS)
// =========================================================================
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/firebase');

router.post('/', async (req, res) => {
    // ALWAYS return 200 OK immediately or at the end to prevent Billstack retry loops
    try {
        const headers = req.headers || {};
        const body = req.body || {};

        console.log("🔍 Incoming Billstack Webhook Body:", JSON.stringify(body, null, 2));

        const eventData = body;
        const dataObj = eventData.data || eventData;
        const eventType = eventData.event || eventData.event_type || dataObj.type || 'PAYMENT_NOTIFICATION';

        // Check if this is a charge/payment event
        const isPayment = String(eventType).toUpperCase().includes('PAYMENT') ||
                          String(eventType).toUpperCase().includes('CHARGE') ||
                          String(eventType).toUpperCase().includes('RESERVED_ACCOUNT') ||
                          dataObj.amount !== undefined;

        if (!isPayment) {
            console.log(`ℹ️ Non-payment event received: ${eventType}, skipping credit action.`);
            return res.status(200).send("Event acknowledged - Non-payment");
        }

        const amount = parseFloat(dataObj.amount || dataObj.amountPaid || 0);
        const merchant_reference = dataObj.merchant_reference || dataObj.reference || '';
        const transaction_ref = dataObj.transaction_ref || dataObj.transactionReference || dataObj.wiaxy_ref || `fallback_${Date.now()}`;
        const uniqueTxIdentifier = String(transaction_ref);

        // Safe account number and object extraction
        const accountObj = dataObj.account || (Array.isArray(dataObj.payer) && dataObj.payer[0]) || {};
        const account_number = String(accountObj.account_number || dataObj.account_number || dataObj.destinationAccountDetails?.accountNumber || '');

        console.log(`🔍 Parsed Data -> Amount: ${amount}, Account: ${account_number}, Ref: ${merchant_reference}, TxRef: ${uniqueTxIdentifier}`);

        let targetUid = null;

        // 1. Check reference format VA_UID_<timestamp> where parts[1] is the Firebase User UID
        if (merchant_reference && String(merchant_reference).startsWith('VA_')) {
            const parts = merchant_reference.split('_');
            if (parts.length > 1 && parts[1]) {
                targetUid = parts[1];
                console.log(`🎯 Matched User UID ${targetUid} directly via Merchant Reference format`);
            }
        }

        // 2. Scan Firebase users if targetUid was not extracted from reference format
        if (!targetUid) {
            const usersSnapshot = await db.ref('users').once('value');
            const usersData = usersSnapshot.val() || {};

            for (const uid in usersData) {
                const user = usersData[uid] || {};

                const dbAccNum = user.account_number ? String(user.account_number).trim() : '';
                const incomingAccNum = account_number ? String(account_number).trim() : '';
                const dbRef = user.reference ? String(user.reference).trim() : '';
                const incomingRef = merchant_reference ? String(merchant_reference).trim() : '';

                if (
                    (incomingAccNum && dbAccNum === incomingAccNum) ||
                    (incomingRef && (dbAccNum === incomingRef || dbRef === incomingRef))
                ) {
                    targetUid = uid;
                    console.log(`🎯 Matched User UID ${targetUid} via Root Account/Reference`);
                    break;
                }

                if (user.assigned_accounts && incomingAccNum) {
                    const matchedAssigned = Object.values(user.assigned_accounts).some(acc =>
                        acc && String(acc.account_number || '').trim() === incomingAccNum
                    );
                    if (matchedAssigned) {
                        targetUid = uid;
                        console.log(`🎯 Matched User UID ${targetUid} via assigned_accounts`);
                        break;
                    }
                }

                if (user.virtual_accounts) {
                    const matchedVirtual = Object.values(user.virtual_accounts).some(acc =>
                        acc && (
                            (incomingAccNum && String(acc.account_number || '').trim() === incomingAccNum) ||
                            (incomingRef && String(acc.reference || '').trim() === incomingRef)
                        )
                    );
                    if (matchedVirtual) {
                        targetUid = uid;
                        console.log(`🎯 Matched User UID ${targetUid} via virtual_accounts`);
                        break;
                    }
                }
            }
        }

        // 3. Fallback to Customer Email if still not found
        if (!targetUid && dataObj.customer && dataObj.customer.email) {
            const customerEmail = String(dataObj.customer.email).toLowerCase().trim();
            const usersSnapshot = await db.ref('users').once('value');
            const usersData = usersSnapshot.val() || {};

            for (const uid in usersData) {
                const user = usersData[uid] || {};
                if (user.email && String(user.email).toLowerCase().trim() === customerEmail) {
                    targetUid = uid;
                    console.log(`🎯 Matched User UID ${targetUid} via Email: ${customerEmail}`);
                    break;
                }
            }
        }

        if (!targetUid) {
            console.warn(`⚠️ MAPPING FAILED: Could not match account [${account_number}] or ref [${merchant_reference}] to any user.`);
            return res.status(200).send("Event acknowledged - Unmapped user");
        }

        // Idempotency check via Firebase transaction
        const processedRef = db.ref(`processed_webhooks/${uniqueTxIdentifier}`);
        let isDuplicate = false;

        await processedRef.transaction((currentValue) => {
            if (currentValue === null) {
                return { processed: true, timestamp: Date.now() };
            } else {
                isDuplicate = true;
                return;
            }
        });

        if (isDuplicate) {
            console.log(`⚠️ Duplicate Webhook Ignored: ${uniqueTxIdentifier}`);
            return res.status(200).send("Already Processed");
        }

        const feeCharged = amount * 0.015;
        const netAmountToCredit = amount - feeCharged;

        // --- ₦70 FIRST FUNDING BONUS CHECK & LOGIC ---
        let bonusAmount = 0;
        const BONUS_THRESHOLD = 1000; // Minimum funding amount required
        const BONUS_REWARD = 70;      // Exactly ₦70 bonus as requested

        const userBonusRef = db.ref(`users/${targetUid}/hasReceivedFirstBonus`);
        let awardedBonusThisTx = false;

        await userBonusRef.transaction((hasReceived) => {
            // If already marked true, skip granting bonus again
            if (hasReceived === true) {
                return; 
            }

            // If not yet rewarded and amount meets or exceeds ₦1,000, grant ₦70 once
            if (amount >= BONUS_THRESHOLD) {
                awardedBonusThisTx = true;
                bonusAmount = BONUS_REWARD;
                return true; // Permanently lock hasReceivedFirstBonus to true
            }

            return hasReceived; 
        });

        const totalCreditAmount = netAmountToCredit + bonusAmount;

        // Credit user balance safely (principal net amount + ₦70 bonus if qualified)
        await db.ref(`users/${targetUid}/balance`).transaction((currentBalance) => {
            return (parseFloat(currentBalance) || 0) + totalCreditAmount;
        });

        const timestamp = Date.now();

        // 1. Log main funding transaction
        const txRef = db.ref(`transactions/${targetUid}`).push();
        await txRef.set({
            id: txRef.key || 'tx_' + timestamp,
            amount: netAmountToCredit,
            reference: merchant_reference || 'Billstack Direct',
            transaction_reference: uniqueTxIdentifier,
            account_number: account_number || 'N/A',
            type: 'credit',
            status: 'success',
            timestamp: timestamp
        });

        // 2. Log separate bonus transaction if awarded
        if (awardedBonusThisTx && bonusAmount > 0) {
            const bonusTxRef = db.ref(`transactions/${targetUid}`).push();
            await bonusTxRef.set({
                id: bonusTxRef.key || 'tx_bonus_' + timestamp,
                amount: bonusAmount,
                reference: 'FIRST_FUNDING_BONUS',
                transaction_reference: `bonus_${uniqueTxIdentifier}`,
                type: 'bonus',
                status: 'success',
                timestamp: timestamp + 1
            });
        }

        // Send notification to user
        let notificationMessage = `Your account has been successfully credited with ₦${netAmountToCredit.toLocaleString(undefined, {minimumFractionDigits: 2})}.`;
        if (awardedBonusThisTx && bonusAmount > 0) {
            notificationMessage += ` Plus a ₦${bonusAmount} welcome bonus for your first funding!`;
        }

        await db.ref(`notifications/${targetUid}/${uniqueTxIdentifier}`).set({
            message: notificationMessage,
            read: false,
            timestamp: timestamp
        });

        console.log(`🎉 SUCCESSFULLY CREDITED user ${targetUid} with ₦${netAmountToCredit} ${awardedBonusThisTx ? `+ ₦${bonusAmount} welcome bonus` : ''}`);
        return res.status(200).send("Processed");

    } catch (e) {
        console.error("🔥 Safe-catch webhook internal error:", e.message, e.stack);
        return res.status(200).send("Event acknowledged with internal fallback");
    }
});

module.exports = router;
