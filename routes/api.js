const express = require('express');
const router = express.Router();

// Existing route mappings
router.use('/account', require('./accountRoutes'));
router.use('/webhook', require('./webhookRoutes'));
router.use('/airtime', require('./airtimeRoutes'));
router.use('/data', require('./dataRoutes'));
router.use('/cabletv', require('./cabletvRoutes')); // Path: /api/cabletv
router.use('/exampin', require('./exampinRoutes'));
router.use('/bulksms', require('./bulksmsRoutes'));
router.use('/rechargepin', require('./rechargepinRoutes'));
router.use('/electricity', require('./electricityRoutes'));
router.use('/airtimeswap', require('./airtimeswapRoutes'));
router.use('/sendmoney', require('./sendmoneyRoutes'));

module.exports = router;
