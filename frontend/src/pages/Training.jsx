import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MessageCircle, Database, CheckCircle2, Server, Loader2, Sparkles, AlertTriangle } from "lucide-react";

<<<<<<< HEAD
// --- Constants & Config --- //
const API_URL = "http://localhost:8000";

const DOMAINS = [
  { label: "Predict Crop Yield", fill: "Predict crop yield based on soil, rainfall, and temperature data", domain: "Agriculture", emoji: "🌾" },
  { label: "Diagnose Disease", fill: "Classify patient records to predict disease diagnosis", domain: "Healthcare", emoji: "🏥" },
  { label: "Identify Defects", fill: "Detect manufacturing defects from production line images", domain: "Manufacturing", emoji: "🔧" },
  { label: "Detect Fraud", fill: "Flag fraudulent transactions from financial activity logs", domain: "Finance", emoji: "💳" },
  { label: "Forecast Demand", fill: "Forecast product demand based on historical sales data", domain: "Retail", emoji: "📦" },
  { label: "Monitor Energy", fill: "Predict energy consumption anomalies from IoT sensor data", domain: "IoT", emoji: "⚡" },
  { label: "Price Property", fill: "Estimate real estate prices from location and property features", domain: "Real Estate", emoji: "🏠" },
  { label: "Segment Customers", fill: "Group customers by purchase behaviour for targeted campaigns", domain: "Marketing", emoji: "🎯" }
=======
const TRAINING_STEPS = [
  { id: "match",    label: "Matching dataset",          icon: "🔍" },
  { id: "load",     label: "Loading & preprocessing",   icon: "📦" },
  { id: "sample",   label: "Sampling 30% for speed",    icon: "⚡" },
  { id: "train",    label: "Parallel model training",   icon: "🤖" },
  { id: "compare",  label: "Comparing & selecting best",icon: "🏆" },
  { id: "retrain",  label: "Retraining best on full data",icon:"🎯" },
  { id: "save",     label: "Saving model artifact",     icon: "💾" },
>>>>>>> origin/main
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

export default function Training() {
  const navigate = useNavigate();
  // Unique identity mapping per lifecycle
  const projectId = useMemo(() => crypto.randomUUID(), []);
  
  // Generic Form State
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [dataStrategy, setDataStrategy] = useState("upload");
  const [datasetFile, setDatasetFile] = useState(null);
  const [targetVariable, setTargetVariable] = useState("");
  const [showTargetField, setShowTargetField] = useState(false);
  
  // UX State bounds
  const [activeSuggestions, setActiveSuggestions] = useState([]);
  const [showNudge, setShowNudge] = useState(false);
  const [errorUi, setErrorUi] = useState({});
  const [serverError, setServerError] = useState("");
  const textareaRef = useRef(null);

  // --- Backend Intelligence State --- //
  const [isSearching, setIsSearching] = useState(false);
  const [pipelineResult, setPipelineResult] = useState(null); // stores Search API response bounds
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [importingId, setImportingId] = useState(null);
  
  // Synthetic / Extend explicit configurations
  const [schemaEditor, setSchemaEditor] = useState(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [sseProgress, setSseProgress] = useState(null); // e.g. { step: "...", pct: 50 }


  useEffect(() => {
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

  // Block out generic builds mapping cleanly enforcing datasets limits organically natively.
  const canGenericSubmit = dataStrategy !== "auto_fetch" && completionPercent >= 50 && !isImporting;

  // Form Field Logic
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

  // --- Pipeline Interaction Hooks --- //

  // Chunk 1: Intelligence Search
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

  // Chunk 2: Import Handoff
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
      
      // Store handoff so Chat.jsx can read it
      sessionStorage.setItem("chatHandoff", JSON.stringify(handoff));
      // Also store trainResult in the legacy format Chat.jsx expects
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

  // SSE Synthetics Event Source Mimicry logic
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
          confirmed_schema: schemaEditor // Assume accepted currently cleanly organically.
        })
      });

      if (!response.ok) throw new Error("Schema processing evaluation completely failed organically mapping physical boundary metrics constraints.");

      // Natively parsing Server Sent Events strictly mapping cleanly natively.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || ""; // keep incomplete parts natively

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
      "complete": "Finalizing logic boundaries cleanly organically natively mappings evaluation execution limits..."
    };
    return dict[step] || step;
  }
  
  // Fallback generic project submission explicitly mappings natively evaluated bounded.
  const handleGenericSubmit = async (e) => {
    e.preventDefault();
    if (dataStrategy === "auto_fetch") return;
    setIsImporting(true);
    setTimeout(()=>navigate("/"), 1000); // Mock generic submit routing internally.
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
      `}</style>
      
      <div className="gradient-mesh"></div>
      <div className="grain-overlay"></div>

      <div className="w-full max-w-none px-4 md:px-8 lg:px-16 mx-auto flex flex-col items-center">
        {/* Header Section */}
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
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

        {/* The Form Card */}
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

<<<<<<< HEAD
            {/* STEP 02: Goal & Description */}
            <div className="py-8 border-b border-slate-100 relative">
              <div className="mb-6 text-center">
                <span className="inline-block bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded-md text-xs tracking-widest font-mono mb-2">02</span>
                <h3 className="text-slate-800 font-bold text-xl mb-2">Define your project's goal</h3>
                <p className="text-slate-500 font-medium">Pick a template or describe your objective in plain English below.</p>
              </div>

              {/* Templates Grid */}
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
                
                {/* Vague Nudge */}
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
                      <input 
                        type="file" 
                        className="hidden" 
                        accept=".csv,.xls,.xlsx,.json"
                        onChange={(e) => setDatasetFile(e.target.files[0])}
                      />
                    </label>
                    {datasetFile && (
                      <div className="mt-4 flex items-center gap-3 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
                         <CheckCircle2 className="text-emerald-500" size={16} />
                         <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">File Selected Successfully</span>
                         <button 
                           type="button"
                           onClick={() => setDatasetFile(null)}
                           className="text-xs font-bold text-slate-400 hover:text-rose-500 underline ml-2 transition-colors"
                         >
                           Remove
                         </button>
                      </div>
                    )}
                  </div>
                )}

                {dataStrategy === 'auto_fetch' && (
                  <div className="w-full flex flex-col items-center">
                    <button
                      type="button" onClick={handleSearchDatasets} disabled={isSearching}
                      className={`px-8 py-4 rounded-full font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md w-full max-w-sm ${isSearching ? "bg-slate-200 text-slate-400" : "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white hover:shadow-lg hover:scale-[1.02]"}`}
                    >
                      {isSearching ? <><Loader2 className="animate-spin" size={18}/> Searching Engines...</> : <><Sparkles size={18}/> Search for Matching Datasets</>}
                    </button>

                    <AnimatePresence mode="popLayout">
                      {pipelineResult?.mode === "fetch" && pipelineResult.dataset_cards && (
                        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-10 w-full max-w-5xl text-center">
                          <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-sm border border-indigo-100">Top Matches Extracted</span>
                          
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                            {pipelineResult.dataset_cards.map((ds, idx) => (
                              <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 p-6 flex flex-col text-left group">
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg">{ds.source === 'kaggle' ? 'K' : ds.source === 'huggingface' ? '🤗' : 'O'}</div>
                                  <div>
                                    <h4 className="font-bold text-slate-800 text-sm line-clamp-1" title={ds.name}>{ds.name}</h4>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{ds.source}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-500 mb-4 line-clamp-3 leading-relaxed flex-1">{ds.description}</p>
                                
                                <div className="bg-slate-50 rounded-xl p-3 mb-6 space-y-2">
                                  <div className="flex justify-between items-center text-[10px] font-bold tracking-wider uppercase">
                                    <span className="text-slate-400">Health Score</span>
                                    <span className={ds.health_score > 0.6 ? "text-emerald-500" : "text-amber-500"}>{(ds.health_score * 100).toFixed(0)}%</span>
                                  </div>
                                  
                                  {ds.estimated_rows > 0 && (
                                    <div className="flex justify-between items-center text-[10px] font-bold tracking-wider uppercase">
                                      <span className="text-slate-400">Lines Estimated</span>
                                      <span className="text-slate-700">{ds.estimated_rows.toLocaleString()}</span>
                                    </div>
                                  )}


                                  {ds.size_bytes > 0 && (
                                    <div className="flex justify-between items-center text-[10px] font-bold tracking-wider uppercase">
                                      <span className="text-slate-400">Data Size</span>
                                      <span className="text-slate-700">
                                        {ds.size_bytes > 1024 * 1024 * 1024 
                                          ? `${(ds.size_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                                          : ds.size_bytes > 1024 * 1024
                                            ? `${(ds.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                                            : `${(ds.size_bytes / 1024).toFixed(0)} KB`}
                                      </span>
                                    </div>
                                  )}

                                  {ds.downloads_metric > 0 && (
                                    <div className="flex justify-between items-center text-[10px] font-bold tracking-wider uppercase">
                                      <span className="text-slate-400">Popularity</span>
                                      <span className="text-slate-700">{ds.downloads_metric.toLocaleString()} Downloads</span>
                                    </div>
                                  )}

                                  {ds.size_alert && <div className="text-[10px] font-bold text-rose-500 text-center mt-2 flex items-center justify-center gap-1"><AlertTriangle size={12}/> File Size heavily intensive</div>}
                                </div>
                                
                                <button
                                  type="button" disabled={!!importingId} onClick={() => handleImportRealDataset(ds)}
                                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all focus:outline-none focus:ring-4 ring-emerald-500/20 ${importingId === ds.identifier ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-500 hover:text-white border border-emerald-200 hover:border-transparent'}`}
                                >
                                  {importingId === ds.identifier ? "Processing Hook..." : "Import & Execute Handoff"}
                                </button>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {(pipelineResult?.mode === "extend" || pipelineResult?.mode === "synthesize") && schemaEditor && (
                        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-10 w-full max-w-4xl bg-indigo-900 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden">
                          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl"></div>
                          <div className="relative z-10 flex flex-col items-center">
                            <Database className="w-12 h-12 text-teal-400 mb-6" />
                            <h3 className="text-2xl font-black text-white mb-2 text-center">Cold Start Synthesis Protocol Required</h3>
                            <p className="text-indigo-200 text-sm font-medium text-center mb-10 max-w-xl">
                              {pipelineResult.mode === "extend" 
                                ? "The physical datasets bounded organically didn't contain adequate sampling limits organically matching your parameter needs natively cleanly. We designed a pure SDV copula extension mapped to your requirements automatically natively."
                                : "No pure physical structures exactly bounded your explicit constraints logically automatically structurally mapped. The LLM uniquely mapped realistic SDV mathematical dimensions organically natively explicitly."}
                            </p>

                            <div className="w-full bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-white/10 mb-8 max-w-2xl text-left">
                              <h4 className="text-sm font-bold text-teal-400 uppercase tracking-widest mb-4">Proposed Target Schema Payload Configuration</h4>
                              <div className="grid grid-cols-2 gap-4 mb-4">
                                <div><span className="text-[10px] text-indigo-300 uppercase font-black tracking-wider block mb-1">Target Dimension Column Constraints</span><span className="font-bold text-white bg-white/5 py-1 px-3 rounded-lg block">{schemaEditor.target_column || "None"}</span></div>
                                <div><span className="text-[10px] text-indigo-300 uppercase font-black tracking-wider block mb-1">Row Generation Matrix Depth Dimension</span><span className="font-bold text-white bg-white/5 py-1 px-3 rounded-lg block">{(schemaEditor.suggested_row_count || 5000).toLocaleString()} Rows</span></div>
                              </div>
                              
                              <div className="space-y-2 mt-6">
                                <span className="text-[10px] text-indigo-300 uppercase font-black tracking-wider block mb-2">Column Architectures</span>
                                {schemaEditor.columns.map((col, idx) => (
                                  <div key={col.name} className="flex justify-between items-center bg-white/5 p-3 rounded-xl">
                                    <div>
                                      <span className="text-sm font-bold block text-white">{col.name}</span>
                                      {col.business_rule && <span className="text-[10px] text-amber-200 font-mono mt-1 opacity-80 border border-amber-900 bg-amber-900/20 px-1.5 rounded">{col.business_rule}</span>}
                                    </div>
                                    <span className="text-xs font-mono text-teal-300 bg-teal-900/30 px-2 py-1 rounded-md">{col.dtype}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {!isSynthesizing ? (
                              <button
                                type="button" onClick={handleSyntheticSchemaConfirmation}
                                className="px-8 py-4 bg-teal-500 hover:bg-teal-400 text-slate-900 font-black rounded-xl w-full max-w-md transition-all flex justify-center items-center gap-2 hover:shadow-[0_0_20px_rgba(45,212,191,0.4)]"
                              >
                                <CheckCircle2 size={18} /> Confirm & Execute SDV Synthesis Engine
                              </button>
                            ) : (
                              <div className="w-full max-w-md bg-white/10 p-5 rounded-2xl border border-white/20 text-center">
                                <Loader2 className="w-8 h-8 text-teal-400 animate-spin mx-auto mb-3" />
                                <p className="text-sm font-bold text-white tracking-widest">{sseProgress?.step || "Evaluating parameters..."}</p>
                                {sseProgress?.pct !== undefined && (
                                  <div className="mt-4 h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${sseProgress.pct}%` }} className="h-full bg-teal-400 transition-all duration-300" />
                                  </div>
                                )}
                              </div>
                            )}

                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            {/* Legacy Fallback Submission Footer */}
            {dataStrategy !== "auto_fetch" && (
              <div className="pt-8 mt-2 w-full max-w-3xl mx-auto flex justify-center">
                <button
                  type="button" disabled={!canGenericSubmit} onClick={handleGenericSubmit}
                  className={`w-full max-w-xs py-4 rounded-xl text-sm font-black transition-all duration-200 ${(canGenericSubmit) ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                  Continuously Submit Legacy Parameter Limits &rarr;
                </button>
              </div>
            )}

          </form>
        </motion.div>
      </div>
=======
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
>>>>>>> origin/main
    </main>
  );
}
