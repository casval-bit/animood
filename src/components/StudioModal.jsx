import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { sb } from "../api/supabase.js";
import { Spinner } from "./Spinner.jsx";
import { Modal } from "./Modal.jsx";

const FALLBACK = "https://placehold.co/200x300/1a1a2e/818cf8?text=?";

export function StudioModal({ studioId, studioName, onClose, onOpenDetail }) {
  const { lang } = useLang();
  const { me } = useApp();
  const [animes, setAnimes]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sort, setSort]           = useState("year"); // "year" | "score" | "popular"
  const [hideWatched, setHideWatched] = useState(false);

  const watched = useMemo(() => {
    const w = me?.watched;
    if(!w) return new Set();
    if(Array.isArray(w)) return new Set(w.map(Number));
    return new Set(Object.keys(w).map(Number));
  }, [me?.watched]);
  const statuses = me?.statuses || {};

  useEffect(() => {
    if(!studioName) return;
    setLoading(true);
    // Query anime_cache filtering by studios JSONB array
    const enc = encodeURIComponent(studioName);
    sb.query(
      `anime_cache?studios=cs.%5B%7B%22name%22%3A%22${enc}%22%7D%5D&select=mal_id,title,title_en,score,year,episodes,type,image_url,large_image,genres,status,scored_by&limit=200`
    )
      .then(rows => {
        setAnimes(rows || []);
      })
      .catch(() => setAnimes([]))
      .finally(() => setLoading(false));
  }, [studioName]);

  const sorted = useMemo(() => {
    let list = [...animes];
    if(hideWatched) list = list.filter(a => !watched.has(a.mal_id));
    if(sort === "year")    list.sort((a,b) => (b.year||0) - (a.year||0));
    if(sort === "score")   list.sort((a,b) => (b.score||0) - (a.score||0));
    if(sort === "popular") list.sort((a,b) => (b.scored_by||0) - (a.scored_by||0));
    return list;
  }, [animes, sort, hideWatched, watched]);

  const statusColors = {
    completed:"#3b82f6", watching:"#22c55e",
    dropped:"#ef4444", onhold:"#f59e0b", watchlist:"#9ca3af",
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-5">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-2xl">
            🎬
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-black text-slate-100 truncate">{studioName}</div>
            <div className="text-[11px] text-slate-500">
              {loading ? "Chargement…" : `${animes.length} animés`}
              {hideWatched && !loading && ` · ${sorted.length} non vus`}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {/* Sort */}
          <div className="flex rounded-lg overflow-hidden border border-white/8">
            {[
              { id:"year",    label:"Plus récent" },
              { id:"score",   label:"Mieux noté"  },
              { id:"popular", label:"Populaire"   },
            ].map(s => (
              <button key={s.id} onClick={()=>setSort(s.id)}
                className="px-3 py-1.5 text-[10px] font-bold transition"
                style={{
                  background: sort===s.id ? "rgba(124,58,237,0.25)" : "transparent",
                  color: sort===s.id ? "#c084fc" : "var(--text-4)",
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Eye toggle — hide watched */}
          <button onClick={()=>setHideWatched(p=>!p)}
            title={hideWatched ? "Afficher les animés vus" : "Masquer les animés vus"}
            style={{
              width:32,height:32,borderRadius:8,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              background: hideWatched ? "rgba(255,255,255,0.04)" : "rgba(124,58,237,0.15)",
              border: hideWatched ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(124,58,237,0.3)",
              transition:"all 0.15s",flexShrink:0,
            }}>
            {hideWatched ? (
              /* Eye closed */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              /* Eye open */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <Spinner />
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-slate-500">
            {hideWatched ? "Tu as tout vu ! 🎉" : "Aucun animé trouvé"}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 max-h-[60vh] overflow-y-auto pr-1">
            {sorted.map(a => {
              const dotColor = statusColors[statuses[a.mal_id]];
              const isWatched = watched.has(a.mal_id);
              return (
                <button key={a.mal_id} onClick={() => onOpenDetail({
                    mal_id: a.mal_id,
                    title: a.title,
                    images: { jpg: { large_image_url: a.large_image || a.image_url, image_url: a.image_url } },
                    score: a.score, year: a.year, episodes: a.episodes, type: a.type,
                    genres: a.genres, synopsis: a.synopsis, status: a.status,
                  })}
                  className="group text-left" style={{opacity: isWatched ? 0.6 : 1}}>
                  <div className="relative mb-1 aspect-[2/3] overflow-hidden rounded-xl transition-transform duration-200 group-hover:-translate-y-0.5">
                    <img
                      src={a.image_url || a.large_image || FALLBACK} alt={a.title}
                      onError={e=>{e.target.src=FALLBACK;}}
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                    />
                    {/* Status dot */}
                    {dotColor && (
                      <div style={{position:"absolute",bottom:4,right:4,width:8,height:8,
                        borderRadius:"50%",background:dotColor,border:"1px solid rgba(0,0,0,0.5)"}}/>
                    )}
                    {/* Score */}
                    {a.score && (
                      <div className="absolute bottom-1 left-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-extrabold text-amber-400">
                        ★{a.score}
                      </div>
                    )}
                    {/* Year */}
                    {a.year && (
                      <div className="absolute top-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[8px] text-slate-400">
                        {a.year}
                      </div>
                    )}
                  </div>
                  <div className="line-clamp-2 text-center text-[10px] leading-tight text-slate-400">
                    {a.title_en || a.title}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
