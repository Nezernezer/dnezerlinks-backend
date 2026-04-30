const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/validate', async (req, res) => {
    const { iuc, providerID } = req.body;

    try {
        const token = process.env.VTUNAIJA_API_KEY ? process.env.VTUNAIJA_API_KEY.trim() : "";
        const url = "https://vtunaija.com.ng/api/cablesub/verify/";
        
        // VTUNAIJA expects a POST request for verification
        const response = await axios.post(url, {
            cablename: String(providerID), // Uses 1, 2, 3, or 4
            smart_card_number: String(iuc).trim()
        }, {
            headers: { 
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("DEBUG - IUC:", iuc, "ProviderID:", providerID, "Response:", response.data);

        if (response.data.status === 'success') {
            res.json({ 
                success: true, 
                customerName: response.data.Customer_Name || response.data.name
            });
        } else {
            res.json({ 
                success: false, 
                error: response.data.api_response || "Iuc/smartcard number not valid" 
            });
        }
    } catch (error) {
        console.error("API ERROR:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Validation failed. Please try again." });
    }
});

router.post('/buy', async (req, res) => {
    res.json({ success: true, message: "Purchase route ready" });
});

module.exports = router;
