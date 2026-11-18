const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = require('../config/firebase');

// Fee configuration: ₦500 for each custom brand name purchase
const BRAND_NAME_FEE = 500;
const ADDITIONAL_SENDER_ID_FEE = 200;

// Helper to extract user ID from Firebase Auth middleware or request body
const getUserId = (req) => {
    if (req.user && req.user.uid) return req.user.uid;
    return req.body.uid || req.body.userId;
};

/**
 * 1. Purchase / Set Recharge Card Brand Name (Fee: ₦500 per purchase)
 */
router.post('/set-brand-name', async (req, res) => {
    const userId = getUserId(req);
    const { brandName } = req.body;

    if (!userId) {
        return res.status(400).json({ success: false, error: 'Unauthorized or missing User ID.' });
    }

    if (!brandName || typeof brandName !== 'string' || brandName.trim().length < 2) {
        return res.status(400).json({ success: false, error: 'Please provide a valid brand name (at least 2 characters).' });
    }

    const cleanBrandName = brandName.trim().toUpperCase();
    const userDocRef = admin.database().ref(`users/${userId}`);

    try {
        let errorMsg = '';
        const cost = BRAND_NAME_FEE;

        const result = await userDocRef.transaction((userData) => {
            if (!userData) {
                errorMsg = 'User profile not found.';
                return userData;
            }

            const currentBalance = Number(userData.balance || 0);

            if (currentBalance < cost) {
                errorMsg = `Insufficient balance. ₦${cost} is required to purchase a custom brand name.`;
                return; // Abort transaction
            }

            // Deduct ₦500 for each purchase/update
            userData.balance = currentBalance - cost;
            userData.rechargeBrandName = cleanBrandName;
            userData.brandNameUpdatedAt = Date.now();

            return userData;
        });

        if (!result.committed) {
            return res.status(400).json({ success: false, error: errorMsg || 'Failed to update brand name.' });
        }

        // Log transaction history to transactions/${userId}
        const txRef = db.ref(`transactions/${userId}`).push();
        await txRef.set({
            service: "Recharge Card Brand Name",
            amount: cost,
            type: "debit",
            status: "successful",
            timestamp: Date.now(),
            reference: txRef.key,
            description: `Custom Recharge Brand Name purchased: "${cleanBrandName}"`
        });

        return res.json({
            success: true,
            message: `Brand name "${cleanBrandName}" successfully purchased! (₦${cost} deducted)`,
            brandName: cleanBrandName
        });

    } catch (error) {
        console.error('Brand name update error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error while updating brand name.' });
    }
});

/**
 * 2. Register Bulk SMS Sender ID (First one FREE, subsequent ₦200 each)
 */
router.post('/register-sender-id', async (req, res) => {
    const userId = getUserId(req);
    const { senderId } = req.body;

    if (!userId) {
        return res.status(400).json({ success: false, error: 'Unauthorized or missing User ID.' });
    }

    if (!senderId || typeof senderId !== 'string') {
        return res.status(400).json({ success: false, error: 'Please provide a valid Sender ID.' });
    }

    const cleanSenderId = senderId.trim().toUpperCase();
    if (cleanSenderId.length < 3 || cleanSenderId.length > 11 || !/^[A-Z0-9\s]+$/.test(cleanSenderId)) {
        return res.status(400).json({ success: false, error: 'Sender ID must be 3 to 11 alphanumeric characters.' });
    }

    const userDocRef = admin.database().ref(`users/${userId}`);

    try {
        let errorMsg = '';
        let feeCharged = 0;

        const result = await userDocRef.transaction((userData) => {
            if (!userData) {
                errorMsg = 'User profile not found.';
                return userData;
            }

            const existingIds = Array.isArray(userData.smsSenderIds) ? userData.smsSenderIds : [];

            if (existingIds.some(id => String(id).toUpperCase() === cleanSenderId)) {
                errorMsg = 'You have already registered this Sender ID.';
                return;
            }

            const isFirst = existingIds.length === 0;
            const cost = isFirst ? 0 : ADDITIONAL_SENDER_ID_FEE;
            const currentBalance = Number(userData.balance || 0);

            if (currentBalance < cost) {
                errorMsg = `Insufficient balance. ₦${ADDITIONAL_SENDER_ID_FEE} is required for additional Sender IDs.`;
                return;
            }

            if (cost > 0) {
                userData.balance = currentBalance - cost;
            }

            existingIds.push(cleanSenderId);
            userData.smsSenderIds = existingIds;
            feeCharged = cost;

            return userData;
        });

        if (!result.committed) {
            return res.status(400).json({ success: false, error: errorMsg || 'Failed to register Sender ID.' });
        }

        const txRef = db.ref(`transactions/${userId}`).push();
        await txRef.set({
            service: "Bulk SMS Sender ID",
            amount: feeCharged,
            type: "debit",
            status: "successful",
            timestamp: Date.now(),
            reference: txRef.key,
            description: feeCharged === 0 
                ? `Free First Sender ID registration: "${cleanSenderId}"` 
                : `Additional Sender ID registration: "${cleanSenderId}"`
        });

        return res.json({
            success: true,
            message: feeCharged === 0
                ? `First Sender ID "${cleanSenderId}" registered for FREE!`
                : `Sender ID "${cleanSenderId}" registered successfully (₦${feeCharged} deducted).`,
            senderId: cleanSenderId,
            feeCharged
        });

    } catch (error) {
        console.error('Sender ID registration error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error during Sender ID registration.' });
    }
});

module.exports = router;
