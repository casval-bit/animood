// ─── AniMood 2026 : la fenêtre (favori de la communauté + Top 3 / Tierlist / Grille) ─────────────────────────────────────────────────────
// Habillage « fête » (GameModal festive) : cadre doré, grand « 2026 » en en-tête et trois gros onglets en pilules (l'onglet actif en doré),
// pour qu'elle ne ressemble pas aux fenêtres classiques et que les sections se voient du premier coup d'œil.
// Ouverte depuis le bloc de fin d'année (sous l'en-tête) et depuis les Jeux. Elle reste montée pour les 3 onglets une fois visités :
// changer d'onglet ne perd aucune modification en cours (la tierlist enregistre avec un léger délai).
// Le sélecteur d'animé (AnimePicker2026) est un panneau par-dessus le contenu : `pickAnime()` l'ouvre et renvoie l'animé choisi (ou null).
import { useState, useCallback, useRef } from "react";
import { GameModal } from "../Modal.jsx";
import { TierlistStudio } from "../Tierlist.jsx";
import { Poster } from "../Poster.jsx";
import { useApp } from "../../context/useApp.js";
import { useLang } from "../../context/useLang.js";
import { awardsText } from "../../constants/awardsI18n.js";
import { animeName } from "../../utils/awards2026.js";
import { AnimePicker2026 } from "./AnimePicker2026.jsx";
import { Top3Panel } from "./Top3Panel.jsx";
import { GridPanel } from "./GridPanel.jsx";
import { useAwardsData } from "./useAwardsData.js";

const GOLD = "251,191,36";

function FavouriteStrip({ data, t }) {
  const top = data.rankings?.community?.points?.list?.[0];
  const anime = top ? data.details.get(top.id) : null;
  return (
    <div data-testid="awards-favourite" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", flexShrink: 0,
      background: `linear-gradient(100deg, rgba(${GOLD},0.16), rgba(var(--ac-8b5cf6),0.1))`, borderBottom: `1px solid rgba(${GOLD},0.28)` }}>
      <span style={{ width: 38, height: 54, flexShrink: 0, borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
        background: anime ? "rgb(var(--ac-1a1030))" : `rgba(${GOLD},0.14)`, border: `1px solid rgba(${GOLD},0.5)`, fontSize: 20 }}>
        {anime ? <Poster anime={anime} name={animeName(anime)} w={38} /> : <span aria-hidden="true">🏆</span>}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.6, textTransform: "uppercase", color: "#fbbf24" }}>🏆 {t.favTitle}</div>
        {data.loading ? (
          <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-4)" }}>{t.loading}</div>
        ) : anime ? (
          <>
            <div data-testid="awards-favourite-title" style={{ fontSize: 14, fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{animeName(anime)}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>{t.favMeta(top.points, top.mentions)}</div>
          </>
        ) : (
          <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 700, color: "var(--text-2)" }}>{data.missing ? t.resultsMissing : t.favNone}</div>
        )}
      </div>
    </div>
  );
}

// ── En-tête festif : « AniMood 2026 » + les trois sections en gros onglets ─────────────────────────────────────────────────────────────────────
// Îlot sombre (data-keep-bright) : même rendu en thème clair et sombre. `inert` pendant le choix d'un animé (le panneau de choix recouvre le contenu).
const HERO_BG = [
  "radial-gradient(260px 130px at 6% -12%, rgba(251,191,36,0.42), transparent 70%)",
  "radial-gradient(300px 150px at 98% 0%, rgba(var(--ac-e879f9),0.3), transparent 70%)",
  "radial-gradient(circle at 24% 62%, rgba(255,255,255,0.6) 0 1px, transparent 1.6px)",
  "radial-gradient(circle at 58% 30%, rgba(251,191,36,0.7) 0 1.4px, transparent 2.2px)",
  "radial-gradient(circle at 80% 70%, rgba(var(--ac-a78bfa),0.7) 0 1.4px, transparent 2.2px)",
  "radial-gradient(circle at 41% 85%, rgba(var(--ac-e879f9),0.6) 0 1.2px, transparent 2px)",
  "linear-gradient(135deg, #1b1040 0%, #2c1464 48%, #170a38 100%)",
].join(", ");

