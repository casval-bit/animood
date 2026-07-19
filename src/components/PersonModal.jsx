import { useState, useEffect } from "react";
import { jikan } from "../api/jikan.js";
import { Spinner } from "./Spinner.jsx";
import { Modal } from "./Modal.jsx";

const FALLBACK = "https://placehold.co/120x120/1a1a2e/818cf8?text=?";

export function PersonModal({ personId, onClose, onOpenDetail }) {
  const [data, setData]     = useState(null);
  const [animes, setAnimes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if(!personId) return;
    (async () => {
      try {
        const [person, voices, animeRoles] = await Promise.all([
          jikan.getPerson(personId), jikan.getPersonVoices(personId), jikan.getPersonAnime(personId),
        ]);
        setData(person.data);
        const map = {};
        (animeRoles.data||[]).forEach(a => { const id=a.anime?.mal_id; if(id) map[id]={mal_id:id,title:a.anime?.title,img:a.anime?.images?.jpg?.image_url,role:a.position}; });
        (voices.data||[]).forEach(v => { const id=v.anime?.mal_id; if(id && !map[id]) map[id]={mal_id:id,title:v.anime?.title,img:v.anime?.images?.jpg?.image_url,role:`VA · ${v.character?.name}`}; });
        setAnimes(Object.values(map).slice(0,24));
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [personId]);

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {loading && <Spinner label="Chargement…" />}
      {data && (
        <div className="p-6">
          <div className="mb-5 flex items-center gap-4">
            <img src={data.images?.jpg?.image_url || FALLBACK} alt={data.name} onError={e=>{e.target.src=FALLBACK;}}
              className="h-16 w-16 rounded-full border-2 border-white/10 object-cover" />
            <div>
              <div className="text-lg font-black text-slate-100">{data.name}</div>
              {data.name_kanji && <div className="text-xs text-slate-500">{data.name_kanji}</div>}
              {data.favorites != null && <div className="mt-0.5 text-[11px] text-slate-600">❤️ {data.favorites.toLocaleString()} favoris</div>}
            </div>
          </div>
          {data.about && <p className="mb-5 text-[13px] leading-relaxed text-slate-400">{data.about.slice(0,320)}…</p>}
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Animés ({animes.length})</div>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {animes.map(a => (
              <button key={a.mal_id} onClick={() => onOpenDetail(a)} className="group text-left">
                <div className="mb-1 aspect-2/3 overflow-hidden rounded-lg transition-transform duration-300 group-hover:-translate-y-1">
                  <img src={a.img || FALLBACK} alt={a.title} onError={e=>{e.target.src=FALLBACK;}} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                </div>
                <div className="line-clamp-2 text-center text-[9px] leading-tight text-slate-400">{a.title}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
