const express = require('express');
const router = express.Router();

router.post('/validate-meter', (req, res) => {
    const { meterNumber, disco } = req.body;
    res.json({ status: 'success', customer: 'John Doe' });
});

router.post('/pay', (req, res) => {
    const { meterNumber, amount, tokenType } = req.body;
    res.json({ status: 'success', token: '4432-1123-9987-0098' });
});

module.exports = router;
