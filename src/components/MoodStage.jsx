import { useEffect } from "react";
import { MOODS } from "../constants/moods.js";

// ─────────────────────────────────────────────────────────────────────────────
// MoodStage — DESKTOP ONLY.
// Scène théâtrale à droite de la grille de moods :
//   • idle     → les moods choisis en grandes cartes de tarot (0 à 3)
//   • summon   → pendant la recherche : le "pack" vibre dans un nuage de
//                bagarre, balise façon TARDIS qui clignote, puis POOF
//   • results  → les résultats apparaissent en cascade
// Ce composant n'est jamais rendu par la version web.
// ─────────────────────────────────────────────────────────────────────────────

const MOOD_GENRES = {
  emotional: ["Drama", "Romance"],
  happy:     ["Comedy", "Slice of Life"],
  hype:      ["Action", "Adventure"],
  dark:      ["Horror", "Psychological"],
  chill:     ["Slice of Life", "Iyashikei"],
  twisted:   ["Mystery", "Psychological"],
  in_love:   ["Romance", "Drama"],
  thrills:   ["Thriller", "Mystery"],
};

const ROMAN = ["I", "II", "III"];

// Bouffées du nuage de bagarre
const PUFFS = [
  { x: -64, y: -34, s: 66, d: 0 },    { x: 62, y: -40, s: 74, d: 0.15 },
  { x: -82, y: 24, s: 60, d: 0.3 },   { x: 78, y: 30, s: 66, d: 0.1 },
  { x: -22, y: -78, s: 58, d: 0.25 }, { x: 22, y: 76, s: 70, d: 0.4 },
  { x: -56, y: 72, s: 50, d: 0.2 },   { x: 58, y: -82, s: 48, d: 0.35 },
  { x: 100, y: -4, s: 46, d: 0.05 },  { x: -102, y: -6, s: 44, d: 0.45 },
];

// Étincelles qui jaillissent du nuage
const SPARKS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.2;
  const dist = 120 + (i % 4) * 22;
  return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, d: (i % 8) * 0.11, s: 10 + (i % 3) * 5 };
});

// Pack avec bords crantés (comme une pochette de cartes)
function crimpPolygon(teeth = 16, depth = 7) {
  const top = [], bot = [];
  for (let i = 0; i <= teeth; i++) {
    const x = (i / teeth) * 100;
    const y = i % 2 === 0 ? 0 : depth;
    top.push(`${x}% ${y}px`);
    bot.push(`${x}% calc(100% - ${y}px)`);
  }
  return `polygon(${top.join(",")},${bot.reverse().join(",")})`;
}
const PACK_CLIP = crimpPolygon();

