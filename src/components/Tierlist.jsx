// ─── TIERLIST STUDIO — site web ET appli de bureau ───────────────────────────────────────────────────────────
// Sources : saison en cours, une année au choix, « ma liste » (notés / terminés / watchlist), ou une liste perso.
// Glisser-déposer (avec position d'insertion) ou toucher une affiche puis un rang, annuler (Ctrl+Z), auto-classement par mes notes
// ou par la note communautaire, rangs personnalisables (nom, couleur, ordre), taille des affiches, sauvegarde automatique par source,
// export PNG fiable (les images passent par un proxy CORS le temps de l'export) et copie dans le presse-papiers.
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { sb } from "../api/supabase.js";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { isAdultAnime } from "../utils/adultContent.js";
import { isTvShort } from "../utils/franchise.js";

const PALETTE = ["#ef4444", "#f97316", "#fbbf24", "#22c55e", "#06b6d4", "#6366f1", "#a78bfa", "#f472b6", "#94a3b8", "#14b8a6"];
const DEFAULT_TIERS = [
  { id: "S", label: "S", color: "#ef4444" },
  { id: "A", label: "A", color: "#f97316" },
  { id: "B", label: "B", color: "#fbbf24" },
  { id: "C", label: "C", color: "#22c55e" },
  { id: "D", label: "D", color: "#06b6d4" },
  { id: "F", label: "F", color: "#6366f1" },
];
const SELECT = "mal_id,title,title_en,image_url,large_image,score,year,type,rating,themes,genres,duration";
const SIZES = { S: { w: 46, h: 65 }, M: { w: 62, h: 88 }, L: { w: 84, h: 119 } };
const HUD_BG = "linear-gradient(135deg, rgba(10,6,30,0.9) 0%, rgba(15,9,40,0.8) 100%)";
const HUD_BORDER = "1px solid rgba(139,92,246,0.2)";

const freshBoard = () => ({ tiers: DEFAULT_TIERS.map(t => ({ ...t, items: [] })), pool: [] });
const light = (r) => ({ mal_id: r.mal_id, title: r.title, title_en: r.title_en, image_url: r.image_url, large_image: r.large_image, score: r.score, year: r.year, type: r.type });
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein ou bloqué : tant pis */ } };
const proxied = (src, w = 260) => `https://images.weserv.nl/?url=${encodeURIComponent(String(src).replace(/^https?:\/\//, ""))}&w=${w}&output=jpg`;

// ── Affiche : essaie image_url puis large_image ; titre écrit sur la case si rien ne charge ──────────────────
function Poster({ anime, name, w }) {
  const sources = [anime.image_url, anime.large_image].filter(Boolean);
  const [i, setI] = useState(0);
  const src = sources[i];
  if(!src) return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
      fontSize: Math.max(7, w / 8), lineHeight: 1.1, padding: 2, color: "rgba(255,255,255,.7)", background: "linear-gradient(160deg,#2a1850,#150c30)", overflow: "hidden" }}>{name}</div>
  );
  return <img key={i} src={src} data-raw={src} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false}
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
    onError={() => setI(n => n + 1)} />;
}

// Déplace une affiche (retire de la source, insère à `index` dans la cible)
function applyMove(b, anime, from, to, index) {
  const listOf = (bd, id) => id === "pool" ? bd.pool : bd.tiers.find(t => t.id === id)?.items;
  if(!listOf(b, to) && to !== "pool") return b;
  const fromList = listOf(b, from) || [];
  const fromIdx = fromList.findIndex(x => x.mal_id === anime.mal_id);
  let at = index == null ? Infinity : index;
  if(from === to && fromIdx >= 0 && fromIdx < at) at -= 1; // l'élément retiré décale les suivants
  const strip = (arr) => arr.filter(x => x.mal_id !== anime.mal_id);
  const put = (arr) => { const a = strip(arr); const pos = Math.max(0, Math.min(at, a.length)); a.splice(pos, 0, anime); return a; };
  return {
    pool: from === "pool" || to === "pool" ? (to === "pool" ? put(b.pool) : strip(b.pool)) : b.pool,
    tiers: b.tiers.map(t => t.id === to ? { ...t, items: put(t.items) } : t.id === from ? { ...t, items: strip(t.items) } : t),
  };
}

