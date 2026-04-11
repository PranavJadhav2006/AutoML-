const express = require("express");
const axios = require("axios");
const router = express.Router();

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

/**
 * POST /api/chat
 * Body: { model_id: string, question: string }
 * Proxies to FastAPI POST /chat
 */
router.post("/", async (req, res) => {
  const { model_id, question } = req.body;

  if (!model_id || !question || typeof question !== "string") {
    return res.status(400).json({ error: "model_id and question are required." });
  }

  try {
    const response = await axios.post(
      `${ML_URL}/chat`,
      { model_id, question },
      { timeout: 30_000 }
    );
    res.json(response.data);
  } catch (err) {
    const msg = err.response?.data?.detail || err.message || "Chat failed";
    console.error("[CHAT ERROR]", msg);
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
