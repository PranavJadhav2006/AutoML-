import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion";
import { Zap, Bot, Rocket, Search } from "lucide-react";

const FEATURES = [
  { icon: Zap, color: "text-amber-500", title: "Automated Model Training", desc: "From upload to trained model in under 30 minutes. We select algorithms and tune hyperparameters automatically." },
  { icon: Bot, color: "text-indigo-500", title: "AI Dataset Chat", desc: "Ask your data questions in plain English and discover hidden patterns without writing deep SQL queries." },
  { icon: Rocket, color: "text-emerald-500", title: "One-Click Deployment", desc: "Auto-generated UI, hosted instantly. Share your machine learning app securely via a simple URL." },
  { icon: Search, color: "text-sky-500", title: "Dataset Auto-Fetch", desc: "Describe your data need. We find it. Integrated directly with Kaggle, HuggingFace, and UCI repositories." },
];

const STEPS = [
  { num: "01", title: "Upload or Describe", desc: "Bring your CSV or ask our AI to pull a relevant public dataset." },
  { num: "02", title: "Auto-Train Platform", desc: "Our engine trains combinations of models to find the clear winner." },
  { num: "03", title: "Instantly Deploy", desc: "Access a custom playground UI connected perfectly to your API." }
];

// Staggered text variants
const textContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } }
};
const textWord = {
  hidden: { opacity: 0, y: 30, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 120, damping: 20 } }
};

