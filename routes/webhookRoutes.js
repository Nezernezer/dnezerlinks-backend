// =========================================================================
// 2. BILLSTACK WEBHOOK LOGIC (DIAGNOSTIC MODE)
// =========================================================================
const signature = headers['x-wiaxy-signature'] ||
                  headers['x-billstack-signature'] ||
                  headers['signature'];

const secret = process.env.BILLSTACK_SECRET_KEY;

// DIAGNOSTIC LOG 1: Check Headers & Secrets
console.log("🔍 Incoming Billstack Headers:", JSON.stringify(headers));
console.log("🔍 Secret Key Loaded?:", secret ? "YES (Length: " + secret.length + ")" : "NO ❌");

if (!signature || !secret) {
    console.error("❌ Missing signature or secret key from incoming webhook header.");
    return res.status(200).send('Event acknowledged - Missing signature');
}

try {
    const expectedSignature = crypto.createHash('md5').update(secret).digest('hex');
    const incomingSigClean = signature.trim().toLowerCase();
    const expectedSigClean = expectedSignature.trim().toLowerCase();

    // DIAGNOSTIC LOG 2: Validate Signatures Match
    if (incomingSigClean !== expectedSigClean) {
        console.error(`❌ Signature Mismatch! Incoming: ${incomingSigClean} | Expected: ${expectedSigClean}`);
        // NOTE: If you want to bypass signature temporarily for testing, uncomment line below:
        // return res.status(200).send('Event acknowledged - Invalid signature bypassed for test');
        return res.status(200).send('Event acknowledged - Invalid signature');
    }

    const eventData = body || {};
    console.log("✅ Billstack Webhook verified successfully. Full Payload:", JSON.stringify(eventData));

    // Support multiple possible event structures from Billstack
    const dataObj = eventData.data || eventData;
    const eventType = eventData.event || eventData.event_type || 'PAYMENT_NOTIFICATION';

    if (eventType.includes('PAYMENT') || eventType.includes('charge') || dataObj.amount) {
        const amount = dataObj.amount || dataObj.amountPaid;
        const merchant_reference = dataObj.merchant_reference || dataObj.reference;
        const transaction_ref = dataObj.transaction_ref || dataObj.transactionReference || dataObj.wiaxy_ref;
        const uniqueTxIdentifier = transaction_ref || `fallback_${Date.now()}`;

        // Flexible account number extraction across different payloads
        const account_number = dataObj.account ? dataObj.account.account_number : (dataObj.account_number || dataObj.destinationAccountDetails?.accountNumber);
        
        console.log(`🔍 Extracted Payment Data -> Amount: ${amount}, Account: ${account_number}, Ref: ${merchant_reference}`);

        let targetUid = null;

        // 1. Try VA_ prefix mapping
        if (merchant_reference && String(merchant_reference).startsWith('VA_')) {
            const parts = merchant_reference.split('_');
            targetUid = parts[1];
        }

        // 2. Comprehensive recursive scan of Firebase users
        if (!targetUid) {
            const usersSnapshot = await db.ref('users').once('value');
            const usersData = usersSnapshot.val() || {};

            for (const uid in usersData) {
                const user = usersData[uid];
                
                const dbAccNum = user.account_number ? String(user.account_number).trim() : '';
                const incomingAccNum = account_number ? String(account_number).trim() : '';
                const dbRef = user.reference ? String(user.reference).trim() : '';
                const incomingRef = merchant_reference ? String(merchant_reference).trim() : '';

                // Loose string and number matching conversion
                if (
                    (incomingAccNum && dbAccNum === incomingAccNum) ||
                    (incomingRef && (dbAccNum === incomingRef || dbRef === incomingRef))
                ) {
                    targetUid = uid;
                    console.log(`🎯 Matched User UID ${targetUid} via Root Account/Reference`);
                    break;
                }

                // Check assigned_accounts Dictionary
                if (user.assigned_accounts && incomingAccNum) {
                    const matchedAssigned = Object.values(user.assigned_accounts).some(acc =>
                        acc && String(acc.account_number).trim() === incomingAccNum
                    );
                    if (matchedAssigned) {
                        targetUid = uid;
                        console.log(`🎯 Matched User UID ${targetUid} via assigned_accounts`);
                        break;
                    }
                }

                // Check virtual_accounts Dictionary
                if (user.virtual_accounts) {
                    const matchedVirtual = Object.values(user.virtual_accounts).some(acc =>
                        acc && (
                            (incomingAccNum && String(acc.account_number).trim() === incomingAccNum) ||
                            (incomingRef && String(acc.reference).trim() === incomingRef)
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

        // 3. Fallback: Match by Customer Email
        if (!targetUid && dataObj.customer && dataObj.customer.email) {
            const customerEmail = dataObj.customer.email;
            const usersSnap = await db.ref('users').orderByChild('email').equalTo(customerEmail).once('value');
            if (usersSnap.exists()) {
                targetUid = Object.keys(usersSnap.val())[0];
                console.log(`🎯 Matched User UID ${targetUid} via Email: ${customerEmail}`);
            }
        }

        if (!targetUid) {
            console.warn(`⚠️ MAPPING FAILED: Could not match account [${account_number}] or ref [${merchant_reference}] to any user in Firebase.`);
            return res.status(200).send("Event acknowledged - Unmapped user");
        }

        // Check for duplicate processing
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

        // Securely credit user balance in Firebase
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

        console.log(`🎉 SUCCESSFULLY CREDITED user ${targetUid} with ₦${netAmountToCredit}`);
        return res.status(200).send("Processed");
    }

    return res.status(200).send("Event acknowledged");

} catch (e) {
    console.error("🔥 Safe-catch webhook error:", e.message, e.stack);
    return res.status(200).send("Event acknowledged with warnings");
}
