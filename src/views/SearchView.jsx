import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { jikan, supabaseRowToAnime, fetchPopularAnime, fetchTitleSuggestions } from "../api/jikan.js";
import { fetchPopularStudios, studioBlurb, getStudioCountries } from "../api/studios.js";
import { sb } from "../api/supabase.js";
import { ptsStore } from "../api/moods.js";
import { AnimeCard } from "../components/AnimeCard.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { StudioModal } from "../components/StudioModal.jsx";
import { GLASS, GLASS_STYLE } from "../constants/theme.js";
import { Chip, ChipGroup, SectionLabel } from "../components/ui.jsx";

const FALLBACK = "https://placehold.co/64x92/1a1a2e/818cf8?text=?";

const TABS = [
  { id:"anime",   label:"Animé",   emoji:"📺" },
  { id:"studio",  label:"Studio",  emoji:"🎬" },
  { id:"members", label:"Membres", emoji:"👥" },
];
const TYPE_FILTERS = [{id:"all",label:"Tout",emoji:"🔀"},{id:"TV",label:"Animé",emoji:"📺"},{id:"Movie",label:"Film",emoji:"🎬"},{id:"OVA",label:"OAV",emoji:"💿"}];

// "Populaires" only makes sense for TV series — films & OAV are rarer, so we frame
// them as curated picks instead of implying a huge, ranked pool.
const POPULAR_LABELS = {
  all:   "🔥 Populaires en ce moment",
  TV:    "🔥 Populaires en ce moment",
  Movie: "🎬 Coups de cœur films",
  OVA:   "💿 Coups de cœur OAV",
};

