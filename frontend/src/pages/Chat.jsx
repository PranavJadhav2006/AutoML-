import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";

const ML_URL = "http://localhost:8000";

function DataTable({ data }) {
  if (!data || typeof data !== "object") return null;
  const keys = Object.keys(data);
  if (keys.length === 0) return null;

  const isNested = typeof data[keys[0]] === "object" && data[keys[0]] !== null;

  if (isNested) {
    const statKeys = Object.keys(data[keys[0]]);
    return (
      <div className="overflow-x-auto mt-3 rounded-lg" style={{ background: "rgba(15,15,26,0.6)" }}>
        <table className="data-table text-xs">
          <thead>
            <tr>
              <th>Stat</th>
              {keys.slice(0, 6).map((k) => <th key={k}>{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {statKeys.map((stat) => (
              <tr key={stat}>
                <td className="font-mono text-brand-400">{stat}</td>
                {keys.slice(0, 6).map((k) => (
                  <td key={k} className="font-mono">
                    {typeof data[k][stat] === "number" ? data[k][stat].toFixed(3) : String(data[k][stat])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto mt-3 rounded-lg" style={{ background: "rgba(15,15,26,0.6)" }}>
      <table className="data-table text-xs">
        <thead>
          <tr><th>Key</th><th>Value</th></tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td className="font-mono text-brand-400">{k}</td>
              <td className="font-mono">{String(data[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} fade-up`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-1"
             style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
          🤖
        </div>
      )}
      <div className={isUser ? "chat-bubble-user" : "chat-bubble-ai max-w-2xl"}>
        <p className="whitespace-pre-wrap leading-relaxed"
           dangerouslySetInnerHTML={{
             __html: msg.content
               .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
               .replace(/`(.*?)`/g, '<code class="font-mono text-brand-300 bg-brand-900/40 px-1 rounded">$1</code>'),
           }}
        />
        {msg.data && <DataTable data={msg.data} />}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm ml-2 flex-shrink-0 mt-1"
             style={{ background: "rgba(99,102,241,0.3)" }}>
          👤
        </div>
      )}
    </div>
  );
}

export default function Chat() {
  const navigate = useNavigate();
  const [sessionData, setSessionData] = useState(null);   // holds trainResult
  const [handoff, setHandoff]         = useState(null);   // holds chatHandoff
  const [messages, setMessages]       = useState([]);
  const [suggestedQueries, setSuggestedQueries] = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    // --- Read both storage keys ---
    const rawHandoff = sessionStorage.getItem("chatHandoff");
    const rawResult  = sessionStorage.getItem("trainResult");

    if (!rawHandoff && !rawResult) {
      navigate("/training");
      return;
    }

    let parsedHandoff = null;
    let parsedResult  = null;

    if (rawHandoff) parsedHandoff = JSON.parse(rawHandoff);
    if (rawResult)  parsedResult  = JSON.parse(rawResult);

    // Prefer handoff data from the new intelligent pipeline
    if (parsedHandoff) {
      setHandoff(parsedHandoff);
      setSuggestedQueries(parsedHandoff.suggested_queries || []);
      setMessages([{
        role: "ai",
        content: parsedHandoff.first_message || `Your dataset is loaded and ready. Ask me anything about the data!`,
        data: null
      }]);
    }

    // Always set session data for context (model_id etc.)
    if (parsedResult) {
      setSessionData(parsedResult);
      // If no handoff, fall back to legacy welcome
      if (!parsedHandoff) {
        setMessages([{
          role: "ai",
          content: `👋 Hi! I'm your dataset assistant for **${parsedResult.dataset_name}**.\n\nYou can ask me questions about the data — distributions, statistics, missing values, correlations, and more.\n\nTry one of the suggested questions below!`,
          data: null
        }]);
      }
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (question) => {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q, data: null }]);
    setLoading(true);

    try {
      // New pipeline: use /api/chat-dataset with dataset_path
      if (handoff?.dataset_path) {
        const res = await axios.post(`${ML_URL}/api/dataset/chat`, {
          dataset_path: handoff.dataset_path,
          question: q,
          session_id: handoff.chat_session_id
        });
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: res.data.answer || res.data.response || JSON.stringify(res.data), data: res.data.data || null }
        ]);
      } else if (sessionData?.model_id) {
        // Legacy fallback
        const res = await axios.post("/api/chat", {
          model_id: sessionData.model_id,
          question: q,
        });
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: res.data.answer, data: res.data.data }
        ]);
      } else {
        throw new Error("No active session found.");
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: `⚠️ ${err.response?.data?.detail || err.message || "Failed to get a response. Is the ML service running?"}`, data: null }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Display name
  const datasetName = handoff?.profile_summary
    ? (sessionData?.dataset_name || "Your Dataset")
    : sessionData?.dataset_name || "Dataset";

  const profileSummary = handoff?.profile_summary;

  if (!sessionData && !handoff) return null;

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 flex flex-col h-[calc(100vh-64px)]">

      {/* Header */}
      <div className="fade-up mb-6 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-100 mb-1">
              Chat with <span className="gradient-text">Dataset</span>
            </h1>
            <p className="text-slate-400 text-sm flex items-center gap-3">
              <span>📂 {datasetName}</span>
              {profileSummary?.row_count && (
                <span>· {profileSummary.row_count.toLocaleString()} rows</span>
              )}
              {profileSummary?.col_count && (
                <span>· {profileSummary.col_count} columns</span>
              )}
              {profileSummary?.target_col && (
                <span>· Target: <code className="text-brand-300">{profileSummary.target_col}</code></span>
              )}
            </p>
          </div>
          <Link to="/training" className="btn-secondary text-sm py-2">
            ← New Dataset
          </Link>
        </div>
      </div>

      {/* Suggested queries */}
      {suggestedQueries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 flex-shrink-0 fade-up" style={{ animationDelay: "0.05s" }}>
          {suggestedQueries.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-full transition-all duration-200 text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-40"
              style={{
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.15)",
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="glass flex-1 overflow-y-auto p-6 flex flex-col gap-4 fade-up mb-4"
           style={{ animationDelay: "0.1s" }}>
        {messages.map((msg, i) => (
          <ChatMessage key={i} msg={msg} />
        ))}
        {loading && (
          <div className="flex items-center gap-3 self-start">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                 style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              🤖
            </div>
            <div className="chat-bubble-ai flex items-center gap-2">
              <span className="spinner" />
              <span className="text-slate-400 text-sm">Analysing dataset…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="glass p-4 flex gap-3 items-end flex-shrink-0 fade-up" style={{ animationDelay: "0.15s" }}>
        <textarea
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about the dataset… (Enter to send)"
          rows={2}
          className="input-field text-sm flex-1 resize-none"
        />
        <button
          id="chat-send-btn"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="btn-primary py-3 px-5 flex-shrink-0"
        >
          {loading ? <span className="spinner" /> : "→"}
        </button>
      </div>
    </main>
  );
}
