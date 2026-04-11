const express = require("express");
const axios = require("axios");
const router = express.Router();

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

/**
 * POST /api/predict
 * Body: { model_id: string, features: { [key: string]: number } }
 * Proxies to FastAPI POST /predict
 */
router.post("/", async (req, res) => {
  const { model_id, features } = req.body;

  if (!model_id || !features || typeof features !== "object") {
    return res.status(400).json({ error: "model_id and features are required." });
  }

  try {
    const response = await axios.post(
      `${ML_URL}/predict`,
      { model_id, features },
      { timeout: 30_000 }
    );
    res.json(response.data);
  } catch (err) {
    const msg = err.response?.data?.detail || err.message || "Prediction failed";
    console.error("[PREDICT ERROR]", msg);
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
