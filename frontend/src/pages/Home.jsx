import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const EXAMPLE_PROMPTS = [
  "Predict house prices based on features like size, location, and rooms",
  "Classify iris flowers into species using petal and sepal measurements",
  "Diagnose breast cancer as malignant or benign from cell measurements",
  "Predict diabetes disease progression from patient health metrics",
  "Classify wine types based on chemical composition",
  "Predict titanic passenger survival based on age, class, and gender",
];

const FEATURES = [
  { icon: "🔍", title: "Auto Dataset Fetch", desc: "Describe your problem — we find the best dataset automatically from HuggingFace & sklearn" },
  { icon: "⚡", title: "Instant Training", desc: "Trains Random Forest, Gradient Boosting & more — picks the winner automatically" },
  { icon: "🎮", title: "Live Playground", desc: "Dynamic prediction UI generated from your model's feature names — ready to use instantly" },
  { icon: "💬", title: "Chat with Data", desc: "Ask plain-English questions about your dataset — get stats, distributions & insights" },
];

export default function Home() {
  const navigate = useNavigate();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [placeholder, setPlaceholder] = useState(EXAMPLE_PROMPTS[0]);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  // Cycle example prompts in placeholder
  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % EXAMPLE_PROMPTS.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setPlaceholder(EXAMPLE_PROMPTS[placeholderIdx]);
  }, [placeholderIdx]);

  const handleTrain = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await axios.post("/api/train", { problem_description: description });
      // Store result in sessionStorage so Training page can read it
      sessionStorage.setItem("trainResult", JSON.stringify(res.data));
      navigate("/training");
    } catch (err) {
      setError(err.response?.data?.error || "Training failed. Is the ML service running?");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleTrain();
  };

  return (
    <main className="relative min-h-[calc(100vh-64px)] flex flex-col overflow-hidden">

      {/* Decorative blobs */}
      <div className="blob w-96 h-96 bg-brand-600" style={{ top: "-10%", left: "-5%" }} />
      <div className="blob w-80 h-80 bg-violet-600" style={{ top: "20%", right: "-5%" }} />
      <div className="blob w-64 h-64 bg-accent-500" style={{ bottom: "5%", left: "40%" }} />

      {/* Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-20 pb-8">
        
        {/* Badge */}
        <div className="badge badge-classification mb-6 fade-up">
          ✨ No-Code ML Platform · v1.0
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 fade-up max-w-4xl leading-none"
            style={{ animationDelay: "0.05s" }}>
          Train AI Models{" "}
          <span className="gradient-text">Without Code</span>
        </h1>

        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mb-12 fade-up leading-relaxed"
           style={{ animationDelay: "0.1s" }}>
          Describe your ML problem in plain English. AutoML Studio fetches the best dataset,
          trains multiple models, and gives you a live prediction playground — all in under 2 minutes.
        </p>

        {/* Input Card ─────────────────────────────────────────────────── */}
        <div className="glass w-full max-w-2xl p-6 mb-4 fade-up glow-brand"
             style={{ animationDelay: "0.15s" }}>
          <label className="block text-left text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            📝 Describe your ML problem
          </label>
          <textarea
            id="problem-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={3}
            className="input-field resize-none text-base mb-4"
          />

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm text-rose-300 border border-rose-500/30"
                 style={{ background: "rgba(239,68,68,0.1)" }}>
              ⚠️ {error}
            </div>
          )}

          <button
            id="start-training-btn"
            onClick={handleTrain}
            disabled={!description.trim() || loading}
            className="btn-primary w-full justify-center text-base py-3.5"
          >
            {loading ? (
              <>
                <span className="spinner" />
                Fetching dataset & training…
              </>
            ) : (
              <>
                <span>🚀</span>
                Start Training  
                <span className="text-xs opacity-60 ml-1">⌘↵</span>
              </>
            )}
          </button>
        </div>

        {/* Example chips */}
        <div className="flex flex-wrap justify-center gap-2 max-w-2xl fade-up" style={{ animationDelay: "0.2s" }}>
          <span className="text-xs text-slate-500 self-center mr-1">Try:</span>
          {EXAMPLE_PROMPTS.slice(0, 4).map((p, i) => (
            <button
              key={i}
              onClick={() => setDescription(p)}
              className="text-xs px-3 py-1.5 rounded-full transition-all duration-200
                         text-slate-400 hover:text-slate-200 cursor-pointer"
              style={{
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.15)",
              }}
            >
              {p.slice(0, 40)}…
            </button>
          ))}
        </div>
      </section>

      {/* Features grid ─────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-20 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="glass p-5 transition-all duration-300 fade-up hover:border-brand-500/30 cursor-default"
              style={{ animationDelay: `${0.2 + i * 0.07}s` }}
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-slate-200 mb-2 text-sm">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="mt-12 glass p-8 fade-up" style={{ animationDelay: "0.4s" }}>
          <h2 className="text-xl font-bold text-slate-200 text-center mb-8">How It Works</h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            {[
              { step: "1", label: "Describe", icon: "📝", desc: "Plain English problem" },
              { step: "2", label: "Fetch", icon: "📦", desc: "Auto-find best dataset" },
              { step: "3", label: "Train", icon: "⚡", desc: "Multi-model AutoML" },
              { step: "4", label: "Play", icon: "🎮", desc: "Live prediction UI" },
              { step: "5", label: "Chat", icon: "💬", desc: "Explore data insights" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-2 text-center min-w-[80px]">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                       style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)" }}>
                    {s.icon}
                  </div>
                  <span className="text-xs font-semibold text-brand-300">{s.label}</span>
                  <span className="text-xs text-slate-500">{s.desc}</span>
                </div>
                {i < 4 && (
                  <div className="hidden md:block text-slate-600 text-xl">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
