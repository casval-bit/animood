// ─── Kit visuel commun des jeux ─────────────────────────────────────────────────────────────────────────────
// Un seul langage pour tous les écrans de jeu : boutons (avec survol / appui), cartes de mode, salon (code + joueurs),
// bandeau de score toujours visible, fenêtre « Abandonner ? », écran de fin avec l'ELO gagné ou perdu.
// Les couleurs viennent des variables du thème (--fg-rgb, --text-*) : tout reste lisible en thème clair comme sombre.
import { useState, useEffect, useRef, useMemo } from "react";
import { useGameText } from "../hooks/useGameUi.js";

// Couleurs d'état : variables CSS (plus foncées en thème clair, voir le début du CSS), jamais concaténées avec un suffixe.
export const GOOD = "var(--gm-good,#22c55e)", BAD = "var(--gm-bad,#ef4444)", WARN = "var(--gm-warn,#f59e0b)", ACCENT = "#a78bfa";

// ─── Styles (injectés une seule fois) ────────────────────────────────────────────────────────────────────────────
const CSS = `
:root{--gm-good:#22c55e;--gm-bad:#ef4444;--gm-warn:#f59e0b;--gm-good-text:#4ade80;--gm-bad-text:#f87171;--gm-warn-text:#fbbf24;--gm-violet:#c4b5fd;--gm-violet-soft:#ddd6fe;--gm-on-violet:#fff}
:root[data-theme="light"]{--gm-good:#15803d;--gm-bad:#b91c1c;--gm-warn:#b45309;--gm-good-text:#15803d;--gm-bad-text:#b91c1c;--gm-warn-text:#b45309;--gm-violet:#6d28d9;--gm-violet-soft:#4c1d95;--gm-on-violet:#4c1d95}
.gm{--gm-line:rgba(var(--fg-rgb),.11);--gm-fill:rgba(var(--fg-rgb),.045);--gm-fill-2:rgba(var(--fg-rgb),.085);color:var(--text-1);box-sizing:border-box;position:relative}
.gm *,.gm *::before,.gm *::after{box-sizing:border-box}
.gm button{font-family:inherit}
@keyframes gm-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes gm-pop{0%{opacity:0;transform:scale(.72)}60%{opacity:1;transform:scale(1.07)}100%{transform:scale(1)}}
@keyframes gm-fade{from{opacity:0}to{opacity:1}}
@keyframes gm-ring{0%{transform:scale(.3);opacity:.8}100%{transform:scale(1);opacity:0}}
@keyframes gm-pulse{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,.6)}50%{box-shadow:0 0 0 8px rgba(139,92,246,0)}}
@keyframes gm-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}
@keyframes gm-shimmer{0%{background-position:-240px 0}100%{background-position:240px 0}}
@keyframes gm-spin{to{transform:rotate(360deg)}}
@keyframes gm-blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
@keyframes gm-glow{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes gm-confetti{0%{transform:translate3d(0,-20px,0) rotate(0);opacity:1}100%{transform:translate3d(var(--dx),360px,0) rotate(var(--rot));opacity:0}}
@keyframes gm-slide{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
:root[data-theme="light"] .gm-tag,:root[data-theme="light"] .gm-end-title,:root[data-theme="light"] .gm-mode-go{color:color-mix(in srgb,rgb(var(--tone,139,92,246)) 52%,#16102a)}
.gm-rise{animation:gm-rise .32s ease both}
.gm-pop{animation:gm-pop .38s cubic-bezier(.2,.9,.3,1.2) both}
.gm-shake{animation:gm-shake .45s ease}

.gm-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;border-radius:12px;padding:11px 18px;font-size:13px;font-weight:800;line-height:1.1;cursor:pointer;user-select:none;color:var(--text-1);background:transparent;transition:transform .12s,box-shadow .18s,background .16s,border-color .16s,opacity .16s,color .16s}
.gm-btn:hover:not(:disabled){transform:translateY(-1px)}
.gm-btn:active:not(:disabled){transform:translateY(0) scale(.97)}
.gm-btn:disabled{opacity:.42;cursor:not-allowed}
.gm-btn:focus-visible{outline:2px solid var(--gm-violet);outline-offset:2px}
.gm-btn-primary{color:#fff;background:linear-gradient(135deg,#6d5bff,#8b5cf6 55%,#ec4899);box-shadow:0 6px 20px rgba(124,58,237,.35)}
.gm-btn-primary:hover:not(:disabled){box-shadow:0 10px 28px rgba(124,58,237,.55)}
.gm-btn-soft{background:var(--gm-fill-2);border-color:var(--gm-line)}
.gm-btn-soft:hover:not(:disabled){background:rgba(var(--fg-rgb),.14)}
.gm-btn-ghost{color:var(--text-3)}
.gm-btn-ghost:hover:not(:disabled){color:var(--text-1);background:var(--gm-fill)}
.gm-btn-danger{color:#fff;background:linear-gradient(135deg,#dc2626,#ef4444);box-shadow:0 6px 20px rgba(239,68,68,.32)}
.gm-btn-danger:hover:not(:disabled){box-shadow:0 10px 26px rgba(239,68,68,.5)}
.gm-btn-leave{color:var(--text-3);border-color:var(--gm-line);background:transparent}
.gm-btn-leave:hover:not(:disabled){color:var(--gm-bad-text);background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.55);box-shadow:0 6px 18px rgba(239,68,68,.16)}
.gm-btn-warn{color:var(--gm-bad-text);background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.32)}
.gm-btn-warn:hover:not(:disabled){background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.6);box-shadow:0 6px 18px rgba(239,68,68,.2)}
.gm-btn-sm{padding:7px 12px;font-size:12px;border-radius:10px}
.gm-btn-lg{padding:14px 24px;font-size:14px;border-radius:14px}
.gm-btn-block{width:100%}

.gm-mode{--tone:139,92,246;position:relative;display:flex;flex-direction:column;gap:10px;text-align:left;padding:18px;border-radius:18px;cursor:pointer;color:inherit;font:inherit;overflow:hidden;border:1px solid rgba(var(--tone),.3);background:linear-gradient(160deg,rgba(var(--tone),.13),rgba(var(--tone),.03) 62%);transition:transform .16s,box-shadow .2s,border-color .2s,background .2s}
.gm-mode:hover:not(:disabled){transform:translateY(-3px);border-color:rgba(var(--tone),.7);box-shadow:0 14px 34px rgba(var(--tone),.24);background:linear-gradient(160deg,rgba(var(--tone),.22),rgba(var(--tone),.05) 72%)}
.gm-mode:active:not(:disabled){transform:translateY(-1px) scale(.99)}
.gm-mode:focus-visible{outline:2px solid rgb(var(--tone));outline-offset:2px}
.gm-mode:disabled{opacity:.5;cursor:default}
.gm-mode-ico{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;background:rgba(var(--tone),.17);border:1px solid rgba(var(--tone),.34)}
.gm-mode-go{position:absolute;right:16px;top:18px;opacity:0;transform:translateX(-6px);transition:all .2s;color:rgb(var(--tone));font-weight:900;font-size:18px}
.gm-mode:hover .gm-mode-go{opacity:1;transform:none}
.gm-tag{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:rgb(var(--tone,139,92,246));background:rgba(var(--tone,139,92,246),.14);border:1px solid rgba(var(--tone,139,92,246),.28)}

.gm-input{width:100%;padding:12px 14px;border-radius:12px;font:inherit;font-size:14px;color:var(--text-1);background:rgba(var(--fg-rgb),.05);border:1px solid rgba(var(--fg-rgb),.15);outline:none;transition:border-color .15s,box-shadow .15s}
.gm-input:focus{border-color:rgba(139,92,246,.85);box-shadow:0 0 0 3px rgba(139,92,246,.24)}
.gm-input::placeholder{color:var(--text-4)}
.gm-input-code{text-align:center;font-weight:900;font-size:22px;letter-spacing:.38em;text-transform:uppercase;padding-left:calc(14px + .38em);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.gm-input-err{border-color:rgba(239,68,68,.7)!important}

.gm-code{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap}
.gm-code-ch{width:46px;height:58px;display:flex;align-items:center;justify-content:center;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;font-weight:900;color:var(--gm-violet-soft);background:linear-gradient(160deg,rgba(124,58,237,.3),rgba(79,70,229,.14));border:1px solid rgba(167,139,250,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.1);animation:gm-pop .4s both}

.gm-card{border-radius:16px;background:var(--gm-fill);border:1px solid var(--gm-line)}
.gm-eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
.gm-seat{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:14px;background:var(--gm-fill);border:1px solid var(--gm-line)}
.gm-seat.empty{border-style:dashed;background:transparent;color:var(--text-3)}

.gm-bubble{flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:900;border:2px solid rgba(255,255,255,.18);text-shadow:0 1px 2px rgba(0,0,0,.35)}
.gm-bubble.active{animation:gm-pulse 1.6s infinite;border-color:var(--gm-violet)}

.gm-radar{position:relative;width:132px;height:132px;display:flex;align-items:center;justify-content:center;margin:0 auto}
.gm-radar i{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(167,139,250,.7);animation:gm-ring 2.4s ease-out infinite}
.gm-radar i:nth-child(2){animation-delay:.8s}
.gm-radar i:nth-child(3){animation-delay:1.6s}
.gm-radar b{position:relative;width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;background:linear-gradient(135deg,rgba(109,91,255,.4),rgba(236,72,153,.28));border:1px solid rgba(196,181,253,.55);box-shadow:0 0 30px rgba(139,92,246,.45)}
.gm-dots span{animation:gm-blink 1.2s infinite}
.gm-dots span:nth-child(2){animation-delay:.2s}
.gm-dots span:nth-child(3){animation-delay:.4s}

.gm-hud{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;padding:12px 14px;border-radius:18px;background:linear-gradient(135deg,rgba(var(--fg-rgb),.065),rgba(var(--fg-rgb),.025));border:1px solid var(--gm-line)}
.gm-hud-side{display:flex;align-items:center;gap:10px;min-width:0}
.gm-hud-side.right{flex-direction:row-reverse;text-align:right}
.gm-hud-info{min-width:0}
.gm-hud-name{font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gm-hud-sub{font-size:10.5px;color:var(--text-3);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gm-hud-score{font-size:30px;font-weight:900;line-height:1;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.gm-hud-score small{font-size:13px;font-weight:700;color:var(--text-3);letter-spacing:0}
.gm-hud-mid{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:76px;text-align:center}
.gm-pips{display:flex;gap:4px}
.gm-pip{width:9px;height:9px;border-radius:50%;background:rgba(var(--fg-rgb),.16);transition:background .25s,transform .25s}
.gm-pip.on{background:#22c55e;transform:scale(1.15)}
.gm-pip.off{background:#ef4444}

.gm-turn{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:99px;font-size:12px;font-weight:800;border:1px solid var(--gm-line);background:var(--gm-fill);color:var(--text-2)}
.gm-turn.mine{color:var(--gm-good-text);border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.1)}
.gm-turn.mine::before,.gm-turn.theirs::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor;animation:gm-glow 1.3s infinite}
.gm-turn.theirs{color:var(--text-2)}
.gm-timer{height:6px;border-radius:99px;background:rgba(var(--fg-rgb),.1);overflow:hidden}
.gm-timer>i{display:block;height:100%;border-radius:99px;transition:width .25s linear,background .3s}

.gm-overlay{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,4,16,.68);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);animation:gm-fade .16s both}
.gm-dialog{width:min(400px,100%);border-radius:22px;padding:24px 22px 20px;text-align:center;background:var(--surface-1-strong,#111827);border:1px solid rgba(var(--fg-rgb),.14);box-shadow:var(--shadow-modal,0 25px 60px rgba(0,0,0,.5));animation:gm-pop .3s both}

.gm-end{position:relative;overflow:hidden;text-align:center;padding:28px 22px 22px;border-radius:24px;border:1px solid var(--gm-line);background:linear-gradient(180deg,rgba(var(--tone,139,92,246),.16),rgba(var(--fg-rgb),.025) 55%);animation:gm-rise .4s both}
.gm-end::before{content:"";position:absolute;left:50%;top:-90px;width:320px;height:220px;transform:translateX(-50%);background:radial-gradient(closest-side,rgba(var(--tone,139,92,246),.5),transparent);pointer-events:none;animation:gm-glow 3s infinite}
.gm-medal{position:relative;width:92px;height:92px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:44px;background:radial-gradient(circle at 30% 25%,rgba(var(--tone,139,92,246),.4),rgba(var(--tone,139,92,246),.1));border:2px solid rgba(var(--tone,139,92,246),.7);box-shadow:0 0 0 7px rgba(var(--tone,139,92,246),.12),0 10px 40px rgba(var(--tone,139,92,246),.45);animation:gm-pop .55s .08s cubic-bezier(.2,.9,.3,1.25) both}
.gm-end-title{position:relative;font-size:27px;font-weight:900;letter-spacing:-.02em;color:rgb(var(--tone,139,92,246));animation:gm-rise .4s .12s both}
.gm-end-sub{position:relative;margin-top:4px;font-size:13px;color:var(--text-2);animation:gm-rise .4s .18s both}
.gm-end-score{position:relative;display:inline-flex;align-items:center;gap:12px;margin-top:14px;padding:8px 20px;border-radius:99px;font-size:24px;font-weight:900;font-variant-numeric:tabular-nums;background:var(--gm-fill-2);border:1px solid var(--gm-line);animation:gm-rise .4s .24s both}
.gm-reward{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px auto 0;max-width:420px;animation:gm-rise .4s .3s both}
.gm-reward-tile{padding:14px 12px 12px;border-radius:16px;background:var(--gm-fill);border:1px solid var(--gm-line)}
.gm-reward-num{font-size:34px;font-weight:900;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.gm-skel{border-radius:10px;background:linear-gradient(90deg,rgba(var(--fg-rgb),.06) 25%,rgba(var(--fg-rgb),.15) 50%,rgba(var(--fg-rgb),.06) 75%);background-size:480px 100%;animation:gm-shimmer 1.2s linear infinite}
.gm-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.gm-confetti i{position:absolute;top:0;width:8px;height:12px;border-radius:2px;animation:gm-confetti 2.2s ease-out both}

.gm-note{padding:9px 12px;border-radius:12px;font-size:12px;font-weight:700;text-align:center}
.gm-note.warn{color:var(--gm-warn-text);background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.32)}
.gm-note.bad{color:var(--gm-bad-text);background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.32)}
.gm-note.good{color:var(--gm-good-text);background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.32)}
.gm-note.info{color:var(--text-2);background:var(--gm-fill);border:1px solid var(--gm-line)}
.gm-scroll{overflow-y:auto;scrollbar-width:thin}
@media (prefers-reduced-motion:reduce){.gm *,.gm *::before,.gm *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

let injected = false;
function ensureGameStyles() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  if (document.getElementById("animood-game-ui")) return;
  const el = document.createElement("style");
  el.id = "animood-game-ui";
  el.textContent = CSS;
  document.head.appendChild(el);
}
ensureGameStyles();

/** Conteneur racine d'un écran de jeu : active les variables du kit. */
export function GameRoot({ children, style, className = "" }) {
  ensureGameStyles();
  return <div className={`gm ${className}`} style={style}>{children}</div>;
}

// ─── Petits éléments ──────────────────────────────────────────────────────────────────────────────────────────────
export function Btn({ variant = "primary", size, block, icon, children, className = "", ...rest }) {
  return (
    <button type="button" className={`gm-btn gm-btn-${variant}${size ? ` gm-btn-${size}` : ""}${block ? " gm-btn-block" : ""} ${className}`} {...rest}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}{children}
    </button>
  );
}

const hueOf = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const initialOf = (name) => {
  const n = String(name || "?");
  if (n.startsWith("🤖")) return "🤖";
  const m = n.replace(/^[^\p{L}\p{N}]+/u, "");
  return (m[0] || "?").toUpperCase();
};
/** Pastille ronde avec l'initiale (ou 🤖) ; `active` = c'est son tour. */
export function Bubble({ name, size = 40, active = false }) {
  const h = hueOf(name);
  const bot = String(name || "").startsWith("🤖");
  return (
    <span className={`gm-bubble${active ? " active" : ""}`} aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * (bot ? 0.52 : 0.42)),
        background: bot ? "linear-gradient(135deg,#475569,#1e293b)" : `linear-gradient(135deg,hsl(${h} 72% 52%),hsl(${(h + 48) % 360} 70% 42%))` }}>
      {initialOf(name)}
    </span>
  );
}

export function Dots() {
  return <span className="gm-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>;
}

/** Radar animé « recherche en cours ». */
export function Radar({ icon = "🔍" }) {
  return <div className="gm-radar" aria-hidden="true"><i /><i /><i /><b>{icon}</b></div>;
}

export function Eyebrow({ children, style }) {
  return <div className="gm-eyebrow" style={style}>{children}</div>;
}

/** Message d'état (avertissement, erreur, succès, info). */
export function Note({ tone = "info", children, style, role }) {
  return <div className={`gm-note ${tone}`} style={style} role={role || (tone === "bad" ? "alert" : undefined)}>{children}</div>;
}

/** En-tête d'un écran de salon : grande icône, titre, sous-titre, pastille à droite. */
export function LobbyHeader({ icon, title, subtitle, chip, tone = "139,92,246" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, "--tone": tone }}>
      <div className="gm-mode-ico" style={{ width: 54, height: 54, fontSize: 28, borderRadius: 16, "--tone": tone }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.15 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>}
      </div>
      {chip}
    </div>
  );
}

/** Grande carte cliquable (choix d'un mode de jeu). `tone` = "r,g,b". */
export function ModeCard({ icon, title, desc, tag, tone = "139,92,246", onClick, disabled, extra, ...rest }) {
  return (
    <button type="button" className="gm-mode" style={{ "--tone": tone }} onClick={onClick} disabled={disabled} {...rest}>
      <span className="gm-mode-go" aria-hidden="true">→</span>
      <span className="gm-mode-ico" aria-hidden="true">{icon}</span>
      <span style={{ display: "block" }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 900, letterSpacing: "-.01em" }}>{title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginTop: 4, lineHeight: 1.45 }}>{desc}</span>
      </span>
      {(tag || extra) && (
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
          {tag && <span className="gm-tag">{tag}</span>}
          {extra}
        </span>
      )}
    </button>
  );
}

/** Jauge de force (1 à 3 barres) pour les niveaux de l'IA. */
export function Meter({ value, max = 3, tone = "139,92,246" }) {
  return (
    <span style={{ display: "inline-flex", gap: 3 }} aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{ width: 16, height: 6, borderRadius: 4, background: i < value ? `rgb(${tone})` : "rgba(var(--fg-rgb),.15)" }} />
      ))}
    </span>
  );
}

/** Copie un texte (API moderne, sinon sélection temporaire). */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

/** Code de salon en grosses tuiles + bouton Copier. */
export function CodeBox({ code, copyLabel, copiedLabel }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div>
      <div className="gm-code" aria-label={code}>
        {[...String(code)].map((c, i) => <span key={i} className="gm-code-ch" style={{ animationDelay: `${i * 0.06}s` }}>{c}</span>)}
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <Btn variant="soft" size="sm" onClick={copy} icon={copied ? "✓" : "📋"}>{copied ? copiedLabel : copyLabel}</Btn>
      </div>
    </div>
  );
}

/** Champ de saisie d'un code de salon (majuscules, caractères valides uniquement). */
export function CodeInput({ value, onChange, onSubmit, placeholder, error, autoFocus, maxLength = 6, ...rest }) {
  return (
    <input className={`gm-input gm-input-code${error ? " gm-input-err" : ""}`} value={value} maxLength={maxLength} autoFocus={autoFocus}
      autoComplete="off" spellCheck={false} placeholder={placeholder} aria-invalid={!!error}
      onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSubmit?.(); }} {...rest} />
  );
}

/** Une place dans un salon : joueur (avec badges) ou place libre. */
export function Seat({ name, you, host, youLabel, hostLabel, emptyLabel, extra }) {
  if (!name) {
    return (
      <div className="gm-seat empty" style={{ fontSize: 12.5 }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", border: "2px dashed var(--gm-line)", display: "flex", alignItems: "center", justifyContent: "center" }}>?</span>
        <span>{emptyLabel}<Dots /></span>
      </div>
    );
  }
  return (
    <div className="gm-seat gm-pop">
      <Bubble name={name} size={36} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {extra}
      {host && <span className="gm-tag" style={{ "--tone": "251,191,36" }}>👑 {hostLabel}</span>}
      {you && <span className="gm-tag" style={{ "--tone": "34,197,94" }}>{youLabel}</span>}
    </div>
  );
}

// ─── Bandeau de score (toujours visible pendant la partie) ──────────────────────────────────────────────────────────
/** me / opp : { name, sub, score (nœud), active }. `center` : nœud au milieu (manche, VS…). */
export function DuelHud({ me, opp, center }) {
  const side = (p, right) => (
    <div className={`gm-hud-side${right ? " right" : ""}`}>
      <Bubble name={p.name} size={44} active={!!p.active} />
      <div className="gm-hud-info">
        <div className="gm-hud-name">{p.name}</div>
        {p.sub ? <div className="gm-hud-sub">{p.sub}</div> : null}
      </div>
      <div className="gm-hud-score" style={{ margin: right ? "0 6px 0 0" : "0 0 0 6px" }}>{p.score}</div>
    </div>
  );
  return (
    <div className="gm-hud" role="group" aria-label="score">
      {side(me, false)}
      <div className="gm-hud-mid">{center}</div>
      {side(opp, true)}
    </div>
  );
}

/** Points de manche : `won` verts, `lost` rouges, le reste gris. */
export function Pips({ total, won, lost = 0 }) {
  return (
    <div className="gm-pips" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <i key={i} className={`gm-pip${i < won ? " on" : i < won + lost ? " off" : ""}`} />)}
    </div>
  );
}

export function TurnPill({ mine, children }) {
  return <span className={`gm-turn ${mine ? "mine" : "theirs"}`}>{children}</span>;
}

/** Barre de temps : `left` secondes restantes sur `total`. */
export function TimerBar({ left, total = 40 }) {
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const color = left <= 8 ? BAD : left <= 18 ? WARN : GOOD;
  return <div className="gm-timer" role="timer" aria-label={`${left}s`}><i style={{ width: `${pct}%`, background: color }} /></div>;
}

// ─── Fenêtre « Abandonner ? » ──────────────────────────────────────────────────────────────────────────────────────
export function QuitDialog({ open, title, body, penalty, stayLabel, quitLabel, onStay, onQuit, busy, danger = true }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onStay?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onStay]);
  if (!open) return null;
  return (
    <div className="gm-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onStay}>
      <div className="gm-dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 62, height: 62, margin: "0 auto 12px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
          background: danger ? "rgba(239,68,68,.14)" : "rgba(139,92,246,.15)", border: `1px solid ${danger ? "rgba(239,68,68,.45)" : "rgba(139,92,246,.45)"}` }}>🏳️</div>
        <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-.01em" }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 8, lineHeight: 1.5 }}>{body}</div>
        {penalty ? <div className="gm-note bad" style={{ marginTop: 14 }}>{penalty}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
          <Btn variant="primary" size="lg" block onClick={onStay} autoFocus>{stayLabel}</Btn>
          <Btn variant="warn" block onClick={onQuit} disabled={busy}>{quitLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Écran de fin ───────────────────────────────────────────────────────────────────────────────────────────────────
const TONES = { win: "34,197,94", loss: "239,68,68", draw: "245,158,11", neutral: "139,92,246" };

/** Compte de 0 à `target` en ~0,8 s (entier signé conservé). Sans animation si l'utilisateur la désactive dans son système. */
function useCountUp(target, ms = 800) {
  const [val, setVal] = useState(0);
  const goal = Number(target) || 0;
  const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!goal || reduce) return undefined;
    let raf, start;
    const step = (ts) => {
      if (start === undefined) start = ts;
      const p = Math.min(1, (ts - start) / ms);
      setVal(Math.round(goal * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [goal, reduce, ms]);
  return !goal ? 0 : reduce ? goal : val;
}

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 26 }, (_, i) => {
    const r = (k) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    return { left: `${Math.round(r(1) * 100)}%`, delay: `${(r(2) * 0.7).toFixed(2)}s`, dx: `${Math.round((r(3) - 0.5) * 120)}px`,
      rot: `${Math.round(r(4) * 720 - 360)}deg`, color: ["#22c55e", "#a78bfa", "#f59e0b", "#ec4899", "#38bdf8"][i % 5] };
  }), []);
  return (
    <div className="gm-confetti" aria-hidden="true">
      {pieces.map((p, i) => <i key={i} style={{ left: p.left, animationDelay: p.delay, background: p.color, "--dx": p.dx, "--rot": p.rot }} />)}
    </div>
  );
}

function RewardPanel({ g, mode, settlement, record, onRetry, retrying }) {
  const eloTarget = settlement?.status === "done" ? settlement.elo : 0;
  const ptsTarget = settlement?.status === "done" ? settlement.pts : 0;
  const eloShown = useCountUp(Math.abs(eloTarget));
  const ptsShown = useCountUp(Math.abs(ptsTarget));
  if (mode === "ai") {
    return (
      <div style={{ maxWidth: 420, margin: "18px auto 0" }}>
        <Note tone="info">🤖 {g.end.aiNote}</Note>
        {record ? <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-2)" }}>{g.end.record(record)}</div> : null}
      </div>
    );
  }
  if (mode !== "ranked" && mode !== "friend" && mode !== "party") return null;
  const st = settlement?.status || "pending";
  if (st === "pending") {
    return (
      <div className="gm-reward" aria-busy="true">
        {(mode === "ranked" ? [0, 1] : [0]).map((i) => (
          <div key={i} className="gm-reward-tile"><div className="gm-skel" style={{ height: 11, width: "40%", margin: "0 auto 10px" }} /><div className="gm-skel" style={{ height: 32, width: "62%", margin: "0 auto" }} /></div>
        ))}
        <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--text-3)" }}>{g.end.saving}<Dots /></div>
      </div>
    );
  }
  if (st === "failed") {
    return (
      <div style={{ maxWidth: 420, margin: "18px auto 0" }}>
        <Note tone="bad">⚠️ {g.end.failed}{settlement.error ? ` (${settlement.error})` : ""}</Note>
        {onRetry ? <div style={{ marginTop: 10 }}><Btn variant="soft" size="sm" onClick={onRetry} disabled={retrying} icon="↻">{retrying ? g.end.retrying : g.common.retry}</Btn></div> : null}
      </div>
    );
  }
  const eloTone = settlement.elo > 0 ? GOOD : settlement.elo < 0 ? BAD : "var(--text-2)";
  const ptsTone = settlement.pts > 0 ? "var(--gm-warn-text)" : "var(--text-2)";
  return (
    <div className="gm-reward">
      {mode === "ranked" && (
        <div className="gm-reward-tile">
          <Eyebrow>ELO</Eyebrow>
          <div className="gm-reward-num" style={{ color: eloTone, marginTop: 8 }}>{signed(settlement.elo === 0 ? 0 : Math.sign(settlement.elo) * eloShown)}</div>
          {settlement.newElo != null && settlement.oldElo != null
            ? <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)", fontWeight: 700 }}>{settlement.oldElo} → <b style={{ color: "var(--text-1)" }}>{settlement.newElo}</b></div>
            : null}
        </div>
      )}
      <div className="gm-reward-tile">
        <Eyebrow>{g.end.points}</Eyebrow>
        <div className="gm-reward-num" style={{ color: ptsTone, marginTop: 8 }}>{signed(settlement.pts === 0 ? 0 : Math.sign(settlement.pts) * ptsShown)}</div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)", fontWeight: 700 }}>{mode === "friend" ? g.end.friendNote : mode === "party" ? g.end.partyNote : g.end.pointsNote}</div>
      </div>
    </div>
  );
}

/**
 * Écran de fin de partie. tone : win | loss | draw | neutral. `settlement` = settlementView() (ELO / points enregistrés).
 * actions : [{ label, onClick, variant }] ; children = contenu supplémentaire (classement, détails…).
 */
export function EndScreen({ tone = "neutral", icon, title, subtitle, scoreLine, mode, settlement, record, onRetry, retrying, actions = [], children }) {
  ensureGameStyles();
  const g = useGameText().g;
  return (
    <div className="gm-end" style={{ "--tone": TONES[tone] || TONES.neutral }} data-tone={tone} role="status">
      {tone === "win" ? <Confetti /> : null}
      <div className="gm-medal" aria-hidden="true">{icon}</div>
      <div className="gm-end-title">{title}</div>
      {subtitle ? <div className="gm-end-sub">{subtitle}</div> : null}
      {scoreLine ? <div className="gm-end-score">{scoreLine}</div> : null}
      <RewardPanel g={g} mode={mode} settlement={settlement} record={record} onRetry={onRetry} retrying={retrying} />
      {children}
      {actions.length ? (
        <div style={{ position: "relative", display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 22 }}>
          {actions.map((a, i) => <Btn key={i} variant={a.variant || (i === 0 ? "primary" : "soft")} size="lg" onClick={a.onClick} disabled={a.disabled} icon={a.icon}>{a.label}</Btn>)}
        </div>
      ) : null}
    </div>
  );
}
