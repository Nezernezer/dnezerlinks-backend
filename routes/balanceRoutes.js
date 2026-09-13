const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.database();

// GET /api/balance
router.get('/', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        const uid = decoded.uid;

        const snap = await db.ref(`users/${uid}/balance`).once('value');
        const balance = Number(snap.val() || 0);

        return res.json({
            success: true,
            balance: balance
        });
    } catch (error) {
        console.error('Balance error:', error.message);
        return res.status(500).json({ success: false, message: 'Could not fetch balance' });
    }
});

module.exports = router;
