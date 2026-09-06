const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.database();

// ─────────────────────────────────────────────
// Helper: normalize Nigerian phone numbers
// ─────────────────────────────────────────────
function normalizePhone(phone) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');

    if (cleaned.startsWith('234') && cleaned.length === 13) {
        cleaned = '0' + cleaned.slice(3);
    }
    if (cleaned.length === 10 && !cleaned.startsWith('0')) {
        cleaned = '0' + cleaned;
    }
    return cleaned.length === 11 && cleaned.startsWith('0') ? cleaned : null;
}

// ─────────────────────────────────────────────
// 1. Search User by Phone
// ─────────────────────────────────────────────
router.post('/search-user', async (req, res) => {
    const { phone, uid, userId } = req.body;
    const senderUid = uid || userId;

    const normalized = normalizePhone(phone);
    if (!normalized) {
        return res.status(400).json({ success: false, message: 'Enter a valid Nigerian phone number' });
    }

    try {
        const snapshot = await db.ref('users')
            .orderByChild('phone')
            .equalTo(normalized)
            .once('value');

        const users = snapshot.val();
        if (!users) {
            return res.status(404).json({ success: false, message: 'User not found with this phone number' });
        }

        const recipientUid = Object.keys(users)[0];
        const userData = users[recipientUid];

        if (recipientUid === senderUid) {
            return res.status(400).json({ success: false, message: 'You cannot send money to yourself' });
        }

        res.json({
            success: true,
            uid: recipientUid,
            name: userData.fullName || userData.name || userData.username || 'Dlinks User'
        });
    } catch (error) {
        console.error('Search user error:', error);
        res.status(500).json({ success: false, message: 'Server error during search' });
    }
});

// ─────────────────────────────────────────────
// 2. Process Money Transfer
// PIN is already verified by the global securityGatekeeper
// ─────────────────────────────────────────────
router.post('/transfer', async (req, res) => {
    const { recipientUid, amount, uid, userId } = req.body;
    const senderUid = uid || userId;
    const numericAmount = Number(amount);

    if (!senderUid || !recipientUid || !numericAmount || numericAmount <= 0 || !Number.isFinite(numericAmount)) {
        return res.status(400).json({ success: false, message: 'Invalid transfer details' });
    }

    if (numericAmount > 5000000) {
        return res.status(400).json({ success: false, message: 'Amount exceeds maximum allowed' });
    }

    if (senderUid === recipientUid) {
        return res.status(400).json({ success: false, message: 'Cannot transfer to your own account' });
    }

    try {
        // Load both users
        const [senderSnap, recipientSnap] = await Promise.all([
            db.ref(`users/${senderUid}`).once('value'),
            db.ref(`users/${recipientUid}`).once('value')
        ]);

        const senderData = senderSnap.val();
        const recipientData = recipientSnap.val();

        if (!senderData) {
            return res.status(404).json({ success: false, message: 'Sender account not found' });
        }
        if (!recipientData) {
            return res.status(404).json({ success: false, message: 'Recipient account not found' });
        }

        const senderName = senderData.fullName || senderData.name || senderData.username || 'Dlinks User';
        const recipientName = recipientData.fullName || recipientData.name || recipientData.username || 'Dlinks User';

        // Atomic balance deduction from sender
        const senderBalanceRef = db.ref(`users/${senderUid}/balance`);
        const senderResult = await senderBalanceRef.transaction((current) => {
            const bal = Number(current || 0);
            if (bal < numericAmount) return; // abort
            return bal - numericAmount;
        });

        if (!senderResult.committed) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }

        // Credit recipient
        await db.ref(`users/${recipientUid}/balance`).transaction((current) => {
            return Number(current || 0) + numericAmount;
        });

        const now = Date.now();
        const reference = `TRF-\( {now}- \){Math.floor(Math.random() * 100000)}`;

        // ─── Record under SENDER (debit) ───
        // Path: transactions/{senderUid}/{pushId}
        const senderTxRef = db.ref(`transactions/${senderUid}`).push();
        await senderTxRef.set({
            transaction_id: senderTxRef.key,
            service: 'Wallet Transfer',
            type: 'debit',
            amount: numericAmount,
            status: 'successful',
            timestamp: now,
            reference: reference,
            description: `Transfer to ${recipientName}`,
            recipientUid: recipientUid,
            recipientName: recipientName,
            counterparty: recipientUid,
            counterpartyName: recipientName
        });

        // ─── Record under RECIPIENT (credit) ───
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
            senderUid: senderUid,
            senderName: senderName,
            counterparty: senderUid,
            counterpartyName: senderName
        });

        res.json({
            success: true,
            recipientName,
            message: `Successfully sent ₦${numericAmount.toLocaleString()} to ${recipientName}`,
            transactionId: senderTxRef.key,
            reference
        });

    } catch (error) {
        console.error('Transfer error:', error);
        res.status(500).json({ success: false, message: 'Transfer failed. Please try again.' });
    }
});

module.exports = router;
