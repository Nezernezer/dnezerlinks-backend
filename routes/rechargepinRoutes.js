const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const axios = require('axios');

// Handles: POST /api/rechargepin/generate
router.post('/generate', async (req, res) => {
    // Destructure explicit fields safely sent from the frontend
    const { uid, network, amount, qty, brandName } = req.body;

    const parsedAmt = parseFloat(amount);
    const parsedQty = parseInt(qty);

    // Calculate total cost directly on the server to avoid missing parameter crashes
    const totalCost = parsedAmt * parsedQty;

    // Validate payload structure carefully
    if (!uid || !network || isNaN(parsedAmt) || isNaN(parsedQty) || parsedQty < 1) {
        return res.status(400).json({ success: false, error: 'Invalid payload details.' });
    }

    const apiKey = process.env.VTUNAIJA_API_KEY;
    if (!apiKey) {
        console.error("🔥 Environment Variable 'VTUNAIJA_API_KEY' is missing on Render!");
        return res.status(500).json({ success: false, error: 'Server configuration error.' });
    }

    const networkMap = { 'MTN': '1', 'GLO': '2', '9MOBILE': '3', 'AIRTEL': '4' };
    const apiNetworkId = networkMap[network.toUpperCase()];

    if (!apiNetworkId) {
        return res.status(400).json({ success: false, error: 'Unsupported Network platform selected.' });
    }

    const db = admin.database();
    const userRef = db.ref(`users/${uid}`);

    try {
        let orderStatus = false;
        let vtuResponseData = null;

        // 1. Warm up the local server cache with a quick direct snapshot lookup
        const balSnap = await userRef.child('balance').once('value');
        const liveServerBalance = balSnap.val();

        if (liveServerBalance === null) {
            return res.status(400).json({
                success: false,
                error: "Database configuration error: Balance node does not exist for this account."
            });
        }

        // 2. Safe balance reduction transaction loop
        const transactionResult = await userRef.child('balance').transaction((currentBal) => {
            // Firebase Trap Fix: If the local cache runs speculatively with null,
            // feed it the pre-fetched balance to force a synchronous cloud handshake.
            if (currentBal === null) {
                return Number(liveServerBalance) - totalCost;
            }

            const numericBalance = Number(currentBal);
            const numericCost = Number(totalCost);

            if (isNaN(numericBalance) || numericBalance < numericCost) {
                return; // Aborts transaction loop if balance is genuinely insufficient
            }

            return numericBalance - numericCost;
        });

        // If transaction fails to commit, it means their balance is genuinely insufficient
        if (!transactionResult.committed) {
            return res.status(400).json({
                success: false,
                error: `Genuinely Insufficient Balance! Your wallet balance is less than the required ₦${totalCost.toLocaleString()}`
            });
        }

        // 3. Contact VTU NAIJA API using dynamic form properties
        try {
            const pinRequest = await axios.post('https://vtunaija.com.ng/api/rechargepin/', {
                network: apiNetworkId,
                network_amount: String(parsedAmt),
                quantity: String(parsedQty),
                name_on_card: brandName || "Dnezerlinks" // Dynamic fallback assignment
            }, {
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // Handle multiple response variance strings from VTU Naija's processing engine
            if (pinRequest.data && (
                pinRequest.data.status === 'success' ||
                pinRequest.data.Status === 'successful' ||
                pinRequest.data.status === 'successful'
            )) {
                orderStatus = true;
                vtuResponseData = pinRequest.data;
            } else {
                throw new Error(pinRequest.data.api_response || 'Provider API Rejected Request');
            }

        } catch (apiError) {
            console.error("🔥 VTU Naija Connection Failure:", apiError.message);

            // Auto-refund user using the exact processing totalCost if provider endpoint fails
            await userRef.child('balance').transaction((currentBal) => {
                const currentNumericBal = currentBal === null ? 0 : Number(currentBal);
                return currentNumericBal + totalCost;
            });

            return res.status(502).json({
                success: false,
                error: `Provider service failed. Your funds have been auto-refunded.`
            });
        }

        // 4. If transaction on provider was successful, structure assets and respond
        if (orderStatus) {
            // Extrapolate and parse comma-separated string arrays safely
            let pinStringArray = [];
            let serialStringArray = [];

            if (typeof vtuResponseData.pin === 'string') {
                pinStringArray = vtuResponseData.pin.split(',');
            }
            if (typeof vtuResponseData.serial === 'string') {
                serialStringArray = vtuResponseData.serial.split(',');
            }

            const pinsGenerated = pinStringArray.map((pinCode, index) => ({
                pin: pinCode.trim(),
                serial: serialStringArray[index] ? serialStringArray[index].trim() : 'N/A'
            })).filter(p => p.pin !== "");


            Save log data into user's transaction ledger history
           const txRef = db.ref(`transactions/${uid}`).push();
            await txRef.set({
              type: 'Recharge PIN',
               service: `${network} (₦${parsedAmt} x ${parsedQty})`,
                amount: totalCost,
                date: new Date().toLocaleString(),
                status: "Successful",
                pins: pinsGenerated,
		brandName: finalBrandValue
            });

           return res.status(200).json({
             success: true,
               message: 'PINs Generated Successfully!',
                pins: pinsGenerated,
                network: network,
                amount: parsedAmt,
		brandName: finalBrandValue
            });
       }

    } catch (rootError) {
        console.error("Critical System failure:", rootError);
        return res.status(500).json({ success: false, error: 'Internal server operations failed.' });
    }
});

module.exports = router;





























































const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const axios = require('axios');

// Handles: POST /api/rechargepin/generate
router.post('/generate', async (req, res) => {
    // Destructure explicit fields safely sent from the frontend
    const { uid, network, amount, qty, brandName } = req.body;

    const parsedAmt = parseFloat(amount);
    const parsedQty = parseInt(qty);

    // Calculate total cost directly on the server to avoid missing parameter crashes
    const totalCost = parsedAmt * parsedQty;

    // Validate payload structure carefully
    if (!uid || !network || isNaN(parsedAmt) || isNaN(parsedQty) || parsedQty < 1) {
        return res.status(400).json({ success: false, error: 'Invalid payload details.' });
    }

    const apiKey = process.env.VTUNAIJA_API_KEY;
    if (!apiKey) {
        console.error("🔥 Environment Variable 'VTUNAIJA_API_KEY' is missing on Render!");
        return res.status(500).json({ success: false, error: 'Server configuration error.' });
    }

    const networkMap = { 'MTN': '1', 'GLO': '2', '9MOBILE': '3', 'AIRTEL': '4' };
    const apiNetworkId = networkMap[network.toUpperCase()];

    if (!apiNetworkId) {
        return res.status(400).json({ success: false, error: 'Unsupported Network platform selected.' });                                                       }

    const db = admin.database();
    const userRef = db.ref(`users/${uid}`);

    try {
        let orderStatus = false;
        let vtuResponseData = null;

        // 1. Warm up the local server cache with a quick direct snapshot lookup
        const balSnap = await userRef.child('balance').once('value');
        const liveServerBalance = balSnap.val();

        if (liveServerBalance === null) {
            return res.status(400).json({
                success: false,
                error: "Database configuration error: Balance node does not exist for this account."
            });
        }

        // 2. Safe balance reduction transaction loop
        const transactionResult = await userRef.child('balance').transaction((currentBal) => {
            // Firebase Trap Fix: If the local cache runs speculatively with null,
            // feed it the pre-fetched balance to force a synchronous cloud handshake.
            if (currentBal === null) {                                                        return Number(liveServerBalance) - totalCost;
            }                                                                 
            const numericBalance = Number(currentBal);
            const numericCost = Number(totalCost);
                                                                                          if (isNaN(numericBalance) || numericBalance < numericCost) {
                return; // Aborts transaction loop if balance is genuinely insufficient
            }                                                                 
            return numericBalance - numericCost;                                      });

        // If transaction fails to commit, it means their balance is genuinely insufficient
        if (!transactionResult.committed) {                                               return res.status(400).json({                                                     success: false,
                error: `Genuinely Insufficient Balance! Your wallet balance is less than the required ₦${totalCost.toLocaleString()}`
            });                                                                       }                                                                     
        // 3. Contact VTU NAIJA API using dynamic form properties
        try {                                                                             const pinRequest = await axios.post('[https://vtunaija.com.ng/api/rechargepin/](https://vtunaija.com.ng/api/rechargepin/)', {
                network: apiNetworkId,                                                        network_amount: String(parsedAmt),
                quantity: String(parsedQty),
                name_on_card: brandName || "Dnezerlinks" // Dynamic fallback assignment
            }, {
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // Handle multiple response variance strings from VTU Naija's processing engine
            if (pinRequest.data && (                                                          pinRequest.data.status === 'success' ||
                pinRequest.data.Status === 'successful' ||
                pinRequest.data.status === 'successful'
            )) {
                orderStatus = true;
                vtuResponseData = pinRequest.data;                                        } else {
                throw new Error(pinRequest.data.api_response || 'Provider API Rejected Request');
            }

        } catch (apiError) {                                                              console.error("🔥 VTU Naija Connection Failure:", apiError.message);                                                                            
            // Auto-refund user using the exact processing totalCost if provider endpoint fails
            await userRef.child('balance').transaction((currentBal) => {
                const currentNumericBal = currentBal === null ? 0 : Number(currentBal);
                return currentNumericBal + totalCost;
            });                                                               
            return res.status(502).json({
                success: false,
                error: `Provider service failed. Your funds have been auto-refunded.`
            });
        }

        // 4. If transaction on provider was successful, structure assets and respond
        if (orderStatus) {
            // Extrapolate and parse comma-separated string arrays safely
            let pinStringArray = [];
            let serialStringArray = [];

            if (typeof vtuResponseData.pin === 'string') {
                pinStringArray = vtuResponseData.pin.split(',');
            }
            if (typeof vtuResponseData.serial === 'string') {
                serialStringArray = vtuResponseData.serial.split(',');
            }

            const pinsGenerated = pinStringArray.map((pinCode, index) => ({
                pin: pinCode.trim(),
                serial: serialStringArray[index] ? serialStringArray[index].trim() : 'N/A'
            })).filter(p => p.pin !== "");

            // Save log data into user's transaction ledger history
            const txRef = db.ref(`transactions/${uid}`).push();
            await txRef.set({
                type: 'debit',
                service: `${network} (₦${parsedAmt} x ${parsedQty})`,
                description: `Generated ${parsedQty} Pcs of ${network} ₦${parsedAmt} vouchers`,
                phone: `Qty: ${parsedQty} (${network})`,
                amount: totalCost,
                date: new Date().toLocaleString(),
                status: "SUCCESSFUL",
                timestamp: Date.now(),
                pins: pinsGenerated
            });                                                               
            return res.status(200).json({                                                     success: true,
                message: 'PINs Generated Successfully!',
                pins: pinsGenerated,
                network: network,
                amount: parsedAmt
            });
        }

    } catch (rootError) {
        console.error("Critical System failure:", rootError);
        return res.status(500).json({ success: false, error: 'Internal server operations failed.' });
    }
});

module.exports = router;
