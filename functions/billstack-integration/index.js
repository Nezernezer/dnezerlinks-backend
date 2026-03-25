const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const BILLSTACK_SECRET = process.env.BILLSTACK_SECRET_KEY;

// Payment Initialization
app.post('/pay', async (req, res) => {
    const { email, amount } = req.body;
    try {
        const response = await axios.post('https://api.billstack.co/v1/transaction/initialize', {
            email,
            amount,
            callback_url: "https://dnezerlinks.onrender.com/verify"
        }, {
            headers: {
                Authorization: `Bearer ${BILLSTACK_SECRET}`,
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Webhook Listener (Crucial for VTU automation)
app.post('/webhook', (req, res) => {
    const event = req.body;
    if (event.event === 'charge.success') {
        console.log('Payment Successful for:', event.data.customer.email);
        // Add your logic here to dispense data/airtime
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
