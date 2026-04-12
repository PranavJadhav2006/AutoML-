import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import MetricsCard from "../components/MetricsCard";

const TRAINING_STEPS = [
  { id: "match",    label: "Matching dataset",          icon: "🔍" },
  { id: "load",     label: "Loading & preprocessing",   icon: "📦" },
  { id: "train",    label: "Training models",           icon: "⚡" },
  { id: "evaluate", label: "Evaluating performance",    icon: "📈" },
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
