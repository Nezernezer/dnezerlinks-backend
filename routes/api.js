const express = require('express');

const router = express.Router();

// ================= ACCOUNT =================
router.use(
    '/account',
    require('./accountRoutes')
);

// ================= WEBHOOK =================
router.use(
    '/webhook',
    require('./webhookRoutes')
);

// ================= SERVICES =================
router.use(
    '/airtime',
    require('./airtimeRoutes')
);

router.use(
    '/data',
    require('./dataRoutes')
);

router.use(
    '/cabletv',
    require('./cabletvRoutes')
);

router.use(
    '/exampin',
    require('./exampinRoutes')
);

router.use(
    '/bulksms',
    require('./bulksmsRoutes')
);

router.use(
    '/rechargepin',
    require('./rechargepinRoutes')
);

router.use(
    '/electricity',
    require('./electricityRoutes')
);

router.use(
    '/airtimeswap',
    require('./airtimeswapRoutes')
);

router.use(
    '/sendmoney',
    require('./sendmoneyRoutes')
);

module.exports = router;
