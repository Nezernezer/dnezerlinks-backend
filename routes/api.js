const express = require('express');
const router = express.Router();

router.use('/account', require('./accountRoutes'));
router.use('/webhook', require('./webhookRoutes'));
router.use('/airtime', require('./airtimeRoutes'));
router.use('/data', require('./dataRoutes'));

module.exports = router;
