const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Fee configurations
const BRAND_NAME_FEE = 500;
const ADDITIONAL_SENDER_ID_FEE = 200;

// Helper to extract user ID from Firebase Auth middleware or request body
const getUserId = (req) => {
    if (req.user && req.user.uid) return req.user.uid;
    return req.body.uid || req.body.userId;
};

/**
 * 1. Unlock / Set Recharge Card Brand Name (Fee: ₦500)
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

    const cleanBrandName = brandName.trim();
    const userRef = admin.database().ref(`users/${userId}`);

    try {
        let errorMsg = '';
        let costCharged = 0;

        const result = await userRef.transaction((userData) => {
            if (!userData) {
                errorMsg = 'User profile not found.';
                return userData;
            }

            const currentBalance = Number(userData.balance || 0);
            const isAlreadyUnlocked = userData.isBrandNameUnlocked === true;
            const cost = isAlreadyUnlocked ? 0 : BRAND_NAME_FEE;

            if (currentBalance < cost) {
                errorMsg = `Insufficient balance. ₦${BRAND_NAME_FEE} is required to set a custom brand name.`;
                return; // Abort transaction
            }

            if (!isAlreadyUnlocked) {
                userData.balance = currentBalance - cost;
                userData.isBrandNameUnlocked = true;
                costCharged = cost;
            }

            userData.rechargeBrandName = cleanBrandName;
            userData.brandNameUpdatedAt = Date.now();

            return userData;
        });

        if (!result.committed) {
            return res.status(400).json({ success: false, error: errorMsg || 'Failed to update brand name.' });
        }

        // Log transaction history if a fee was charged
        if (costCharged > 0) {
            const txRef = admin.database().ref(`users/${userId}/transactions`).push();
            await txRef.set({
                type: 'Recharge Card Brand Name',
                amount: costCharged,
                description: `Custom Recharge Brand Name set to "${cleanBrandName}"`,
                status: 'Successful',
                date: new Date().toISOString(),
                timestamp: Date.now()
            });
        }

        return res.json({
            success: true,
            message: `Brand name "${cleanBrandName}" successfully updated!`,
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

    const userRef = admin.database().ref(`users/${userId}`);

    try {
        let errorMsg = '';
        let feeCharged = 0;

        const result = await userRef.transaction((userData) => {
            if (!userData) {
                errorMsg = 'User profile not found.';
                return userData;
            }

            const existingIds = Array.isArray(userData.smsSenderIds) ? userData.smsSenderIds : [];

            // Check if Sender ID already exists for this user
            if (existingIds.some(id => String(id).toUpperCase() === cleanSenderId)) {
                errorMsg = 'You have already registered this Sender ID.';
                return; // Abort transaction
            }

            const isFirst = existingIds.length === 0;
            const cost = isFirst ? 0 : ADDITIONAL_SENDER_ID_FEE;
            const currentBalance = Number(userData.balance || 0);

            if (currentBalance < cost) {
                errorMsg = `Insufficient balance. ₦${ADDITIONAL_SENDER_ID_FEE} is required for additional Sender IDs.`;
                return; // Abort transaction
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

        // Log transaction history to Firebase so it shows up in history logs
        const txRef = admin.database().ref(`users/${userId}/transactions`).push();
        await txRef.set({
            type: 'Bulk SMS Sender ID',
            amount: feeCharged,
            description: feeCharged === 0 
                ? `Free First Sender ID registration: "${cleanSenderId}"` 
                : `Additional Sender ID registration: "${cleanSenderId}"`,
            status: 'Successful',
            date: new Date().toISOString(),
            timestamp: Date.now()
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