const STAGE_CSS = `
@property --mb-amp { syntax: '<number>'; inherits: true; initial-value: 1; }

@keyframes mb-twinkle { 0%,100% { opacity: .15; transform: scale(.7); } 50% { opacity: 1; transform: scale(1.25); } }
@keyframes mb-card-in {
  0%   { opacity: 0; transform: translateY(42px) scale(.72) rotateX(40deg); filter: blur(6px); }
  60%  { opacity: 1; filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotateX(0deg); }
}
@keyframes mb-card-float { 0%,100% { transform: translateY(0) rotate(var(--mb-rot,0deg)); } 50% { transform: translateY(-8px) rotate(var(--mb-rot,0deg)); } }
@keyframes mb-spin { to { transform: rotate(360deg); } }
@keyframes mb-spin-rev { to { transform: rotate(-360deg); } }
@keyframes mb-foil { 0% { background-position: 160% 0; } 100% { background-position: -60% 0; } }
@keyframes mb-spot { 0%,100% { opacity: .75; } 50% { opacity: 1; } }
@keyframes mb-ghost { 0%,100% { opacity: .55; transform: translateY(0); } 50% { opacity: .9; transform: translateY(-5px); } }
@keyframes mb-halo { 0%,100% { opacity: .55; transform: scale(1); } 50% { opacity: .95; transform: scale(1.08); } }

/* ── Invocation : pack qui vibre ── */
@keyframes mb-amp-ramp { 0% { --mb-amp: .6; } 65% { --mb-amp: 3.4; } 100% { --mb-amp: 6; } }
@keyframes mb-jitter {
  0%   { transform: translate(calc(var(--mb-amp) * -1px),  calc(var(--mb-amp) * .6px))  rotate(calc(var(--mb-amp) * -.38deg)); }
  25%  { transform: translate(calc(var(--mb-amp) * 1px),   calc(var(--mb-amp) * -.8px)) rotate(calc(var(--mb-amp) * .42deg)); }
  50%  { transform: translate(calc(var(--mb-amp) * -.7px), calc(var(--mb-amp) * -1px))  rotate(calc(var(--mb-amp) * .26deg)); }
  75%  { transform: translate(calc(var(--mb-amp) * .9px),  calc(var(--mb-amp) * .8px))  rotate(calc(var(--mb-amp) * -.3deg)); }
  100% { transform: translate(calc(var(--mb-amp) * -.4px), calc(var(--mb-amp) * .3px))  rotate(calc(var(--mb-amp) * .2deg)); }
}
@keyframes mb-pack-arrive { 0% { opacity: 0; transform: translateY(70px) scale(.55) rotate(-10deg); } 100% { opacity: 1; transform: translateY(0) scale(1) rotate(0); } }
@keyframes mb-puff { 0% { transform: translate(var(--px), var(--py)) scale(.86); } 100% { transform: translate(calc(var(--px) * 1.08), calc(var(--py) * 1.08)) scale(1.14); } }
@keyframes mb-cloud-wobble { 0%,100% { transform: rotate(-9deg) scale(1); } 50% { transform: rotate(9deg) scale(1.06); } }
@keyframes mb-impact { 0%,100% { opacity: .0; transform: rotate(0deg) scale(.8); } 20% { opacity: .85; transform: rotate(8deg) scale(1.05); } 55% { opacity: .35; transform: rotate(-6deg) scale(.95); } 80% { opacity: .9; transform: rotate(5deg) scale(1.12); } }
@keyframes mb-spark { 0% { opacity: 0; transform: translate(0,0) scale(.2) rotate(0deg); } 18% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1) rotate(180deg); } }
@keyframes mb-beacon { 0%,100% { opacity: .18; } 8% { opacity: 1; } 46% { opacity: 1; } 56% { opacity: .18; } }
@keyframes mb-beacon-glow { 0%,100% { opacity: 0; transform: translateX(-50%) scale(.5); } 8% { opacity: 1; transform: translateX(-50%) scale(1.15); } 46% { opacity: .85; transform: translateX(-50%) scale(1); } 56% { opacity: 0; transform: translateX(-50%) scale(.5); } }
@keyframes mb-tail { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
@keyframes mb-dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
@keyframes mb-summon-text { 0%,100% { opacity: .55; letter-spacing: .28em; } 50% { opacity: 1; letter-spacing: .34em; } }

/* ── POOF ── */
@keyframes mb-pack-burst { 0% { transform: scale(1); opacity: 1; filter: brightness(1); } 35% { transform: scale(1.18) rotate(2deg); filter: brightness(2.2); } 100% { transform: scale(.2) rotate(-14deg); opacity: 0; filter: brightness(4); } }
@keyframes mb-cloud-poof { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.7); opacity: 0; } }
@keyframes mb-flash { 0% { transform: translate(-50%,-50%) scale(0); opacity: 1; } 45% { opacity: 1; } 100% { transform: translate(-50%,-50%) scale(13); opacity: 0; } }
@keyframes mb-spark-burst { 0% { opacity: 1; transform: translate(0,0) scale(.4) rotate(0deg); } 100% { opacity: 0; transform: translate(calc(var(--dx) * 2.4), calc(var(--dy) * 2.4)) scale(1.3) rotate(260deg); } }

/* ── Résultats ── */
@keyframes mb-reveal-card { 0% { opacity: 0; transform: translateY(26px) scale(.82); filter: blur(5px); } 100% { opacity: 1; transform: none; filter: blur(0); } }
.mb-reveal .grid.grid-cols-2 > * { animation: mb-reveal-card .55s cubic-bezier(.34,1.56,.64,1) both; }
.mb-reveal .grid.grid-cols-2 > *:nth-child(1) { animation-delay: .04s; }
.mb-reveal .grid.grid-cols-2 > *:nth-child(2) { animation-delay: .11s; }
.mb-reveal .grid.grid-cols-2 > *:nth-child(3) { animation-delay: .18s; }
.mb-reveal .grid.grid-cols-2 > *:nth-child(4) { animation-delay: .25s; }
.mb-reveal .grid.grid-cols-2 > *:nth-child(5) { animation-delay: .32s; }
.mb-reveal .grid.grid-cols-2 > *:nth-child(6) { animation-delay: .39s; }
.mb-reveal .grid.grid-cols-2 > *:nth-child(7) { animation-delay: .46s; }
.mb-reveal .grid.grid-cols-2 > *:nth-child(8) { animation-delay: .53s; }
.mb-reveal .grid.grid-cols-2 > *:nth-child(9) { animation-delay: .6s; }

@keyframes mb-cloud-drift { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes mb-cloud-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes mb-breathe { 0%,100% { transform: translateY(0) scaleX(1); } 50% { transform: translateY(-4px) scaleX(1.05); } }
@keyframes mb-mist-sym { 0%,100% { opacity: .35; transform: scaleX(1); } 50% { opacity: .7; transform: scaleX(1.1); } }
@keyframes mb-twinkle { 0%,100% { opacity: .15; transform: scale(.6); } 50% { opacity: .95; transform: scale(1); } }
@keyframes mb-mist { 0%,100% { opacity: .35; transform: translateX(-6px) scale(1); } 50% { opacity: .7; transform: translateX(8px) scale(1.06); } }
@keyframes mb-beam { 0%,100% { opacity: .55; } 50% { opacity: .9; } }
.mb-tarot-slot:hover .mb-tarot-face { transform: translateY(-7px) scale(1.035); box-shadow: 0 22px 50px rgba(0,0,0,.65), 0 0 46px var(--mb-c); }
.mb-tarot-slot:hover .mb-tarot-x { opacity: 1; }
.mb-stage-dots::after { content: ''; animation: mb-dots 1.4s steps(1) infinite; }
`;

