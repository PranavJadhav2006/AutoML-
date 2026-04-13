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

        {/* Logo - Fixed width to balance with the spacer */}
        <div className="w-48 flex justify-start">
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
        </div>

        {/* Nav links - Centered */}
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

        {/* Spacer - Balance the logo width for true centering */}
        <div className="hidden md:block w-48"></div>
      </div>
    </nav>
  );
}
