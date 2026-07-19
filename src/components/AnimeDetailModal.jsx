import { useState, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { MOODS } from "../constants/moods.js";
import { STREAMING_COLORS } from "../constants/filters.js";
import { jikan } from "../api/jikan.js";
import { ptsStore, getPtsForAnime, addUserVote, genreFallbackV2 } from "../api/moods.js";
import { Spinner } from "./Spinner.jsx";
import { StarRating } from "./StarRating.jsx";
import { MoodOctagon } from "./MoodOctagon.jsx";
import { Modal } from "./Modal.jsx";
import { PersonModal } from "./PersonModal.jsx";
import { StudioModal } from "./StudioModal.jsx";
import { GradientButton } from "./ui.jsx";

const FALLBACK = "https://placehold.co/700x300/1a1a2e/818cf8?text=?";

export function AnimeDetailModal({ malId, seedData, onClose, onOpenDetail }) {
  const { me, saveMe, myUsername } = useApp();
  const [anime, setAnime]         = useState(null);
  const [staff, setStaff]         = useState([]);
  const [characters, setCharacters] = useState([]);
  const [animePts, setAnimePts]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [rating, setRating]       = useState(me.ratings[malId]?.score ?? null);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [selMoods, setSelMoods]   = useState(() => {
    const prevVote = ptsStore[`${malId}_vote`];
    return prevVote?.moods || me.ratings[malId]?.moods || [];
  });
  const [personModal, setPersonModal] = useState(null);
  const [studioModal, setStudioModal] = useState(null);

  const isWatched = me.watched.includes(malId);
  const a = anime || seedData;

  useEffect(() => {
    if(!malId) return;
    (async () => {
      try {
        const ad = await jikan.getAnime(malId);
        setAnime(ad.data);
        setLoading(false);

        if(ad.data?._fromCache && ad.data.staff?.length) {
          setStaff(ad.data.staff.slice(0,10).map(s => ({ person:{mal_id:s.mal_id,name:s.name,images:{jpg:{image_url:s.image}}}, positions:s.positions })));
        } else {
          jikan.getStaff(malId).then(sd => setStaff((sd.data||[]).slice(0,10))).catch(()=>{});
        }
        if(ad.data?._fromCache && ad.data.characters?.length) {
          setCharacters(ad.data.characters.slice(0,8).map(c => ({ character:{mal_id:c.mal_id,name:c.name,images:{jpg:{image_url:c.image}}}, role:c.role, voice_actors:c.va?[{language:"Japanese",person:{mal_id:c.va.mal_id,name:c.va.name,images:{jpg:{image_url:c.va.image}}}}]:[] })));
        } else {
          jikan.getCharacters(malId).then(cd => setCharacters((cd.data||[]).slice(0,8))).catch(()=>{});
        }

        if(ptsStore[ad.data.mal_id]) {
          setAnimePts(ptsStore[ad.data.mal_id]);
        } else {
          setAnimePts(genreFallbackV2(ad.data));
          getPtsForAnime(ad.data).then(pts => setAnimePts(pts)).catch(()=>{});
        }
      } catch(e) { setError(e.message); setLoading(false); }
    })();
  }, [malId]);

  const save = async () => {
    if(!rating) return;
    setSaveState("saving");
    if(selMoods.length > 0 && animePts) {
      const newPts = await addUserVote(myUsername, malId, selMoods);
      setAnimePts(newPts);
    }
    saveMe({
      ...me,
      watched: me.watched.includes(malId) ? me.watched : [...me.watched, malId],
      ratings: { ...me.ratings, [malId]: { score: rating, moods: selMoods } },
    });
    setSaveState("saved");
    setTimeout(() => setSaveState(s => s === "saved" ? "idle" : s), 2000);
  };

  const toggleWatched = () => saveMe({ ...me, watched: isWatched ? me.watched.filter(id => id !== malId) : [...me.watched, malId] });

  const favorites = me.favorites || [null,null,null,null,null];
  const isFavorite = favorites.includes(malId);
  const toggleFavorite = () => {
    const favs = [...favorites];
    const idx = favs.indexOf(malId);
    if(idx !== -1) { favs[idx] = null; }
    else {
      const emptyIdx = favs.indexOf(null);
      if(emptyIdx === -1) return;
      favs[emptyIdx] = malId;
    }
    saveMe({ ...me, favorites: favs });
  };

  const isOnWatchlist = (me.statuses||{})[malId] === "watchlist";
  const toggleWatchlist = () => {
    const newStatuses = { ...(me.statuses||{}) };
    if(isOnWatchlist) delete newStatuses[malId]; else newStatuses[malId] = "watchlist";
    saveMe({ ...me, statuses: newStatuses });
  };

  const img = a?.images?.jpg?.large_image_url || a?.img || FALLBACK;
  const title = a?.title || "—";
  const synopsis = a?.synopsis;
  const year = a?.year || a?.aired?.prop?.from?.year;
  const eps = a?.episodes, type = a?.type, score = a?.score;
  const genres = a?.genres?.map(g => g.name || g) || [];
  const studios = a?.studios || [];
  const streaming = a?.streaming || seedData?.streaming || [];
  const trailer = a?.trailer?.url;

  return (
    <>
      <Modal onClose={onClose} maxWidth="max-w-4xl">
        {close => (
          <>
            <div className="relative h-64 w-full overflow-hidden rounded-t-3xl">
              <img src={img} alt={title} onError={e=>{e.target.src=FALLBACK;}} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-linear-to-t from-[#0d0b18] via-[#0d0b18]/30 to-transparent" />
              <button onClick={close} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-slate-200 backdrop-blur hover:bg-black/70">✕</button>
              {score && <div className="absolute right-4 top-16 rounded-lg bg-black/75 px-2.5 py-1 text-sm font-extrabold text-amber-400">★ {score}</div>}
              <div className="absolute inset-x-6 bottom-4">
                <div className="mb-2 text-2xl font-black text-white">{title}</div>
                <div className="flex flex-wrap gap-1.5">
                  {type && <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">{type}</span>}
                  {eps && <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">{eps} eps</span>}
                  {year && <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">{year}</span>}
                  {me.ratings[malId] && <span className="rounded bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-400">Ma note : {me.ratings[malId].score}/10</span>}
                </div>
              </div>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-[1fr_300px]">
              <div className="min-w-0">
                {loading && <Spinner small label="Chargement…" />}

                {studios.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {studios.map(s => (
                      <button key={s.mal_id} onClick={() => setStudioModal({ id:s.mal_id, name:s.name })}
                        className="rounded-lg border border-indigo-400/25 bg-indigo-400/10 px-2.5 py-1 text-[11px] font-bold text-indigo-300 transition hover:bg-indigo-400/20">
                        🎬 {s.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {genres.map(g => <span key={g} className="rounded-md bg-indigo-400/12 px-2 py-1 text-[11px] font-semibold text-indigo-300">{g}</span>)}
                </div>

                {synopsis && (
                  <div className="mb-4">
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Synopsis</div>
                    <p className="text-[13px] leading-relaxed text-slate-400">{synopsis.length > 420 ? synopsis.slice(0,420)+"…" : synopsis}</p>
                  </div>
                )}

                {streaming.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Disponible sur</div>
                    <div className="flex flex-wrap gap-1.5">
                      {streaming.map(s => { const name = s.name || s; return <span key={name} className="rounded-md px-2.5 py-1 text-[11px] font-extrabold text-white" style={{ background: STREAMING_COLORS[name] || "#444" }}>{name}</span>; })}
                    </div>
                  </div>
                )}

                {staff.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Staff</div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {staff.slice(0,6).map((s,i) => (
                        <button key={i} onClick={() => setPersonModal(s.person?.mal_id)}
                          className="flex items-center justify-between rounded-lg border border-white/6 bg-white/3 px-2.5 py-1.5 text-left transition hover:bg-white/6">
                          <span className="flex items-center gap-2">
                            <img src={s.person?.images?.jpg?.image_url || "https://placehold.co/28x28/1a1a2e/818cf8?text=?"} alt={s.person?.name}
                              className="h-7 w-7 rounded-full object-cover" onError={e=>{e.target.src="https://placehold.co/28x28/1a1a2e/818cf8?text=?";}} />
                            <span className="text-xs font-semibold text-slate-200">{s.person?.name}</span>
                          </span>
                          <span className="text-[10px] text-slate-500">{s.positions?.slice(0,1).join(", ")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {characters.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Personnages & Seiyuu</div>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {characters.slice(0,8).map((c,i) => {
                        const va = c.voice_actors?.find(v => v.language === "Japanese");
                        return (
                          <div key={i} className="w-16 shrink-0 text-center">
                            <img src={c.character?.images?.jpg?.image_url || "https://placehold.co/52x52/1a1a2e/818cf8?text=?"} alt={c.character?.name}
                              className="mx-auto mb-1 h-13 w-13 rounded-full border-2 border-white/10 object-cover" onError={e=>{e.target.src="https://placehold.co/52x52/1a1a2e/818cf8?text=?";}} />
                            <div className="mb-1 truncate text-[8px] text-slate-400">{c.character?.name?.split(" ").slice(-1)[0]}</div>
                            {va && (
                              <button onClick={() => setPersonModal(va.person?.mal_id)}>
                                <img src={va.person?.images?.jpg?.image_url || "https://placehold.co/36x36/1a1a2e/c084fc?text=?"} alt={va.person?.name}
                                  className="mx-auto h-9 w-9 rounded-full border-2 border-purple-400/40 object-cover" onError={e=>{e.target.src="https://placehold.co/36x36/1a1a2e/c084fc?text=?";}} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {error && <div className="py-3 text-center text-xs text-red-400">Erreur : {error}</div>}
              </div>

              <div className="flex flex-col gap-4">
                {animePts && <MoodOctagon pts={animePts} />}

                <div className="rounded-2xl bg-white/3 p-4">
                  <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Ma note</div>
                  <StarRating value={rating} onChange={setRating} />
                  <div className="my-2 text-[10px] text-slate-500">Ton ressenti (max 3 moods) :</div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {MOODS.map(m => {
                      const sel = selMoods.includes(m.id);
                      return (
                        <button key={m.id} onClick={() => setSelMoods(p => p.includes(m.id) ? p.filter(x=>x!==m.id) : p.length<3 ? [...p,m.id] : p)}
                          className="rounded-full px-2 py-1 text-[10px] font-bold transition"
                          style={{ border: sel?`1px solid ${m.color}`:"1px solid rgba(255,255,255,0.1)", background: sel?`${m.color}18`:"transparent", color: sel?m.color:"#6b7280" }}>
                          {m.emoji} {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <GradientButton onClick={save} disabled={!rating || saveState==="saving"} className="flex-1 py-2.5 text-[13px]">
                      {saveState === "saving" ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Enregistrement…
                        </span>
                      ) : saveState === "saved" ? (
                        <span className="flex items-center justify-center gap-1.5 animate-mood-pop">
                          ✓ Enregistré
                        </span>
                      ) : "Sauvegarder"}
                    </GradientButton>
                    <button onClick={toggleWatched}
                      className={`rounded-xl px-3 py-2.5 text-[13px] font-bold ${isWatched ? "border border-emerald-400 bg-emerald-400/10 text-emerald-400" : "border border-white/10 text-slate-500"}`}>
                      {isWatched ? "✓ Vu" : "Marquer vu"}
                    </button>
                    <button onClick={toggleFavorite} title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                      className={`rounded-xl px-3 py-2.5 text-sm ${isFavorite ? "border border-pink-400 bg-pink-400/10 text-pink-400" : "border border-white/10 text-slate-500"}`}>
                      {isFavorite ? "❤️" : "🤍"}
                    </button>
                    <button onClick={toggleWatchlist} title={isOnWatchlist ? "Retirer de la watchlist" : "Ajouter à la watchlist"}
                      className={`rounded-xl px-3 py-2.5 text-sm ${isOnWatchlist ? "border border-slate-400 bg-slate-400/15 text-slate-300" : "border border-white/10 text-slate-500"}`}>
                      🎯
                    </button>
                  </div>
                </div>

                {trailer && (
                  <a href={trailer} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/3 py-2.5 text-[13px] font-bold text-slate-400">
                    ▶ Voir le trailer
                  </a>
                )}
              </div>
            </div>
          </>
        )}
      </Modal>

      {personModal && (
        <PersonModal personId={personModal} onClose={() => setPersonModal(null)}
          onOpenDetail={a => { setPersonModal(null); onOpenDetail?.(a); }} />
      )}
      {studioModal && (
        <StudioModal studioId={studioModal.id} studioName={studioModal.name} onClose={() => setStudioModal(null)}
          onOpenDetail={a => { setStudioModal(null); onOpenDetail?.(a); }} />
      )}
    </>
  );
}