function studioInitials(name = "") {
  const words = name.split(/\s+/).filter(Boolean);
  if(words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function studioColor(name = "") {
  let hash = 0;
  for(let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
}

function StudioLogo({ studio }) {
  const [broken, setBroken] = useState(false);
  if(studio.logo && !broken) {
    return <img src={studio.logo} alt={studio.name} onError={() => setBroken(true)} className="h-full w-full object-contain p-2" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-base font-black tracking-tight text-white" style={{ background: `linear-gradient(135deg, ${studioColor(studio.name)}, rgba(0,0,0,.35))` }}>
      {studioInitials(studio.name)}
    </div>
  );
}

function StudioCard({ studio, onClick }) {
  return (
    <button onClick={onClick} className={`group flex flex-col gap-3 p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/15 ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <StudioLogo studio={studio} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[15px] font-black text-slate-100">{studio.name}</div>
            {studio.country && (
              <span className="shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">{studio.country.emoji} {studio.country.label}</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500">{studio.count ? `${studio.count} animés populaires` : "Studio d'animation"}</div>
        </div>
        <span className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5">›</span>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-400">{studio.blurb}</p>
      {studio.titles?.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {studio.titles.map(t => <span key={t} className="rounded-full bg-indigo-400/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">{t}</span>)}
        </div>
      )}
    </button>
  );
}

export function SearchView({ onOpenDetail, onOpenUser }) {
  const { me } = useApp();
  const [tab, setTab]           = useState("anime");
  const [query, setQuery]       = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [studioModal, setStudioModal] = useState(null);

  const [popularAnime, setPopularAnime]     = useState([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [popularStudios, setPopularStudios] = useState([]);
  const [loadingStudios, setLoadingStudios] = useState(true);

  const [suggestions, setSuggestions]         = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 150); return () => clearTimeout(t); }, []);

  // Categories are never empty — prefill popular anime, refetched per type filter so
  // "Film"/"OAV" don't just show a TV-dominated list under the wrong label.
  // loadingPopular is flipped back on in changeTypeFilter (the event handler), not here,
  // so the effect body only synchronizes with the fetch instead of driving state itself.
  useEffect(() => {
    let cancelled = false;
    fetchPopularAnime(24, typeFilter==="all" ? null : typeFilter)
      .then(rows => { if(!cancelled) setPopularAnime(rows); })
      .finally(() => { if(!cancelled) setLoadingPopular(false); });
    return () => { cancelled = true; };
  }, [typeFilter]);

  useEffect(() => {
    let cancelled = false;
    fetchPopularStudios(12).then(rows => { if(!cancelled) setPopularStudios(rows); }).catch(() => {}).finally(() => { if(!cancelled) setLoadingStudios(false); });
    return () => { cancelled = true; };
  }, []);

  // Progressive, non-blocking logo enhancement — never gates the initial render.
  useEffect(() => {
    if(!popularStudios.length) return;
    let cancelled = false;
    popularStudios.forEach((s, i) => {
      if("logo" in s) return;
      setTimeout(async () => {
        if(cancelled) return;
        let url = null;
        try { url = (await jikan.getProducerFull(s.mal_id))?.data?.images?.jpg?.image_url || null; } catch { /* keep text logo fallback */ }
        if(!cancelled) setPopularStudios(prev => prev.map(p => p.mal_id === s.mal_id ? { ...p, logo: url } : p));
      }, i * 450);
    });
    return () => { cancelled = true; };
  }, [popularStudios.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDocClick = e => { if(boxRef.current && !boxRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const doSearch = async (q) => {
    const t = q.trim(); if(!t) return;
    setQuery(t); setSubmitted(true); setLoading(true); setError(null); setShowSuggestions(false);
    try {
      if(tab === "anime") {
        const params = { q:t, limit:24, order_by:"score", sort:"desc", sfw:false };
        if(typeFilter !== "all") params.type = typeFilter;
        const res = await jikan.searchAnime(params);
        const raw = res.data||[];
        const tLow = t.toLowerCase();
        const sorted = [...raw].sort((a,b) => {
          const aT=(a.title||"").toLowerCase(), bT=(b.title||"").toLowerCase();
          const aE=(a.title_english||"").toLowerCase(), bE=(b.title_english||"").toLowerCase();
          const s=(ti,en)=>(ti===tLow||en===tLow)?3:(ti.startsWith(tLow)||en.startsWith(tLow))?2:(ti.includes(tLow)||en.includes(tLow))?1:0;
          return s(bT,bE)-s(aT,aE);
        });
        setResults(sorted);
      } else if(tab === "studio") {
        const r = await fetch(`https://api.jikan.moe/v4/producers?q=${encodeURIComponent(t)}&order_by=count&sort=desc&limit=20`);
        const d = await r.json();
        const studios = (d.data||[]).map(s => ({
          mal_id: s.mal_id, name: s.titles?.[0]?.title || "Studio", count: s.count, established: s.established,
          logo: s.images?.jpg?.image_url || null, blurb: studioBlurb(s.titles?.[0]?.title),
        }));
        setResults(studios);
        getStudioCountries(studios.map(s => s.mal_id)).then(countries => {
          if(!Object.keys(countries).length) return;
          setResults(prev => prev.map(s => countries[s.mal_id] ? { ...s, country: countries[s.mal_id] } : s));
        }).catch(() => {});
      } else if(tab === "members") {
        const enc = encodeURIComponent(t);
        const rows = await sb.query(`profiles?or=(name.ilike.*${enc}*,username.ilike.*${enc}*)&select=username,name,avatar,bio,watched&limit=20`);
        setResults(rows||[]);
      }
    } catch(e) {
      if(e.message?.includes("504") || e.message?.includes("Gateway") || e.message?.includes("fetch")) {
        setError("Jikan est temporairement indisponible — réessaie dans quelques secondes");
      } else setError(e.message);
    } finally { setLoading(false); }
  };

  const clearSearch = () => { setQuery(""); setSubmitted(false); setResults([]); setSuggestions([]); setShowSuggestions(false); inputRef.current?.focus(); };
  const changeTab = (id) => { setTab(id); setSubmitted(false); setResults([]); setQuery(""); setSuggestions([]); setShowSuggestions(false); };
  const changeTypeFilter = (id) => { setLoadingPopular(true); setTypeFilter(id); };

  const onQueryChange = (val) => {
    setQuery(val);
    setActiveSuggestion(-1);
    if(submitted && !val) { clearSearch(); return; }
    if(tab !== "anime") return;
    if(debounceRef.current) clearTimeout(debounceRef.current);
    if(!val.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const rows = await fetchTitleSuggestions(val, 10);
      setSuggestions(rows);
      setShowSuggestions(true);
    }, 220);
  };

  const selectSuggestion = (row) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setQuery("");
    onOpenDetail(supabaseRowToAnime(row));
  };

  const onInputKeyDown = (e) => {
    if(tab === "anime" && showSuggestions && suggestions.length > 0) {
      if(e.key === "ArrowDown") { e.preventDefault(); setActiveSuggestion(i => (i+1) % suggestions.length); return; }
      if(e.key === "ArrowUp")   { e.preventDefault(); setActiveSuggestion(i => (i-1+suggestions.length) % suggestions.length); return; }
      if(e.key === "Escape")    { setShowSuggestions(false); return; }
      if(e.key === "Enter") {
        e.preventDefault();
        if(activeSuggestion >= 0 && suggestions[activeSuggestion]) selectSuggestion(suggestions[activeSuggestion]);
        else doSearch(query);
        return;
      }
    }
    if(e.key === "Enter") doSearch(query);
    if(e.key === "Escape") setShowSuggestions(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 animate-slide-up">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight text-slate-50 md:text-[32px]">🔍 Recherche</h1>
        <p className="text-sm text-slate-500">Explore les animes et studios les plus populaires, ou cherche par titre.</p>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {TABS.map(t => <Chip key={t.id} label={t.label} emoji={t.emoji} selected={tab===t.id} onClick={() => changeTab(t.id)} />)}
        </div>

        <div ref={boxRef} className="relative w-full sm:w-96">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input ref={inputRef} value={query}
            onChange={e => onQueryChange(e.target.value)}
            onFocus={() => { if(suggestions.length) setShowSuggestions(true); }}
            onKeyDown={onInputKeyDown}
            placeholder={tab==="anime"?"Titre d'animé…":tab==="studio"?"Nom de studio…":"Nom d'utilisateur…"}
            className="w-full rounded-2xl border border-white/10 bg-white/6 py-3 pl-10 pr-9 text-sm text-slate-100 outline-none transition focus:border-violet-400/50 focus:bg-white/8" />
          {query && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 flex h-5.5 w-5.5 -translate-y-1/2 items-center justify-center rounded-full bg-white/8 text-[11px] text-slate-400">✕</button>
          )}

          {tab === "anime" && showSuggestions && suggestions.length > 0 && (
            <div className={`absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-y-auto p-1.5 ${GLASS}`} style={GLASS_STYLE}>
              {suggestions.map((row, i) => (
                <button key={row.mal_id}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selectSuggestion(row)}
                  onMouseEnter={() => setActiveSuggestion(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${i===activeSuggestion ? "bg-white/10" : "hover:bg-white/5"}`}>
                  <img src={row.image_url || row.large_image || FALLBACK} alt="" onError={e=>{e.target.src=FALLBACK;}} className="h-12 w-9 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-slate-100">{row.title_en || row.title}</div>
                    <div className="truncate text-[10px] text-slate-500">
                      {row.title_en && row.title_en !== row.title ? `${row.title} · ` : ""}{row.year || "?"}{row.type ? ` · ${row.type}` : ""}
                    </div>
                  </div>
                  {row.score && <span className="shrink-0 text-[11px] font-bold text-amber-400">★{row.score}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === "anime" && (
        <div className="mb-6">
          <ChipGroup items={TYPE_FILTERS} value={[typeFilter]} onToggle={changeTypeFilter} />
        </div>
      )}

      {/* ── ANIME TAB ── */}
      {tab === "anime" && !submitted && (
        <>
          <SectionLabel className="mb-3">{POPULAR_LABELS[typeFilter] || POPULAR_LABELS.all}</SectionLabel>
          {loadingPopular ? <Spinner label="Chargement…" /> : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {popularAnime.map(a => {
                const status = (me.statuses||{})[a.mal_id];
                const statusColors = { completed:"#3b82f6", watching:"#22c55e", dropped:"#ef4444", onhold:"#f59e0b", watchlist:"#9ca3af" };
                return <AnimeCard key={a.mal_id} anime={a} onClick={onOpenDetail} statusDot={statusColors[status]} moodPts={ptsStore[a.mal_id]} quickAction="watchlist" />;
              })}
            </div>
          )}
        </>
      )}

      {/* ── STUDIO TAB ── */}
      {tab === "studio" && !submitted && (
        <>
          <SectionLabel className="mb-3">🎬 Studios populaires</SectionLabel>
          {loadingStudios ? <Spinner label="Chargement…" /> : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popularStudios.map(s => (
                <StudioCard key={s.mal_id} studio={s} onClick={() => setStudioModal({ id:s.mal_id, name:s.name })} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── MEMBERS TAB (search-only) ── */}
      {tab === "members" && !submitted && (
        <EmptyState emoji="👥" title="Cherche un membre" subtitle="Tape un pseudo ou un nom pour commencer" />
      )}

      {/* ── SEARCH RESULTS (any tab) ── */}
      {submitted && (
        <>
          <div className="mb-3 text-[11px] font-semibold text-slate-500">{loading ? "Recherche…" : `${results.length} résultat${results.length!==1?"s":""}`}</div>
          {loading && <Spinner label="Recherche en cours…" />}
          {error && <div className="py-8 text-center text-xs text-red-400">Erreur : {error}</div>}
          {!loading && !error && results.length === 0 && <EmptyState emoji="🔍" title="Aucun résultat" subtitle="Essaie un autre terme" />}

          {!loading && tab === "anime" && results.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {results.map(a => {
                const status = (me.statuses||{})[a.mal_id];
                const statusColors = { completed:"#3b82f6", watching:"#22c55e", dropped:"#ef4444", onhold:"#f59e0b", watchlist:"#9ca3af" };
                return <AnimeCard key={a.mal_id} anime={a} onClick={onOpenDetail} statusDot={statusColors[status]} moodPts={ptsStore[a.mal_id]} quickAction="watchlist" />;
              })}
            </div>
          )}

          {!loading && tab === "studio" && results.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(s => <StudioCard key={s.mal_id} studio={s} onClick={() => setStudioModal({ id:s.mal_id, name:s.name })} />)}
            </div>
          )}

          {!loading && tab === "members" && results.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(u => (
                <button key={u.username} onClick={() => onOpenUser(u.username)}
                  className={`flex items-center gap-3 p-3.5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/15 ${GLASS}`} style={GLASS_STYLE}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-violet-600 to-fuchsia-500 text-lg">
                    {u.avatar && u.avatar.startsWith("http") ? <img src={u.avatar} alt={u.name} className="h-full w-full object-cover" /> : (u.avatar||"👤")}
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-black text-slate-100">{u.name||u.username}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">@{u.username}{u.watched?.length ? ` · ${u.watched.length} animés vus` : ""}</div>
                    {u.bio && <div className="mt-0.5 text-[10px] italic text-slate-400">{u.bio}</div>}
                  </div>
                  <span className="text-slate-600">›</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {studioModal && <StudioModal studioId={studioModal.id} studioName={studioModal.name} onClose={() => setStudioModal(null)} onOpenDetail={a => { setStudioModal(null); onOpenDetail(a); }} />}
    </div>
  );
}
