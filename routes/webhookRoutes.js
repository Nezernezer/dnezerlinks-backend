const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/firebase');

// Supports POST requests to /api/webhook AND /api/webhook/billstack
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
                            (accountNumber && String(user.account_number).trim() === String(accountNumber).trim()) ||
                            (merchantRef && (String(user.account_number).trim() === String(merchantRef).trim() || String(user.reference).trim() === String(merchantRef).trim()))
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
            return res.status(200).send("Event acknowledged with warnings");
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
        return res.status(200).send('Event acknowledged - Missing signature');
    }

    try {
        const expectedSignature = crypto.createHash('md5').update(secret).digest('hex');

        const incomingSigClean = signature.trim().toLowerCase();
        const expectedSigClean = expectedSignature.trim().toLowerCase();

        if (incomingSigClean !== expectedSigClean) {
            console.error("❌ Billstack Signature authentication failed!");
            return res.status(200).send('Event acknowledged - Invalid signature');
        }

        const eventData = body || {};
        console.log("✅ Billstack Webhook verified successfully. Event type:", eventData.event);

        if (eventData.event === 'PAYMENT_NOTIFICATION') {
            const dataObj = eventData.data || {};
            const { amount, merchant_reference, transaction_ref, wiaxy_ref } = dataObj;
            const uniqueTxIdentifier = transaction_ref || wiaxy_ref || `fallback_${Date.now()}`;

            const account_number = dataObj.account ? dataObj.account.account_number : null;
            let targetUid = null;

            // 1. Try VA_ prefix mapping
            if (merchant_reference && merchant_reference.startsWith('VA_')) {
                const parts = merchant_reference.split('_');
                targetUid = parts[1];
            }

            // 2. Comprehensive recursive scan of Firebase users across root fields and nested virtual/assigned collections
            if (!targetUid) {
                const usersSnapshot = await db.ref('users').once('value');
                const usersData = usersSnapshot.val() || {};

                for (const uid in usersData) {
                    const user = usersData[uid];
                    
                    // Check Root Level Fields
                    if (
                        (account_number && String(user.account_number).trim() === String(account_number).trim()) ||
                        (merchant_reference && (String(user.account_number).trim() === String(merchant_reference).trim() || String(user.reference).trim() === String(merchant_reference).trim()))
                    ) {
                        targetUid = uid;
                        break;
                    }

                    // Check Nested assigned_accounts Dictionary
                    if (user.assigned_accounts) {
                        const matchedAssigned = Object.values(user.assigned_accounts).some(acc =>
                            acc && String(acc.account_number).trim() === String(account_number).trim()
                        );
                        if (matchedAssigned) {
                            targetUid = uid;
                            break;
                        }
                    }

                    // Check Nested virtual_accounts Dictionary
                    if (user.virtual_accounts) {
                        const matchedVirtual = Object.values(user.virtual_accounts).some(acc =>
                            acc && (
                                String(acc.account_number).trim() === String(account_number).trim() ||
                                String(acc.reference).trim() === String(merchant_reference).trim()
                            )
                        );
                        if (matchedVirtual) {
                            targetUid = uid;
                            break;
                        }
                    }
                }
            }

            // 3. Fallback: Match by Customer Email if account lookup fails
            if (!targetUid && dataObj.customer && dataObj.customer.email) {
                const customerEmail = dataObj.customer.email;
                const usersSnap = await db.ref('users').orderByChild('email').equalTo(customerEmail).once('value');
                if (usersSnap.exists()) {
                    targetUid = Object.keys(usersSnap.val())[0];
                }
            }

            if (!targetUid) {
                console.warn(`⚠️ Warning: Could not map user for account: ${account_number}, ref: ${merchant_reference}. Acknowledging safely.`);
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
                console.log(`⚠️ Duplicate Webhook Ignored: ${uniqueTxIdentifier}`);
                return res.status(200).send("Already Processed");
            }

            const rawAmount = parseFloat(amount) || 0;
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

            console.log(`✅ Successfully credited user ${targetUid} with ₦${netAmountToCredit}`);
            return res.status(200).send("Processed");
        }

        return res.status(200).send("Event acknowledged");

    } catch (e) {
        console.error("🔥 Safe-catch webhook error:", e.message);
        return res.status(200).send("Event acknowledged with warnings");
    }
});

module.exports = router;
