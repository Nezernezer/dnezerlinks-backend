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

    console.log(`Validating IUC: ${iuc} for Service: ${serviceName}`);

    if (!serviceName) {
        return res.json({ success: false, error: "Invalid Provider Selected" });
    }

    try {
        const token = process.env.VTUNAIJA_API_KEY;
        const url = `https://vtunaija.com.ng/api/merchant/verify-smart-customer/?smart_no=${iuc}&service=${serviceName}`;
        
        const response = await axios.get(url, {
            headers: { 
                'Authorization': `Token ${token.trim()}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("VTUNAIJA RAW RESPONSE:", response.data);

        // VTUNAIJA status checks
        if (response.data.status === 'success' || response.data.invalid === false) {
            return res.json({ 
                success: true, 
                customerName: response.data.customer_name || response.data.name 
            });
        } else {
            // Log exactly why it failed
            console.log("API returned failure status:", response.data.msg || response.data.error);
            return res.json({ success: false, error: "Iuc/smartcard number not valid" });
        }
    } catch (error) {
        console.error("AXIOS ERROR DETAILS:", error.response?.data || error.message);
        return res.status(500).json({ success: false, error: "Validation server unreachable" });
    }
});

router.post('/buy', async (req, res) => {
    res.json({ success: true, message: "Endpoint Ready" });
});

module.exports = router;
