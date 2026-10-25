// ─── Onglet « Listes » du profil — appli de bureau ──────────────────────────────────────────────────────
// Chaque liste est une carte HUD avec un éventail d'affiches ; les fenêtres d'ouverture restent celles de ProfileView.
import { useLang } from "../context/useLang.js";
import { BookmarkIcon } from "../components/ui.jsx";
import { HudCard, HudTitle } from "./profileHud.jsx";
import { useHudCss } from "./hudCss.js";

const posterOf = (a) => a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url || a?.image_url || a?.large_image;

// Éventail d'affiches qui se chevauchent
function Fan({ ids, animeCache, color }) {
  const shown = ids.slice(0, 5);
  if (!shown.length) {
    return <div style={{ width: 54, height: 78, borderRadius: 8, border: "2px dashed rgba(139,92,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "rgba(167,139,250,.4)" }}>＋</div>;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", paddingLeft: 6 }}>
      {shown.map((id, i) => {
        const img = posterOf(animeCache[id]);
        return (
          <div key={id} style={{
            width: 54, height: 78, borderRadius: 8, overflow: "hidden", flexShrink: 0, marginLeft: i ? -22 : 0,
            transform: `rotate(${(i - (shown.length - 1) / 2) * 3.2}deg)`, transformOrigin: "bottom center",
            zIndex: shown.length - i, background: "rgba(139,92,246,0.12)",
            border: "1px solid rgba(255,255,255,.14)", boxShadow: `0 6px 14px rgba(0,0,0,.45), 0 0 14px ${color}22`,
          }}>
            {img && <img loading="lazy" decoding="async" src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
          </div>
        );
      })}
    </div>
  );
}

function Tile({ icon, title, subtitle, badge, ids, animeCache, color, onClick, delay }) {
  return (
    <HudCard onClick={onClick} delay={delay} corners={["tl", "br"]} pad="16px 18px"
      style={{ cursor: "pointer", transition: "border-color .15s, box-shadow .15s, transform .15s" }}
      onMouseEnter={e => { const c = e.currentTarget; c.style.borderColor = `${color}88`; c.style.boxShadow = `0 0 22px ${color}33`; c.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { const c = e.currentTarget; c.style.borderColor = "rgba(139,92,246,0.18)"; c.style.boxShadow = "none"; c.style.transform = "none"; }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Fan ids={ids} animeCache={animeCache} color={color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-flex", filter: `drop-shadow(0 0 5px ${color}aa)` }}>{icon}</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
            {badge && <span style={{ fontSize: 9, fontWeight: 800, color: "#c4b5fd", background: "rgba(139,92,246,.18)", border: "1px solid rgba(139,92,246,.35)", borderRadius: 999, padding: "1px 7px" }}>{badge}</span>}
          </div>
          <div style={{ fontSize: 11, color: "rgba(148,163,184,.8)", marginTop: 4 }}>{subtitle}</div>
        </div>
        <span style={{ fontSize: 20, color: "rgba(167,139,250,.6)" }}>›</span>
      </div>
    </HudCard>
  );
}

export function ProfileListsDesktop({ t, watchlistIds, highlights, customLists, pinnedListId, animeCache, onOpenList, creatingList, setCreatingList, newListName, setNewListName, createList }) {
  useHudCss();
  const { lang } = useLang();
  const en = lang === "en";
  const total = 2 + customLists.length;
  return (
    <div>
      <HudTitle right={`${total} ${en ? "lists" : "listes"}`}>{en ? "My lists" : "Mes listes"}</HudTitle>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <Tile delay={0} color="#22c55e" icon={<BookmarkIcon size={15} />} title="Watchlist" subtitle={t.animeCount(watchlistIds.length)}
          ids={watchlistIds} animeCache={animeCache} onClick={() => onOpenList("watchlist")} />
        <Tile delay={60} color="#ef4444"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>}
          title="Highlights" subtitle={`${t.animeCount(highlights.length)} · ${t.highlightsSuffix}`}
          ids={highlights} animeCache={animeCache} onClick={() => onOpenList("highlights")} />
        {customLists.map((list, i) => (
          <Tile key={list.id} delay={120 + i * 50} color="#a78bfa" icon={<span style={{ fontSize: 14 }}>📋</span>} title={list.name}
            subtitle={t.animeCount(list.animeIds.length)} badge={pinnedListId === list.id ? t.pinnedBadge : null}
            ids={list.animeIds} animeCache={animeCache} onClick={() => onOpenList(list.id)} />
        ))}
        {/* Créer une liste */}
        {creatingList ? (
          <HudCard pad="16px 18px" style={{ display: "flex", alignItems: "center", gap: 10, borderStyle: "dashed", borderColor: "rgba(167,139,250,.5)" }}>
            <input autoFocus value={newListName} onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createList(); if (e.key === "Escape") { setCreatingList(false); setNewListName(""); } }}
              placeholder={t.createListPlaceholder}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text-1)", fontSize: 13 }} />
            <button onClick={createList} style={{ borderRadius: 10, background: "linear-gradient(135deg,#7c3aed,#c026d3)", color: "#fff", fontSize: 11, fontWeight: 800, padding: "6px 14px", border: "none", cursor: "pointer" }}>{t.createBtn}</button>
            <button onClick={() => { setCreatingList(false); setNewListName(""); }} style={{ background: "none", border: "none", color: "rgba(148,163,184,.7)", cursor: "pointer", fontSize: 14 }}>✕</button>
          </HudCard>
        ) : (
          <button type="button" onClick={() => setCreatingList(true)}
            style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer", padding: "16px 18px", borderRadius: 16, border: "1px dashed rgba(139,92,246,.35)", background: "rgba(139,92,246,.04)", transition: "background .15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,92,246,.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(139,92,246,.04)"; }}>
            <span style={{ fontSize: 22, color: "#c4b5fd" }}>＋</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-2)" }}>{t.createListTitle}</div>
              <div style={{ fontSize: 10, color: "rgba(148,163,184,.65)" }}>{t.createListDesc}</div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
