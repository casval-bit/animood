// ─── Onglet « Stats » du profil — appli de bureau ───────────────────────────────────────────────────────
// Même langage visuel que la page principale du profil (cartes HUD, barres brillantes), nouvelle structure :
//   chiffres-clés → distribution des notes → note par année + humeurs → ta liste / formats → genres (barres + radar)
//   → classements (studios, voix, réalisateurs) → écart avec la communauté.
import { useMemo, useState } from "react";
import { useLang } from "../context/useLang.js";
import { STATUS_COLORS, getStatusLabel } from "../constants/statuses.js";
import { HudCard, HudTitle, HudChip, HudKpi, GlossBars } from "./profileHud.jsx";
import { useHudCss } from "./hudCss.js";

const MOOD_META = {
  emotional:{emoji:"💔",color:"#A78BFA",fr:"Émouvant",en:"Emotional"},
  happy:    {emoji:"✨",color:"#FFD93D",fr:"Joyeux",en:"Happy"},
  hype:     {emoji:"⚡",color:"#F97316",fr:"Hype",en:"Hype"},
  dark:     {emoji:"🩸",color:"#EF4444",fr:"Sombre",en:"Dark"},
  chill:    {emoji:"🌿",color:"#34D399",fr:"Chill",en:"Chill"},
  twisted:  {emoji:"🌀",color:"#06B6D4",fr:"Tordu",en:"Twisted"},
  in_love:  {emoji:"🌸",color:"#F9A8D4",fr:"Romantique",en:"In love"},
  thrills:  {emoji:"🎢",color:"#FB923C",fr:"Frissons",en:"Thrills"},
};
const TYPE_COLORS = { TV:"#8b5cf6", Movie:"#ec4899", OVA:"#22d3ee", ONA:"#34d399", Special:"#fbbf24", Music:"#f97316", TV_Special:"#fbbf24" };
const GOLD = "#fbbf24";

const glowStyle = (c) => ({ filter: `drop-shadow(0 0 5px ${c}99)` });

// ── formatage ────────────────────────────────────────────────────────────────────────────────────────
function fmtTime(min, en) {
  if (!min) return "—";
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24), r = h % 24;
  return en ? `${d}d ${r}h` : `${d} j ${r} h`;
}

