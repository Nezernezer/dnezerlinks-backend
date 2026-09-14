// routes/sendmoneyRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/firebase');

router.post('/search-user', async (req, res) => {
    const { email, uid: requestUid } = req.body;
    const senderUid = requestUid || (req.user ? req.user.uid : null);

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
        console.error('Search user error:', error.message);
        res.status(500).json({ success: false, error: 'Server error during search' });
    }
});

router.post('/transfer', async (req, res) => {
    const { uid: requestUid, email, amount, pin } = req.body;
    const uid = requestUid || (req.user ? req.user.uid : null);

    const numericAmount = parseFloat(amount);

    console.log(`[TRANSFER] Sender UID=${uid}, Recipient Email=${email}, Amount=${numericAmount}`);

    if (!uid) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing user session' });
    }

    if (!email || !numericAmount || numericAmount <= 0 || !pin) {
        return res.status(400).json({ success: false, error: 'Missing required transfer details' });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    try {
        // 1. Fetch Sender profile and search recipient simultaneously
        const [senderSnap, recipientSnapshot] = await Promise.all([
            db.ref(`users/${uid}`).once('value'),
            db.ref('users').orderByChild('email').equalTo(cleanEmail).once('value')
        ]);

        const senderData = senderSnap.val();
        if (!senderData) {
            console.log(`[TRANSFER ERROR] Sender node not found at users/${uid}`);
            return res.status(404).json({ success: false, error: 'Sender account not found' });
        }

        // 2. PIN Security Validation (Matching dataRoutes pattern)
        const savedPin = String(senderData.transaction_pin || senderData.pin || '');
        if (String(pin).trim() !== savedPin.trim()) {
            return res.status(401).json({ success: false, error: 'Incorrect Transaction PIN!' });
        }

        const users = recipientSnapshot.val();
        if (!users) {
            return res.status(404).json({ success: false, error: 'Recipient not found' });
        }

        const recipientUid = Object.keys(users)[0];
        const recipientData = users[recipientUid];

        if (recipientUid === uid) {
            return res.status(400).json({ success: false, error: 'Cannot transfer to your own account' });
        }

        const senderBalance = parseFloat(senderData.balance || 0);
        console.log(`[TRANSFER] Verified Sender DB Balance: ${senderBalance}, Attempting to send: ${numericAmount}`);

        if (senderBalance < numericAmount) {
            console.log(`[TRANSFER ERROR] Insufficient balance for UID ${uid}`);
            return res.status(400).json({ success: false, error: 'Insufficient Balance' });
        }

        const recipientCurrentBalance = parseFloat(recipientData.balance || 0);

        const senderName = senderData.fullName || senderData.name || senderData.username || 'Dlinks User';
        const recipientName = recipientData.fullName || recipientData.name || recipientData.username || 'Dlinks User';

        const newSenderBalance = senderBalance - numericAmount;
        const newRecipientBalance = recipientCurrentBalance + numericAmount;

        const now = Date.now();
        const reference = `TRF-${now}-${Math.floor(Math.random() * 100000)}`;

        // 3. Multi-path Atomic Update
        const updates = {};
        updates[`users/${uid}/balance`] = newSenderBalance;
        updates[`users/${recipientUid}/balance`] = newRecipientBalance;

        const senderTxRef = db.ref(`transactions/${uid}`).push();
        const recipientTxRef = db.ref(`transactions/${recipientUid}`).push();
        const recipientNotifRef = db.ref(`notifications/${recipientUid}`).push();

        updates[`transactions/${uid}/${senderTxRef.key}`] = {
            transaction_id: senderTxRef.key,
            service: 'Wallet Transfer',
            type: 'debit',
            amount: numericAmount,
            status: 'successful',
            timestamp: now,
            reference: reference,
            target_details: recipientName,
            targetDetails: recipientName,
            description: recipientName,
            recipientName: recipientName,
            email: cleanEmail,
            recipientUid: recipientUid
        };

        updates[`transactions/${recipientUid}/${recipientTxRef.key}`] = {
            transaction_id: recipientTxRef.key,
            service: 'Wallet Transfer',
            type: 'credit',
            amount: numericAmount,
            status: 'successful',
            timestamp: now,
            reference: reference,
            target_details: senderName,
            targetDetails: senderName,
            description: senderName,
            senderName: senderName,
            senderUid: uid
        };

        updates[`notifications/${recipientUid}/${recipientNotifRef.key}`] = {
            id: recipientNotifRef.key,
            title: 'Wallet Credited',
            message: `Your account has been credited with ₦${numericAmount.toLocaleString()} by ${senderName}`,
            timestamp: now,
            read: false,
            type: 'credit'
        };

        await db.ref().update(updates);

        console.log(`✅ [TRANSFER SUCCESS] Reference: ${reference} (UID: ${uid} -> ${recipientUid})`);
        res.json({
            success: true,
            recipientName,
            message: `Successfully sent ₦${numericAmount.toLocaleString()} to ${recipientName}`,
            reference
        });

    } catch (error) {
        console.error('❌ Transfer execution error:', error.message);
        res.status(500).json({ success: false, error: 'Transfer failed. Please try again.' });
    }
});

module.exports = router;
