const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// 1. Function to Reserve the Account
async function reserveAccount(userData) {
    try {
        const response = await axios.post(
            'https://api.billstack.co/v2/thirdparty/generateVirtualAccount/',
            {
                email: userData.email,
                reference: `DNEZER_${Date.now()}`,
                firstName: userData.firstName,
                lastName: userData.lastName,
                phone: userData.phone,
                bank: "PALMPAY"
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.BILLSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        throw error;
    }
}

// 2. Route for User Registration/Dashboard
app.post('/get-my-account', async (req, res) => {
    try {
        const accountData = await reserveAccount(req.body);
        // This sends the Bank Name and Account Number back to your frontend
        res.status(200).json({
            status: "success",
            bank: accountData.data.account[0].bank_name,
            accountNumber: accountData.data.account[0].account_number,
            accountName: accountData.data.account[0].account_name
        });
    } catch (err) {
        res.status(500).json({ status: "error", message: "Could not generate account" });
    }
});

app.get('/', (req, res) => res.send('Dnezerlinks API v2 is Active'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
