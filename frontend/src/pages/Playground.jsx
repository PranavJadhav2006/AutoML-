import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";

function ConfidenceBar({ label, value }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span className="font-mono">{value}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function Playground() {
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [inputs, setInputs] = useState({});
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("trainResult");
    if (!raw) { navigate("/"); return; }
    const data = JSON.parse(raw);
    setResult(data);
    // Pre-fill inputs with 0
    const init = {};
    data.feature_names?.forEach((f) => { init[f] = ""; });
    setInputs(init);
  }, []);

  const handlePredict = async () => {
    setLoading(true);
    setError("");
    setPrediction(null);

    // Convert inputs to numbers
    const features = {};
    Object.keys(inputs).forEach((k) => {
      features[k] = parseFloat(inputs[k]) || 0;
    });

    try {
      const res = await axios.post("/api/predict", {
        model_id: result.model_id,
        features,
      });
      setPrediction(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Prediction failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, val) => {
    setInputs((prev) => ({ ...prev, [key]: val }));
    setPrediction(null);
  };

  if (!result) return null;

  const isClassification = result.task_type === "classification";

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">

      {/* Header */}
      <div className="fade-up mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className={`badge ${isClassification ? "badge-classification" : "badge-regression"}`}>
            {isClassification ? "🏷️ Classification" : "📉 Regression"}
          </span>
          <span className="text-slate-500 text-sm">Model: <code className="text-brand-300">{result.model_id}</code></span>
        </div>
        <h1 className="text-4xl font-black text-slate-100 mb-2">
          Prediction <span className="gradient-text">Playground</span>
        </h1>
        <p className="text-slate-400">
          {result.dataset_name} · {result.best_model} ·{" "}
          {isClassification
            ? `Accuracy: ${(result.metrics.accuracy * 100).toFixed(1)}%`
            : `R²: ${result.metrics.r2_score?.toFixed(3)}`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Input form */}
        <div className="glass p-6 fade-up" style={{ animationDelay: "0.05s" }}>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">
            🔢 Input Features ({result.feature_names?.length})
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
            {result.feature_names?.map((feature) => (
              <div key={feature}>
                <label className="block text-xs text-slate-500 font-mono mb-1 truncate" title={feature}>
                  {feature}
                </label>
                <input
                  id={`feature-${feature.replace(/\s+/g, "-")}`}
                  type="number"
                  step="any"
                  value={inputs[feature] ?? ""}
                  onChange={(e) => handleChange(feature, e.target.value)}
                  placeholder="0.0"
                  className="input-field text-sm py-2.5"
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg text-sm text-rose-300 border border-rose-500/30"
                 style={{ background: "rgba(239,68,68,0.1)" }}>
              ⚠️ {error}
            </div>
          )}

          <button
            id="predict-btn"
            onClick={handlePredict}
            disabled={loading}
            className="btn-primary w-full justify-center mt-5"
          >
            {loading ? <><span className="spinner" /> Predicting…</> : "🔮 Run Prediction"}
          </button>
        </div>

        {/* Right panel: result */}
        <div className="flex flex-col gap-4 fade-up" style={{ animationDelay: "0.1s" }}>

          {/* Prediction result */}
          <div className="glass p-6 flex-1 flex flex-col justify-center">
            {!prediction ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-4">🔮</div>
                <p className="text-slate-500 text-sm">Fill in the features and click<br />
                  <span className="text-brand-400"> Run Prediction</span>
                </p>
              </div>
            ) : (
              <div className="fade-up">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Prediction</div>
                <div className="text-6xl font-black gradient-text mb-2 break-all">
                  {isClassification
                    ? `Class ${prediction.prediction}`
                    : prediction.prediction?.toFixed(4)}
                </div>

                {isClassification && prediction.confidence != null && (
                  <div className="mt-2 mb-4">
                    <span className="text-sm text-slate-400">Confidence: </span>
                    <span className="text-lg font-bold text-accent-400">
                      {prediction.confidence}%
                    </span>
                  </div>
                )}

                {!isClassification && (
                  <p className="text-slate-400 text-sm mt-2">
                    Predicted value from {result.best_model}
                  </p>
                )}

                {/* Probability bars */}
                {prediction.all_probabilities && (
                  <div className="mt-6">
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">
                      Class Probabilities
                    </div>
                    {Object.entries(prediction.all_probabilities).map(([cls, pct]) => (
                      <ConfidenceBar key={cls} label={cls} value={pct} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="glass p-5">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Quick Actions</div>
            <div className="flex flex-col gap-2">
              <Link to="/chat" className="btn-secondary text-sm py-2.5 w-full justify-center">
                💬 Chat with Dataset
              </Link>
              <Link to="/training" className="btn-secondary text-sm py-2.5 w-full justify-center">
                📊 View Training Results
              </Link>
              <Link to="/" className="btn-secondary text-sm py-2.5 w-full justify-center">
                🔁 Train New Model
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