export function TierlistStudio() {
  const { me } = useApp();
  const { lang } = useLang();
  const en = lang === "en";
  const L = en ? {
    season: "Season", year: "Year", mine: "My list", custom: "Custom",
    rated: "Rated", completed: "Completed", watchlist: "Watchlist", all: "All",
    undo: "Undo", reset: "Reset", reload: "Reload", autoMine: "Auto · my ratings", autoMal: "Auto · community score",
    png: "Save PNG", copy: "Copy", copied: "Copied ✓", exporting: "Exporting…", exportError: "Export failed — take a screenshot instead.",
    addTier: "+ Tier", search: "Search an anime…", filter: "Filter…", pool: (n) => `${n} left`, placed: (a, b) => `${a} / ${b} ranked`,
    titlePh: "Name your tierlist…", hint: "Drag posters into a tier (or tap a poster, then a tier). Click a tier letter to edit it.",
    empty: "Nothing here yet.", emptyCustom: "Search an anime above to add it.", emptyMine: "Rate or complete some anime to fill this list.",
    loading: "Loading…", sortScore: "Score", sortTitle: "A–Z", sortMine: "My rating", rename: "Name", delete: "Delete tier", done: "OK", sizeLbl: "Size",
    tapSel: "Selected — tap a tier", my: "My rating",
  } : {
    season: "Saison", year: "Année", mine: "Ma liste", custom: "Perso",
    rated: "Notés", completed: "Terminés", watchlist: "À voir", all: "Tous",
    undo: "Annuler", reset: "Vider", reload: "Recharger", autoMine: "Auto · mes notes", autoMal: "Auto · note communauté",
    png: "Enregistrer en PNG", copy: "Copier", copied: "Copié ✓", exporting: "Export…", exportError: "Export impossible — fais une capture d'écran à la place.",
    addTier: "+ Rang", search: "Chercher un animé…", filter: "Filtrer…", pool: (n) => `${n} restant${n > 1 ? "s" : ""}`, placed: (a, b) => `${a} / ${b} classés`,
    titlePh: "Nomme ta tierlist…", hint: "Glisse les affiches dans un rang (ou touche une affiche puis un rang). Clique sur la lettre d'un rang pour le modifier.",
    empty: "Rien ici pour l'instant.", emptyCustom: "Cherche un animé ci-dessus pour l'ajouter.", emptyMine: "Note ou termine des animés pour remplir cette liste.",
    loading: "Chargement…", sortScore: "Note", sortTitle: "A–Z", sortMine: "Ma note", rename: "Nom", delete: "Supprimer le rang", done: "OK", sizeLbl: "Taille",
    tapSel: "Sélectionnée — touche un rang", my: "Ma note",
  };

  const thisYear = new Date().getFullYear();
  const [source, setSource] = useState("season");
  const [year, setYear] = useState(thisYear);
  const [mineFilter, setMineFilter] = useState("rated");
  const [board, setBoard] = useState(freshBoard);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "S" : "M"));
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 760);
  const [selected, setSelected] = useState(null);      // {anime, from} — touche : affiche puis rang
  const [dragging, setDragging] = useState(null);
  const [dropAt, setDropAt] = useState(null);          // {to, index} — repère d'insertion
  const [editTier, setEditTier] = useState(null);
  const [hover, setHover] = useState(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("score");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(null);              // "png" | "copy" | "copied"
  const [canUndo, setCanUndo] = useState(false);
  const boardRef = useRef(null);
  const history = useRef([]);
  const loaded = useRef(false);

  const ratings = useMemo(() => me?.ratings || {}, [me?.ratings]);
  const statuses = useMemo(() => me?.statuses || {}, [me?.statuses]);
  const myScore = useCallback((a) => ratings[a.mal_id]?.score ?? null, [ratings]);
  const key = `${source}:${source === "year" ? year : ""}:${source === "mine" ? mineFilter : ""}`;

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const commit = useCallback((fn) => {
    setBoard(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      if(next === prev) return prev;
      history.current.push(prev);
      if(history.current.length > 60) history.current.shift();
      return next;
    });
    setCanUndo(true);
  }, []);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if(prev) setBoard(prev);
    setCanUndo(history.current.length > 0);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || "")) { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  // ── Chargement d'une source (ou reprise de la sauvegarde automatique) ──
  const fetchRows = useCallback(async () => {
    if(source === "custom") return [];
    let rows;
    if(source === "season") {
      rows = await sb.query(`anime_cache?type=eq.TV&status=eq.Currently%20Airing&select=${SELECT}&order=score.desc.nullslast&limit=150`).catch(() => []);
    } else if(source === "year") {
      rows = await sb.query(`anime_cache?type=eq.TV&year=eq.${year}&select=${SELECT}&order=score.desc.nullslast&limit=250`).catch(() => []);
    } else {
      const ids = new Set();
      const add = (id) => { const n = Number(id); if(n) ids.add(n); };
      if(mineFilter === "rated" || mineFilter === "all") Object.keys(ratings).forEach(add);
      if(mineFilter === "completed" || mineFilter === "all") { (me?.watched || []).forEach(add); Object.entries(statuses).forEach(([id, s]) => { if(s === "completed") add(id); }); }
      if(mineFilter === "watchlist" || mineFilter === "all") Object.entries(statuses).forEach(([id, s]) => { if(s === "watchlist") add(id); });
      const list = [...ids];
      const parts = await Promise.all(Array.from({ length: Math.ceil(list.length / 150) }, (_, i) =>
        sb.query(`anime_cache?mal_id=in.(${list.slice(i * 150, i * 150 + 150).join(",")})&select=${SELECT}`).catch(() => [])));
      rows = parts.flat();
    }
    const mineIds = new Set(Object.keys(statuses).map(Number));
    return (rows || []).filter(r => source === "mine" || ((r.image_url || r.large_image) && !isTvShort(r) && (!isAdultAnime(r) || mineIds.has(r.mal_id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, year, mineFilter, me?.ratings, me?.statuses, me?.watched]);

  const load = useCallback(async (fresh) => {
    loaded.current = false;
    setLoading(true); setSelected(null); setEditTier(null); setFilter(""); setResults([]);
    history.current = []; setCanUndo(false);
    const saved = !fresh ? lsGet(`animood_tierlist_v2:${key}`) : null;
    if(saved?.board?.tiers?.length) {
      setBoard(saved.board); setTitle(saved.title || ""); setLoading(false); loaded.current = true;
      return;
    }
    const rows = await fetchRows();
    const b = freshBoard();
    b.pool = rows.map(light);
    setBoard(b); setTitle(""); setLoading(false); loaded.current = true;
  }, [key, fetchRows]);
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [key]);

  useEffect(() => {
    if(!loaded.current) return;
    const id = setTimeout(() => lsSet(`animood_tierlist_v2:${key}`, { board, title }), 500);
    return () => clearTimeout(id);
  }, [board, title, key]);

  // ── Recherche (mode perso) ──
  const searching = source === "custom" && filter.trim().length >= 2;
  useEffect(() => {
    if(!searching) return;
    const enc = encodeURIComponent(filter.trim().replace(/[*,()]/g, " "));
    const id = setTimeout(async () => {
      const rows = await sb.query(`anime_cache?or=(title.ilike.*${enc}*,title_en.ilike.*${enc}*)&select=${SELECT}&order=score.desc.nullslast&limit=14`).catch(() => []);
      setResults((rows || []).map(light));
    }, 300);
    return () => clearTimeout(id);
  }, [filter, searching]);

  const placedIds = new Set([...board.pool, ...board.tiers.flatMap(t => t.items)].map(a => a.mal_id));
  const totalCount = placedIds.size;
  const rankedCount = board.tiers.reduce((n, t) => n + t.items.length, 0);

  const addToPool = (a) => { if(!placedIds.has(a.mal_id)) commit(b => ({ ...b, pool: [...b.pool, a] })); setFilter(""); setResults([]); };

  const move = (anime, from, to, index) => commit(b => applyMove(b, anime, from, to, index));
  const dropOn = (to, index) => {
    const m = dragging || selected;
    if(m) move(m.anime, m.from, to, index);
    setDragging(null); setSelected(null); setDropAt(null);
  };

  // ── Auto-classement ──
  const tierIndexFor = (score, n) => {
    if(n === 6) return score >= 9 ? 0 : score >= 8 ? 1 : score >= 7 ? 2 : score >= 6 ? 3 : score >= 5 ? 4 : 5;
    return Math.max(0, Math.min(n - 1, Math.floor(((10 - score) / 6) * n)));
  };
  const autoPlace = (useMine) => commit(b => {
    const next = { pool: [], tiers: b.tiers.map(t => ({ ...t, items: [...t.items] })) };
    b.pool.forEach(a => {
      const s = useMine ? myScore(a) : a.score;
      if(s == null || s <= 0) next.pool.push(a);
      else next.tiers[tierIndexFor(s, next.tiers.length)].items.push(a);
    });
    next.tiers.forEach(t => t.items.sort((x, y) => (useMine ? (myScore(y) ?? 0) - (myScore(x) ?? 0) : 0) || (y.score || 0) - (x.score || 0)));
    return next;
  });
  const resetBoard = () => commit(b => ({ tiers: b.tiers.map(t => ({ ...t, items: [] })), pool: [...b.pool, ...b.tiers.flatMap(t => t.items)] }));

  // ── Rangs ──
  const patchTier = (id, patch) => commit(b => ({ ...b, tiers: b.tiers.map(t => t.id === id ? { ...t, ...patch } : t) }));
  const moveTier = (id, dir) => commit(b => {
    const i = b.tiers.findIndex(t => t.id === id), j = i + dir;
    if(i < 0 || j < 0 || j >= b.tiers.length) return b;
    const tiers = [...b.tiers]; [tiers[i], tiers[j]] = [tiers[j], tiers[i]];
    return { ...b, tiers };
  });
  const deleteTier = (id) => { commit(b => {
    const t = b.tiers.find(x => x.id === id);
    if(!t || b.tiers.length <= 1) return b;
    return { tiers: b.tiers.filter(x => x.id !== id), pool: [...b.pool, ...t.items] };
  }); setEditTier(null); };
  const addTier = () => commit(b => ({ ...b, tiers: [...b.tiers, { id: `t${Date.now()}`, label: "?", color: PALETTE[b.tiers.length % PALETTE.length], items: [] }] }));

  // ── Export PNG / presse-papiers : les affiches passent par un proxy CORS (data URL) pour ne pas être « bloquées » ──
  const renderCanvas = async () => {
    const { default: html2canvas } = await import("html2canvas");
    const srcs = [...new Set([...boardRef.current.querySelectorAll("img[data-raw]")].map(i => i.dataset.raw))];
    const data = {};
    await Promise.all(srcs.map(async (s) => {
      try {
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 9000);
        const r = await fetch(proxied(s), { signal: ctrl.signal }); clearTimeout(to);
        if(!r.ok) return;
        const blob = await r.blob();
        data[s] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      } catch { /* image gardée telle quelle */ }
    }));
    return html2canvas(boardRef.current, {
      backgroundColor: "#0f0a1e", scale: 2, useCORS: true, ignoreElements: (el) => el.dataset?.noExport === "1",
      onclone: (doc) => doc.querySelectorAll("img[data-raw]").forEach(img => { const d = data[img.dataset.raw]; if(d) img.src = d; }),
    });
  };
  const savePng = async () => {
    if(!boardRef.current || busy) return;
    setBusy("png");
    try {
      const canvas = await renderCanvas();
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `animood-tierlist-${(title || source).replace(/[^\w-]+/g, "_").slice(0, 40)}.png`;
      a.click();
    } catch(e) { console.error(e); alert(L.exportError); }
    setBusy(null);
  };
  const copyPng = async () => {
    if(!boardRef.current || busy) return;
    setBusy("png");
    try {
      const canvas = await renderCanvas();
      const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setBusy("copied"); setTimeout(() => setBusy(null), 1600);
    } catch(e) { console.error(e); setBusy(null); alert(L.exportError); }
  };

  // ── Rendu ──
  const { w, h } = SIZES[size];
  const nameOf = (a) => a.title_en || a.title;

  const card = (anime, from, idx) => {
    const isSel = selected?.anime.mal_id === anime.mal_id;
    const mine = myScore(anime);
    const marker = dropAt && dropAt.to === from && dropAt.index === idx;
    return (
      <div key={anime.mal_id} draggable title={`${nameOf(anime)}${anime.score ? ` · ★ ${anime.score}` : ""}${mine != null ? ` · ${L.my} ${mine}` : ""}`}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(anime.mal_id)); } catch { /* ok */ } setDragging({ anime, from }); }}
        onDragEnd={() => { setDragging(null); setDropAt(null); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const after = e.clientX > r.left + r.width / 2; setDropAt({ to: from, index: idx + (after ? 1 : 0) }); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); dropOn(from, idx + (e.clientX > r.left + r.width / 2 ? 1 : 0)); }}
        onClick={(e) => { e.stopPropagation(); setSelected(isSel ? null : { anime, from }); }}
        onMouseEnter={() => setHover(anime)} onMouseLeave={() => setHover(null)}
        style={{ position: "relative", width: w, height: h, borderRadius: 6, overflow: "visible", flexShrink: 0, cursor: "grab", background: "#1a1030",
          border: isSel ? "2px solid #c084fc" : "1px solid rgba(255,255,255,0.12)",
          boxShadow: marker ? "-3px 0 0 #e879f9" : isSel ? "0 0 12px rgba(192,132,252,0.7)" : "0 2px 6px rgba(0,0,0,.35)" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 5, overflow: "hidden" }}><Poster anime={anime} name={nameOf(anime)} w={w} /></div>
        {mine != null && size !== "S" && (
          <span style={{ position: "absolute", right: 2, bottom: 2, fontSize: 9, fontWeight: 900, padding: "0 4px", borderRadius: 6, background: "rgba(0,0,0,.75)", color: "#fbbf24" }}>{mine}</span>
        )}
      </div>
    );
  };

  const poolItems = board.pool
    .filter(a => source === "custom" || !filter.trim() || nameOf(a).toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => sort === "title" ? nameOf(a).localeCompare(nameOf(b)) : sort === "mine" ? (myScore(b) ?? -1) - (myScore(a) ?? -1) : (b.score || 0) - (a.score || 0));

  const pillBtn = (active) => ({
    padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${active ? "#a78bfa" : "rgba(139,92,246,0.2)"}`,
    background: active ? "rgba(139,92,246,0.28)" : "rgba(139,92,246,0.05)", color: active ? "#ddd6fe" : "var(--text-3)",
    boxShadow: active ? "0 0 12px rgba(139,92,246,.35)" : "none",
  });
  const toolBtn = (disabled) => ({
    padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap",
    border: "1px solid rgba(139,92,246,0.22)", background: "rgba(139,92,246,0.08)", color: disabled ? "var(--text-5)" : "#c4b5fd", opacity: disabled ? 0.5 : 1,
  });

  const pct = totalCount ? Math.round((rankedCount / totalCount) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", minHeight: 0 }}>
      {/* Sources */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "1px solid rgba(139,92,246,0.14)", flexShrink: 0 }}>
        {[["season", L.season], ["year", L.year], ["mine", L.mine], ["custom", L.custom]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSource(id)} style={pillBtn(source === id)}>{label}</button>
        ))}
        {source === "year" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, marginLeft: 4 }}>
            <button type="button" aria-label="−" onClick={() => setYear(y => Math.max(1990, y - 1))} style={toolBtn(false)}>‹</button>
            <span style={{ minWidth: 42, textAlign: "center", fontSize: 12, fontWeight: 900, color: "#ddd6fe" }}>{year}</span>
            <button type="button" aria-label="+" disabled={year >= thisYear} onClick={() => setYear(y => Math.min(thisYear, y + 1))} style={toolBtn(year >= thisYear)}>›</button>
          </span>
        )}
        {source === "mine" && (
          <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", marginLeft: 4 }}>
            {[["rated", L.rated], ["completed", L.completed], ["watchlist", L.watchlist], ["all", L.all]].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setMineFilter(id)} style={{ ...pillBtn(mineFilter === id), padding: "4px 10px", fontSize: 10 }}>{label}</button>
            ))}
          </span>
        )}
      </div>

      {/* Outils */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "7px 12px", borderBottom: "1px solid rgba(139,92,246,0.14)", flexShrink: 0 }}>
        <button type="button" onClick={undo} disabled={!canUndo} style={toolBtn(!canUndo)}>↶ {L.undo}</button>
        <button type="button" onClick={resetBoard} disabled={!rankedCount} style={toolBtn(!rankedCount)}>{L.reset}</button>
        <button type="button" onClick={() => load(true)} style={toolBtn(false)}>⟳ {L.reload}</button>
        <span style={{ width: 1, height: 18, background: "rgba(139,92,246,0.2)" }} />
        <button type="button" onClick={() => autoPlace(true)} disabled={!board.pool.some(a => myScore(a) != null)} style={toolBtn(!board.pool.some(a => myScore(a) != null))}>✨ {L.autoMine}</button>
        <button type="button" onClick={() => autoPlace(false)} disabled={!board.pool.length} style={toolBtn(!board.pool.length)}>📊 {L.autoMal}</button>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} title={L.sizeLbl}>
          {Object.keys(SIZES).map(k => <button key={k} type="button" onClick={() => setSize(k)} style={{ ...pillBtn(size === k), padding: "3px 9px", fontSize: 10 }}>{k}</button>)}
        </span>
        <button type="button" onClick={copyPng} disabled={!!busy} style={toolBtn(!!busy)}>{busy === "copied" ? L.copied : `⧉ ${L.copy}`}</button>
        <button type="button" onClick={savePng} disabled={!!busy}
          style={{ ...toolBtn(!!busy), background: "linear-gradient(135deg,#7c3aed,#c026d3)", border: "none", color: "#fff" }}>
          {busy === "png" ? L.exporting : `⬇ ${L.png}`}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Tableau */}
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: "auto" }} onClick={() => { setSelected(null); }}>
          <div ref={boardRef} style={{ padding: "12px 12px 10px", background: "#0f0a1e" }}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={L.titlePh} maxLength={60}
              style={{ width: "100%", boxSizing: "border-box", marginBottom: 10, padding: "4px 2px", background: "none", border: "none", outline: "none",
                fontSize: 20, fontWeight: 900, letterSpacing: -0.4, color: "#f5f3ff", textShadow: "0 0 18px rgba(168,85,247,.5)" }} />
            {board.tiers.map((tier, ti) => (
              <div key={tier.id} style={{ marginBottom: 4 }}>
                <div onDragOver={(e) => { e.preventDefault(); setDropAt({ to: tier.id, index: tier.items.length }); }}
                  onDrop={(e) => { e.preventDefault(); dropOn(tier.id, tier.items.length); }}
                  onClick={(e) => { if(selected) { e.stopPropagation(); dropOn(tier.id, tier.items.length); } }}
                  style={{ display: "flex", alignItems: "stretch", borderRadius: 10, overflow: "hidden", background: HUD_BG,
                    border: dropAt?.to === tier.id ? "1px solid #e879f9" : selected ? "1px dashed rgba(192,132,252,0.55)" : HUD_BORDER,
                    cursor: selected ? "pointer" : "default" }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setEditTier(editTier === tier.id ? null : tier.id); }}
                    style={{ width: narrow ? 42 : 56, minHeight: h + 12, flexShrink: 0, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${tier.color}, ${tier.color}bb)`,
                      color: "#fff", fontSize: tier.label.length > 2 ? 13 : 20, fontWeight: 900, textShadow: "0 1px 6px rgba(0,0,0,.45)",
                      boxShadow: `inset -8px 0 14px -8px rgba(0,0,0,.35), 0 0 18px ${tier.color}44`, overflow: "hidden", padding: 2 }}>{tier.label}</button>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 4, padding: 6, minHeight: h + 12, alignContent: "flex-start" }}>
                    {tier.items.map((a, i) => card(a, tier.id, i))}
                  </div>
                </div>
                {editTier === tier.id && (
                  <div data-no-export="1" onClick={e => e.stopPropagation()}
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 10px", margin: "3px 0 2px", borderRadius: 10, background: "rgba(139,92,246,0.08)", border: HUD_BORDER }}>
                    <input value={tier.label} maxLength={8} placeholder={L.rename} onChange={e => patchTier(tier.id, { label: e.target.value })}
                      style={{ width: 80, padding: "4px 8px", borderRadius: 7, fontSize: 12, fontWeight: 800, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", color: "var(--text-1)" }} />
                    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                      {PALETTE.map(c => (
                        <button key={c} type="button" aria-label={c} onClick={() => patchTier(tier.id, { color: c })}
                          style={{ width: 18, height: 18, borderRadius: "50%", border: tier.color === c ? "2px solid #fff" : "1px solid rgba(255,255,255,.25)", background: c, cursor: "pointer", padding: 0 }} />
                      ))}
                    </span>
                    <button type="button" disabled={ti === 0} onClick={() => moveTier(tier.id, -1)} style={toolBtn(ti === 0)}>↑</button>
                    <button type="button" disabled={ti === board.tiers.length - 1} onClick={() => moveTier(tier.id, 1)} style={toolBtn(ti === board.tiers.length - 1)}>↓</button>
                    <button type="button" disabled={board.tiers.length <= 1} onClick={() => deleteTier(tier.id)} style={{ ...toolBtn(board.tiers.length <= 1), color: "#fb7185" }}>🗑 {L.delete}</button>
                    <button type="button" onClick={() => setEditTier(null)} style={{ ...toolBtn(false), marginLeft: "auto" }}>{L.done}</button>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 9, letterSpacing: 2, fontWeight: 800, textTransform: "uppercase", color: "rgba(167,139,250,.55)" }}>
              <span>AniMood</span><span>{L.placed(rankedCount, totalCount)}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "6px 12px 14px" }}>
            <button type="button" onClick={addTier} style={{ ...toolBtn(false), borderStyle: "dashed" }}>{L.addTier}</button>
            <div style={{ flex: 1, minWidth: 120, height: 5, borderRadius: 99, background: "rgba(139,92,246,.14)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#7c3aed,#e879f9)", transition: "width .3s" }} />
            </div>
            <span style={{ fontSize: 10, color: "var(--text-4)", minWidth: 0 }}>{selected ? L.tapSel : hover ? `${nameOf(hover)}${hover.score ? ` · ★ ${hover.score}` : ""}` : L.hint}</span>
          </div>
        </div>

        {/* Réserve */}
        <div style={{ width: narrow ? "100%" : 260, height: narrow ? 210 : "auto", flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0,
          borderLeft: narrow ? "none" : "1px solid rgba(139,92,246,0.16)", borderTop: narrow ? "1px solid rgba(139,92,246,0.16)" : "none", background: "rgba(8,5,22,.5)" }}>
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid rgba(139,92,246,0.12)" }}>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={source === "custom" ? L.search : L.filter}
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: 8, fontSize: 11, border: "1px solid rgba(139,92,246,0.22)", background: "rgba(255,255,255,0.04)", color: "var(--text-1)" }} />
            {source !== "custom" && (
              <div style={{ display: "flex", gap: 4 }}>
                {[["score", L.sortScore], ["title", L.sortTitle], ...(source === "mine" || Object.keys(ratings).length ? [["mine", L.sortMine]] : [])].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setSort(id)} style={{ ...pillBtn(sort === id), padding: "2px 9px", fontSize: 9 }}>{label}</button>
                ))}
              </div>
            )}
            {searching && results.length > 0 && (
              <div style={{ maxHeight: 170, overflowY: "auto" }}>
                {results.map(a => (
                  <button key={a.mal_id} type="button" onClick={() => addToPool(a)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "3px 5px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderRadius: 6, opacity: placedIds.has(a.mal_id) ? 0.4 : 1 }}>
                    <span style={{ width: 24, height: 34, borderRadius: 4, overflow: "hidden", flexShrink: 0, display: "block" }}><Poster anime={a} name="" w={24} /></span>
                    <span style={{ fontSize: 10, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(a)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div onDragOver={(e) => { e.preventDefault(); setDropAt({ to: "pool", index: board.pool.length }); }}
            onDrop={(e) => { e.preventDefault(); dropOn("pool", board.pool.length); }}
            onClick={() => { if(selected) dropOn("pool", board.pool.length); }}
            style={{ flex: 1, overflowY: "auto", padding: 8, minHeight: 0, outline: dropAt?.to === "pool" ? "1px dashed #e879f9" : "none", outlineOffset: -3 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(167,139,250,.75)", marginBottom: 6 }}>
              {loading ? L.loading : L.pool(board.pool.length)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {poolItems.map(a => card(a, "pool", board.pool.indexOf(a)))}
            </div>
            {!loading && board.pool.length === 0 && totalCount === 0 && (
              <div style={{ marginTop: 18, textAlign: "center", fontSize: 11, color: "var(--text-4)" }}>
                {source === "custom" ? L.emptyCustom : source === "mine" ? L.emptyMine : L.empty}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
