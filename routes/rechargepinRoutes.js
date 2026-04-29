const express = require('express');
const router = express.Router();

router.post('/generate', (req, res) => {
    const { network, amount, qty } = req.body;
    res.json({ status: 'success', data: 'E-PINs generated successfully' });
});

module.exports = router;