function useStageCSS() {
  useEffect(() => {
    const id = "animood-moodstage-css";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = STAGE_CSS;
  }, []);
}

// ── Rideaux + lambrequin (ardoise sombre, sans couleur parasite) ─────────────
function Curtains() {
  const fold = (dir) => ({
    position: "absolute", top: 0, bottom: 0, [dir]: 0, width: "16%",
    background: [
      "repeating-linear-gradient(90deg,",
      "rgba(27,30,52,.96) 0 11px,",
      "rgba(15,17,32,.98) 11px 22px,",
      "rgba(22,25,44,.96) 22px 30px)",
    ].join(""),
    WebkitMaskImage: `linear-gradient(${dir === "left" ? "90deg" : "270deg"}, #000 0%, #000 50%, transparent 100%)`,
    maskImage: `linear-gradient(${dir === "left" ? "90deg" : "270deg"}, #000 0%, #000 50%, transparent 100%)`,
    pointerEvents: "none",
  });
  return (
    <>
      <div style={fold("left")} />
      <div style={fold("right")} />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(3,4,12,.75) 100%)",
      }} />
      {/* lambrequin festonné */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "linear-gradient(180deg,#14172b,#1d2140)", pointerEvents: "none" }} />
      <div style={{
        position: "absolute", top: 10, left: 0, right: 0, height: 22, pointerEvents: "none",
        background: "radial-gradient(circle 21px at 21px 0, #1d2140 97%, transparent 100%) repeat-x",
        backgroundSize: "42px 22px",
        filter: "drop-shadow(0 6px 8px rgba(0,0,0,.5))",
      }} />
      <div style={{ position: "absolute", top: 9, left: 0, right: 0, height: 1.5, background: "linear-gradient(90deg, transparent, rgba(139,92,246,.6), rgba(236,72,153,.45), transparent)", pointerEvents: "none" }} />
    </>
  );
}

