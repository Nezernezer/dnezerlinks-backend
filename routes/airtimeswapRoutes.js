const express = require('express');
const router = express.Router();

router.post('/request', (req, res) => {
    const { network, amount, phone } = req.body;
    res.json({ status: 'pending', msg: 'Please transfer airtime to 08117776509' });
});

module.exports = router;
