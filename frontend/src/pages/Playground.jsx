import { useState, useEffect, useRef } from "react";
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
  
  // Tabular inputs
  const [inputs, setInputs] = useState({});
  
  // Image inputs
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");

  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("trainResult");
    if (!raw) { navigate("/"); return; }
    const data = JSON.parse(raw);
    setResult(data);
    
    if (data.task_type !== "image_classification") {
      const init = {};
      data.feature_names?.forEach((f) => { init[f] = ""; });
      setInputs(init);
    } else {
        // Init canvas if needed
        setTimeout(initCanvas, 100);
    }
  }, []);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = "round";
        ctx.lineWidth = 14;
        ctx.strokeStyle = "white";
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
      setPrediction(null);
      setError("");
    }
  };

  const clearCanvas = () => {
      initCanvas();
      setPrediction(null);
      setError("");
  };

  const startDrawing = (e) => {
      const { offsetX, offsetY } = e.nativeEvent;
      const ctx = canvasRef.current.getContext("2d");
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY);
      setIsDrawing(true);
  };
  
  const endDrawing = () => {
      const ctx = canvasRef.current.getContext("2d");
      ctx.closePath();
      setIsDrawing(false);
  };

  const draw = (e) => {
      if (!isDrawing) return;
      const { offsetX, offsetY } = e.nativeEvent;
      const ctx = canvasRef.current.getContext("2d");
      ctx.lineTo(offsetX, offsetY);
      ctx.stroke();
  };

  const handlePredictTabular = async () => {
    setLoading(true);
    setError("");
    setPrediction(null);

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

  const handlePredictImage = async () => {
    setLoading(true);
    setError("");
    setPrediction(null);

    const formData = new FormData();
    formData.append("model_id", result.model_id);

    if (activeTab === "upload") {
        if (!imageFile) {
            setError("Please upload an image first.");
            setLoading(false);
            return;
        }
        formData.append("file", imageFile);
    } else {
        // Draw tab
        const canvas = canvasRef.current;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        formData.append("file", blob, "canvas.png");
        setImagePreview(canvas.toDataURL());
    }

    try {
      const res = await axios.post("/api/image-predict", formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPrediction(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Image Prediction failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, val) => {
    setInputs((prev) => ({ ...prev, [key]: val }));
    setPrediction(null);
  };

  if (!result) return null;

  const isImageTask = result.task_type === "image_classification";
  const isClassification = isImageTask || result.task_type === "classification";

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="fade-up mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className={`badge ${isClassification ? "badge-classification" : "badge-regression"}`}>
            {isImageTask ? "🖼️ Image Classification" : isClassification ? "🏷️ Classification" : "📉 Regression"}
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

        {/* Input Panel */}
        <div className="glass p-6 fade-up flex flex-col" style={{ animationDelay: "0.05s" }}>
          
          {!isImageTask ? (
            /* TABULAR FORM */
            <>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">
                🔢 Input Features ({result.feature_names?.length})
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1 flex-1">
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
            </>
          ) : (
            /* IMAGE UPLOAD/DRAW */
            <>
                <div className="flex gap-2 mb-4 bg-slate-800 p-1 rounded-xl">
                    <button 
                        className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${activeTab === 'upload' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                        onClick={() => { setActiveTab('upload'); setPrediction(null); }}
                    >
                        📁 Upload Image
                    </button>
                    <button 
                        className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${activeTab === 'draw' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                        onClick={() => { setActiveTab('draw'); setPrediction(null); setTimeout(initCanvas, 50); }}
                    >
                        ✏️ Draw Image
                    </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
                    {activeTab === "upload" && (
                        <div className="w-full flex flex-col items-center">
                            {imagePreview ? (
                                <div className="relative group w-full max-w-[280px]">
                                    <img src={imagePreview} alt="Preview" className="w-full h-auto rounded-lg border border-slate-700 shadow-xl" />
                                    <button 
                                        className="absolute top-2 right-2 bg-slate-900/80 text-rose-400 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => { setImagePreview(null); setImageFile(null); setPrediction(null); }}
                                    >
                                        ✕ Remove
                                    </button>
                                </div>
                            ) : (
                                <label className="w-full max-w-[280px] h-[280px] border-2 border-dashed border-slate-600 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer bg-slate-800/50">
                                    <span className="text-4xl mb-2">📥</span>
                                    <span className="text-sm font-medium">Click to attach photo</span>
                                    <span className="text-xs opacity-70 mt-1">PNG, JPG, JPEG</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                </label>
                            )}
                        </div>
                    )}

                    <div className={`${activeTab === 'draw' ? 'flex' : 'hidden'} flex-col items-center w-full`}>
                        <div className="bg-slate-900 p-2 rounded-2xl border border-slate-700 shadow-xl">
                            <canvas
                                ref={canvasRef}
                                width={280}
                                height={280}
                                className="block rounded-lg cursor-crosshair"
                                onMouseDown={startDrawing}
                                onMouseUp={endDrawing}
                                onMouseLeave={endDrawing}
                                onMouseMove={draw}
                            />
                        </div>
                        <button onClick={clearCanvas} className="text-xs text-slate-400 mt-3 hover:text-white flex items-center gap-1">
                            <span className="text-lg">🗑️</span> Clear Canvas
                        </button>
                    </div>
                </div>
            </>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg text-sm text-rose-300 border border-rose-500/30 font-medium"
                 style={{ background: "rgba(239,68,68,0.1)" }}>
              ⚠️ {error}
            </div>
          )}

          <button
            id="predict-btn"
            onClick={isImageTask ? handlePredictImage : handlePredictTabular}
            disabled={loading}
            className="btn-primary w-full justify-center mt-5"
          >
            {loading ? <><span className="spinner" /> Analyzing…</> : isImageTask ? "👁️ Analyze Image" : "🔮 Run Prediction"}
          </button>
        </div>

        {/* Right panel: result */}
        <div className="flex flex-col gap-4 fade-up" style={{ animationDelay: "0.1s" }}>

          {/* Prediction result */}
          <div className="glass p-6 flex-1 flex flex-col justify-center relative overflow-hidden">
            {prediction && isImageTask && imagePreview && (
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                    <img src={imagePreview} className="w-48 h-48 object-cover rounded-full" blur="10px"/>
                </div>
            )}
            {!prediction ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-4">🔮</div>
                <p className="text-slate-500 text-sm">
                  {isImageTask ? "Upload or draw an image, then click" : "Fill in the features and click"}<br />
                  <span className="text-brand-400"> {isImageTask ? "Analyze Image" : "Run Prediction"} </span>
                </p>
              </div>
            ) : (
              <div className="fade-up z-10">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Prediction</div>
                <div className={`${isClassification && prediction.prediction && String(prediction.prediction).length > 15 ? 'text-4xl' : 'text-5xl'} font-black gradient-text mb-2 break-words`}>
                  {isClassification
                    ? prediction.prediction
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
                  <div className="mt-6 max-h-[220px] overflow-y-auto pr-2">
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-3 sticky top-0 bg-[#1e293b]/90 backdrop-blur-md pt-1 pb-2">
                      Top Class Probabilities
                    </div>
                    {Object.entries(prediction.all_probabilities)
                        .sort((a,b) => b[1] - a[1]) // highest first
                        .slice(0, 5) // Show top 5
                        .map(([cls, pct]) => (
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
