import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import MetricsCard from "../components/MetricsCard";

const TRAINING_STEPS = [
  { id: "match",    label: "Matching dataset",          icon: "🔍" },
  { id: "load",     label: "Loading & preprocessing",   icon: "📦" },
  { id: "sample",   label: "Sampling 30% for speed",    icon: "⚡" },
  { id: "train",    label: "Parallel model training",   icon: "🤖" },
  { id: "compare",  label: "Comparing & selecting best",icon: "🏆" },
  { id: "retrain",  label: "Retraining best on full data",icon:"🎯" },
  { id: "save",     label: "Saving model artifact",     icon: "💾" },
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export default function Training() {
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [stepIdx, setStepIdx] = useState(-1); // -1 = not started yet
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("trainResult");
    if (!raw) {
      navigate("/");
      return;
    }
    const data = JSON.parse(raw);
    setResult(data);

    // Animate through steps
    (async () => {
      for (let i = 0; i < TRAINING_STEPS.length; i++) {
        setStepIdx(i);
        await sleep(i === 2 ? 1200 : 700); // linger on "Training models"
      }
      setDone(true);
    })();
  }, []);

  if (!result && !error) return null;

  const metrics = result?.metrics || {};
  const isClassification = result?.task_type === "classification";

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">

      {/* Header */}
      <div className="fade-up mb-10">
        <div className="flex items-center gap-3 mb-3">
          <span className={`badge ${isClassification ? "badge-classification" : "badge-regression"}`}>
            {isClassification ? "🏷️ Classification" : "📉 Regression"}
          </span>
          <span className="badge badge-success">
            ✅ {result?.best_model}
          </span>
        </div>
        <h1 className="text-4xl font-black text-slate-100 mb-2">
          Training <span className="gradient-text">Complete</span>
        </h1>
        <p className="text-slate-400">
          Dataset: <span className="text-slate-300 font-medium">{result?.dataset_name}</span>
          &nbsp;·&nbsp;
          {result?.dataset_rows?.toLocaleString()} rows&nbsp;·&nbsp;
          {result?.dataset_cols} columns
        </p>
      </div>

      {/* Step progress */}
      <div className="glass p-6 mb-8 fade-up" style={{ animationDelay: "0.05s" }}>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">
          Training Pipeline
        </h2>
        <div className="flex flex-col gap-4">
          {TRAINING_STEPS.map((step, i) => {
            const status = i < stepIdx ? "done" : i === stepIdx ? "active" : "pending";
            return (
              <div key={step.id} className="flex items-center gap-4">
                {/* Dot */}
                <div className={`step-dot flex-shrink-0 ${status === "active" ? "active" : ""} ${status === "done" ? "done" : ""}`} />

                {/* Icon + label */}
                <div className="flex items-center gap-3 flex-1">
                  <span className={`text-lg transition-opacity ${status === "pending" ? "opacity-30" : "opacity-100"}`}>
                    {step.icon}
                  </span>
                  <span className={`text-sm font-medium transition-all duration-300 ${
                    status === "done"   ? "text-accent-400" :
                    status === "active" ? "text-brand-300" :
                    "text-slate-600"
                  }`}>
                    {step.label}
                  </span>
                </div>

                {/* Status badge */}
                <div className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-all ${
                  status === "done"   ? "text-accent-500 bg-accent-500/10" :
                  status === "active" ? "text-brand-400 bg-brand-400/10" :
                  "text-slate-600"
                }`}>
                  {status === "done" ? "✓ Done" : status === "active" ? "Running…" : ""}
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="progress-bar mt-6">
          <div
            className="progress-fill"
            style={{ width: done ? "100%" : `${Math.max(5, ((stepIdx + 1) / TRAINING_STEPS.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* Results (shown after animation completes) */}
      {done && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 fade-up">
            {isClassification ? (
              <>
                <MetricsCard icon="🎯" label="Accuracy"  value={`${(metrics.accuracy * 100).toFixed(1)}`}  unit="%" color="brand" />
                <MetricsCard icon="📊" label="F1 Score"  value={`${(metrics.f1_score * 100).toFixed(1)}`}  unit="%" color="violet" />
                <MetricsCard icon="📦" label="Dataset"   value={result.dataset_rows?.toLocaleString()} unit="rows" color="accent" />
                <MetricsCard icon="🔢" label="Features"  value={result.feature_names?.length} color="brand" />
              </>
            ) : (
              <>
                <MetricsCard icon="📈" label="R² Score"  value={metrics.r2_score?.toFixed(3)} color="brand" />
                <MetricsCard icon="📉" label="RMSE"      value={metrics.rmse?.toFixed(3)} color="rose" />
                <MetricsCard icon="📦" label="Dataset"   value={result.dataset_rows?.toLocaleString()} unit="rows" color="accent" />
                <MetricsCard icon="🔢" label="Features"  value={result.feature_names?.length} color="brand" />
              </>
            )}
          </div>

          {/* Feature names */}
          <div className="glass p-6 mb-8 fade-up" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              📋 Feature Names ({result.feature_names?.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {result.feature_names?.map((f) => (
                <span
                  key={f}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono text-brand-300"
                  style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Dataset Preview */}
          {result.dataset_preview && result.dataset_preview.length > 0 && (
            <div className="glass p-6 mb-8 fade-up" style={{ animationDelay: "0.12s" }}>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                👀 Dataset Preview (First 5 Rows)
              </h2>
              <div className="overflow-x-auto rounded-lg border border-slate-700/50">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-800/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-700/50">
                    <tr>
                      {Object.keys(result.dataset_preview[0]).map((col) => (
                        <th key={col} className="px-4 py-3 whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 bg-slate-900/20">
                    {result.dataset_preview.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        {Object.values(row).map((val, colIdx) => (
                          <td key={colIdx} className="px-4 py-3 whitespace-nowrap truncate max-w-[200px]">
                            {val !== null && val !== undefined ? String(val) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Model info */}
          <div className="glass p-6 mb-8 fade-up" style={{ animationDelay: "0.15s" }}>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              🤖 Model Information
            </h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Model ID", result.model_id],
                ["Best Algorithm", result.best_model],
                ["Task Type", result.task_type],
                ["Dataset", result.dataset_name],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-slate-500 text-xs uppercase tracking-wide mb-1">{k}</dt>
                  <dd className="text-slate-200 font-medium font-mono">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ── Smart Preprocessing Report ── */}
          {result.preprocessing && (
            <div className="glass p-6 mb-8 fade-up" style={{ animationDelay: "0.16s" }}>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">
                🧠 Smart Preprocessing Report
              </h2>

              {/* Dataset Analysis row */}
              {result.preprocessing.dataset_analysis && (
                <div
                  className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 p-3 rounded-xl"
                  style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(51,65,85,0.4)" }}
                >
                  {[
                    ["Rows", result.preprocessing.dataset_analysis.size?.toLocaleString(), "📦"],
                    ["Numeric Cols", result.preprocessing.dataset_analysis.num_cols, "🔢"],
                    ["Categoric Cols", result.preprocessing.dataset_analysis.cat_cols, "🏷️"],
                    ["Pre-scaled?", result.preprocessing.dataset_analysis.is_scaled ? "Yes" : "No", "📐"],
                  ].map(([label, val, icon]) => (
                    <div key={label} className="text-center">
                      <div className="text-lg mb-1">{icon}</div>
                      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
                      <div className="text-sm font-bold text-slate-200 mt-0.5">{val ?? "—"}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Decision chips */}
              <div className="flex flex-wrap gap-2">
                {/* Target column */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }}>
                  🎯 Target: <span className="font-mono">{result.preprocessing.target_column}</span>
                </span>

                {/* Missing values */}
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  result.preprocessing.missing_handled
                    ? "text-amber-300"
                    : "text-slate-500"
                }`}
                  style={{
                    background: result.preprocessing.missing_handled ? "rgba(245,158,11,0.12)" : "rgba(51,65,85,0.3)",
                    border: result.preprocessing.missing_handled ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(51,65,85,0.4)",
                  }}>
                  {result.preprocessing.missing_handled
                    ? `✅ Missing filled (${result.preprocessing.values_filled ?? 0} values)`
                    : "⬜ No missing values"}
                </span>

                {/* Encoding */}
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  result.preprocessing.categorical_encoded > 0 ? "text-violet-300" : "text-slate-500"
                }`}
                  style={{
                    background: result.preprocessing.categorical_encoded > 0 ? "rgba(139,92,246,0.12)" : "rgba(51,65,85,0.3)",
                    border: result.preprocessing.categorical_encoded > 0 ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(51,65,85,0.4)",
                  }}>
                  {result.preprocessing.categorical_encoded > 0
                    ? `✅ Encoded ${result.preprocessing.categorical_encoded} cat. col(s)`
                    : "⬜ No encoding needed"}
                </span>

                {/* Scaling */}
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  result.preprocessing.scaling_applied ? "text-emerald-300" : "text-slate-500"
                }`}
                  style={{
                    background: result.preprocessing.scaling_applied ? "rgba(16,185,129,0.12)" : "rgba(51,65,85,0.3)",
                    border: result.preprocessing.scaling_applied ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(51,65,85,0.4)",
                  }}>
                  {result.preprocessing.scaling_applied
                    ? "✅ StandardScaler applied"
                    : "⬜ Scaling skipped (already normalised)"}
                </span>

                {/* Outliers */}
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  result.preprocessing.outliers_removed > 0 ? "text-rose-300" : "text-slate-500"
                }`}
                  style={{
                    background: result.preprocessing.outliers_removed > 0 ? "rgba(244,63,94,0.12)" : "rgba(51,65,85,0.3)",
                    border: result.preprocessing.outliers_removed > 0 ? "1px solid rgba(244,63,94,0.3)" : "1px solid rgba(51,65,85,0.4)",
                  }}>
                  {result.preprocessing.outliers_removed > 0
                    ? `✅ ${result.preprocessing.outliers_removed} outlier rows removed (IQR)`
                    : "⬜ Outlier removal skipped (< 1000 rows)"}
                </span>
              </div>
            </div>
          )}

          {/* ── Model Comparison ── */}
          {result.model_comparison && Object.keys(result.model_comparison).length > 0 && (
            <div className="glass p-6 mb-8 fade-up" style={{ animationDelay: "0.17s" }}>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">
                🏆 Model Comparison
              </h2>

              {/* Best-model callout */}
              <div
                className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
                style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(16,185,129,0.12))",
                  border: "1px solid rgba(99,102,241,0.35)",
                }}
              >
                <span className="text-2xl">🥇</span>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Best Model</p>
                  <p className="text-lg font-bold text-brand-300">{result.best_model}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    {result.task_type === "classification" ? "Accuracy" : "R² Score"}
                  </p>
                  <p className="text-2xl font-black text-accent-400">
                    {result.model_comparison[result.best_model]?.toFixed(4)}
                  </p>
                </div>
              </div>

              {/* Leaderboard rows */}
              <div className="flex flex-col gap-3">
                {Object.entries(result.model_comparison)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, score], idx) => {
                    const isWinner = name === result.best_model;
                    const maxScore = Math.max(...Object.values(result.model_comparison));
                    const barWidth = maxScore > 0 ? (score / maxScore) * 100 : 0;
                    const medals = ["🥇", "🥈", "🥉"];
                    return (
                      <div
                        key={name}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                        style={{
                          background: isWinner
                            ? "rgba(99,102,241,0.12)"
                            : "rgba(15,23,42,0.5)",
                          border: isWinner
                            ? "1px solid rgba(99,102,241,0.3)"
                            : "1px solid rgba(51,65,85,0.4)",
                        }}
                      >
                        {/* Rank medal */}
                        <span className="text-lg w-6 text-center flex-shrink-0">
                          {medals[idx] ?? `#${idx + 1}`}
                        </span>

                        {/* Name */}
                        <span
                          className={`text-sm font-semibold w-36 flex-shrink-0 ${
                            isWinner ? "text-brand-300" : "text-slate-300"
                          }`}
                        >
                          {name}
                        </span>

                        {/* Bar */}
                        <div className="flex-1 h-2 rounded-full bg-slate-700/60 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${barWidth}%`,
                              background: isWinner
                                ? "linear-gradient(90deg, #6366f1, #10b981)"
                                : "linear-gradient(90deg, #475569, #94a3b8)",
                            }}
                          />
                        </div>

                        {/* Score */}
                        <span
                          className={`text-sm font-mono font-bold w-14 text-right flex-shrink-0 ${
                            isWinner ? "text-accent-400" : "text-slate-400"
                          }`}
                        >
                          {score.toFixed(4)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Data Insights */}
          {result.plots && Object.keys(result.plots).length > 0 && (
            <div className="glass p-6 mb-8 fade-up" style={{ animationDelay: "0.18s" }}>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                📊 Data Insights
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {result.plots.heatmap && (
                  <div className="flex flex-col items-center bg-slate-900/30 p-2 rounded-xl">
                    <h3 className="text-xs text-slate-400 font-semibold uppercase mb-2 tracking-wide w-full px-2">Correlation Heatmap</h3>
                    <img src={result.plots.heatmap} alt="Correlation Heatmap" className="rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] max-w-full h-auto border border-slate-700/30 transition-transform duration-300 hover:scale-[1.02]" />
                  </div>
                )}
                {result.plots.feature_importance && (
                  <div className="flex flex-col items-center bg-slate-900/30 p-2 rounded-xl">
                    <h3 className="text-xs text-slate-400 font-semibold uppercase mb-2 tracking-wide w-full px-2">Feature Importance</h3>
                    <img src={result.plots.feature_importance} alt="Feature Importance" className="rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] max-w-full h-auto border border-slate-700/30 transition-transform duration-300 hover:scale-[1.02]" />
                  </div>
                )}
                {result.plots.distribution && (
                  <div className="flex flex-col items-center md:col-span-2 bg-slate-900/30 p-2 rounded-xl">
                    <h3 className="text-xs text-slate-400 font-semibold uppercase mb-2 tracking-wide w-full px-2">Feature Distributions</h3>
                    <img src={result.plots.distribution} alt="Feature Distributions" className="rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] max-w-full h-auto border border-slate-700/30 transition-transform duration-300 hover:scale-[1.01]" />
                  </div>
                )}
                {result.plots.target && (
                  <div className="flex flex-col items-center bg-slate-900/30 p-2 rounded-xl">
                    <h3 className="text-xs text-slate-400 font-semibold uppercase mb-2 tracking-wide w-full px-2">Target Distribution</h3>
                    <img src={result.plots.target} alt="Target Distribution" className="rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] max-w-full h-auto border border-slate-700/30 transition-transform duration-300 hover:scale-[1.02]" />
                  </div>
                )}
                {result.plots.missing && (
                  <div className="flex flex-col items-center bg-slate-900/30 p-2 rounded-xl">
                    <h3 className="text-xs text-slate-400 font-semibold uppercase mb-2 tracking-wide w-full px-2">Missing Values</h3>
                    <img src={result.plots.missing} alt="Missing Values" className="rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] max-w-full h-auto border border-slate-700/30 transition-transform duration-300 hover:scale-[1.02]" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-4 fade-up" style={{ animationDelay: "0.2s" }}>
            <Link
              to="/playground"
              id="go-to-playground-btn"
              className="btn-primary text-base py-3.5 px-8"
            >
              🎮 Open Playground
            </Link>
            <Link
              to="/chat"
              id="go-to-chat-btn"
              className="btn-secondary text-base py-3.5 px-8"
            >
              💬 Chat with Dataset
            </Link>
            <Link to="/" className="btn-secondary text-base py-3.5 px-8">
              🔁 Train New Model
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
