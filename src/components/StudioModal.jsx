import { useState, useEffect } from "react";
import { jikan } from "../api/jikan.js";
import { studioBlurb, getStudioCountries } from "../api/studios.js";
import { Spinner } from "./Spinner.jsx";
import { Modal } from "./Modal.jsx";

const FALLBACK = "https://placehold.co/200x300/1a1a2e/818cf8?text=?";

export function StudioModal({ studioId, studioName, onClose, onOpenDetail }) {
  const [animes, setAnimes]   = useState([]);
  const [about, setAbout]     = useState(null);
  const [logo, setLogo]       = useState(null);
  const [country, setCountry] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if(!studioId) return;
    jikan.getProducerAnime(studioId).then(r => setAnimes(r.data||[])).catch(console.error).finally(() => setLoading(false));
    jikan.getProducerFull(studioId).then(r => {
      setAbout(r?.data?.about || null);
      setLogo(r?.data?.images?.jpg?.image_url || null);
    }).catch(() => {});
    getStudioCountries([studioId]).then(c => setCountry(c[studioId] || null)).catch(() => {});
  }, [studioId]);

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6">
        <div className="mb-5 flex items-center gap-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-2xl">
            {logo ? <img src={logo} alt={studioName} className="h-full w-full object-contain p-1.5" onError={()=>setLogo(null)} /> : "🎬"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-black text-slate-100">{studioName}</div>
              {country && (
                <span className="shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">{country.emoji} {country.label}</span>
              )}
            </div>
            <div className="text-xs text-slate-500">Animés triés par score MAL</div>
          </div>
        </div>
        <p className="mb-5 text-[13px] leading-relaxed text-slate-400">{about ? (about.length > 260 ? about.slice(0,260)+"…" : about) : studioBlurb(studioName)}</p>
        {loading && <Spinner />}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {animes.map(a => (
            <button key={a.mal_id} onClick={() => onOpenDetail(a)} className="group text-left">
              <div className="relative mb-1 aspect-2/3 overflow-hidden rounded-xl transition-transform duration-300 group-hover:-translate-y-1">
                <img src={a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || FALLBACK} alt={a.title}
                  onError={e=>{e.target.src=FALLBACK;}} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                {a.score && <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-extrabold text-amber-400">★{a.score}</div>}
              </div>
              <div className="line-clamp-2 text-center text-[10px] leading-tight text-slate-400">{a.title}</div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