export default function Home() {
  const navigate = useNavigate();
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  
  // 3D Parallax state
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { stiffness: 150, damping: 20, mass: 0.5 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);
  const rotateX = useTransform(smoothY, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(smoothX, [-0.5, 0.5], ["-10deg", "10deg"]);
  
  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(hover: none)").matches);
  }, []);

  const handleMouseMove = (e) => {
    if (isTouchDevice) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width - 0.5;
    const yPct = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(xPct);
    mouseY.set(yPct);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <main 
      className="w-full min-h-screen bg-[#fafafa] text-slate-900 flex flex-col relative z-20 overflow-x-hidden selection:bg-emerald-200 selection:text-emerald-900"
      style={{ fontFamily: "'Outfit', 'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        
        .gradient-mesh {
          position: absolute;
          inset: 0;
          z-index: -20;
          background: 
            radial-gradient(ellipse at 10% 20%, rgba(134,239,172,0.5) 0%, transparent 70%),
            radial-gradient(ellipse at 80% 30%, rgba(147,197,253,0.4) 0%, transparent 70%),
            radial-gradient(ellipse at 50% 80%, rgba(253,230,138,0.3) 0%, transparent 70%),
            #fafafa;
        }

        .grain-overlay {
          position: absolute;
          inset: 0;
          z-index: -10;
          opacity: 0.04;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        .bg-tech-pattern {
          position: absolute;
          inset: 0;
          z-index: -15;
          opacity: 0.03;
          pointer-events: none;
          background-image: url('https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&q=80');
          background-size: cover;
          background-position: center;
          mix-blend-mode: multiply;
        }

        /* Shimmer Button */
        .btn-shimmer {
          position: relative;
          overflow: hidden;
        }
        .btn-shimmer::after {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 50%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.4), transparent);
          transform: skewX(-20deg);
          transition: left 0.6s ease-in-out;
        }
        .btn-shimmer:hover::after { left: 150%; }

        /* Trust Bar Marquee */
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee-scroll {
          display: flex;
          width: max-content;
          animation: marquee 25s linear infinite;
        }

        /* Interactive Feature Card Glow */
        .card-glow-wrapper { position: relative; overflow: hidden; }
        .card-glow-wrapper::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(400px circle at var(--mouse-x) var(--mouse-y), rgba(16, 185, 129, 0.05), transparent 40%);
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
          z-index: 10;
        }
        .card-glow-wrapper:hover::before { opacity: 1; }

        .text-glow-indigo {
          text-shadow: 0 0 25px rgba(79, 70, 229, 0.4), 0 0 50px rgba(79, 70, 229, 0.2);
          filter: drop-shadow(0 0 10px rgba(79, 70, 229, 0.15));
        }

        /* Reduced Motion */
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; transform: none !important; }
        }
      `}</style>
      
      {/* ──────────────────────────────────────────────────────────── 
          Section 1: Hero
          ──────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-24 px-6 min-h-[90vh] flex flex-col items-center justify-center text-center w-full relative">
        <div className="gradient-mesh"></div>
        <div className="grain-overlay"></div>
        <div className="bg-tech-pattern blur-sm"></div>


        <motion.h1 
          className="text-5xl md:text-7xl lg:text-[5.5rem] font-black tracking-tight text-slate-900 mb-6 max-w-5xl leading-[1.05]"
          variants={textContainer}
          initial="hidden"
          animate="show"
        >
          {"Build and Deploy ML Models in Minutes — ".split(" ").map((w, i) => (
            <motion.span key={i} className="inline-block mr-3" variants={textWord}>{w}</motion.span>
          ))}
          <motion.span variants={textWord} className="text-emerald-500 relative inline-block text-glow-indigo">
            No Code Needed
            <svg className="absolute -bottom-1 left-0 w-full text-emerald-200 opacity-70" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 9.5C40.5 3 118 -2.5 199 9.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>
          </motion.span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.6 }}
          className="text-lg md:text-xl text-slate-500 max-w-2xl mb-12 leading-relaxed font-medium"
        >
          Upload your dataset and let our engine handle the rest. We automate model selection, hyperparameter tuning, and deployment so you can ship intelligent apps instantly.
        </motion.p>
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, type: "spring", stiffness: 100 }}
          className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto relative z-20"
        >
          <button 
            onClick={() => navigate('/training')} 
            className="btn-shimmer px-8 py-4 rounded-xl bg-emerald-500 text-white font-bold text-lg shadow-[0_4px_24px_-4px_rgba(16,185,129,0.5)] transform hover:-translate-y-1 transition-transform"
          >
            Start New Project
          </button>
          <button 
            onClick={() => navigate('/playground')} 
            className="px-8 py-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-lg hover:bg-slate-50 shadow-sm transform hover:-translate-y-1 transition-all"
          >
            Try Demo Project
          </button>
        </motion.div>

        {/* 3D Browser Mockup */}
        <div 
          className="mt-20 w-full max-w-5xl relative [perspective:1200px]"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Background animated orbs for mockup glow */}
          <div className="absolute top-1/2 left-1/4 w-72 h-72 bg-emerald-400 rounded-full mix-blend-multiply filter blur-[80px] opacity-20 animate-pulse"></div>
          <div className="absolute top-1/2 right-1/4 w-72 h-72 bg-indigo-400 rounded-full mix-blend-multiply filter blur-[80px] opacity-20 animate-pulse" style={{ animationDelay: "2s" }}></div>

          <motion.div 
            style={{ 
               rotateX: isTouchDevice ? 0 : rotateX, 
               rotateY: isTouchDevice ? 0 : rotateY,
               transformStyle: "preserve-3d"
            }}
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 1.4, duration: 1.2, type: "spring" }}
            className={`w-full bg-white/80 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl overflow-hidden aspect-[16/10] flex flex-col relative z-20 ${isTouchDevice ? '' : 'will-change-transform'}`}
          >
            {/* Chrome Bar */}
            <div className="h-12 border-b border-slate-200/60 bg-white/50 flex items-center py-2 px-4 gap-2 backdrop-blur-md">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-400 shadow-sm"></div>
                <div className="w-3 h-3 rounded-full bg-amber-400 shadow-sm"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-sm"></div>
              </div>
              <div className="mx-auto bg-white/60 border border-slate-200 text-slate-400 text-xs px-4 py-1.5 rounded-lg max-w-sm w-full font-mono text-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                studio.automl.dev/dashboard
              </div>
            </div>
            
            {/* Mock Dashboard UI */}
            <div className="flex-1 p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50/30 overflow-hidden relative" style={{ transform: "translateZ(30px)" }}>
              <div className="col-span-2 flex flex-col gap-6">
                <div className="flex items-center justify-between pointer-events-none">
                  <div>
                    <div className="h-6 w-32 bg-slate-800 rounded-md mb-2"></div>
                    <div className="h-4 w-48 bg-slate-300 rounded-md opacity-70"></div>
                  </div>
                  <div className="px-3 py-1 bg-emerald-100 rounded-full flex items-center gap-2 shadow-sm border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-bold text-emerald-800">Training Active</span>
                  </div>
                </div>
                
                <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col justify-end gap-3 pointer-events-none w-full relative">
                  <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80')] bg-cover opacity-5 rounded-xl mix-blend-luminosity"></div>
                  
                  {/* Mock Chart Area */}
                  <div className="flex items-end justify-between gap-4 h-full pb-4 border-b border-dashed border-slate-200 w-full relative z-10">
                    <div className="w-full bg-indigo-50 border border-indigo-100 rounded-t-sm h-1/4 relative"><div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-indigo-400 font-bold">SVM</div></div>
                    <div className="w-full bg-indigo-50 border border-indigo-100 rounded-t-sm h-[35%] relative"><div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-indigo-400 font-bold">DT</div></div>
                    <div className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 border-x border-t border-emerald-500 rounded-t-sm h-[85%] relative shadow-[0_-5px_25px_rgba(52,211,153,0.4)]">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs text-emerald-600 font-black px-2 py-0.5 bg-emerald-50 rounded shadow-sm border border-emerald-100">92.4% RF</div>
                    </div>
                    <div className="w-full bg-indigo-50 border border-indigo-100 rounded-t-sm h-[60%] relative"><div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-indigo-400 font-bold">GB</div></div>
                    <div className="w-full bg-indigo-50 border border-indigo-100 rounded-t-sm h-[45%] relative"><div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-indigo-400 font-bold">NN</div></div>
                  </div>
                </div>
              </div>

              <div className="col-span-1 hidden md:flex flex-col gap-6 pointer-events-none" style={{ transform: "translateZ(50px)" }}>
                <div className="h-40 bg-white border border-slate-200 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 flex flex-col gap-3">
                   <div className="flex gap-2 items-center"><div className="p-1.5 bg-sky-100 rounded-md"><Search size={14} className="text-sky-600" /></div><div className="h-4 w-1/2 bg-slate-800 rounded"></div></div>
                   <div className="flex gap-2 mt-2"><div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200"></div><div className="flex-1 space-y-2 py-1"><div className="h-2 w-full bg-slate-200 rounded"></div><div className="h-2 w-2/3 bg-slate-200 rounded"></div></div></div>
                   <div className="flex gap-2 mt-auto"><div className="w-8 h-8 rounded-full bg-slate-800"></div><div className="flex-1 space-y-2 py-1"><div className="h-2 w-full bg-emerald-100 rounded"></div><div className="h-2 w-4/5 bg-emerald-100 rounded"></div></div></div>
                </div>
                <div className="h-28 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl shadow-sm p-4 flex flex-col justify-center items-center text-center">
                   <Bot size={28} className="text-indigo-400 mb-2" />
                   <div className="h-2 w-3/4 bg-indigo-200/50 rounded mb-1.5"></div>
                   <div className="h-2 w-1/2 bg-indigo-200/50 rounded"></div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── 
          Section 2: Social Proof Marquee
          ──────────────────────────────────────────────────────────── */}
      <section className="py-12 border-y border-slate-200 bg-white shadow-[0_0_40px_rgba(0,0,0,0.02)] overflow-hidden w-full relative z-30">
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>
        
        <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-8 text-center px-6">Trusted by the creators behind the code</p>
        
        <div className="flex w-full">
          <div className="marquee-scroll opacity-80 filter saturate-50 hover:saturate-100 transition-all duration-500">
            {/* Double the list for infinite scroll effect */}
            {[1, 2].map((group) => (
              <div key={group} className="flex items-center gap-12 md:gap-24 px-6 md:px-12 shrink-0">
                <div className="flex items-center gap-4 text-slate-600 font-bold text-lg whitespace-nowrap">
                  <img src="https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=80&q=80" alt="Researcher" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" loading="lazy" decoding="async" />
                  Healthcare Researcher
                </div>
                <div className="flex items-center gap-4 text-slate-600 font-bold text-lg whitespace-nowrap">
                  <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&q=80" alt="Founder" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" loading="lazy" decoding="async" />
                  Startup Founder
                </div>
                <div className="flex items-center gap-4 text-slate-600 font-bold text-lg whitespace-nowrap">
                  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&q=80" alt="Developer" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" loading="lazy" decoding="async" />
                  Fullstack Dev
                </div>
                <div className="flex items-center gap-4 text-slate-600 font-bold text-lg whitespace-nowrap">
                  <img src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=80&q=80" alt="Data Scientist" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" loading="lazy" decoding="async" />
                  Data Scientist
                </div>
                <div className="flex items-center gap-4 text-slate-600 font-bold text-lg whitespace-nowrap">
                  <img src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&q=80" alt="ML Engineer" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" loading="lazy" decoding="async" />
                  ML Engineer
                </div>
                <div className="flex items-center gap-4 text-slate-600 font-bold text-lg whitespace-nowrap">
                  <img src="https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=80&q=80" alt="Product Manager" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" loading="lazy" decoding="async" />
                  Product Manager
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── 
          Section 3: Feature Highlights
          ──────────────────────────────────────────────────────────── */}
      <section className="py-32 px-6 max-w-6xl mx-auto w-full relative">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight">Everything you need to ship ML</h2>
          <p className="text-xl text-slate-500 max-w-2xl mx-auto font-medium">No plumbing required. We abstract away the infrastructure so you can focus on building your product.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <motion.div 
                key={idx} 
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
                className="card-glow-wrapper bg-white border border-slate-200 rounded-3xl p-10 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-all duration-300 group"
                onMouseMove={(e) => {
                   const rect = e.currentTarget.getBoundingClientRect();
                   e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                   e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                }}
              >
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-8 shadow-inner group-hover:scale-110 transition-transform duration-300 relative">
                  <div className={`absolute inset-0 bg-current opacity-10 rounded-2xl ${feature.color}`}></div>
                  <Icon className={`w-7 h-7 ${feature.color}`} strokeWidth={2.5} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">{feature.title}</h3>
                <p className="text-slate-600 font-medium leading-relaxed text-lg">{feature.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── 
          Section 4: How It Works
          ──────────────────────────────────────────────────────────── */}
      <section className="py-32 px-6 w-full relative bg-slate-900 text-white overflow-hidden text-center">
        {/* Atmospheric blurred background mask */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1400&q=80')] bg-cover bg-center opacity-10 mix-blend-luminosity filter blur-sm"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-900"></div>

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-24"
          >
            <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-white">How It Works</h2>
            <p className="text-xl text-slate-400 font-medium max-w-2xl mx-auto">From raw data to a deployed API in three simple steps.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative pb-10">
            {/* Animated SVG Connector Line */}
            <div className="hidden md:block absolute top-[3rem] left-[16%] w-[68%] h-2">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 10" fill="none">
                <motion.path 
                  d="M0,5 L100,5" 
                  stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="4 4" 
                />
                <motion.path 
                  d="M0,5 L100,5" 
                  stroke="#10b981" strokeWidth="2"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                />
              </svg>
            </div>
            
            {STEPS.map((step, idx) => (
              <motion.div 
                key={idx} 
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ type: "spring", stiffness: 100, delay: idx * 0.2 }}
                className="relative flex flex-col items-center z-10"
              >
                <div className="w-24 h-24 bg-slate-800 border border-slate-700/50 rounded-full flex items-center justify-center text-2xl font-black text-emerald-400 mb-8 relative shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                  {step.num}
                  <div className="absolute inset-0 rounded-full border border-emerald-500 box-content -m-[6px] opacity-0 group-hover:opacity-100 scale-95 hover:scale-100 hover:opacity-50 transition-all duration-300"></div>
                </div>
                <h3 className="text-2xl font-bold mb-4">{step.title}</h3>
                <p className="text-slate-400 font-medium px-4 text-lg leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── 
          Section 5: CTA Banner
          ──────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 w-full relative bg-[#fafafa]">
        {/* Subtle dot matrix background */}
        <div className="absolute inset-0 z-0" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "24px 24px" }}></div>
        
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-5xl mx-auto bg-slate-900 rounded-[2rem] p-12 md:p-20 relative overflow-hidden flex flex-col items-center text-center shadow-2xl z-10 border border-slate-800"
        >
          {/* Animated Hue Blobs in BG */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-500 rounded-full filter blur-[100px] opacity-20 hover:opacity-30 transition-opacity duration-700 pointer-events-none"></div>
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500 rounded-full filter blur-[100px] opacity-20 pointer-events-none"></div>

          <h2 className="text-4xl md:text-6xl font-black text-white mb-6 relative z-10 leading-[1.1] tracking-tight">
            Ready to ship your first ML model?
          </h2>
          <p className="text-slate-400 text-xl font-medium mb-12 max-w-2xl relative z-10">
            Join thousands of developers using AutoML Studio to build intelligent features without wrestling with PyTorch or Pandas.
          </p>
          
          <div className="relative z-10 flex">
             {/* Pulse Ring Halo */}
            <div className="absolute inset-0 bg-emerald-500 rounded-xl animate-ping opacity-20"></div>
            <button 
              onClick={() => navigate('/training')} 
              className="btn-shimmer px-10 py-5 rounded-xl bg-emerald-500 text-white font-bold text-xl shadow-[0_10px_30px_rgba(16,185,129,0.3)] transform hover:scale-105 transition-all w-full sm:w-auto relative"
            >
              Start New Project
            </button>
          </div>
        </motion.div>
      </section>
      
    </main>
  );
}
