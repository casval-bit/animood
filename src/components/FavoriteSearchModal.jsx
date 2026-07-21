import { useState, useEffect, useRef } from "react";
import { jikan } from "../api/jikan.js";
import { Spinner } from "./Spinner.jsx";
import { Modal } from "./Modal.jsx";

const FALLBACK = "https://placehold.co/64x92/1a1a2e/818cf8?text=?";

export function FavoriteSearchModal({ onSelect, onClose }) {
  const [q, setQ]             = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const search = async (val) => {
    setQ(val);
    if(!val.trim()) { setResults([]); return; }
    // Debounce 400ms
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        // First try Supabase cache for instant results
        const { sb } = await import("../api/supabase.js");
        const enc = encodeURIComponent(val.trim());
        const cached = await sb.query(`anime_cache?title=ilike.*${enc}*&order=score.desc.nullslast&limit=20&select=mal_id,title,title_en,year,type,score,image_url,large_image`);
        if(cached?.length >= 3) {
          setResults(cached.map(r => ({
            mal_id: r.mal_id, title: r.title, title_english: r.title_en,
            year: r.year, type: r.type, score: r.score,
            images: { jpg: { image_url: r.image_url, large_image_url: r.large_image } }
          })));
          setLoading(false);
          return;
        }
        // Fallback to Jikan with more results
        const d = await jikan.searchAnime({ q: val.trim(), limit: 20, order_by:"score", sort:"desc", sfw:false });
        setResults(d.data||[]);
      } catch {}
      setLoading(false);
    }, 400);
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md">
      <div className="p-5">
        <div className="mb-3 text-sm font-extrabold text-slate-100">Ajouter un favori</div>
        <div className="relative mb-3.5">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">🔍</span>
          <input ref={inputRef} value={q} onChange={e => search(e.target.value)} placeholder="Rechercher un animé…"
            className="w-full rounded-xl border border-white/12 bg-white/7 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none" />
        </div>
        {loading && <Spinner small />}
        <div className="flex flex-col gap-2">
          {results.map(a => (
            <button key={a.mal_id} onClick={() => onSelect(a)}
              className="flex items-center gap-2.5 overflow-hidden rounded-xl border border-white/7 bg-white/4 text-left transition hover:bg-white/8">
              <img src={a.images?.jpg?.image_url || FALLBACK} alt={a.title} onError={e=>{e.target.src=FALLBACK;}} className="h-15.5 w-11 shrink-0 object-cover" />
              <div className="flex-1 py-1.5 pr-2.5">
                <div className="text-xs font-bold leading-tight text-slate-100">{a.title}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{a.year || "?"} · {a.type}{a.score ? ` · ★${a.score}` : ""}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
