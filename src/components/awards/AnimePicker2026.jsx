// ─── Sélecteur d'animé de 2026 ───────────────────────────────────────────────────────────────────────────────────────────────────
// Panneau posé PAR-DESSUS le contenu de la fenêtre AniMood 2026 (position absolue, pas une 2e fenêtre : la fenêtre de jeu a une
// transformation CSS qui enfermerait une couche « fixed »). Le bouton « retour » de l'appareil et Échap ferment le sélecteur seul,
// sans fermer toute la fenêtre (useModalBack empile les fenêtres : seule la dernière réagit).
// Ne propose que des animés de 2026, tous formats confondus ; le même animé peut être choisi plusieurs fois par l'appelant.
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLang } from "../../context/useLang.js";
import { useApp } from "../../context/useApp.js";
import { useModalBack } from "../../hooks/useModalBack.js";
import { awardsText } from "../../constants/awardsI18n.js";
import { searchAnime2026, fetchMyAnime2026 } from "../../api/awards2026.js";
import { FORMAT_GROUPS, formatGroupOf, animeName } from "../../utils/awards2026.js";
import { Poster } from "../Poster.jsx";

const FORMAT_LABEL = { all: "formatAll", tv: "formatTv", movie: "formatMovie", ova: "formatOva", ona: "formatOna" };
const PAGE_SIZE = 36;

const chip = (active) => ({
  minHeight: 32, padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  border: `1px solid ${active ? "rgb(var(--ac-a78bfa))" : "rgba(var(--ac-8b5cf6),0.22)"}`,
  background: active ? "rgba(var(--ac-8b5cf6),0.28)" : "rgba(var(--ac-8b5cf6),0.06)",
  color: active ? "rgb(var(--ac-ddd6fe))" : "var(--text-3)",
});

/**
 * `taken` (facultatif) : Map(mal_id → rang 1..3) des animés déjà choisis ailleurs ; ils restent choisissables (l'appelant échange les places).
 * `onPick(row)` : appelé une seule fois avec la ligne du catalogue, dès le clic. `onClose()` : appelé ensuite, quand la fenêtre est vraiment fermée
 * (après un choix comme après « ← », Échap ou le bouton « retour » de l'appareil) — l'entrée d'historique du sélecteur est toujours retirée.
 */
