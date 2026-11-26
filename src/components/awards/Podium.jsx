// ─── Podium d'AniMood 2026 (bloc de fin d'année) : les 3 premiers de la communauté, au total des points, avec leurs affiches ───────────
// Disposition d'un vrai podium : 2e à gauche, 1er au centre (affiche et marche plus hautes), 3e à droite ; les marches portent le rang et
// les points. Chaque affiche ouvre la fenêtre AniMood 2026 (onglet Top 3). Les données viennent de useCommunityPodium (actualisées toutes seules).
// Une place sans animé (pas encore assez de votes) montre un « ? » ; avant la première lecture, un squelette de même hauteur évite tout saut.
// Dans le code les colonnes sont dans l'ordre du classement (1er, 2e, 3e : ordre de lecture des lecteurs d'écran) ; `at` les place à l'écran.
// Le bloc qui porte ce podium est un îlot sombre (data-keep-bright) : les couleurs ci-dessous sont donc les mêmes en thème clair et sombre.
import { Poster } from "../Poster.jsx";
import { animeName } from "../../utils/awards2026.js";

// `rank` = index du classement (0 = 1er) ; `at` = colonne à l'écran ; `delay` = ordre d'apparition (3e, puis 2e, puis 1er) ; largeur d'affiche : proportionnelle à l'écran, bornée.
const COLUMNS = [
  { rank: 0, at: 2, step: 44, poster: "clamp(52px, 16.5vw, 72px)", metal: ["#fde68a", "#f59e0b"], edge: "rgba(251,191,36,0.98)", glow: "251,191,36",  numeral: 20, delay: 0.26 },
  { rank: 1, at: 1, step: 36, poster: "clamp(42px, 13vw, 58px)",   metal: ["#f8fafc", "#94a3b8"], edge: "rgba(226,232,240,0.9)", glow: "148,163,184", numeral: 16, delay: 0.12 },
  { rank: 2, at: 3, step: 30, poster: "clamp(42px, 13vw, 58px)",   metal: ["#fdba74", "#c2410c"], edge: "rgba(251,146,60,0.9)",  glow: "234,88,12",   numeral: 15, delay: 0 },
];
const INK = "#1f1300";                         // texte sur les marches (métal clair)
const SOFT = "rgba(245,243,255,0.66)";

function Column({ col, row, loading, onOpen, t }) {
  const anime = row?.anime;
  const name = anime ? animeName(anime) : "";
  const filled = !!row && !!anime;
  return (
    <li data-testid={`yearend-podium-${col.rank + 1}`} data-id={row?.id ?? ""} className={loading ? "animate-pulse" : "awards-rise"}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", minWidth: 0, gridColumn: col.at, gridRow: 1, animationDelay: loading ? undefined : `${col.delay}s` }}>
      <button type="button" onClick={onOpen} disabled={!filled} tabIndex={filled ? 0 : -1}
        aria-label={filled ? t.podiumPlace(col.rank + 1, name, row.points) : undefined} aria-hidden={filled ? undefined : "true"} title={filled ? name : undefined}
        style={{ position: "relative", display: "block", width: "100%", maxWidth: col.poster, aspectRatio: "2 / 3", padding: 0, borderRadius: 10, overflow: "hidden",
          cursor: filled ? "pointer" : "default", border: filled ? `2px solid ${col.edge}` : "2px dashed rgba(255,255,255,0.3)",
          background: filled ? "#1a1030" : "rgba(255,255,255,0.06)", boxShadow: filled ? `0 8px 22px rgba(${col.glow},0.32)` : "none" }}>
        {filled
          ? <Poster anime={anime} name={name} w={80} />
          : <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: col.rank === 0 ? 24 : 19, fontWeight: 900, color: SOFT }}>?</span>}
      </button>
      {/* marche : rang + points */}
      <div aria-hidden="true" style={{ width: "100%", height: col.step, marginTop: 5, borderRadius: "9px 9px 3px 3px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
        color: INK, background: `linear-gradient(180deg, ${col.metal[0]}, ${col.metal[1]})`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 14px rgba(0,0,0,0.25)", opacity: filled ? 1 : 0.5 }}>
        <span style={{ fontSize: col.numeral, fontWeight: 900, lineHeight: 1 }}>{col.rank + 1}</span>
        <span key={row?.points ?? "-"} className="awards-pop" data-testid={`yearend-podium-pts-${col.rank + 1}`} style={{ fontSize: 10.5, fontWeight: 900, lineHeight: 1.1 }}>{filled ? `${row.points} ${t.pts}` : "—"}</span>
      </div>
      <div aria-hidden="true" style={{ width: "100%", height: "2.5em", marginTop: 5, overflow: "hidden", textAlign: "center", fontSize: 10.5, fontWeight: 800, lineHeight: 1.25, color: "#f5f3ff" }}>{name}</div>
    </li>
  );
}

/** `podium` : résultat de useCommunityPodium ({ status, voters, top }). `onOpen` : ouvre la fenêtre AniMood 2026. */
export function Podium({ podium, onOpen, t }) {
  const loading = podium.status === "loading";
  const empty = podium.status === "empty";
  return (
    <div role="group" aria-label={t.podiumTitle} aria-busy={loading || undefined} data-testid="yearend-podium" data-status={podium.status} data-voters={podium.voters}
      style={{ position: "relative", width: "100%", maxWidth: 340, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "2px 8px", flexWrap: "wrap", marginBottom: 8 }}>
        <span title={t.podiumSub} style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase", color: "#fbbf24" }}>🏆 {t.podiumTitle}</span>
        <span data-testid="yearend-podium-sub" style={{ fontSize: 10.5, fontWeight: 700, color: SOFT }}>
          <span className="hidden md:inline">{t.podiumSub}{podium.voters > 0 ? " · " : ""}</span>{podium.voters > 0 ? t.voters(podium.voters) : <span className="md:hidden">{t.podiumSub}</span>}
        </span>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: "0 4px", display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: 9, alignItems: "end" }}>
        {COLUMNS.map(col => {
          const row = podium.top[col.rank];
          // clé = place + animé : si la place change d'animé (ou si le podium vient de se charger), la colonne se redessine et rejoue son animation
          return <Column key={`${col.rank}-${row?.id ?? (loading ? "load" : "none")}`} col={col} row={row} loading={loading} onOpen={onOpen} t={t} />;
        })}
      </ol>
      {empty && <p data-testid="yearend-podium-empty" style={{ margin: "8px 0 0", textAlign: "center", fontSize: 11.5, lineHeight: 1.45, color: SOFT }}>{t.podiumEmpty}</p>}
      {loading && <span className="sr-only">{t.podiumLoading}</span>}
    </div>
  );
}
