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
      `https://vtunaija.com/api/v1/${endpoint}`,
      payload,
      {
        headers: {
          Authorization: `Token ${apiKey}`,
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

// ================= BILLSTACK =================
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
          Authorization: `Bearer ${secret}`,
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

// ================= MESSENGER WEBHOOK =================
const VERIFY_TOKEN = "dnezerlinks123";

// Verification (GET)
app.get("/messengerWebhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Receive messages (POST)
app.post("/messengerWebhook", (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    body.entry.forEach((entry) => {
      const webhookEvent = entry.messaging[0];
      console.log("Received event:", JSON.stringify(webhookEvent, null, 2));
    });

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// ================= TEST =================
app.get("/functions-test", (req, res) => {
  res.send("FUNCTIONS FILE ACTIVE");
});

// ================= START SERVER =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
