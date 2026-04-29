const express = require('express');
const router = express.Router();

router.post('/send', (req, res) => {
    const { senderID, recipients, message } = req.body;
    res.json({ status: 'success', msg: 'Messages Queued' });
});

module.exports = router;
