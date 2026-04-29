const express = require('express');
const router = express.Router();

router.post('/buy', (req, res) => {
    const { examType, quantity } = req.body;
    res.json({ status: 'success', pin: '1234-5678-9012', serial: 'SN12345' });
});

module.exports = router;
