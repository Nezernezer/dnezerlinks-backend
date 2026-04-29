const express = require('express');
const router = express.Router();

router.post('/transfer', (req, res) => {
    const { bankCode, accountNumber, amount } = req.body;
    res.json({ status: 'success', msg: 'Transfer successful' });
});

module.exports = router;
