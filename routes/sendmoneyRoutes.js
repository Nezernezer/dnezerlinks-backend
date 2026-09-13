// routes/sendmoneyRoutes.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.database();

router.post('/search-user', async (req, res) => {
    const { email } = req.body;
    const senderUid = req.user ? req.user.uid : null;

    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ success: false, error: 'Enter a valid email address' });
    }

    try {
        const snapshot = await db.ref('users')
            .orderByChild('email')
            .equalTo(cleanEmail)
            .once('value');

        const users = snapshot.val();
        if (!users) {
            return res.status(404).json({ success: false, error: 'User not found with this email address' });
        }

        const recipientUid = Object.keys(users)[0];
        const userData = users[recipientUid];

        if (senderUid && recipientUid === senderUid) {
            return res.status(400).json({ success: false, error: 'You cannot send money to yourself' });
        }

        res.json({
            success: true,
            name: userData.fullName || userData.name || userData.username || 'Dlinks User',
            email: cleanEmail
        });
    } catch (error) {
        console.error('Search user error:', error);
        res.status(500).json({ success: false, error: 'Server error during search' });
    }
});

router.post('/transfer', async (req, res) => {
    const { email, amount, uid, pin } = req.body;
    const numericAmount = Number(amount);

    console.log(`[TRANSFER] Attempt: Sender UID=${uid}, Recipient Email=${email}, Amount=${numericAmount}`);

    if (!uid || !email || !numericAmount || numericAmount <= 0 || !pin) {
        return res.status(400).json({ success: false, error: 'Missing required transfer details' });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    try {
        // 1. Find Recipient
        const snapshot = await db.ref('users')
            .orderByChild('email')
            .equalTo(cleanEmail)
            .once('value');

        const users = snapshot.val();
        if (!users) {
            return res.status(404).json({ success: false, error: 'Recipient not found' });
        }

        const recipientUid = Object.keys(users)[0];
        const recipientData = users[recipientUid];

        if (recipientUid === uid) {
            return res.status(400).json({ success: false, error: 'Cannot transfer to your own account' });
        }

        // 2. Fetch Sender Data
        const senderSnap = await db.ref(`users/${uid}`).once('value');
        const senderData = senderSnap.val();

        if (!senderData) {
            return res.status(404).json({ success: false, error: 'Sender account not found' });
        }

        const senderName = senderData.fullName || senderData.name || senderData.username || 'Dlinks User';
        const recipientName = recipientData.fullName || recipientData.name || recipientData.username || 'Dlinks User';
        
        console.log(`[TRANSFER] Sender Balance in DB:`, senderData.balance);

        // 3. Perform Atomic Transaction for Sender (Deduct)
        const senderBalanceRef = db.ref(`users/${uid}/balance`);
        const senderResult = await senderBalanceRef.transaction((current) => {
            const bal = Number(current || 0);
            console.log(`[TRANSACTION] Current sender balance: ${bal}, Deducting: ${numericAmount}`);
            if (bal < numericAmount) {
                return; // Aborts if insufficient
            }
            return bal - numericAmount;
        });

        if (!senderResult.committed) {
            console.log(`[TRANSFER ERROR] Insufficient balance or transaction aborted.`);
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }

        // 4. Perform Atomic Transaction for Recipient (Credit)
        const recipientBalanceRef = db.ref(`users/${recipientUid}/balance`);
        await recipientBalanceRef.transaction((current) => {
            const bal = Number(current || 0);
            console.log(`[TRANSACTION] Current recipient balance: ${bal}, Adding: ${numericAmount}`);
            return bal + numericAmount;
        });

        const now = Date.now();
        const reference = `TRF-${now}-${Math.floor(Math.random() * 100000)}`;

        // 5. Record Transactions
        const senderTxRef = db.ref(`transactions/${uid}`).push();
        await senderTxRef.set({
            transaction_id: senderTxRef.key,
            service: 'Wallet Transfer',
            type: 'debit',
            amount: numericAmount,
            status: 'successful',
            timestamp: now,
            reference: reference,
            description: `Transfer to ${recipientName}`,
            email: cleanEmail,
            recipientUid: recipientUid,
            recipientName: recipientName
        });

        const recipientTxRef = db.ref(`transactions/${recipientUid}`).push();
        await recipientTxRef.set({
            transaction_id: recipientTxRef.key,
            service: 'Wallet Transfer',
            type: 'credit',
            amount: numericAmount,
            status: 'successful',
            timestamp: now,
            reference: reference,
            description: `Transfer from ${senderName}`,
            email: cleanEmail,
            senderUid: uid,
            senderName: senderName
        });

        console.log(`[TRANSFER SUCCESS] Reference: ${reference}`);
        res.json({
            success: true,
            recipientName,
            message: `Successfully sent ₦${numericAmount.toLocaleString()} to ${recipientName}`,
            reference
        });

    } catch (error) {
        console.error('Transfer execution error:', error);
        res.status(500).json({ success: false, error: 'Transfer failed. Please try again.' });
    }
});

module.exports = router;