function HubTabs({ tabs, active, onChange, label }) {
  const refs = useRef({});
  const onKeyDown = (e, i) => {                          // flèches / Début / Fin : on passe d'un onglet à l'autre (motif ARIA des onglets)
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if(next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} data-testid="awards-tabs"
      style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, gap: 8, padding: "0 14px 14px" }}>
      {tabs.map((tab, i) => {
        const on = tab.id === active;
        return (
          <button key={tab.id} ref={el => { refs.current[tab.id] = el; }} type="button" role="tab" id={`awards-tab-${tab.id}`} aria-selected={on} aria-controls={`awards-pane-${tab.id}`}
            tabIndex={on ? 0 : -1} data-active={on ? "true" : undefined} data-testid={`awards-tab-${tab.id}`}
            onClick={() => onChange(tab.id)} onKeyDown={e => onKeyDown(e, i)}
            className="flex flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-2.5"
            style={{ minHeight: 54, padding: "6px 6px", borderRadius: 16, cursor: "pointer", fontSize: 14, fontWeight: 900, lineHeight: 1.15, transition: "background 0.2s, box-shadow 0.2s, transform 0.2s",
              color: on ? "#1f1300" : "#ede9fe",
              border: on ? "1px solid rgba(255,247,214,0.9)" : "1px solid rgba(255,255,255,0.22)",
              background: on ? "linear-gradient(135deg,#fde68a 0%,#fbbf24 48%,#f59e0b 100%)" : "rgba(255,255,255,0.08)",
              boxShadow: on ? "0 8px 24px rgba(251,191,36,0.45), inset 0 1px 0 rgba(255,255,255,0.65)" : "inset 0 1px 0 rgba(255,255,255,0.08)",
              transform: on ? "translateY(-1px)" : "none" }}>
            <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>{tab.emoji}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function HubHero({ t, tabs, active, onChange, inert }) {
  return (
    <div data-keep-bright="" data-testid="awards-hero" inert={inert ? true : undefined}
      style={{ position: "relative", flexShrink: 0, overflow: "hidden", color: "#f5f3ff", background: HERO_BG, borderBottom: "1px solid rgba(251,191,36,0.4)" }}>
      <span aria-hidden="true" className="awards-twinkle" style={{ position: "absolute", top: 12, left: "46%", fontSize: 14, color: "#fde68a", pointerEvents: "none" }}>✦</span>
      <span aria-hidden="true" className="awards-twinkle" style={{ position: "absolute", top: 40, left: "68%", fontSize: 10, color: "#f0abfc", pointerEvents: "none", animationDelay: "1.1s" }}>✦</span>
      <div style={{ position: "relative", padding: "14px 60px 12px 18px" }}>
        <h2 style={{ margin: 0, display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "0 10px" }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase", color: "#fbbf24" }}><span aria-hidden="true">🎆 </span>AniMood</span>
          <span data-testid="awards-year" style={{ fontSize: 42, fontWeight: 900, lineHeight: 1, letterSpacing: -1.5, color: "#fbbf24",
            backgroundImage: "linear-gradient(180deg,#fff7d6 0%,#fde68a 35%,#f59e0b 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 2px 14px rgba(251,191,36,0.45))" }}>2026</span>
        </h2>
        <p className="hidden sm:block" style={{ margin: "5px 0 0", fontSize: 12, lineHeight: 1.45, color: "rgba(245,243,255,0.74)" }}>{t.hubSubtitle}</p>
      </div>
      <HubTabs tabs={tabs} active={active} onChange={onChange} label={t.hubTabs} />
    </div>
  );
}

export function AwardsHub({ onClose, initialTab = "top3" }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = awardsText(lang);
  const data = useAwardsData(myUsername);
  const [tab, setTab] = useState(initialTab);
  const [visited, setVisited] = useState(() => new Set([initialTab]));
  const [picker, setPicker] = useState(null);                  // { title, taken, resolve }

  const changeTab = (id) => { setTab(id); setVisited(v => (v.has(id) ? v : new Set(v).add(id))); };
  const pickAnime = useCallback((opts) => new Promise((resolve) => setPicker({ ...opts, resolve })), []);

  const tabs = [
    { id: "top3", label: t.tabTop3, emoji: "🏆" },
    { id: "tierlist", label: t.tabTierlist, emoji: "📊" },
    { id: "grid", label: t.tabGrid, emoji: "🧩" },
  ];
  // Les onglets déjà visités restent montés (masqués) : rien n'est perdu en changeant d'onglet
  const pane = (id, node, scroll = true) => visited.has(id) && (
    <div key={id} role="tabpanel" id={`awards-pane-${id}`} aria-labelledby={`awards-tab-${id}`} hidden={tab !== id} data-testid={`pane-${id}`}
      style={{ display: tab === id ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, overflowY: scroll ? "auto" : "hidden" }}>{node}</div>
  );

  return (
    <GameModal onClose={onClose} festive maxWidth="1000px" fullHeight
      hero={<HubHero t={t} tabs={tabs} active={tab} onChange={changeTab} inert={!!picker} />}>
      {() => (
        <div data-testid="awards-hub" style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* `inert` : pendant le choix d'un animé, le contenu en dessous n'est plus atteignable (ni au clavier, ni par les lecteurs d'écran) */}
          <div inert={picker ? true : undefined} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <FavouriteStrip data={data} t={t} />
            {pane("top3", <Top3Panel data={data} pickAnime={pickAnime} />)}
            {pane("tierlist", <TierlistStudio awards />, false)}
            {pane("grid", <GridPanel pickAnime={pickAnime} />)}
          </div>
          {picker && (
            <AnimePicker2026 title={picker.title} taken={picker.taken}
              onPick={(row) => picker.resolve(row)}
              onClose={() => { picker.resolve(null); setPicker(null); }} />
          )}
        </div>
      )}
    </GameModal>
  );
}
