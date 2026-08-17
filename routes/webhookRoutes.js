// =========================================================================
// BILLSTACK WEBHOOK ROUTE (DEFENSIVE ERROR-PROOFED VERSION)
// =========================================================================
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/firebase');

router.post('/webhook', async (req, res) => {
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

        // Safe account number extraction using optional chaining
        const account_number = dataObj.account?.account_number || 
                               dataObj.account_number || 
                               dataObj.destinationAccountDetails?.accountNumber || '';

        console.log(`🔍 Parsed Data -> Amount: ${amount}, Account: ${account_number}, Ref: ${merchant_reference}, TxRef: ${uniqueTxIdentifier}`);

        let targetUid = null;

        // 1. Check reference format VA_UID
        if (merchant_reference && String(merchant_reference).startsWith('VA_')) {
            const parts = merchant_reference.split('_');
            if (parts.length > 1) {
                targetUid = parts[1];
            }
        }

        // 2. Scan Firebase users if targetUid not found yet
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

        // 3. Fallback to Customer Email
        if (!targetUid && dataObj.customer && dataObj.customer.email) {
            const customerEmail = dataObj.customer.email;
            const usersSnap = await db.ref('users').orderByChild('email').equalTo(customerEmail).once('value');
            if (usersSnap.exists()) {
                const val = usersSnap.val();
                targetUid = Object.keys(val)[0];
                console.log(`🎯 Matched User UID ${targetUid} via Email: ${customerEmail}`);
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

        // Credit user balance safely
        await db.ref(`users/${targetUid}/balance`).transaction((currentBalance) => {
            return (parseFloat(currentBalance) || 0) + netAmountToCredit;
        });

        const txRef = db.ref(`transactions/${targetUid}`).push();
        const timestamp = Date.now();

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

        await db.ref(`notifications/${targetUid}/${uniqueTxIdentifier}`).set({
            message: `Your account has been successfully credited with ₦${netAmountToCredit.toLocaleString(undefined, {minimumFractionDigits: 2})}.`,
            read: false,
            timestamp: timestamp
        });

        console.log(`🎉 SUCCESSFULLY CREDITED user ${targetUid} with ₦${netAmountToCredit}`);
        return res.status(200).send("Processed");

    } catch (e) {
        // Crucial: Catch any runtime parsing or Firebase failure and still send 200 
        // to prevent Billstack from marking your endpoint down with a 500 error.
        console.error("🔥 Safe-catch webhook internal error:", e.message, e.stack);
        return res.status(200).send("Event acknowledged with internal fallback");
    }
});

module.exports = router;
