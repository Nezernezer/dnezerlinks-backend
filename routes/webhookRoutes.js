const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Supports all incoming path variations from the Firebase proxy to prevent unhandled routing crashes
router.post(['/', '/billstack', '/webhook', '/*'], express.json(), async (req, res) => {
    const headers = req.headers;
    const body = req.body;

    // =========================================================================
    // 1. DETECT PROVIDER & HANDLE MONNIFY WEBHOOK
    // =========================================================================
    const monnifySignature = headers['monnify-signature'];
    if (monnifySignature || body.eventType) {
        try {
            const secretKey = process.env.MONNIFY_SECRET_KEY;

            if (secretKey) {
                const dataString = JSON.stringify(body);
                const computedSignature = crypto
                    .createHmac('sha512', secretKey)
                    .update(dataString)
                    .digest('hex');

                if (monnifySignature && monnifySignature.trim().toLowerCase() !== computedSignature.trim().toLowerCase()) {
                    console.error("❌ Monnify Signature authentication failed!");
                    return res.status(401).send('Invalid Monnify signature');
                }
            }

            console.log("✅ Monnify Webhook received. Event type:", body.eventType);

            if (body.eventType === 'SUCCESSFUL_TRANSACTION') {
                const eventData = body.eventData;
                const { amountPaid, paymentReference, transactionReference, customer, product, destinationAccountDetails } = eventData;

                const uniqueTxIdentifier = transactionReference || paymentReference;
                const customerEmail = customer ? customer.email : null;
                const merchantRef = product ? product.reference : null;
                const accountNumber = destinationAccountDetails ? destinationAccountDetails.accountNumber : null;

                if (!uniqueTxIdentifier) {
                    console.error("❌ Monnify webhook missing unique reference.");
                    return res.status(400).send("Missing transaction reference.");
                }

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
                    console.log(`⚠️ Duplicate Monnify Webhook Ignored: ${uniqueTxIdentifier}`);
                    return res.status(200).send("Already Processed");
                }

                let targetUid = null;

                if (merchantRef) {
                    const userCheckSnap = await db.ref(`users/${merchantRef}`).once('value');
                    if (userCheckSnap.exists()) {
                        targetUid = merchantRef;
                    }
                }

                if (!targetUid) {
                    const usersSnapshot = await db.ref('users').once('value');
                    const usersData = usersSnapshot.val() || {};

                    for (const uid in usersData) {
                        const user = usersData[uid];
                        if (
                            (accountNumber && user.account_number === accountNumber) ||
                            (merchantRef && (user.account_number === merchantRef || user.reference === merchantRef))
                        ) {
                            targetUid = uid;
                            break;
                        }
                    }
                }

                if (!targetUid && customerEmail) {
                    const usersSnap = await db.ref('users').orderByChild('email').equalTo(customerEmail).once('value');
                    if (usersSnap.exists()) {
                        targetUid = Object.keys(usersSnap.val())[0];
                    }
                }

                if (!targetUid) {
                    console.error(`❌ Monnify Mapping Failure: Could not map user for account ${accountNumber} or email ${customerEmail}`);
                    return res.status(200).send("Event acknowledged - Unmapped user");
                }

                const rawAmount = parseFloat(amountPaid);
                const feeCharged = rawAmount * 0.015;
                const netAmountToCredit = rawAmount - feeCharged;

                await db.ref(`users/${targetUid}/balance`).transaction((currentBalance) => {
                    return (parseFloat(currentBalance) || 0) + netAmountToCredit;
                });

                const txRef = db.ref(`transactions/${targetUid}`).push();
                const timestamp = Date.now();

                await txRef.set({
                    id: txRef.key,
                    amount: netAmountToCredit,
                    reference: paymentReference || 'Monnify Direct',
                    transaction_reference: uniqueTxIdentifier,
                    account_number: accountNumber,
                    type: 'credit',
                    status: 'success',
                    timestamp: timestamp
                });

                await db.ref(`notifications/${targetUid}/${uniqueTxIdentifier}`).set({
                    message: `Your account has been successfully credited via Monnify with ₦${netAmountToCredit.toLocaleString(undefined, {minimumFractionDigits: 2})}.`,
                    read: false,
                    timestamp: timestamp
                });

                return res.status(200).send("Processed");
            }

            return res.status(200).send("Event acknowledged");

        } catch (err) {
            console.error("🔥 Monnify Webhook processing crash:", err.message);
            return res.status(400).send("Parsing error");
        }
    }

    // =========================================================================
    // 2. BILLSTACK WEBHOOK LOGIC
    // =========================================================================
    const signature = headers['x-wiaxy-signature'] ||
                      headers['x-billstack-signature'] ||
                      headers['signature'];

    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!signature || !secret) {
        console.error("❌ Missing signature or secret key from incoming webhook header.");
        return res.status(401).send('Unauthorized');
    }

    try {
        const expectedSignature = crypto.createHash('md5').update(secret).digest('hex');

        const incomingSigClean = signature.trim().toLowerCase();
        const expectedSigClean = expectedSignature.trim().toLowerCase();

        if (incomingSigClean !== expectedSigClean) {
            console.error("❌ Billstack Signature authentication failed!");
            return res.status(401).send('Invalid signature');
        }

        const eventData = body;
        console.log("✅ Billstack Webhook verified successfully. Event type:", eventData.event);

        if (eventData.event === 'PAYMENT_NOTIFICATION') {
            if (!eventData.data) {
                console.error("❌ Billstack payload missing 'data' object.");
                return res.status(400).send("Malformed payload");
            }

            const { amount, merchant_reference, transaction_ref, wiaxy_ref } = eventData.data;
            const uniqueTxIdentifier = transaction_ref || wiaxy_ref;

            if (!uniqueTxIdentifier) {
                console.error("❌ Webhook missing unique transaction_ref / wiaxy_ref keys.");
                return res.status(400).send("Missing transaction identity reference.");
            }

            const account_number = eventData.data.account ? eventData.data.account.account_number : null;
            let targetUid = null;

            if (merchant_reference && merchant_reference.startsWith('VA_')) {
                const parts = merchant_reference.split('_');
                targetUid = parts[1];
            }

            if (!targetUid) {
                const usersSnapshot = await db.ref('users').once('value');
                const usersData = usersSnapshot.val() || {};

                for (const uid in usersData) {
                    const user = usersData[uid];

                    if (
                        (account_number && user.account_number === account_number) ||
                        (merchant_reference && (user.account_number === merchant_reference || user.reference === merchant_reference))
                    ) {
                        targetUid = uid;
                        break;
                    }

                    if (user.assigned_accounts && account_number && user.assigned_accounts[account_number]) {
                        targetUid = uid;
                        break;
                    }
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

            if (!targetUid && eventData.data.customer && eventData.data.customer.email) {
                const customerEmail = eventData.data.customer.email;
                const usersSnap = await db.ref('users').orderByChild('email').equalTo(customerEmail).once('value');
                if (usersSnap.exists()) {
                    targetUid = Object.keys(usersSnap.val())[0];
                }
            }

            if (!targetUid) {
                console.error(`❌ Data Mapping Failure: No user matches account_number: ${account_number} or reference: ${merchant_reference}`);
                return res.status(200).send("Event acknowledged - Unmapped user");
            }

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
                console.log(`⚠️ Duplicate Webhook Ignored: TxRef ${uniqueTxIdentifier} already processed.`);
                return res.status(200).send("Already Processed");
            }

            const rawAmount = parseFloat(amount);
            const feeCharged = rawAmount * 0.015;
            const netAmountToCredit = rawAmount - feeCharged;

            await db.ref(`users/${targetUid}/balance`).transaction((currentBalance) => {
                return (parseFloat(currentBalance) || 0) + netAmountToCredit;
            });

            const txRef = db.ref(`transactions/${targetUid}`).push();
            const timestamp = Date.now();

            await txRef.set({
                id: txRef.key,
                amount: netAmountToCredit,
                reference: merchant_reference,
                transaction_reference: uniqueTxIdentifier,
                account_number: account_number,
                type: 'credit',
                status: 'success',
                timestamp: timestamp
            });

            await db.ref(`notifications/${targetUid}/${uniqueTxIdentifier}`).set({
                message: `Your account has been successfully credited with ₦${netAmountToCredit.toLocaleString(undefined, {minimumFractionDigits: 2})}.`,
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
