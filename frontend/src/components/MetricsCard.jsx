/**
 * MetricsCard — displays a single labelled metric with optional glow color.
 */
export default function MetricsCard({ label, value, unit = "", color = "brand", icon = "📊" }) {
  const colorMap = {
    brand: { text: "#818cf8", glow: "rgba(99,102,241,0.2)" },
    accent: { text: "#34d399", glow: "rgba(52,211,153,0.2)" },
    violet: { text: "#c4b5fd", glow: "rgba(167,139,250,0.2)" },
    rose:   { text: "#fb7185", glow: "rgba(251,113,133,0.2)" },
  };
  const c = colorMap[color] || colorMap.brand;

  return (
    <div className="metric-card" style={{ borderColor: c.glow }}>
      <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider font-medium">
        <span>{icon}</span>
        {label}
      </div>
      <div className="flex items-end gap-1 mt-1">
        <span className="text-3xl font-bold tabular-nums" style={{ color: c.text }}>
          {value}
        </span>
        {unit && (
          <span className="text-sm text-slate-500 mb-1">{unit}</span>
        )}
      </div>
    </div>
  );
}