// ── Nuages (bande qui défile en boucle) ──────────────────────────────────────
const CLOUD_BUMPS = [[18, 34, 15], [42, 28, 19], [68, 33, 16], [94, 26, 21], [122, 33, 17], [148, 28, 20], [174, 34, 16], [196, 37, 12]];
function CloudStrip({ id, tint, speed, opacity = 1, height = 46, flip = false, delay = 0, fade = false }) {
  const one = (k) => (
    <svg key={k} viewBox="0 0 200 50" preserveAspectRatio="none" style={{ flex: "0 0 50%", height: "100%", display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}-${k}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f6ff" stopOpacity=".95" />
          <stop offset=".55" stopColor="#c9d0ee" stopOpacity=".85" />
          <stop offset="1" stopColor={tint} stopOpacity=".7" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id}-${k})`}>
        {CLOUD_BUMPS.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} />)}
        <rect x="0" y="34" width="200" height="16" />
      </g>
    </svg>
  );
  return (
    <div style={{ position: "absolute", left: 0, right: 0, height, overflow: "hidden", opacity, pointerEvents: "none", transform: flip ? "scaleX(-1)" : undefined,
      ...(fade ? { WebkitMaskImage: "linear-gradient(180deg,#000 35%,transparent 92%)", maskImage: "linear-gradient(180deg,#000 35%,transparent 92%)" } : null) }}>
      <div style={{ display: "flex", width: "200%", height: "100%", animation: `mb-cloud-drift ${speed}s linear ${delay}s infinite` }}>
        {one(0)}{one(1)}
      </div>
    </div>
  );
}

// ── Œuf (façon Fabergé) : silhouette symétrique, sertie d'un liseré perlé et de gemmes ──────────
const EGG_PATH = "M59,2C92,2 114,50 114,98C114,134 90,156 59,156C28,156 4,134 4,98C4,50 26,2 59,2Z";
const EGG_STUDS = [[19.1, 32], [98.9, 32], [4, 98], [114, 98], [19.9, 140.5], [98.1, 140.5]];
function EggFrame({ c, id, children }) {
  const rim = `url(#egg-${id})`;
  const ghost = false;
  return (
    <div style={{ position: "relative", width: 118, height: 158, filter: ghost ? undefined : `drop-shadow(0 0 9px ${c}55)` }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: `path('${EGG_PATH}')`,
        background: ghost
          ? "linear-gradient(180deg, rgba(10,12,28,.6) 0%, rgba(109,91,255,.1) 60%, rgba(214,222,255,.14) 100%)"
          : `linear-gradient(180deg, #0b0d20 0%, ${c}30 46%, ${c}66 78%, rgba(214,222,255,.55) 100%)` }}>
        {children}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 26px rgba(4,5,14,.7)" }} />
      </div>
      <svg viewBox="0 0 118 158" width="118" height="158" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", zIndex: 6 }}>
        {!ghost && (
          <defs>
            <linearGradient id={`egg-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e8ecff" /><stop offset=".45" stopColor={c} /><stop offset="1" stopColor="#e8ecff" stopOpacity=".7" />
            </linearGradient>
          </defs>
        )}
        <path d={EGG_PATH} fill="none" stroke={rim} strokeWidth={ghost ? 1.5 : 3} strokeDasharray={ghost ? "5 4" : undefined} />
        {!ghost && (
          <>
            <path d={EGG_PATH} fill="none" stroke={c} strokeWidth="1" strokeDasharray="1.2 3.6" strokeLinecap="round" opacity=".85"
              transform="translate(59 79) scale(.9) translate(-59 -79)" />
            {EGG_STUDS.map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="3.1" fill="#0b0d1f" stroke="#e8ecff" strokeWidth=".9" />
                <circle cx={x} cy={y} r="1.3" fill={c} />
              </g>
            ))}
            {/* gemme sommitale et gemme basale */}
            {[2, 156].map((y) => (
              <g key={y} transform={`translate(59 ${y}) rotate(45)`}>
                <rect x="-3.6" y="-3.6" width="7.2" height="7.2" rx="1" fill="#0b0d1f" stroke="#e8ecff" strokeWidth="1" />
                <rect x="-1.9" y="-1.9" width="3.8" height="3.8" fill={c} />
              </g>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}

// Petit socle sous l'œuf
function EggStand({ c }) {
  return (
    <svg viewBox="0 0 70 16" width="64" height="15" style={{ display: "block", margin: "0 auto", overflow: "visible" }}>
      <defs>
        <linearGradient id={`stand-${c.slice(1)}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c} stopOpacity=".35" /><stop offset=".5" stopColor="#e8ecff" /><stop offset="1" stopColor={c} stopOpacity=".35" />
        </linearGradient>
      </defs>
      <path d="M8,2 Q35,-1 62,2 L56,8 Q35,11 14,8 Z" fill="#0b0d1f" stroke={`url(#stand-${c.slice(1)})`} strokeWidth="1.2" />
      <path d="M2,14 Q35,10 68,14" fill="none" stroke={`url(#stand-${c.slice(1)})`} strokeWidth="2" strokeLinecap="round" />
      <path d="M14,8 L10,14 M56,8 L60,14" stroke={c} strokeWidth="1" opacity=".7" />
    </svg>
  );
}

// ── Carte de tarot (mood choisi) — fenêtre de théâtre dans les nuages ────────
const SERIF = '"Cormorant Garamond","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif';

function TarotMoodCard({ mood, index, count, onClick, hint }) {
  const rots = count === 3 ? [-5, 0, 5] : count === 2 ? [-3.5, 3.5] : [0];
  const rot = rots[index] ?? 0;
  const lift = count === 3 && index !== 1 ? 8 : 0;
  const genres = (MOOD_GENRES[mood.id] || []).join(" · ");
  const c = mood.color;
  const uid = `cl-${mood.id}`;

  return (
    <div className="mb-tarot-slot" style={{ position: "relative", width: 176, height: 288, "--mb-c": `${c}66`, marginTop: lift }}>
      {/* Cône de projecteur */}
      <div style={{
        position: "absolute", left: "50%", top: -340, width: 300, height: 600,
        transform: "translateX(-50%)", pointerEvents: "none",
        background: `linear-gradient(180deg, ${c}34 0%, ${c}0e 55%, transparent 80%)`,
        clipPath: "polygon(41% 0, 59% 0, 100% 100%, 0 100%)",
        filter: "blur(5px)", mixBlendMode: "screen",
        animation: "mb-spot 4.5s ease-in-out infinite",
      }} />
      {/* Brume au sol */}
      <div style={{
        position: "absolute", left: "50%", bottom: -34, width: 240, height: 40,
        transform: "translateX(-50%)", pointerEvents: "none",
        background: `radial-gradient(ellipse, rgba(214,222,255,.28) 0%, ${c}30 45%, transparent 72%)`,
        filter: "blur(8px)", animation: "mb-mist-sym 7s ease-in-out infinite",
      }} />

      <div style={{ "--mb-rot": `${rot}deg`, animation: `mb-card-float ${6 + index * 0.7}s ease-in-out ${index * 0.5}s infinite`, width: "100%", height: "100%", perspective: 800 }}>
        <div style={{ width: "100%", height: "100%", animation: `mb-card-in .7s cubic-bezier(.22,1.2,.36,1) ${index * 0.09}s both` }}>
          <button
            type="button"
            onClick={onClick}
            title={hint}
            className="mb-tarot-face"
            style={{
              position: "relative", width: "100%", height: "100%",
              padding: 1.5, borderRadius: "22px 22px 16px 16px", border: "none", cursor: "pointer",
              background: `linear-gradient(160deg, rgba(226,232,255,.55) 0%, ${c}88 40%, rgba(226,232,255,.18) 70%, ${c}aa 100%)`,
              boxShadow: `0 16px 40px rgba(0,0,0,.6), 0 0 28px ${c}38`,
              transition: "transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s",
              display: "block", textAlign: "center",
            }}
          >
            <div style={{
              position: "relative", width: "100%", height: "100%", borderRadius: "20.5px 20.5px 14.5px 14.5px", overflow: "hidden",
              background: "linear-gradient(176deg,#151934 0%,#0a0c1c 55%,#0e1124 100%)",
            }}>
              {/* liseré intérieur de carte de tarot */}
              <div style={{ position: "absolute", inset: 5, borderRadius: "16px 16px 11px 11px", border: `1px solid ${c}40`, pointerEvents: "none" }} />
              {/* indices de coin : symbole en haut à gauche, le même renversé en bas à droite */}
              {[false, true].map(flip => (
                <div key={flip ? "br" : "tl"} style={{
                  position: "absolute", [flip ? "right" : "left"]: 11, [flip ? "bottom" : "top"]: 9,
                  transform: flip ? "rotate(180deg)" : undefined,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3, pointerEvents: "none", zIndex: 5,
                }}>
                  <span style={{ fontSize: 15, lineHeight: 1, filter: `drop-shadow(0 0 5px ${c}) drop-shadow(0 1px 2px rgba(0,0,0,.5))` }}>{mood.emoji}</span>
                  <span style={{ width: 1, height: 7, background: `linear-gradient(180deg, ${c}cc, transparent)` }} />
                  <span style={{ width: 4, height: 4, background: c, transform: "rotate(45deg)", boxShadow: `0 0 6px ${c}` }} />
                </div>
              ))}
              {/* numéro romain entre deux filets */}
              <div style={{ position: "absolute", top: 11, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, pointerEvents: "none" }}>
                <span style={{ width: 16, height: 1, background: `linear-gradient(90deg, transparent, ${c}99)` }} />
                <span style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 700, letterSpacing: "0.3em", paddingLeft: "0.3em", color: "rgba(226,232,255,.85)" }}>{ROMAN[index]}</span>
                <span style={{ width: 16, height: 1, background: `linear-gradient(270deg, transparent, ${c}99)` }} />
              </div>

              {/* l'œuf : symétrique, serti de gemmes, posé sur son socle */}
              <div style={{ position: "absolute", left: "50%", top: 33, marginLeft: -59, transformOrigin: "50% 0", transform: "scale(.95)" }}>
                <EggFrame c={c} id={mood.id}>
                  {/* faisceau de projecteur */}
                  <div style={{
                    position: "absolute", left: "50%", top: 0, width: 120, height: 120, transform: "translateX(-50%)",
                    background: "linear-gradient(180deg, rgba(235,240,255,.34) 0%, rgba(235,240,255,.06) 70%, transparent 100%)",
                    clipPath: "polygon(38% 0, 62% 0, 100% 100%, 0 100%)", filter: "blur(3px)",
                    mixBlendMode: "screen", animation: "mb-beam 5s ease-in-out infinite", pointerEvents: "none", zIndex: 1,
                  }} />
                  {/* nuages lointains */}
                  <div style={{ position: "absolute", left: 0, right: 0, top: 4 }}><CloudStrip id={`${uid}-a`} tint={c} speed={46} opacity={0.42} height={44} delay={-6} fade /></div>
                  <div style={{ position: "absolute", left: 0, right: 0, top: 62 }}><CloudStrip id={`${uid}-b`} tint={c} speed={60} opacity={0.34} height={44} flip delay={-14} fade /></div>
                  {/* le mood, flottant dans un halo */}
                  <div style={{ position: "absolute", left: 0, right: 0, top: 30, display: "flex", justifyContent: "center", zIndex: 2, animation: "mb-cloud-bob 5s ease-in-out infinite" }}>
                    <div style={{ position: "relative", width: 76, height: 76, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: `radial-gradient(circle, ${c}66 0%, ${c}1a 55%, transparent 72%)`, animation: "mb-halo 3.6s ease-in-out infinite" }} />
                      <svg viewBox="0 0 76 76" width="76" height="76" style={{ position: "absolute", inset: 0, animation: "mb-spin 34s linear infinite" }}>
                        <circle cx="38" cy="38" r="35" fill="none" stroke="rgba(226,232,255,.6)" strokeWidth="1" strokeDasharray="1.5 6" strokeLinecap="round" />
                      </svg>
                      <span style={{ position: "relative", fontSize: 40, lineHeight: 1, filter: `drop-shadow(0 0 12px ${c}) drop-shadow(0 4px 6px rgba(0,0,0,.45))` }}>{mood.emoji}</span>
                    </div>
                  </div>
                  {/* deux étincelles jumelles */}
                  {[26, 92].map((x, k) => (
                    <span key={x} style={{ position: "absolute", left: x, top: 48 + (k ? 0 : 0), width: 4, height: 4, borderRadius: 1, background: "#eef1ff", transform: "rotate(45deg)", boxShadow: `0 0 7px ${c}`, animation: "mb-twinkle 2.8s ease-in-out infinite", zIndex: 2 }} />
                  ))}
                  {/* bancs de nuages au premier plan */}
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 34 }}><CloudStrip id={`${uid}-c`} tint={c} speed={34} opacity={0.92} height={46} delay={-9} /></div>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 10, zIndex: 3 }}><CloudStrip id={`${uid}-d`} tint={c} speed={24} opacity={1} height={42} flip delay={-3} /></div>
                </EggFrame>
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, top: 182 }}><EggStand c={c} /></div>

              {/* cartouche : nom + genres */}
              <div style={{ position: "absolute", left: 0, right: 0, top: 201, textAlign: "center", padding: "0 12px" }}>
                <div style={{
                  fontFamily: SERIF, fontSize: 15, fontWeight: 700, letterSpacing: "0.26em", paddingLeft: "0.26em",
                  textTransform: "uppercase", color: "rgba(236,240,255,.96)", textShadow: `0 0 14px ${c}`,
                }}>
                  {mood.label}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 14px 6px" }}>
                  <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${c}99)` }} />
                  <span style={{ width: 5, height: 5, background: c, transform: "rotate(45deg)", boxShadow: `0 0 8px ${c}` }} />
                  <span style={{ flex: 1, height: 1, background: `linear-gradient(270deg, transparent, ${c}99)` }} />
                </div>
                <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", color: "rgba(186,196,222,.72)" }}>
                  {genres}
                </div>
              </div>

              {/* voile de brume sur le bas de la carte */}
              <div style={{
                position: "absolute", left: -20, right: -20, bottom: -14, height: 52, pointerEvents: "none",
                background: "radial-gradient(ellipse at 50% 100%, rgba(214,222,255,.16) 0%, transparent 70%)",
                animation: "mb-mist-sym 8s ease-in-out infinite",
              }} />
            </div>

            {/* croix retirer */}
            <span className="mb-tarot-x" style={{
              position: "absolute", top: -9, right: -9, width: 24, height: 24, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(10,12,28,.95)", border: `1.5px solid ${c}`, color: c,
              fontSize: 11, fontWeight: 900, opacity: 0, transition: "opacity .2s",
              boxShadow: `0 0 12px ${c}77`,
            }}>✕</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Carte fantôme (aucun mood choisi) — même fenêtre en arche, vide ──────────
function GhostCard({ title, subtitle }) {
  return (
    <div style={{ textAlign: "center", maxWidth: 300 }}>
      <div style={{
        position: "relative", width: 150, height: 232, margin: "0 auto 20px", overflow: "hidden",
        borderRadius: "75px 75px 14px 14px", border: "1.5px dashed rgba(148,163,184,.42)",
        background: "linear-gradient(180deg, rgba(10,12,28,.6) 0%, rgba(109,91,255,.1) 60%, rgba(214,222,255,.14) 100%)",
        animation: "mb-ghost 4.5s ease-in-out infinite",
        boxShadow: "0 0 40px rgba(109,91,255,.14), inset 0 0 30px rgba(109,91,255,.08)",
      }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 38 }}>
          <CloudStrip id="cl-ghost-a" tint="#6D5BFF" speed={48} opacity={0.24} height={44} delay={-5} fade />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: -6 }}>
          <CloudStrip id="cl-ghost-b" tint="#6D5BFF" speed={32} opacity={0.3} height={44} flip delay={-12} />
        </div>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 26 }}>
          <span style={{ fontSize: 54, lineHeight: 1, opacity: 0.6, filter: "grayscale(.25)", animation: "mb-cloud-bob 5s ease-in-out infinite" }}>🎭</span>
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(148,163,184,.8)" }}>{subtitle}</div>
    </div>
  );
}

// ── Invocation : pack qui vibre dans un nuage de bagarre ─────────────────────
function SummonPack({ selectedMoods, burst, label }) {
  const moods = selectedMoods.map(id => MOODS.find(m => m.id === id)).filter(Boolean);
  const palette = moods.length ? moods.map(m => m.color) : ["#6D5BFF", "#8B5CF6", "#EC4899"];

  return (
    <div className={burst ? "mb-burst" : ""} style={{ position: "relative", width: 320, height: 380, display: "flex", alignItems: "center", justifyContent: "center", animation: "mb-amp-ramp 2.6s ease-in forwards" }}>
      {/* Éclair d'impact (étoile de comic) */}
      <svg viewBox="-100 -100 200 200" width="340" height="340" style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -170, marginTop: -170, animation: "mb-impact .62s steps(1) infinite", pointerEvents: "none" }}>
        <polygon
          points={Array.from({ length: 28 }, (_, i) => {
            const a = (i / 28) * Math.PI * 2;
            const r = i % 2 === 0 ? 96 : 58 + (i % 4) * 5;
            return `${Math.cos(a) * r},${Math.sin(a) * r}`;
          }).join(" ")}
          fill="rgba(139,92,246,.14)" stroke="rgba(167,139,250,.8)" strokeWidth="2" strokeLinejoin="round"
        />
      </svg>

      {/* Nuage (derrière) */}
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, animation: burst ? "mb-cloud-poof .7s ease-out forwards" : "mb-cloud-wobble .5s ease-in-out infinite" }}>
        {PUFFS.map((p, i) => (
          <span key={i} style={{
            position: "absolute", left: -p.s / 2, top: -p.s / 2, width: p.s, height: p.s, borderRadius: "50%",
            "--px": `${p.x}px`, "--py": `${p.y}px`,
            background: "radial-gradient(circle at 34% 28%, #ffffff 0%, #eef1ff 36%, #aeb8e2 84%)",
            border: "2px solid rgba(30,36,84,.55)",
            boxShadow: "inset -7px -9px 16px rgba(70,80,170,.35)",
            animation: `mb-puff .38s ease-in-out ${p.d}s infinite alternate`,
          }} />
        ))}
      </div>

      {/* Étincelles */}
      {SPARKS.map((s, i) => (
        <span key={i} className="mb-spark" style={{
          position: "absolute", left: "50%", top: "50%", marginLeft: -s.s / 2, marginTop: -s.s / 2,
          width: s.s, height: s.s, "--dx": `${s.dx}px`, "--dy": `${s.dy}px`,
          color: palette[i % palette.length], pointerEvents: "none",
          animation: burst ? "mb-spark-burst .6s ease-out forwards" : `mb-spark .95s ease-out ${s.d}s infinite`,
          opacity: 0,
        }}>
          <svg viewBox="0 0 24 24" width={s.s} height={s.s} fill="currentColor" style={{ filter: "drop-shadow(0 0 5px currentColor)" }}>
            <path d="M12 1 23 12 12 23 1 12z" />
          </svg>
        </span>
      ))}

      {/* Le pack */}
      <div style={{ position: "relative", animation: burst ? "none" : "mb-pack-arrive .6s cubic-bezier(.22,1.3,.36,1) both" }}>
        <div style={{ animation: burst ? "mb-pack-burst .5s ease-in forwards" : "mb-jitter .11s linear infinite" }}>
          {/* Balise type TARDIS */}
          <div style={{ position: "absolute", left: "50%", top: -34, width: 0, height: 0, zIndex: 3 }}>
            <div style={{
              position: "absolute", left: 0, top: -34, width: 130, height: 130, marginLeft: -65, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(214,236,255,.85) 0%, rgba(139,92,246,.45) 38%, transparent 68%)",
              transform: "translateX(-50%)", filter: "blur(3px)",
              animation: "mb-beacon-glow 1.12s ease-in-out infinite",
            }} />
            <div style={{ position: "absolute", left: -14, top: 16, width: 28, height: 8, borderRadius: 2, background: "linear-gradient(180deg,#46557c,#232c4a)" }} />
            <div style={{
              position: "absolute", left: -9, top: -4, width: 18, height: 22, borderRadius: "9px 9px 3px 3px",
              background: "linear-gradient(180deg,#f4fbff 0%,#bfe3ff 55%,#7fb9f0 100%)",
              boxShadow: "0 0 18px #d6ecff, 0 0 40px rgba(139,92,246,.8)",
              animation: "mb-beacon 1.12s ease-in-out infinite",
            }} />
          </div>

          <div style={{ filter: "drop-shadow(0 0 22px rgba(109,91,255,.7)) drop-shadow(0 12px 16px rgba(0,0,0,.55))" }}>
            <div style={{
              position: "relative", width: 158, height: 228, clipPath: PACK_CLIP,
              background: "linear-gradient(160deg,#252a52 0%,#0f1124 52%,#2a1740 100%)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
              padding: "26px 14px 24px",
            }}>
              <div style={{ position: "absolute", inset: 10, border: "1.5px solid rgba(167,139,250,.55)", borderRadius: 10, pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 15, border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, pointerEvents: "none" }} />

              <div style={{ position: "relative", marginTop: 6 }}>
                <div style={{ position: "absolute", inset: -18, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.4) 0%, transparent 68%)", animation: "mb-beacon .56s ease-in-out infinite" }} />
                <span style={{ position: "relative", display: "block", fontSize: 66, lineHeight: 1, filter: "drop-shadow(0 0 10px rgba(167,139,250,.7))" }}>🎭</span>
              </div>

              <div style={{ position: "relative", textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.42em", paddingLeft: "0.42em", color: "#e5e7ff", marginBottom: 8 }}>ANIMOOD</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                  {(moods.length ? moods : [null]).map((m, i) => (
                    <span key={i} style={{
                      width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, background: m ? `${m.color}33` : "rgba(255,255,255,.08)",
                      border: `1.5px solid ${m ? m.color : "rgba(255,255,255,.3)"}`,
                      boxShadow: m ? `0 0 10px ${m.color}88` : "none",
                    }}>{m ? m.emoji : "?"}</span>
                  ))}
                </div>
              </div>

              {/* Reflet foil qui défile */}
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "screen",
                background: "linear-gradient(112deg, transparent 32%, rgba(255,255,255,.32) 46%, rgba(199,210,254,.22) 52%, transparent 66%)",
                backgroundSize: "260% 100%", animation: "mb-foil .95s linear infinite",
              }} />
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "color-dodge", opacity: 0.16,
                background: "linear-gradient(135deg, #6D5BFF, #8B5CF6 50%, #EC4899)",
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Bouffées devant le pack (il est « dans » le nuage) */}
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, pointerEvents: "none", animation: burst ? "mb-cloud-poof .6s ease-out forwards" : "mb-cloud-wobble .5s ease-in-out .12s infinite" }}>
        {[{ x: -58, y: 78, s: 56, d: 0.05 }, { x: 54, y: 84, s: 62, d: 0.2 }, { x: 4, y: 100, s: 48, d: 0.3 }, { x: -86, y: 40, s: 42, d: 0.15 }, { x: 88, y: 44, s: 44, d: 0.35 }].map((p, i) => (
          <span key={i} style={{
            position: "absolute", left: -p.s / 2, top: -p.s / 2, width: p.s, height: p.s, borderRadius: "50%",
            "--px": `${p.x}px`, "--py": `${p.y}px`,
            background: "radial-gradient(circle at 34% 28%, #ffffff 0%, #eef1ff 36%, #aeb8e2 84%)",
            border: "2px solid rgba(30,36,84,.55)",
            boxShadow: "inset -6px -8px 14px rgba(70,80,170,.35)",
            animation: `mb-puff .32s ease-in-out ${p.d}s infinite alternate`,
          }} />
        ))}
      </div>

      {/* POOF : flash */}
      {burst && (
        <span style={{
          position: "absolute", left: "50%", top: "50%", width: 90, height: 90, borderRadius: "50%", pointerEvents: "none",
          background: "radial-gradient(circle, #ffffff 0%, rgba(235,222,255,.95) 32%, rgba(167,139,250,.55) 58%, transparent 72%)",
          animation: "mb-flash .75s ease-out forwards", zIndex: 6,
        }} />
      )}

      {/* Libellé */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, textAlign: "center", opacity: burst ? 0 : 1, transition: "opacity .2s" }}>
        <span className="mb-stage-dots" style={{
          fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#cbd5e1",
          animation: "mb-summon-text 1.4s ease-in-out infinite", display: "inline-block",
        }}>
          {String(label || "").replace(/[….]+$/, "")}
        </span>
      </div>
    </div>
  );
}

// ── Scène principale ─────────────────────────────────────────────────────────
export function MoodStage({ selectedMoods, generating, burst, hasSearched, onToggle, lang, t, stageRef, children }) {
  useStageCSS();
  const en = lang === "en";
  const moods = selectedMoods.map(id => MOODS.find(m => m.id === id)).filter(Boolean);

  // Résultats : pas de cadre, juste une apparition en cascade
  if (!generating && hasSearched) {
    return <div ref={stageRef} className="mb-reveal">{children}</div>;
  }

  return (
    <div
      ref={stageRef}
      style={{
        position: "relative", overflow: "hidden", minHeight: 560, borderRadius: 26,
        border: "1px solid rgba(255,255,255,.09)",
        background: [
          "radial-gradient(70% 45% at 50% 0%, rgba(109,91,255,.18) 0%, transparent 70%)",
          "linear-gradient(180deg,#0b0d1e 0%,#080914 55%,#0a0c1a 100%)",
        ].join(","),
        boxShadow: "0 30px 80px rgba(0,0,0,.55), inset 0 0 80px rgba(20,24,60,.35)",
      }}
    >
      <Curtains />

      {/* titre dans le lambrequin */}
      <div style={{
        position: "absolute", top: 40, left: 0, right: 0, textAlign: "center", pointerEvents: "none",
        fontSize: 10, fontWeight: 800, letterSpacing: "0.34em", paddingLeft: "0.34em",
        textTransform: "uppercase", color: "rgba(203,213,225,.7)",
      }}>
        {generating ? (en ? "The ritual begins" : "Le rituel commence") : (en ? "Your spread" : "Ton tirage")}
      </div>

      {/* sol de scène */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: 90, pointerEvents: "none",
        background: "linear-gradient(180deg, transparent 0%, rgba(14,16,36,.9) 100%)",
        borderTop: "1px solid rgba(255,255,255,.05)",
      }} />

      <div style={{ position: "relative", minHeight: 560, display: "flex", alignItems: "center", justifyContent: "center", padding: "74px 50px 56px" }}>
        {generating ? (
          <SummonPack selectedMoods={selectedMoods} burst={burst} label={t?.analyzing} />
        ) : moods.length === 0 ? (
          <GhostCard title={t?.emptyTitle} subtitle={t?.emptySubtitle} />
        ) : (
          <div style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
            {moods.map((m, i) => (
              <TarotMoodCard
                key={m.id} mood={m} index={i} count={moods.length}
                hint={en ? "Click to remove" : "Clique pour retirer"}
                onClick={() => onToggle(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {!generating && (
        <div style={{
          position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", pointerEvents: "none",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: "rgba(167,155,205,.6)",
        }}>
          {moods.length}/3
        </div>
      )}
    </div>
  );
}
