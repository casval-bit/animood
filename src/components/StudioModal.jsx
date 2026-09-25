import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { STUDIO_MODAL_I18N } from "../constants/studioModalI18n.js";
import { jikan } from "../api/jikan.js";
import { studioBlurb, getStudioCountries, fetchAnimeByStudio } from "../api/studios.js";
import { Spinner } from "./Spinner.jsx";
import { Modal } from "./Modal.jsx";

const FALLBACK = "https://placehold.co/200x300/1a1a2e/818cf8?text=?";
const STATUS_DOT_COLORS = {
  completed: "#3b82f6", watching: "#22c55e",
  dropped: "#ef4444", onhold: "#f59e0b", watchlist: "#9ca3af",
};
const SORTS = ["year", "score", "popular"];

export function StudioModal({ studioId, studioName, onClose, onOpenDetail }) {
  const { lang } = useLang();
  const t = STUDIO_MODAL_I18N[lang] || STUDIO_MODAL_I18N.fr;
  const { me } = useApp();
  const [animes, setAnimes]   = useState([]);
  const [about, setAbout]     = useState(null);
  const [logo, setLogo]       = useState(null);
  const [country, setCountry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort]       = useState("year"); // "year" | "score" | "popular"
  const [hideWatched, setHideWatched] = useState(false);

  const watched = useMemo(() => new Set((me?.watched||[]).map(Number)), [me?.watched]);
  const statuses = me?.statuses || {};

  useEffect(() => {
    if(!studioId) return;
    // Full catalog (not just the usual shuffled top-24 sample) so the sort
    // controls below have something real to sort — the shuffle inside
    // fetchAnimeByStudio doesn't matter since we always re-sort locally.
    fetchAnimeByStudio(studioId, 200).then(setAnimes).catch(console.error).finally(() => setLoading(false));
    jikan.getProducerFull(studioId).then(r => {
      setAbout(r?.data?.about || null);
      setLogo(r?.data?.images?.jpg?.image_url || null);
    }).catch(() => {});
    getStudioCountries([studioId], lang).then(c => setCountry(c[studioId] || null)).catch(() => {});
  }, [studioId, lang]);

  const sorted = useMemo(() => {
    let list = [...animes];
    if(hideWatched) list = list.filter(a => !watched.has(a.mal_id));
    if(sort === "year")    list.sort((a,b) => (b.year||0) - (a.year||0));
    if(sort === "score")   list.sort((a,b) => (b.score||0) - (a.score||0));
    if(sort === "popular") list.sort((a,b) => (b.scored_by||0) - (a.scored_by||0));
    return list;
  }, [animes, sort, hideWatched, watched]);

  const SORT_LABELS = { year: t.sortRecent, score: t.sortScore, popular: t.sortPopular };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-2xl">
            {logo ? <img src={logo} alt={studioName} className="h-full w-full object-contain p-1.5" onError={()=>setLogo(null)} /> : "🎬"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-lg font-black text-slate-100">{studioName}</div>
              {country && (
                <span className="shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">{country.emoji} {country.label}</span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {loading ? t.sortedByScore : t.animeCount(animes.length)}
              {hideWatched && !loading && ` · ${t.hiddenWatchedCount(sorted.length)}`}
            </div>
          </div>
        </div>
        <p className="mb-4 text-[13px] leading-relaxed text-slate-400">{about ? (about.length > 260 ? about.slice(0,260)+"…" : about) : studioBlurb(studioName, lang)}</p>

        {/* Sort + hide-watched controls */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/8">
            {SORTS.map((s,i) => (
              <button key={s} onClick={()=>setSort(s)}
                className="px-3 py-1.5 text-[10px] font-bold transition"
                style={{
                  background: sort===s ? "rgba(124,58,237,0.25)" : "transparent",
                  color: sort===s ? "#c084fc" : "var(--text-4)",
                  borderRight: i < SORTS.length-1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>

          <button onClick={()=>setHideWatched(p=>!p)}
            title={hideWatched ? t.showWatched : t.hideWatched}
            style={{
              width:32,height:32,borderRadius:8,cursor:"pointer",flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center",
              background: hideWatched ? "rgba(255,255,255,0.04)" : "rgba(124,58,237,0.15)",
              border: hideWatched ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(124,58,237,0.3)",
              transition:"all 0.15s",
            }}>
            {hideWatched ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>

        {loading ? (
          <Spinner />
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-slate-500">
            {hideWatched ? t.allWatched : t.noAnime}
          </div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
            {sorted.map(a => {
              const dotColor = STATUS_DOT_COLORS[statuses[a.mal_id]];
              const isWatched = watched.has(a.mal_id);
              return (
                <button key={a.mal_id} onClick={() => onOpenDetail(a)} className="group text-left" style={{opacity: isWatched ? 0.6 : 1}}>
                  <div className="relative mb-1 aspect-2/3 overflow-hidden rounded-xl transition-transform duration-300 group-hover:-translate-y-1">
                    <img src={a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || FALLBACK} alt={a.title}
                      onError={e=>{e.target.src=FALLBACK;}} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    {dotColor && (
                      <div style={{position:"absolute",bottom:4,right:4,width:8,height:8,
                        borderRadius:"50%",background:dotColor,border:"1px solid rgba(0,0,0,0.5)"}}/>
                    )}
                    {a.score && <div className="absolute bottom-1 left-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-extrabold text-amber-400">★{a.score}</div>}
                    {a.year && <div className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[8px] text-slate-400">{a.year}</div>}
                  </div>
                  <div className="line-clamp-2 text-center text-[10px] leading-tight text-slate-400">{a.title_english || a.title}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
