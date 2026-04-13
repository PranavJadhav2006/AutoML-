import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MessageCircle, Database, CheckCircle2, Server, Loader2, Sparkles, AlertTriangle } from "lucide-react";

// --- Constants & Config --- //
const API_URL = "http://localhost:8000";

const ML_STEPS = [
  { id: "match",    label: "Matching dataset",           icon: "🔍" },
  { id: "load",     label: "Loading & preprocessing",    icon: "📦" },
  { id: "sample",   label: "Sampling 30% for speed",     icon: "⚡" },
  { id: "train",    label: "Parallel model training",    icon: "🤖" },
  { id: "compare",  label: "Comparing & selecting best", icon: "🏆" },
  { id: "retrain",  label: "Retraining best on full data",icon: "🎯" },
  { id: "save",     label: "Saving model artifact",      icon: "💾" },
];

const DL_STEPS = [
  { id: "match",    label: "Matching dataset",            icon: "🔍" },
  { id: "load",     label: "Loading & preprocessing",     icon: "📦" },
  { id: "build",    label: "Building neural network",     icon: "🧠" },
  { id: "train",    label: "Training MLP with Keras",     icon: "🔥" },
  { id: "early",    label: "EarlyStopping monitoring",    icon: "⏱️" },
  { id: "eval",     label: "Evaluating on full dataset",  icon: "📊" },
  { id: "save",     label: "Saving model artifact",       icon: "💾" },
];

const DOMAINS = [
  { label: "Predict Crop Yield", fill: "Predict crop yield based on soil, rainfall, and temperature data", domain: "Agriculture", emoji: "🌾" },
  { label: "Diagnose Disease", fill: "Classify patient records to predict disease diagnosis", domain: "Healthcare", emoji: "🏥" },
  { label: "Identify Defects", fill: "Detect manufacturing defects from production line images", domain: "Manufacturing", emoji: "🔧" },
  { label: "Detect Fraud", fill: "Flag fraudulent transactions from financial activity logs", domain: "Finance", emoji: "💳" },
  { label: "Forecast Demand", fill: "Forecast product demand based on historical sales data", domain: "Retail", emoji: "📦" },
  { label: "Monitor Energy", fill: "Predict energy consumption anomalies from IoT sensor data", domain: "IoT", emoji: "⚡" },
  { label: "Price Property", fill: "Estimate real estate prices from location and property features", domain: "Real Estate", emoji: "🏠" },
  { label: "Segment Customers", fill: "Group customers by purchase behaviour for targeted campaigns", domain: "Marketing", emoji: "🎯" }
];

const SUGGESTIONS = [
  { trigger: "predict", suffix: " house prices (Regression)", domain: "Real Estate" },
  { trigger: "predict", suffix: " customer churn (Classification)", domain: "Finance" },
  { trigger: "predict", suffix: " crop yield (Regression)", domain: "Agriculture" },
  { trigger: "classify", suffix: " medical images (Classification)", domain: "Healthcare" },
  { trigger: "classify", suffix: " spam emails (Classification)", domain: "Finance" },
  { trigger: "detect", suffix: " manufacturing defects (Object Detection)", domain: "Manufacturing" },
  { trigger: "detect", suffix: " fraudulent transactions (Classification)", domain: "Finance" },
  { trigger: "forecast", suffix: " energy consumption (Time Series)", domain: "IoT" },
  { trigger: "segment", suffix: " customers by behaviour (Clustering)", domain: "Marketing" }
];

