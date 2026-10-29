// ─── Style « HUD » de l'appli de bureau — briques communes aux onglets du profil ─────────────────────────
// Cartes sombres à bords violets + coins, titres en petites capitales, barres brillantes.
// Utilisées par la page principale (HudPanel) et par les onglets Journal / Listes / Posts / Stats (bureau).
const cornerStyle = (pos) => ({
  position: "absolute", pointerEvents: "none", width: 12, height: 12,
  [pos[0] === "t" ? "top" : "bottom"]: 0,
  [pos[1] === "l" ? "left" : "right"]: 0,
  borderTop: pos[0] === "t" ? "2px solid rgba(139,92,246,0.5)" : "none",
  borderBottom: pos[0] === "b" ? "2px solid rgba(139,92,246,0.5)" : "none",
  borderLeft: pos[1] === "l" ? "2px solid rgba(139,92,246,0.5)" : "none",
  borderRight: pos[1] === "r" ? "2px solid rgba(139,92,246,0.5)" : "none",
});

// Carte HUD : fond violet très sombre, bord violet, coins, balayage lumineux facultatif.
export function HudCard({ children, style, className, corners = ["tl", "br"], scan = false, glow = false, pad = "14px 16px", onClick, title, delay, onMouseEnter, onMouseLeave }) {
  return (
    <div className={className} onClick={onClick} title={title} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{
        position: "relative", overflow: "hidden", borderRadius: 16,
        border: "1px solid rgba(139,92,246,0.18)",
        background: "linear-gradient(135deg, rgba(10,6,30,0.85) 0%, rgba(15,9,40,0.75) 100%)",
        padding: pad,
        animation: [glow && "border-glow-sweep 3s ease-in-out infinite", delay != null && `hg-pop 0.5s cubic-bezier(.22,1,.36,1) ${delay}ms both`].filter(Boolean).join(", ") || undefined,
        ...style,
      }}>
      {scan && <div style={{ position: "absolute", left: 0, right: 0, height: 40, background: "linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.05) 50%, transparent 100%)", animation: "hud-scan 5s linear infinite", pointerEvents: "none" }} />}
      {corners.map(c => <div key={c} style={cornerStyle(c)} />)}
      {children}
    </div>
  );
}

// Titre de carte : petites capitales violettes + zone libre à droite
export function HudTitle({ children, right, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, ...style }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "rgba(167,139,250,0.85)" }}>{children}</div>
      {right != null && <div style={{ fontSize: 9, color: "rgba(148,163,184,0.7)", fontWeight: 600 }}>{right}</div>}
    </div>
  );
}

// Petite pastille de réglage (tri, filtre) au style HUD
export function HudChip({ active, children, onClick, color = "#a78bfa", style }) {
  return (
    <button onClick={onClick} type="button"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", transition: "all .15s",
        padding: "4px 11px", borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: .3,
        border: `1px solid ${active ? color : "rgba(139,92,246,0.18)"}`,
        background: active ? `${color}26` : "rgba(139,92,246,0.05)",
        color: active ? color : "var(--text-3)",
        boxShadow: active ? `0 0 12px ${color}33` : "none",
        ...style,
      }}>
      {children}
    </button>
  );
}

