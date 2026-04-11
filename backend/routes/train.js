const express = require("express");
const axios = require("axios");
const router = express.Router();

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

/**
 * POST /api/train
 * Body: { problem_description: string }
 * Proxies to FastAPI POST /auto-train
 */
router.post("/", async (req, res) => {
  const { problem_description } = req.body;

  if (!problem_description || typeof problem_description !== "string") {
    return res.status(400).json({ error: "problem_description is required." });
  }

  try {
    const response = await axios.post(
      `${ML_URL}/auto-train`,
      { problem_description },
      { timeout: 300_000 } // 5-minute timeout for training
    );
    res.json(response.data);
  } catch (err) {
    const msg = err.response?.data?.detail || err.message || "Training failed";
    console.error("[TRAIN ERROR]", msg);
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
