import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/", label: "Home", icon: "🏠" },
  { to: "/training", label: "Training", icon: "⚡" },
  { to: "/playground", label: "Playground", icon: "🎮" },
  { to: "/chat", label: "Chat", icon: "💬" },
];

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <nav className="sticky top-0 z-50 border-b border-brand-900/50"
         style={{ background: "rgba(15,15,26,0.85)", backdropFilter: "blur(20px)" }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
               style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
            🤖
          </div>
          <span className="font-bold text-lg tracking-tight">
            <span className="gradient-text">AutoML</span>
            <span className="text-slate-300"> Studio</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1">
          {links.map(({ to, label, icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                  ${active
                    ? "bg-brand-600/30 text-brand-300 border border-brand-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  }`}
              >
                <span>{icon}</span>
                {label}
              </Link>
            );
          })}
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
             style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse inline-block" />
          <span className="text-accent-400">ML Engine Ready</span>
        </div>
      </div>
    </nav>
  );
}
