Handles: POST /api/rechargepin/generate
router.post('/generate', async (req, res) => {
    // Destructure explicit fields safely sent from the frontend
    const { uid, network, amount, qty, brandName } = req.body;

    const parsedAmt = parseFloat(amount);
    const parsedQty = parseInt(qty);

    // Calculate total cost directly on the server to avoid missing parameter crashes
    const totalCost = parsedAmt * parsedQty;

    // Validate payload structure carefully
    if (!uid || !network || isNaN(pars