// Tuile de chiffre-clé
export function HudKpi({ icon, label, value, sub, color = "#a855f7", delay = 0 }) {
  return (
    <HudCard corners={["tl", "br"]} delay={delay} pad="12px 10px" style={{ textAlign: "center" }}>
      <div style={{ fontSize: 12, color, marginBottom: 4, filter: `drop-shadow(0 0 6px ${color}88)` }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: -1, textShadow: `0 0 12px ${color}66`, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(148,163,184,0.6)", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: "rgba(148,163,184,0.5)", marginTop: 2 }}>{sub}</div>}
    </HudCard>
  );
}

// ─── Histogramme brillant (une seule famille violet → fuchsia, reflets, éclat qui balaye) ─────────────
// counts : tableau de N valeurs ; labels : légende sous chaque barre (par défaut 1..N)
export function GlossBars({ counts, labels, height = 96, maxBar }) {
  const max = Math.max(...counts, 1);
  const n = counts.length;
  const barMax = maxBar ?? height - 34;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height, position: "relative", padding: "0 2px", borderBottom: "1px solid rgba(167,139,250,0.22)" }}>
      {counts.map((count, i) => {
        const score = i + 1;
        const hPx = count > 0 ? Math.max(Math.round((count / max) * barMax), 6) : 0;
        const isPeak = count > 0 && count === max;
        const hue = 262 + Math.round((i / Math.max(n - 1, 1)) * 45);
        const top = `hsl(${hue} 95% ${72 + Math.round((i / Math.max(n - 1, 1)) * 9)}%)`;
        const mid = `hsl(${hue} 85% 58%)`;
        const bot = `hsl(${hue - 6} 75% 38%)`;
        return (
          <div key={i} title={count > 0 ? `${labels?.[i] ?? score} · ${count}` : undefined}
            style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, minWidth: 0 }}>
            {count > 0 && (
              <div style={{ fontSize: 9, fontWeight: 800, color: isPeak ? "#f5d0fe" : "rgba(196,181,253,0.8)", textShadow: isPeak ? "0 0 8px rgba(232,121,249,0.8)" : "none" }}>{count}</div>
            )}
            <div style={{
              position: "relative", overflow: "hidden", width: "100%", height: hPx,
              background: count > 0 ? `linear-gradient(180deg, ${top} 0%, ${mid} 38%, ${bot} 100%)` : "rgba(167,139,250,0.07)",
              borderRadius: "5px 5px 2px 2px",
              boxShadow: count > 0 ? `0 0 ${isPeak ? 16 : 9}px hsl(${hue} 90% 60% / ${isPeak ? 0.7 : 0.38}), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -8px 10px rgba(0,0,0,0.18)` : "none",
              transformOrigin: "bottom",
              animation: count > 0 ? `hg-rise 0.7s cubic-bezier(.22,1,.36,1) ${(i + 1) * 45}ms both` : "none",
              transition: "height 0.5s ease",
            }}>
              {count > 0 && <>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "42%", background: "linear-gradient(90deg, rgba(255,255,255,0.32), rgba(255,255,255,0))", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, width: "55%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)", animation: `bd-shine 5.5s ease-in-out ${(i + 1) * 0.35}s infinite`, pointerEvents: "none" }} />
              </>}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: count > 0 ? "rgba(196,181,253,0.75)" : "rgba(100,116,139,0.45)" }}>{labels?.[i] ?? score}</div>
          </div>
        );
      })}
    </div>
  );
}

// Barre d'onglets du profil (bureau) : rail sombre, onglet actif en violet lumineux
const TAB_ICONS = { profile: "👤", journal: "📖", lists: "📋", posts: "✍️", stats: "📊" };
export function HudTabs({ tabs, active, onChange }) {
  return (
    <div className="flex max-w-full overflow-x-auto sm:inline-flex" style={{ gap: 4, padding: 4, borderRadius: 16, marginBottom: 24, scrollbarWidth: "none", border: "1px solid rgba(139,92,246,0.18)", background: "linear-gradient(135deg, rgba(10,6,30,0.85) 0%, rgba(15,9,40,0.75) 100%)" }}>
      {tabs.map(tab => {
        const on = tab.id === active;
        return (
          <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className="px-3 whitespace-nowrap sm:px-4"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, flex: "0 0 auto", paddingTop: 8, paddingBottom: 8, borderRadius: 12, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 800, letterSpacing: .2, transition: "all .15s",
              color: on ? "#fff" : "var(--text-3)",
              background: on ? "linear-gradient(135deg, rgba(124,58,237,.6), rgba(192,38,211,.42))" : "transparent",
              boxShadow: on ? "0 0 16px rgba(139,92,246,.45), inset 0 1px 0 rgba(255,255,255,.25)" : "none",
            }}>
            <span style={{ opacity: on ? 1 : .55, filter: on ? "none" : "grayscale(1)" }}>{TAB_ICONS[tab.id]}</span>{tab.label}
          </button>
        );
      })}
    </div>
  );
}
