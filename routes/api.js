const express = require('express');
const router = express.Router();

router.use('/account', require('./accountRoutes'));
router.use('/webhook', require('./webhookRoutes'));
router.use('/airtime', require('./airtimeRoutes'));
router.use('/data', require('./dataRoutes')); // Keep only one
router.use('/cabletv', require('./cabletvRoutes'));
router.use('/exampin', require('./exampinRoutes'));
router.use('/bulksms', require('./bulksmsRoutes'));
router.use('/rechargepin', require('./rechargepinRoutes')); // Fixed spelling
router.use('/electricity', require('./electricityRoutes')); // Fixed spelling
router.use('/airtimeswap', require('./airtimeswapRoutes'));
router.use('/sendmoney', require('./sendmoneyRoutes'));

module.exports = router;
