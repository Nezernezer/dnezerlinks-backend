const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');

router.post('/send', transferController.sendMoney);

module.exports = router;