export function AnimePicker2026({ title, onPick, onClose, taken }) {
  const { lang } = useLang();
  const { me } = useApp();
  const t = awardsText(lang);
  const requestClose = useModalBack(onClose, undefined, { escape: true });
  const [closing, setClosing] = useState(false);          // choix fait : le panneau s'efface pendant que l'historique est refermé
  const choose = (row) => {
    if(closing) return;
    setClosing(true);
    onPick(row);
    requestClose(true);
  };

  const [q, setQ] = useState("");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState("popular");
  const [mineOnly, setMineOnly] = useState(false);
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mineRows, setMineRows] = useState(null);        // mes animés de 2026 (chargés une fois, au premier clic sur « Ma liste »)
  const reqId = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  // Recherche serveur (hors « Ma liste ») : légère attente pendant la frappe, réponses périmées ignorées
  useEffect(() => {
    if(mineOnly) return undefined;
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      setLoading(true); setError(false);
      try {
        const res = await searchAnime2026({ q, format, sort, limit: PAGE_SIZE, offset: 0 });
        if(id !== reqId.current) return;
        setRows(res.rows); setNext(res.next); setHasMore(res.hasMore);
      } catch { if(id === reqId.current) { setRows([]); setError(true); } }
      if(id === reqId.current) setLoading(false);
    }, q.trim().length >= 2 ? 280 : 0);
    return () => clearTimeout(timer);
  }, [q, format, sort, mineOnly]);

  const loadMore = async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await searchAnime2026({ q, format, sort, limit: PAGE_SIZE, offset: next });
      if(id !== reqId.current) return;
      setRows(prev => { const seen = new Set(prev.map(r => r.mal_id)); return [...prev, ...res.rows.filter(r => !seen.has(r.mal_id))]; });
      setNext(res.next); setHasMore(res.hasMore);
    } catch { /* on garde ce qui est déjà affiché */ }
    if(id === reqId.current) setLoading(false);
  };

  // « Ma liste » : mes animés de 2026, filtrés ici (texte, format, tri)
  const toggleMine = useCallback(async () => {
    const on = !mineOnly;
    setMineOnly(on);
    if(on && mineRows === null) {
      setLoading(true);
      try { setMineRows(await fetchMyAnime2026(me)); } catch { setMineRows([]); }
      setLoading(false);
    }
  }, [mineOnly, mineRows, me]);

  const shown = useMemo(() => {
    if(!mineOnly) return rows;
    const text = q.trim().toLowerCase();
    const group = FORMAT_GROUPS.find(g => g.id === format);
    return (mineRows || [])
      .filter(r => (!text || animeName(r).toLowerCase().includes(text) || String(r.title || "").toLowerCase().includes(text)) && (!group?.types || formatGroupOf(r.type) === group.id))
      .sort((a, b) => sort === "score" ? (b.score || 0) - (a.score || 0) : (a.popularity || 9e9) - (b.popularity || 9e9));
  }, [mineOnly, rows, mineRows, q, format, sort]);

  const empty = !loading && !error && shown.length === 0;

  return (
    <div role="dialog" aria-modal="true" aria-label={title || t.pickerTitle} data-testid="awards-picker"
      style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", minHeight: 0,
        background: "linear-gradient(var(--surface-1-strong), var(--surface-1-strong)), var(--page-bg)",      /* opaque : la fenêtre en dessous ne doit pas transparaître */
        opacity: closing ? 0 : 1, pointerEvents: closing ? "none" : "auto", transition: "opacity .12s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid rgba(var(--ac-8b5cf6),0.16)", flexShrink: 0 }}>
        <button type="button" onClick={() => requestClose()} aria-label={t.pickerClose} title={t.pickerClose} data-testid="awards-picker-close"
          style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(var(--ac-8b5cf6),0.25)", background: "rgba(var(--ac-8b5cf6),0.08)", color: "var(--text-2)", cursor: "pointer", fontSize: 17, flexShrink: 0 }}>←</button>
        <div style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title || t.pickerTitle}</div>
      </div>

      <div style={{ padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t.pickerSearch} aria-label={t.pickerSearch} data-testid="awards-picker-search"
          style={{ width: "100%", boxSizing: "border-box", minHeight: 40, padding: "8px 12px", borderRadius: 10, fontSize: 13, color: "var(--text-1)",
            border: "1px solid rgba(var(--ac-8b5cf6),0.28)", background: "rgba(var(--fg-rgb),0.05)", outline: "none" }} />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {FORMAT_GROUPS.map(g => (
            <button key={g.id} type="button" onClick={() => setFormat(g.id)} style={chip(format === g.id)} aria-pressed={format === g.id}>{t[FORMAT_LABEL[g.id]]}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          <button type="button" onClick={toggleMine} style={chip(mineOnly)} aria-pressed={mineOnly} data-testid="awards-picker-mine">📚 {t.pickerMine}</button>
          <span aria-hidden="true" style={{ width: 1, background: "rgba(var(--ac-8b5cf6),0.2)", flexShrink: 0 }} />
          <button type="button" onClick={() => setSort("popular")} style={chip(sort === "popular")} aria-pressed={sort === "popular"}>{t.sortPopular}</button>
          <button type="button" onClick={() => setSort("score")} style={chip(sort === "score")} aria-pressed={sort === "score"}>{t.sortScore}</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 12px 14px" }}>
        {error && <div style={{ padding: "26px 0", textAlign: "center", fontSize: 12, color: "var(--text-4)" }}>{t.resultsError}</div>}
        {empty && <div style={{ padding: "26px 0", textAlign: "center", fontSize: 12, color: "var(--text-4)" }}>{mineOnly ? t.pickerMineNone : t.pickerNone}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 10 }}>
          {shown.map(a => {
            const rank = taken?.get(a.mal_id);
            return (
              <button key={a.mal_id} type="button" onClick={() => choose(a)} data-testid="awards-picker-item" data-id={a.mal_id} title={animeName(a)}
                style={{ display: "flex", flexDirection: "column", gap: 5, padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left", minWidth: 0 }}>
                <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "2 / 3", borderRadius: 10, overflow: "hidden", background: "rgb(var(--ac-1a1030))",
                  border: rank ? "2px solid #fbbf24" : "1px solid rgba(var(--fg-rgb),0.14)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
                  <Poster anime={a} name={animeName(a)} w={92} />
                  {a.type && <span style={{ position: "absolute", left: 4, top: 4, padding: "1px 6px", borderRadius: 6, fontSize: 9, fontWeight: 800, background: "rgba(0,0,0,0.72)", color: "#e9e5ff" }}>{a.type}</span>}
                  {rank ? <span style={{ position: "absolute", right: 4, bottom: 4, padding: "1px 6px", borderRadius: 6, fontSize: 9, fontWeight: 900, background: "#fbbf24", color: "#1f1300" }}>{t.alreadyPicked(rank)}</span> : null}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.25, color: "var(--text-2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{animeName(a)}</span>
              </button>
            );
          })}
        </div>
        {loading && <div style={{ padding: "16px 0", textAlign: "center", fontSize: 11, color: "var(--text-4)" }}>{t.loading}</div>}
        {!mineOnly && hasMore && !loading && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 14 }}>
            <button type="button" onClick={loadMore} data-testid="awards-picker-more" style={{ ...chip(false), padding: "8px 20px" }}>{t.pickerMore}</button>
          </div>
        )}
      </div>
    </div>
  );
}