const textContainerOpts = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.05 } }
};
const textWordOpts = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 20 } }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Training() {
  const navigate = useNavigate();
  
  // --- Training Result Mode State ---
  const [result, setResult] = useState(null);
  const [stepIdx, setStepIdx] = useState(-1);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // --- Project Creation Mode State ---
  const projectId = useMemo(() => crypto.randomUUID(), []);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [dataStrategy, setDataStrategy] = useState("upload");
  const [datasetFile, setDatasetFile] = useState(null);
  const [activeSuggestions, setActiveSuggestions] = useState([]);
  const [showNudge, setShowNudge] = useState(false);
  const [errorUi, setErrorUi] = useState({});
  const [serverError, setServerError] = useState("");
  const textareaRef = useRef(null);
  const [isSearching, setIsSearching] = useState(false);
  const [pipelineResult, setPipelineResult] = useState(null);
  const [importingId, setImportingId] = useState(null);
  const [schemaEditor, setSchemaEditor] = useState(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [sseProgress, setSseProgress] = useState(null);

  const isDL = result?.model_type === "DL";
  const TRAINING_STEPS = isDL ? DL_STEPS : ML_STEPS;
  const isClassification = result?.task_type === "classification";

  useEffect(() => {
    const raw = sessionStorage.getItem("trainResult");
    if (raw) {
      const data = JSON.parse(raw);
      setResult(data);

      const steps = data?.model_type === "DL" ? DL_STEPS : ML_STEPS;

      // Animate through steps
      (async () => {
        for (let i = 0; i < steps.length; i++) {
          setStepIdx(i);
          await sleep(i === 3 ? 1400 : i === 4 ? 1000 : 700);
        }
        setDone(true);
      })();
    }

    const handleGlobalKeyDown = (e) => {
      if (e.key === "Escape") setActiveSuggestions([]);
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const completionPercent = useMemo(() => {
    let score = 0;
    if (projectName.trim()) score += 25;
    if (description.trim().split(/\s+/).length >= 4) score += 25;
    if (domain) score += 25;
    if (dataStrategy) score += 25;
    return score;
  }, [projectName, description, domain, dataStrategy]);

  const canGenericSubmit = dataStrategy !== "auto_fetch" && completionPercent >= 50 && !importingId;

  const handleTileSelect = (tile) => {
    setDomain(tile.domain);
    setDescription(tile.fill);
    setShowNudge(false);
    setActiveSuggestions([]);
    setTimeout(() => { if (textareaRef.current) textareaRef.current.focus(); }, 300);
  };

  const handleDescriptionChange = (e) => {
    const val = e.target.value;
    setDescription(val);
    if(errorUi.description) setErrorUi(prev => ({ ...prev, description: false }));
    setShowNudge(false); 
    
    const words = val.trim().toLowerCase().split(/\s+/);
    const lastWord = words[words.length - 1];
    
    if (lastWord.length > 2) {
      const matches = SUGGESTIONS.filter(s => 
        s.trigger.startsWith(lastWord) || s.trigger === lastWord
      );
      setActiveSuggestions(matches);
    } else {
      setActiveSuggestions([]);
    }
  };

  const acceptSuggestion = (s) => {
    const words = description.trim().split(/\s+/);
    words.pop(); 
    const newDesc = [...words, s.trigger + s.suffix].join(" ");
    setDescription(newDesc + " ");
    setDomain(s.domain);
    setActiveSuggestions([]);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleTextareaKeyDown = (e) => {
    if (e.key === "Tab" && activeSuggestions.length > 0) {
      e.preventDefault();
      acceptSuggestion(activeSuggestions[0]);
    }
  };

  const handleBlurTextarea = () => {
    setTimeout(() => {
      setActiveSuggestions([]);
      const trimmed = description.trim();
      if (!trimmed) return;
      
      const wordCount = trimmed.split(/\s+/).length;
      const vagueRegex = /^(i want to (do|use|make|try) (ai|ml|machine learning))\.?$/i;
      
      if (wordCount < 12 || vagueRegex.test(trimmed)) {
        setShowNudge(true);
      }
    }, 200);
  };

  const appendSuggestion = (text) => {
    setDescription(prev => prev.trim() + (prev.trim().endsWith('.') ? ' ' : '. ') + text);
    setShowNudge(false);
  };

  const handleSearchDatasets = async () => {
    if (!description.trim()) {
      setErrorUi(prev => ({ ...prev, description: true }));
      textareaRef.current?.focus();
      return;
    }
    
    setIsSearching(true);
    setPipelineResult(null);
    setServerError("");

    try {
      const response = await fetch(`${API_URL}/api/dataset/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          user_input: {
            problem_description: description,
            domain: domain,
            data_strategy: dataStrategy
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Search engine explicitly failed mapping intents.");
      }

      const data = await response.json();
      setPipelineResult(data);
      
      if (data.mode === "extend" || data.mode === "synthesize") {
        setSchemaEditor(data.pending_schema);
      }

    } catch (err) {
      setServerError(err.message || "Could not connect to ML service.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleImportRealDataset = async (card) => {
    setImportingId(card.identifier);
    setServerError("");

    try {
      const response = await fetch(`${API_URL}/api/dataset/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          identifier: card.identifier,
          source: card.source
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Dataset import failed.");
      }

      const data = await response.json();
      const handoff = data.chat_handoff;
      
      sessionStorage.setItem("chatHandoff", JSON.stringify(handoff));
      sessionStorage.setItem("trainResult", JSON.stringify({
        dataset_name: card.name || card.identifier,
        model_id: handoff?.chat_session_id || projectId,
        feature_names: [],
        handoff: handoff
      }));
      
      navigate("/chat");

    } catch (err) {
      setServerError(err.message);
      setImportingId(null);
    }
  };

  const handleSyntheticSchemaConfirmation = async () => {
    setIsSynthesizing(true);
    setSseProgress({ step: "Initializing generation engines...", pct: 0 });
    setServerError("");

    try {
      const response = await fetch(`${API_URL}/api/dataset/confirm-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          confirmed_schema: schemaEditor
        })
      });

      if (!response.ok) throw new Error("Schema processing evaluation completely failed.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          if (chunk.startsWith("data: ")) {
            const dataStr = chunk.slice(6);
            if (!dataStr.trim()) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.error) throw new Error(data.error);

              setSseProgress({ step: processSseString(data.step), pct: data.pct });

              if (data.step === "complete") {
                sessionStorage.setItem("chatHandoff", JSON.stringify(data.chat_handoff));
                setTimeout(() => navigate("/chat"), 800);
                return;
              }
            } catch (e) {
              console.error("SSE Parse Error:", e);
            }
          }
        }
      }
    } catch (err) {
      setServerError(err.message);
      setIsSynthesizing(false);
    }
  };

  function processSseString(step) {
    const dict = {
      "designing_schema": "Validating architectures natively...",
      "building_seed": "Faker bounds instantiating natively...",
      "fitting_model": "Learning structural Copula array constraints via SDV...",
      "enforcing_rules": "Validating Business limits recursively...",
      "complete": "Finalizing logic boundaries..."
    };
    return dict[step] || step;
  }
  
  const handleGenericSubmit = async (e) => {
    e.preventDefault();
    if (dataStrategy === "auto_fetch") return;
    navigate("/");
  };

  return (
    <main 
      className="w-full min-h-screen relative z-0 selection:bg-indigo-200 selection:text-indigo-900 overflow-x-hidden pt-12 pb-24"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        .gradient-mesh {
          position: fixed; inset: 0; z-index: -20;
          background: radial-gradient(ellipse at 10% 20%, rgba(99,102,241,0.15) 0%, transparent 70%),
                      radial-gradient(ellipse at 80% 30%, rgba(33,212,189,0.1) 0%, transparent 70%),
                      radial-gradient(ellipse at 50% 80%, rgba(7,16,51,0.05) 0%, transparent 70%),
                      #fafafa;
        }
        .grain-overlay {
          position: fixed; inset: 0; z-index: -10; opacity: 0.04; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }
        .glass {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 1.5rem;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge-classification { background: rgba(99, 102, 241, 0.1); color: #6366f1; border: 1px solid rgba(99, 102, 241, 0.2); }
        .badge-regression { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }
        .badge-success { background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2); }
        .step-dot { width: 10px; height: 10px; border-radius: 50%; background: #cbd5e1; }
        .step-dot.active { background: #6366f1; box-shadow: 0 0 10px rgba(99, 102, 241, 0.5); }
        .step-dot.done { background: #10b981; }
        .btn-primary {
          background: #1e293b;
          color: white;
          font-weight: 700;
          border-radius: 0.75rem;
          transition: all 0.2s;
        }
        .btn-primary:hover { background: #0f172a; transform: translateY(-1px); }
        .btn-secondary {
          background: white;
          color: #1e293b;
          font-weight: 700;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          transition: all 0.2s;
        }
        .btn-secondary:hover { background: #f8fafc; border-color: #cbd5e1; }
      `}</style>
      
      <div className="gradient-mesh"></div>
      <div className="grain-overlay"></div>

      <div className="w-full max-w-6xl px-4 mx-auto flex flex-col items-center">
        {!result ? (
          <>
            {/* --- Project Creation Form --- */}
            <div className="w-full mb-10 text-center px-4">
              <motion.h2 
                variants={textContainerOpts} initial="hidden" animate="show"
                className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-2"
              >
                {"Start a New Project".split(" ").map((w, i) => (
                  <motion.span key={i} className="inline-block mr-2" variants={textWordOpts}>{w}</motion.span>
                ))}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="text-slate-500 font-medium text-lg mb-6"
              >
                Tell us what you want to build. We'll handle the rest.
              </motion.p>

              <motion.button
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                type="button"
                onClick={() => {
                  setProjectName("Titanic Survival Predictor");
                  setDomain("Healthcare");
                  setDescription("Predict the chance of surviving the Titanic using age, fare, and passenger class parameters.");
                  setDataStrategy("auto_fetch");
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold hover:bg-indigo-100 transition-colors border border-indigo-100/50"
              >
                ✨ Try an example
              </motion.button>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.1 }}
              className="w-full bg-white/70 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6 md:p-10 relative"
            >
              {serverError && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium flex items-center justify-center gap-3 text-center">
                  <AlertTriangle className="w-5 h-5" /> {serverError}
                </div>
              )}

              <form className="flex flex-col">
                {/* STEP 01 */}
                <div className="pb-8 border-b border-slate-100 relative group">
                  <div className="mb-6 text-center">
                    <span className="inline-block bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded-md text-xs tracking-widest font-mono mb-2">01</span>
                    <h3 className="text-slate-800 font-bold text-lg">Name your project</h3>
                  </div>
                  <div className="relative w-full max-w-3xl mx-auto">
                    <input
                      type="text"
                      className={`w-full text-center px-5 py-4 text-xl font-medium placeholder:text-slate-300 text-slate-800 bg-slate-50 border rounded-2xl outline-none shadow-inner ${errorUi.projectName ? 'border-rose-300 ring-4 ring-rose-500/10' : 'border-slate-200 focus:bg-white focus:border-indigo-400 focus:ring-4 ring-indigo-500/10'}`}
                      placeholder="e.g. Crop Yield Predictor"
                      value={projectName}
                      onChange={(e) => {
                        setProjectName(e.target.value);
                        if(errorUi.projectName) setErrorUi(prev => ({ ...prev, projectName: false }));
                      }}
                    />
                  </div>
                </div>

                {/* STEP 02: Goal & Description */}
                <div className="py-8 border-b border-slate-100 relative">
                  <div className="mb-6 text-center">
                    <span className="inline-block bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded-md text-xs tracking-widest font-mono mb-2">02</span>
                    <h3 className="text-slate-800 font-bold text-xl mb-2">Define your project's goal</h3>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-2 mb-10 max-w-6xl mx-auto">
                    {DOMAINS.map(tile => {
                      const selected = domain === tile.domain;
                      return (
                        <motion.button
                          key={tile.label} type="button" whileTap={{ scale: 0.95 }} onClick={() => handleTileSelect(tile)}
                          className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${selected ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white hover:border-indigo-200"}`}
                        >
                          {selected && <div className="absolute top-2 right-2 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center"><span className="text-white text-[10px]">✓</span></div>}
                          <span className="text-xl mb-1.5">{tile.emoji}</span>
                          <span className={`font-semibold text-xs leading-tight ${selected ? "text-indigo-800" : "text-slate-700"}`}>{tile.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>

                  <div className="relative w-full max-w-4xl mx-auto">
                    <textarea
                      id="problemDesc" ref={textareaRef}
                      className={`w-full px-5 py-5 text-base font-medium placeholder:text-slate-300 text-slate-800 bg-slate-50 border rounded-2xl outline-none resize-none min-h-[140px] shadow-inner text-center ${errorUi.description ? 'border-rose-300 ring-4 ring-rose-500/10' : 'border-slate-200 focus:bg-white focus:border-indigo-400 focus:ring-4 ring-indigo-500/10'}`}
                      placeholder="e.g. I want to predict house prices based on location and square footage..."
                      value={description}
                      onChange={handleDescriptionChange}
                      onKeyDown={handleTextareaKeyDown}
                      onBlur={handleBlurTextarea}
                    ></textarea>
                    
                    <AnimatePresence>
                      {showNudge && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 p-4 bg-amber-50 rounded-2xl text-sm font-medium text-amber-800 text-center flex flex-col items-center shadow-sm relative max-w-xl mx-auto">
                          <MessageCircle className="text-amber-500 mb-1" size={20} />
                          <div className="leading-relaxed"><span className="font-bold">Be more specific:</span> Do you want to <button type="button" onMouseDown={(e) => { e.preventDefault(); appendSuggestion("predict a value (Regression)"); }} className="underline hover:text-amber-600">predict a value</button> or <button type="button" onMouseDown={(e) => { e.preventDefault(); appendSuggestion("categorise items (Classification)"); }} className="underline hover:text-amber-600">categorise items</button>?</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* STEP 03: Data Source */}
                <div className="py-8 border-b border-slate-100 relative">
                  <div className="mb-6 text-center">
                    <span className="inline-block bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded-md text-xs tracking-widest font-mono mb-2">03</span>
                    <h3 className="text-slate-800 font-bold text-lg">How are you bringing in data?</h3>
                  </div>
                  
                  <div className="bg-slate-100 p-1.5 rounded-2xl w-full grid grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto shadow-inner gap-1 mb-8">
                    {[
                      { id: "auto_fetch", label: "🔍 Find a dataset" },
                      { id: "upload", label: "📁 I have my own" }
                    ].map((opt) => (
                      <button key={opt.id} type="button" onClick={() => setDataStrategy(opt.id)} className="relative px-2 py-3 text-sm outline-none text-center">
                        {dataStrategy === opt.id && <motion.div layoutId="activePill" className="absolute inset-0 bg-white rounded-xl shadow-sm border border-slate-200" transition={{ type: "spring", stiffness: 300, damping: 30 }} />}
                        <span className={`relative z-10 font-bold transition-colors ${dataStrategy === opt.id ? 'text-slate-800' : 'text-slate-500'}`}>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  
                  <div className="w-full flex flex-col items-center">
                    {dataStrategy === 'upload' && (
                      <div className="w-full flex flex-col items-center">
                        <label className="relative flex flex-col items-center justify-center w-full max-w-xl h-44 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 hover:bg-white hover:border-indigo-400 transition-all cursor-pointer group shadow-inner">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                              <Database className="text-indigo-500" size={24} />
                            </div>
                            <p className="mb-1 text-sm text-slate-700 font-bold">
                              {datasetFile ? datasetFile.name : "Click to upload or drag and drop"}
                            </p>
                            <p className="text-xs text-slate-400 font-medium">CSV, XLS, or JSON (max. 50MB)</p>
                          </div>
                          <input type="file" className="hidden" accept=".csv,.xls,.xlsx,.json" onChange={(e) => setDatasetFile(e.target.files[0])} />
                        </label>
                      </div>
                    )}

                    {dataStrategy === 'auto_fetch' && (
                      <div className="w-full flex flex-col items-center">
                        <button
                          type="button" onClick={handleSearchDatasets} disabled={isSearching}
                          className={`px-8 py-4 rounded-full font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md w-full max-w-sm ${isSearching ? "bg-slate-200 text-slate-400" : "bg-indigo-600 text-white hover:shadow-lg"}`}
                        >
                          {isSearching ? <><Loader2 className="animate-spin" size={18}/> Searching...</> : <><Sparkles size={18}/> Search Datasets</>}
                        </button>
                        
                        <AnimatePresence>
                          {pipelineResult?.mode === "fetch" && pipelineResult.dataset_cards && (
                            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                              {pipelineResult.dataset_cards.map((ds, idx) => (
                                <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col shadow-sm hover:shadow-md transition-all">
                                  <h4 className="font-bold text-slate-800 text-sm mb-2">{ds.name}</h4>
                                  <p className="text-xs text-slate-500 mb-4 line-clamp-2">{ds.description}</p>
                                  <button
                                    type="button" onClick={() => handleImportRealDataset(ds)}
                                    className="mt-auto w-full py-2 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-xs hover:bg-indigo-600 hover:text-white transition-all"
                                  >
                                    Import Dataset
                                  </button>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-8 w-full flex justify-center">
                  <button
                    type="submit" disabled={!canGenericSubmit} onClick={handleGenericSubmit}
                    className={`w-full max-w-xs py-4 rounded-xl text-sm font-black transition-all ${canGenericSubmit ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400'}`}
                  >
                    Create Project &rarr;
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        ) : (
          /* --- Training Results View --- */
          <div className="w-full">
            <div className="mb-10 fade-up">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className={`badge ${isClassification ? "badge-classification" : "badge-regression"}`}>
                  {isClassification ? "🏷️ Classification" : "📉 Regression"}
                </span>
                <span className="badge badge-success">
                  ✅ {result?.best_model}
                </span>
                <span className="badge" style={{ background: isDL ? "rgba(139,92,246,0.18)" : "rgba(99,102,241,0.18)", color: isDL ? "#8b5cf6" : "#6366f1" }}>
                  {isDL ? "🧠 Deep Learning" : "🤖 Machine Learning"}
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-2">
                Training <span className="text-indigo-600">Complete</span>
              </h1>
              <p className="text-slate-500 font-medium">
                Dataset: <span className="text-slate-900 font-bold">{result?.dataset_name}</span>
                &nbsp;·&nbsp; {result?.dataset_rows?.toLocaleString()} rows
              </p>
            </div>

            <div className="glass p-8 mb-8">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Pipeline Progress</h2>
              <div className="flex flex-col gap-5">
                {TRAINING_STEPS.map((step, i) => {
                  const status = i < stepIdx ? "done" : i === stepIdx ? "active" : "pending";
                  return (
                    <div key={step.id} className="flex items-center gap-4">
                      <div className={`step-dot ${status}`} />
                      <span className={`text-lg ${status === 'pending' ? 'opacity-30' : 'opacity-100'}`}>{step.icon}</span>
                      <span className={`text-sm font-bold ${status === 'done' ? 'text-emerald-600' : status === 'active' ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {step.label}
                      </span>
                      {status === 'active' && <Loader2 className="w-4 h-4 animate-spin text-indigo-600 ml-auto" />}
                      {status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              <div className="glass p-8">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Model Info</h2>
                <dl className="space-y-4">
                  {[
                    ["Model ID", result.model_id],
                    ["Best Algorithm", result.best_model],
                    ["Engine", result.model_type === "DL" ? "Deep Learning (Keras)" : "Machine Learning"],
                    ["Mode Used", result.mode_selected?.toUpperCase()],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-100 pb-2">
                      <dt className="text-xs font-bold text-slate-500 uppercase">{k}</dt>
                      <dd className="text-sm font-mono font-bold text-slate-900">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {result.model_comparison && (
                <div className="glass p-8">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Leaderboard</h2>
                  <div className="space-y-3">
                    {Object.entries(result.model_comparison)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, score], idx) => (
                        <div key={name} className={`flex items-center gap-3 p-3 rounded-xl border ${name === result.best_model ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-slate-100'}`}>
                          <span className="font-bold text-slate-400 w-4">{idx + 1}</span>
                          <span className="text-sm font-bold text-slate-800 flex-1">{name}</span>
                          <span className="text-sm font-mono font-black text-indigo-600">{score.toFixed(4)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-4">
              <Link to="/playground" className="btn-primary py-4 px-10 text-center">Open Playground</Link>
              <Link to="/chat" className="btn-secondary py-4 px-10 text-center">Chat with Dataset</Link>
              <button onClick={() => { sessionStorage.removeItem("trainResult"); window.location.reload(); }} className="btn-secondary py-4 px-10">Train New Model</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
