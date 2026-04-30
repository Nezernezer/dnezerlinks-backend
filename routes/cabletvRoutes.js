const express = require('express');
const router = express.Router();
const axios = require('axios');

const serviceMap = {
    "1": "gotv",
    "2": "dstv",
    "3": "startimes",
    "4": "showmax"
};

router.post('/validate', async (req, res) => {
    const { iuc, providerID } = req.body;
    const serviceName = serviceMap[String(providerID)];

    if (!serviceName) {
        return res.json({ success: false, error: "Invalid Provider Selected" });
    }

    try {
        const url = `https://vtunaija.com.ng/api/merchant/verify-smart-customer/?smart_no=${iuc}&service=${serviceName}`;
        
        const response = await axios.get(url, {
            headers: { 'Authorization': `Token ${process.env.VTUNAIJA_API_KEY}` }
        });

        console.log("API RAW RESPONSE:", response.data);

        // Check if API says invalid or if it found a name
        if (response.data.invalid === false || response.data.customer_name || response.data.name) {
            res.json({ 
                success: true, 
                customerName: response.data.customer_name || response.data.name 
            });
        } else {
            res.json({ success: false, error: "Iuc/smartcard number not valid" });
        }
    } catch (error) {
        console.error("Validation API Error:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Validation server unreachable" });
    }
});

router.post('/buy', async (req, res) => {
    // This will hit after the Pin/KYC Gatekeeper in index.js passes
    res.json({ success: true, message: "Purchase logic goes here" });
});

module.exports = router;
