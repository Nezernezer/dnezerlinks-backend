const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("Backend is LIVE ✅");
});

// ================= DEBUG =================
app.get("/check-env", (req, res) => {
  res.json({
    BILLSTACK_SECRET_KEY: process.env.BILLSTACK_SECRET_KEY ? "OK" : "MISSING",
    VTU_API_KEY: process.env.VTU_API_KEY ? "OK" : "MISSING"
  });
});

// ================= TEST =================
app.post("/test", (req, res) => {
  res.json({
    status: true,
    body: req.body
  });
});

// ================= VTU =================
app.post("/proxyVtuRequest", async (req, res) => {
  try {
    const apiKey = process.env.VTU_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "VTU_API_KEY missing" });
    }

    const { endpoint, payload } = req.body;

    console.log("VTU Request:", endpoint);

    const response = await axios.post(
      \`https://vtunaija.com/api/v1/\${endpoint}\`,
      payload,
      {
        headers: {
          Authorization: \`Token \${apiKey}\`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);

  } catch (err) {
    console.error("VTU ERROR:", err.response?.data || err.message);

    res.status(500).json({
      error: "VTU failed",
      detail: err.response?.data || err.message
    });
  }
});

// ================= BILLSTACK (FIXED) =================
app.post("/createBillstackAccount", async (req, res) => {
  try {
    const secret = process.env.BILLSTACK_SECRET_KEY;

    if (!secret) {
      return res.status(500).json({ error: "BILLSTACK_SECRET_KEY missing" });
    }

    console.log("Creating Billstack account for:", req.body.email);

    const response = await axios.post(
      "https://api.billstack.com/v1/reserved-accounts",
      {
        accountReference: "ref_" + Date.now(),
        customerEmail: req.body.email
      },
      {
        headers: {
          Authorization: \`Bearer \${secret}\`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);

  } catch (err) {
    console.error("BILLSTACK ERROR:", err.response?.data || err.message);

    res.status(500).json({
      error: "Billstack failed",
      detail: err.response?.data || err.message
    });
  }
});

// ================= START =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));


// ===== FUNCTIONS TEST ROUTE =====
app.get("/functions-test", (req, res) => {
  res.send("FUNCTIONS FILE ACTIVE");
});

