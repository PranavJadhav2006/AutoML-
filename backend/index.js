require("dotenv").config();
const express = require("express");
const cors = require("cors");

const trainRoutes = require("./routes/train");
const predictRoutes = require("./routes/predict");
const chatRoutes = require("./routes/chat");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/train", trainRoutes);
app.use("/api/predict", predictRoutes);
app.use("/api/chat", chatRoutes);

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "AutoML Studio Backend" });
});

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅ AutoML Studio Backend running on http://localhost:${PORT}`);
  console.log(`   ML Service expected at: ${process.env.ML_SERVICE_URL || "http://localhost:8000"}`);
});