// ── Anneau (humeurs, formats) ─────────────────────────────────────────────────────────────────────────
function Donut({ slices, size = 164, thick = 20, centerValue, centerLabel }) {
  const [hov, setHov] = useState(null);
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thick) / 2 - 4, c = size / 2, circ = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 3 : 0;
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((a, s) => a + (s.value / total) * circ, 0));
  const active = hov != null ? slices[hov] : null;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(139,92,246,0.08)" strokeWidth={thick} />
        {slices.map((s, i) => {
          const len = (s.value / total) * circ;
          const dash = Math.max(len - gap, 0.5);
          const off = -starts[i];
          return (
            <circle key={s.key ?? i} cx={c} cy={c} r={r} fill="none" stroke={s.color}
              strokeWidth={hov === i ? thick + 5 : thick}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={off}
              transform={`rotate(-90 ${c} ${c})`}
              style={{ ...glowStyle(s.color), cursor: "pointer", transition: "stroke-width .15s", animation: `hg-fade .6s ease ${i * 70}ms both` }}
              onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} />
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", textAlign: "center", padding: thick + 10 }}>
        <div style={{ fontSize: active ? 18 : 22, fontWeight: 900, color: "#fff", lineHeight: 1.1, textShadow: `0 0 12px ${(active?.color) || "#a855f7"}66` }}>
          {active ? active.value : centerValue}
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(148,163,184,0.7)", marginTop: 3, lineHeight: 1.2 }}>
          {active ? active.label : centerLabel}
        </div>
      </div>
    </div>
  );
}

// ── Radar des genres ──────────────────────────────────────────────────────────────────────────────────
function Radar({ axes }) {
  const n = axes.length;
  if (n < 3) return null;
  const W = 330, H = 270, cx = W / 2, cy = H / 2 + 2, R = 88;
  const pt = (i, f) => [cx + R * f * Math.sin((2 * Math.PI * i) / n), cy - R * f * Math.cos((2 * Math.PI * i) / n)];
  const poly = (f) => axes.map((_, i) => pt(i, f).join(",")).join(" ");
  const shape = axes.map((a, i) => pt(i, Math.max(a.value, 0.04)).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 360, display: "block", margin: "0 auto" }}>
      <defs>
        <radialGradient id="rdFill" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#e879f9" stopOpacity=".55" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity=".25" />
        </radialGradient>
        <linearGradient id="rdStroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c4b5fd" /><stop offset="100%" stopColor="#f0abfc" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map(f => <polygon key={f} points={poly(f)} fill="none" stroke="rgba(167,139,250,0.14)" strokeWidth="1" />)}
      {axes.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(167,139,250,0.12)" strokeWidth="1" />; })}
      <polygon points={shape} fill="url(#rdFill)" stroke="url(#rdStroke)" strokeWidth="2" strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 8px rgba(232,121,249,.55))", animation: "hg-fade .8s ease both" }} />
      {axes.map((a, i) => {
        const [x, y] = pt(i, Math.max(a.value, 0.04));
        const [lx, ly] = pt(i, 1.2);
        const sx = Math.sin((2 * Math.PI * i) / n);
        return (
          <g key={a.label}>
            <circle cx={x} cy={y} r="3.2" fill="#fff" stroke="#c084fc" strokeWidth="1.5" style={glowStyle("#c084fc")}><title>{`${a.label} · ${a.raw}`}</title></circle>
            <text x={lx} y={ly + 3} fontSize="9" fontWeight="700" fill="rgba(226,232,240,0.85)" textAnchor={sx > 0.3 ? "start" : sx < -0.3 ? "end" : "middle"}>{a.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Note moyenne par année : barres (nb d'animés) + courbe lumineuse ─────────────────────────────────
function YearChart({ data, tr }) {
  const [hov, setHov] = useState(null);
  if (!data?.length) return null;
  const W = 640, H = 200, L = 30, Rr = 14, T = 12, B = 26;
  const years = data.map(d => d.year);
  const minX = Math.min(...years), maxX = Math.max(...years);
  const lo = Math.max(1, Math.floor(Math.min(...data.map(d => d.avg)) - 0.7));
  const hi = Math.min(10, Math.ceil(Math.max(...data.map(d => d.avg)) + 0.5));
  const maxC = Math.max(...data.map(d => d.count), 1);
  const toX = y => L + ((y - minX) / Math.max(maxX - minX, 1)) * (W - L - Rr);
  const toY = v => T + (1 - (v - lo) / Math.max(hi - lo, 1)) * (H - T - B);
  const pts = data.map(d => [toX(d.year), toY(d.avg)]);
  let path = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1][0] + pts[i][0]) / 2;
    path += ` C ${cpx} ${pts[i - 1][1]} ${cpx} ${pts[i][1]} ${pts[i][0]} ${pts[i][1]}`;
  }
  const grid = []; for (let v = lo; v <= hi; v++) grid.push(v);
  const step = Math.max(1, Math.ceil(data.length / 9));
  const best = data.reduce((b, d) => (d.count >= 2 && d.avg > (b?.avg ?? 0) ? d : b), null);
  const barW = Math.max(6, Math.min(22, ((W - L - Rr) / Math.max(maxX - minX + 1, 1)) * 0.6));
  const h = hov != null ? data[hov] : best;
  return (
    <div>
      <div style={{ height: 16, marginBottom: 4, fontSize: 10, color: "rgba(196,181,253,0.9)", fontWeight: 700 }}>
        {h ? <>
          <span style={{ color: "#fff" }}>{h.year}</span> · <span style={{ color: GOLD }}>★ {h.avg.toFixed(1)}</span> · {h.count} {tr("animé", "anime")}{h.count > 1 && tr("s", "")}
          {hov == null && <span style={{ color: "rgba(148,163,184,.6)", fontWeight: 500 }}> — {tr("ta meilleure année", "your best year")}</span>}
        </> : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        <defs>
          <linearGradient id="yrLine" x1="0" x2="1"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#f0abfc" /></linearGradient>
          <linearGradient id="yrArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a855f7" stopOpacity=".38" /><stop offset="100%" stopColor="#a855f7" stopOpacity="0" /></linearGradient>
          <linearGradient id="yrBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c4b5fd" stopOpacity=".5" /><stop offset="100%" stopColor="#6d28d9" stopOpacity=".12" /></linearGradient>
        </defs>
        {grid.map(v => (
          <g key={v}>
            <line x1={L} x2={W - Rr} y1={toY(v)} y2={toY(v)} stroke="rgba(167,139,250,0.09)" strokeWidth="1" strokeDasharray="2 4" />
            <text x={L - 6} y={toY(v) + 3} textAnchor="end" fontSize="8" fill="rgba(148,163,184,0.6)">{v}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const bh = (d.count / maxC) * (H - T - B) * 0.42;
          return <rect key={d.year} x={toX(d.year) - barW / 2} y={H - B - bh} width={barW} height={bh} rx="3" fill="url(#yrBar)" opacity={hov == null || hov === i ? 1 : 0.4} />;
        })}
        <path d={`${path} L ${pts[pts.length - 1][0]} ${H - B} L ${pts[0][0]} ${H - B} Z`} fill="url(#yrArea)" />
        <path d={path} fill="none" stroke="#c084fc" strokeWidth="5" opacity=".28" strokeLinejoin="round" style={{ filter: "blur(3px)" }} />
        <path d={path} fill="none" stroke="url(#yrLine)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"
          pathLength="1" strokeDasharray="1" style={{ animation: "hg-draw 1.2s ease-out both" }} />
        {data.map((d, i) => {
          const isBest = best && d.year === best.year;
          return (
            <g key={d.year}>
              <circle cx={pts[i][0]} cy={pts[i][1]} r={hov === i ? 5.5 : isBest ? 4.5 : 3.2} fill={isBest ? GOLD : "#fff"} stroke={isBest ? "#f59e0b" : "#a855f7"} strokeWidth="1.6" style={glowStyle(isBest ? GOLD : "#c084fc")} />
              <rect x={pts[i][0] - Math.max(barW, 10)} y={T} width={Math.max(barW, 10) * 2} height={H - T - B} fill="transparent"
                onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} />
              {i % step === 0 && <text x={pts[i][0]} y={H - 8} textAnchor="middle" fontSize="8" fill="rgba(148,163,184,0.65)">{d.year}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Barre segmentée (statuts, formats) ────────────────────────────────────────────────────────────────
function Segmented({ slices }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", gap: 2, background: "rgba(139,92,246,0.06)" }}>
        {slices.filter(s => s.value > 0).map((s, i) => (
          <div key={s.key} title={`${s.label} · ${s.value}`}
            style={{ flex: s.value, minWidth: 6, background: `linear-gradient(180deg, ${s.color}ff, ${s.color}aa)`, boxShadow: `0 0 10px ${s.color}66, inset 0 1px 0 rgba(255,255,255,.45)`, transformOrigin: "left", animation: `hg-grow .7s cubic-bezier(.22,1,.36,1) ${i * 80}ms both` }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 12 }}>
        {slices.filter(s => s.value > 0).map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
            <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{s.label}</span>
            <span style={{ color: "rgba(148,163,184,.8)", fontWeight: 800 }}>{s.value}</span>
            <span style={{ color: "rgba(148,163,184,.45)", fontSize: 9 }}>{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Classement (studios, voix, réalisateurs, genres) ──────────────────────────────────────────────────
const MEDAL = ["#fbbf24", "#cbd5e1", "#d97706"];
function Leaderboard({ items, gradient, limit = 8, tr }) {
  const [sort, setSort] = useState("count");
  const sorted = useMemo(() => [...items].sort((a, b) => sort === "avg"
    ? (parseFloat(b.avg) || 0) - (parseFloat(a.avg) || 0) || b.count - a.count
    : b.count - a.count).slice(0, limit), [items, sort, limit]);
  const max = Math.max(...sorted.map(x => sort === "avg" ? parseFloat(x.avg) || 0 : x.count), 1);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, justifyContent: "flex-end" }}>
        <HudChip active={sort === "count"} onClick={() => setSort("count")}>{tr("Nombre", "Count")}</HudChip>
        <HudChip active={sort === "avg"} onClick={() => setSort("avg")} color={GOLD}>★ {tr("Ma note", "My rating")}</HudChip>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {sorted.map((it, i) => {
          const val = sort === "avg" ? parseFloat(it.avg) || 0 : it.count;
          return (
            <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 18, textAlign: "center", fontSize: 11, fontWeight: 900, color: MEDAL[i] || "rgba(148,163,184,.5)", textShadow: MEDAL[i] ? `0 0 8px ${MEDAL[i]}88` : "none" }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                  <span style={{ fontSize: 10, color: "rgba(148,163,184,.85)", flexShrink: 0, fontWeight: 700 }}>
                    {it.count}{it.avg && <span style={{ color: GOLD, marginLeft: 6 }}>★{it.avg}</span>}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "rgba(139,92,246,0.1)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(val / max) * 100}%`, borderRadius: 999, background: gradient, boxShadow: "0 0 10px rgba(168,85,247,.45), inset 0 1px 0 rgba(255,255,255,.4)", transformOrigin: "left", animation: `hg-grow .7s cubic-bezier(.22,1,.36,1) ${i * 55}ms both`, transition: "width .4s ease" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Écart avec la communauté ──────────────────────────────────────────────────────────────────────────
function DeltaList({ rows, positive, onOpen, tr }) {
  if (!rows?.length) return <div style={{ fontSize: 11, color: "rgba(148,163,184,.5)", fontStyle: "italic", padding: "6px 0" }}>{tr("Pas encore assez de notes pour comparer.", "Not enough ratings to compare yet.")}</div>;
  const col = positive ? "#34d399" : "#fb7185";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map(r => (
        <button key={r.id} type="button" onClick={() => onOpen?.({ mal_id: r.id, title: r.title, title_en: r.title, image_url: r.img, score: r.mal, type: r.type, images: { jpg: { image_url: r.img, large_image_url: r.img } } })}
          style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", padding: 6, borderRadius: 12, border: "1px solid rgba(139,92,246,0.14)", background: "rgba(139,92,246,0.04)", transition: "background .15s, border-color .15s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,0.1)"; e.currentTarget.style.borderColor = "rgba(139,92,246,0.35)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(139,92,246,0.04)"; e.currentTarget.style.borderColor = "rgba(139,92,246,0.14)"; }}>
          <div style={{ width: 34, height: 48, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.3)", boxShadow: `0 0 10px ${col}33` }}>
            {r.img && <img loading="lazy" decoding="async" src={r.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => { e.target.style.display = "none"; }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,.85)", marginTop: 2 }}>
              {tr("Toi", "You")} <b style={{ color: GOLD }}>★{r.user}</b> · MAL <b style={{ color: "var(--text-2)" }}>{Number(r.mal).toFixed(1)}</b>
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, color: col, textShadow: `0 0 10px ${col}77`, flexShrink: 0, paddingRight: 4 }}>
            {r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Onglet ────────────────────────────────────────────────────────────────────────────────────────────
export function ProfileStatsDesktop({ statsData, ratings, watched, statuses, onOpenDetail }) {
  useHudCss();
  const { lang } = useLang();
  const en = lang === "en";
  const tr = (fr, e) => (en ? e : fr);
  const [moodSort, setMoodSort] = useState("count");

  const R = useMemo(() => {
    const scores = Object.values(ratings || {}).map(r => r.score).filter(s => s >= 1 && s <= 10);
    const counts = Array(10).fill(0); scores.forEach(s => { counts[s - 1]++; });
    const n = scores.length;
    const sortedS = [...scores].sort((a, b) => a - b);
    const mean = n ? scores.reduce((a, b) => a + b, 0) / n : null;
    const median = n ? (n % 2 ? sortedS[(n - 1) / 2] : (sortedS[n / 2 - 1] + sortedS[n / 2]) / 2) : null;
    let mode = null; counts.forEach((c, i) => { if (c > 0 && (mode == null || c >= counts[mode - 1])) mode = i + 1; });
    return { counts, n, mean, median, mode, high: n ? scores.filter(s => s >= 8).length / n : 0, low: n ? scores.filter(s => s <= 5).length / n : 0 };
  }, [ratings]);

  const D = statsData || {};
  const delta = D.deltas || { n: 0, avg: null, up: [], down: [] };
  const pct = (x) => `${Math.round(x * 100)}%`;

  const statusSlices = ["completed", "watching", "onhold", "dropped", "watchlist"].map(k => ({
    key: k, label: getStatusLabel(k, lang), color: STATUS_COLORS[k].dot,
    value: Object.values(statuses || {}).filter(s => s === k).length,
  }));
  const typeSlices = Object.entries(D.typeCounts || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
    key: k, label: k === "TV_Special" ? "TV Special" : k, value: v, color: TYPE_COLORS[k] || "#94a3b8",
  }));

  const moodItems = (D.moodAvgData || []).filter(m => m.count > 0);
  const moodSorted = [...moodItems].sort((a, b) => moodSort === "avg" ? (parseFloat(b.avg) || 0) - (parseFloat(a.avg) || 0) : b.count - a.count);
  const moodSlices = [...moodItems].sort((a, b) => b.count - a.count).map(m => ({
    key: m.key, label: MOOD_META[m.key]?.[en ? "en" : "fr"] || m.key, value: m.count, color: MOOD_META[m.key]?.color || "#a78bfa",
  }));

  const genreAxes = (D.topGenres || []).slice(0, 8);
  const gMax = Math.max(...genreAxes.map(g => g.count), 1);

  const bigGradient = "linear-gradient(90deg,#7c3aed,#c084fc,#f0abfc)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1 — Chiffres-clés */}
      <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 min-[900px]:grid-cols-6">
        <HudKpi delay={0}   icon="▶" label={tr("Animés vus", "Anime watched")} value={watched.length.toLocaleString()} color="#a855f7" />
        <HudKpi delay={60}  icon="📺" label={tr("Épisodes (TV)", "Episodes (TV)")} value={(D.totalEpisodes || 0).toLocaleString()} color="#8b5cf6" />
        <HudKpi delay={120} icon="⏱" label={tr("Temps estimé", "Time watched")} value={fmtTime(D.totalMinutes, en)} color="#22d3ee" />
        <HudKpi delay={180} icon="★" label={tr("Animés notés", "Anime rated")} value={R.n} color="#6366f1" />
        <HudKpi delay={240} icon="⌀" label={tr("Note moyenne", "Average")} value={R.mean != null ? R.mean.toFixed(2) : "—"} color="#e879f9" />
        <HudKpi delay={300} icon="⚖" label={tr("Vs communauté", "Vs community")}
          value={delta.avg != null ? `${delta.avg > 0 ? "+" : ""}${delta.avg.toFixed(2)}` : "—"}
          sub={delta.avg == null ? null : Math.abs(delta.avg) < 0.15 ? tr("dans la moyenne", "right on average") : delta.avg > 0 ? tr("tu notes plus haut", "you rate higher") : tr("tu notes plus bas", "you rate lower")}
          color={GOLD} />
      </div>

      {/* 2 — Distribution des notes */}
      <HudCard scan glow corners={["tl", "tr", "bl", "br"]}>
        <HudTitle right={`${R.n} ${tr("notés", "rated")}`}>{tr("Distribution des notes", "Rating distribution")}</HudTitle>
        {R.n > 0 ? (
          <div className="grid items-end gap-6 min-[700px]:grid-cols-[minmax(0,1fr)_230px]">
            <GlossBars counts={R.counts} height={150} />
            <div style={{ display: "grid", gap: 8 }}>
              {[
                [tr("Note la plus donnée", "Most given"), R.mode != null ? `★ ${R.mode}` : "—"],
                [tr("Médiane", "Median"), R.median != null ? R.median : "—"],
                [tr("Notes ≥ 8", "Ratings ≥ 8"), pct(R.high)],
                [tr("Notes ≤ 5", "Ratings ≤ 5"), pct(R.low)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 10px", borderRadius: 10, background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)" }}>
                  <span style={{ fontSize: 10, color: "rgba(148,163,184,.85)" }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "#fff", textShadow: "0 0 10px rgba(168,85,247,.5)" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <div style={{ padding: "26px 0", textAlign: "center", fontSize: 11, color: "rgba(148,163,184,.5)" }}>{tr("Note des animés pour voir ta distribution", "Rate anime to see your distribution")}</div>}
      </HudCard>

      {/* 3 — Note par année + humeurs */}
      <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2">
        <HudCard>
          <HudTitle right={tr("barres : nb d'animés · courbe : ta note moyenne", "bars: count · line: your average")}>{tr("Note moyenne par année", "Average rating by year")}</HudTitle>
          {D.yearCurve?.length > 1 ? <YearChart data={D.yearCurve} tr={tr} /> : <div style={{ padding: "30px 0", textAlign: "center", fontSize: 11, color: "rgba(148,163,184,.5)" }}>{tr("Pas assez d'années notées", "Not enough rated years")}</div>}
        </HudCard>

        <HudCard>
          <HudTitle right={<span style={{ display: "inline-flex", gap: 5 }}>
            <HudChip active={moodSort === "count"} onClick={() => setMoodSort("count")} style={{ padding: "2px 8px", fontSize: 9 }}>{tr("Nombre", "Count")}</HudChip>
            <HudChip active={moodSort === "avg"} onClick={() => setMoodSort("avg")} color={GOLD} style={{ padding: "2px 8px", fontSize: 9 }}>★</HudChip>
          </span>}>{tr("Humeurs dominantes", "Dominant moods")}</HudTitle>
          {moodSlices.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <Donut slices={moodSlices} centerValue={moodItems.reduce((a, m) => a + m.count, 0)} centerLabel={tr("animés", "anime")} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                {moodSorted.map(m => (
                  <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: MOOD_META[m.key]?.color, boxShadow: `0 0 6px ${MOOD_META[m.key]?.color}`, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "var(--text-2)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{MOOD_META[m.key]?.emoji} {MOOD_META[m.key]?.[en ? "en" : "fr"]}</span>
                    <span style={{ color: "rgba(148,163,184,.85)", fontWeight: 800 }}>{m.count}</span>
                    {m.avg && <span style={{ color: GOLD, fontSize: 10, fontWeight: 800, width: 34, textAlign: "right" }}>★{m.avg}</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : <div style={{ padding: "30px 0", textAlign: "center", fontSize: 11, color: "rgba(148,163,184,.5)" }}>{tr("Pas encore de données d'humeur", "No mood data yet")}</div>}
        </HudCard>
      </div>

      {/* 4 — Ta liste + formats */}
      <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2">
        <HudCard>
          <HudTitle right={`${statusSlices.reduce((a, s) => a + s.value, 0)} ${tr("animés suivis", "tracked")}`}>{tr("Ta liste", "Your list")}</HudTitle>
          <Segmented slices={statusSlices} />
        </HudCard>
        <HudCard>
          <HudTitle right={`${typeSlices.reduce((a, s) => a + s.value, 0)} ${tr("vus", "watched")}`}>{tr("Formats regardés", "Formats watched")}</HudTitle>
          {typeSlices.length ? <Segmented slices={typeSlices} /> : <div style={{ fontSize: 11, color: "rgba(148,163,184,.5)" }}>—</div>}
        </HudCard>
      </div>

      {/* 5 — Genres : barres + radar */}
      {D.topGenres?.length > 0 && (
        <HudCard corners={["tl", "tr", "bl", "br"]}>
          <HudTitle right={tr("tes genres préférés", "your favourite genres")}>{tr("Genres", "Genres")}</HudTitle>
          <div className="grid items-center gap-7 min-[700px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <Leaderboard items={D.topGenres} gradient={bigGradient} limit={10} tr={tr} />
            <Radar axes={genreAxes.map(g => ({ label: g.name, value: g.count / gMax, raw: g.count }))} />
          </div>
        </HudCard>
      )}

      {/* 6 — Classements */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
        {D.topStudios?.length > 0 && <HudCard><HudTitle>🎬 {tr("Top studios", "Top studios")}</HudTitle><Leaderboard items={D.topStudios} gradient="linear-gradient(90deg,#ec4899,#f97316,#fbbf24)" tr={tr} /></HudCard>}
        {D.topVAs?.length > 0 && <HudCard><HudTitle>🎙️ {tr("Top voix", "Top voice actors")}</HudTitle><Leaderboard items={D.topVAs} gradient="linear-gradient(90deg,#34d399,#22d3ee,#818cf8)" tr={tr} /></HudCard>}
        {D.topDirectors?.length > 0 && <HudCard><HudTitle>🎞️ {tr("Top réalisateurs", "Top directors")}</HudTitle><Leaderboard items={D.topDirectors} gradient="linear-gradient(90deg,#f59e0b,#ef4444,#ec4899)" tr={tr} /></HudCard>}
      </div>

      {/* 7 — Écart avec la communauté */}
      {delta.n > 0 && (
        <div className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-2">
          <HudCard>
            <HudTitle right={tr("tu as noté plus haut que MAL", "you rated higher than MAL")}>💚 {tr("Tes coups de cœur", "Your hidden gems")}</HudTitle>
            <DeltaList rows={delta.up} positive onOpen={onOpenDetail} tr={tr} />
          </HudCard>
          <HudCard>
            <HudTitle right={tr("tu as noté plus bas que MAL", "you rated lower than MAL")}>💔 {tr("Tes déceptions", "Your letdowns")}</HudTitle>
            <DeltaList rows={delta.down} positive={false} onOpen={onOpenDetail} tr={tr} />
          </HudCard>
        </div>
      )}
    </div>
  );
}
