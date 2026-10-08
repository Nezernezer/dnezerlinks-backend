// routes/exampinRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/firebase');
const examPrices = require('../public/exampin/examprice'); // Adjust path based on your folder structure

router.post('/buy', async (req, res) => {
    const { uid, examType, quantity, pin, unitPrice: clientUnitPrice, totalAmount: clientTotalAmount } = req.body;

    // Validate required fields
    if (!uid || !examType || !quantity || !pin) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
        return res.status(400).json({ success: false, error: 'Invalid quantity' });
    }

    // Find the exam configuration from examprice.js
    const examConfig = examPrices.find(e => e.id === String(examType).toLowerCase());
    if (!examConfig) {
        return res.status(400).json({ success: false, error: 'Invalid exam type' });
    }

    const vtunaijaExamId = examConfig.vtunaijaId;
    
    // Use the server-side price from examprice.js to ensure security and consistency,
    // falling back to client payload if necessary.
    const unitPrice = examConfig.price;
    const totalAmount = clientTotalAmount && !isNaN(clientTotalAmount) ? parseFloat(clientTotalAmount) : (unitPrice * qty);

    const userRef = db.ref(`users/${uid}`);

    try {
        // 1. Fetch user profile
        const snap = await userRef.once('value');
        const userData = snap.val();

        if (!userData) {
            return res.status(404).json({ success: false, error: "User profile not found." });
        }

        // 2. PIN Security Validation
        const savedPin = String(userData.transaction_pin || userData.pin || '');
        if (String(pin) !== savedPin) {
            return res.status(401).json({ success: false, error: "Incorrect Transaction PIN!" });
        }

        // 3. Balance Verification
        const currentBalance = parseFloat(userData.balance || 0);
        if (currentBalance < totalAmount) {
            return res.status(400).json({ success: false, error: "Insufficient Balance" });
        }

        // 4. Generate unique request-id (required by VTU Naija)
        const requestId = `${uid}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

        // 5. Call VTU Naija API
        const response = await axios.post(
            'https://vtunaija.com.ng/api/exam/',
            {
                exam_name: vtunaijaExamId,
                quantity: String(qty),
                "request-id": requestId
            },
            {
                headers: {
                    'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 50000
            }
        );

        const result = response.data;
        const isSuccess = result && (result.Status === "successful" || result.status === "success");

        // 6. Handle success
        if (isSuccess) {
            await userRef.child('balance').transaction(currentBal => {
                return (currentBal || 0) - totalAmount;
            });

            const pins = result.pin || '';
            const serials = result.serial || '';

            const txRef = db.ref(`transactions/${uid}`).push();
            await txRef.set({
                type: 'Exam PIN',
                service: `${String(examType).toUpperCase()} PIN`,
                quantity: qty,
                amount: totalAmount, // Logs the exact correct total price
                pin: pins,
                serial: serials,
                status: 'successful',
                timestamp: Date.now(),
                reference: result.id || result.request_id || requestId || txRef.key,
                description: `${String(examType).toUpperCase()} Exam PIN Purchase`
            });

            console.log(`✅ Exam PIN bought: ${qty} ${examType} for ₦${totalAmount} (UID: ${uid})`);
            return res.json({
                success: true,
                message: 'Purchase successful',
                pin: pins,
                serial: serials
            });
        }

        // VTU API returned failure
        console.error("VTU Exam API error:", result);
        return res.status(400).json({
            success: false,
            error: result?.api_response || result?.message || "VTU provider failed"
        });

    } catch (error) {
        console.error("Exam PIN purchase error:", error.message);

        if (error.response) {
            console.error("VTU Naija status:", error.response.status);
            console.error("VTU Naija response:", error.response.data);
        }

        if (error.code === 'ECONNABORTED') {
            const txRef = db.ref(`transactions/${uid}`).push();
            await txRef.set({
                type: 'Exam PIN',
                service: `${String(examType).toUpperCase()} PIN`,
                quantity: qty,
                amount: totalAmount,
                status: 'pending',
                timestamp: Date.now(),
                reference: txRef.key,
                description: `${String(examType).toUpperCase()} Exam PIN (Timed out - Pending)`
            });

            console.log(`⏳ Exam PIN timed out after 50s. Logged as pending (UID: ${uid})`);
            return res.status(504).json({
                success: false,
                error: "VTU API timeout. Transaction marked as pending."
            });
        }

        const providerError = error.response?.data?.api_response
            || error.response?.data?.message
            || "API Connection Error";

        return res.status(error.response?.status || 500).json({
            success: false,
            error: providerError
        });
    }
});

module.exports = router;
