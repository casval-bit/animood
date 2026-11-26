// ─── AniMood 2026 : la fenêtre (favori de la communauté + Top 3 / Tierlist / Grille) ─────────────────────────────────────────────────────
// Ouverte depuis le bloc de fin d'année (sous l'en-tête) et depuis les Jeux. Elle reste montée pour les 3 onglets une fois visités :
// changer d'onglet ne perd aucune modification en cours (la tierlist enregistre avec un léger délai).
// Le sélecteur d'animé (AnimePicker2026) est un panneau par-dessus le contenu : `pickAnime()` l'ouvre et renvoie l'animé choisi (ou null).
import { useState, useCallback } from "react";
import { GameModal } from "../Modal.jsx";
import { TabBar } from "../ui.jsx";
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
    <div key={id} role="tabpanel" hidden={tab !== id} data-testid={`pane-${id}`}
      style={{ display: tab === id ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, overflowY: scroll ? "auto" : "hidden" }}>{node}</div>
  );

  return (
    <GameModal onClose={onClose} title={`🎆 ${t.hubTitle}`} subtitle={t.hubSubtitle} maxWidth="1000px" fullHeight>
      {() => (
        <div data-testid="awards-hub" style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* `inert` : pendant le choix d'un animé, le contenu en dessous n'est plus atteignable (ni au clavier, ni par les lecteurs d'écran) */}
          <div inert={picker ? true : undefined} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <FavouriteStrip data={data} t={t} />
            <TabBar tabs={tabs} active={tab} onChange={changeTab} scrollable className="shrink-0 px-2" />
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
