import { useState, useRef, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { MOODS, getMoodObj } from "../constants/moods.js";
import { DURATIONS, MEDIA_TYPES, COUNTRIES } from "../constants/filters.js";
import { fetchMoodboardCandidates } from "../api/moodboard.js";
import { ptsToPct } from "../api/moods.js";
import { sb, follows } from "../api/supabase.js";
import { Spinner } from "../components/Spinner.jsx";
import { Modal } from "../components/Modal.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";
import { ChipGroup, StatPill, StarRatingDisplay, GradientButton, QuickActionIcons } from "../components/ui.jsx";

const MOOD_DESCRIPTIONS = {
  emotional: "Larmes, drama intense, émotions déchirantes. Anime qui touchent profondément.",
  happy:     "Comédie, situations drôles, humour. Anime qui font rire et sourire.",
  hype:      "Action, adrénaline, combats intenses. Anime qui font monter la pression.",
  dark:      "Sombre, mature, violent, désespoir. Anime qui explorent le côté obscur.",
  chill:     "Contemplatif, calme, apaisant. Slice-of-life et anime relaxants.",
  twisted:   "Psychologique, mind games, rebondissements. Anime qui font réfléchir.",
  in_love:   "Romantique, attachement, amour. Anime qui font battre le cœur.",
  thrills:   "Tension narrative, enjeux élevés, frissons. Anime qui tiennent en haleine.",
};

const MOOD_GENRES = {
  emotional: ["Drama", "Romance", "Slice of Life"],
  happy:     ["Comedy", "Slice of Life", "Parody"],
  hype:      ["Action", "Adventure", "Shounen"],
  dark:      ["Horror", "Psychological", "Seinen"],
  chill:     ["Slice of Life", "Iyashikei", "Comedy"],
  twisted:   ["Mystery", "Psychological", "Thriller"],
  in_love:   ["Romance", "Drama", "Slice of Life"],
  thrills:   ["Thriller", "Mystery", "Action"],
};

const COMPAT_BASE = { emotional:90, happy:88, hype:91, dark:87, chill:85, twisted:89, in_love:92, thrills:90 };

function computeCompatibility(moods) {
  if(!moods.length) return 0;
  const avg = moods.reduce((s,m) => s + (COMPAT_BASE[m]||88), 0) / moods.length;
  return Math.min(98, Math.round(avg + (moods.length > 1 ? 3 : 0)));
}

function dominantGenres(moods) {
  const out = [];
  moods.forEach(m => (MOOD_GENRES[m]||[]).forEach(g => { if(!out.includes(g)) out.push(g); }));
  return out.slice(0, 4);
}

function whyThisPick(anime, selectedMoods) {
  const pct = ptsToPct(anime._pts || {});
  const top = [...selectedMoods].sort((a,b) => (pct[b]||0)-(pct[a]||0))[0];
  const m = getMoodObj(top);
  if(!m) return "Recommandé pour toi";
  return `${pct[top]||0}% aligné avec ton mood ${m.emoji} ${m.label}`;
}

function MoodCard({ mood, selected, onClick }) {
  return (
    <button onClick={onClick}
      className={`group relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl px-1.5 text-center transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(139,92,246,.25)] ${selected ? "animate-mood-pop" : ""}`}
      style={{
        background: selected ? `linear-gradient(135deg, ${mood.color}2A, #6D5BFF33 60%, #EC489933)` : "rgba(255,255,255,0.03)",
        border: selected ? `2px solid ${mood.color}` : "1.5px solid rgba(255,255,255,0.07)",
        boxShadow: selected ? "0 0 35px rgba(139,92,246,.35)" : "none",
      }}>
      {selected && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: mood.color, boxShadow: `0 0 10px ${mood.color}` }}>✓</span>
      )}
      <div className="text-2xl">{mood.emoji}</div>
      <div className="text-[11px] font-bold" style={{ color: selected ? mood.color : "#e5e7eb" }}>{mood.label}</div>
    </button>
  );
}

function MoodGuideTile({ onClick }) {
  return (
    <button onClick={onClick}
      className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl px-1.5 text-center transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02]"
      style={{ background: "linear-gradient(135deg, rgba(109,91,255,.2), rgba(236,72,153,.2))", border: "1.5px solid rgba(139,92,246,.4)" }}>
      <div className="text-2xl font-black text-violet-300">?</div>
      <div className="text-[11px] font-bold text-violet-300">Guide</div>
    </button>
  );
}

function MoodResultCard({ anime, selectedMoods, onClick, friendUsers }) {
  const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || anime.image_url || anime.large_image;
  const genres = (anime.genres || []).map(g => g.name || g).slice(0, 2);
  const hasFriendHighlight = friendUsers && friendUsers.length > 0;
  return (
    <div role="button" tabIndex={0}
      onClick={() => onClick?.(anime)}
      onKeyDown={e => { if(e.key==="Enter"||e.key===" ") { e.preventDefault(); onClick?.(anime); } }}
      className={`group flex cursor-pointer flex-col overflow-hidden text-left transition-all duration-300 hover:-translate-y-1 ${GLASS}`}
      style={{...GLASS_STYLE, border: hasFriendHighlight ? "2px solid #ef4444" : undefined,
        boxShadow: hasFriendHighlight ? "0 0 16px rgba(239,68,68,0.3)" : undefined}}>
      <div className="relative aspect-2/3 w-full overflow-hidden bg-black/20">
        <img
          src={img || "https://placehold.co/300x450/1a1a2e/818cf8?text=?"}
          alt={anime.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          onError={e => { e.target.src = "https://placehold.co/300x450/1a1a2e/818cf8?text=?"; }}
        />
        <QuickActionIcons anime={anime} />
        {hasFriendHighlight && (
          <div style={{position:"absolute",top:6,left:6,background:"rgba(239,68,68,0.9)",borderRadius:20,
            padding:"2px 8px",fontSize:10,fontWeight:800,color:"#fff",display:"flex",alignItems:"center",gap:4,zIndex:10}}>
            ❤️ {friendUsers.length === 1
              ? `@${friendUsers[0]} l'a aimé`
              : friendUsers.length <= 4
              ? `${friendUsers.length} l'ont aimé`
              : "Plusieurs amis l'ont aimé"}
          </div>
        )}
        <div className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-extrabold">
          <StarRatingDisplay score={anime.score} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="line-clamp-2 text-[14px] font-extrabold leading-tight text-slate-50">{anime.title}</div>
        <div className="flex flex-wrap gap-1">
          {genres.map(g => <span key={g} className="rounded-full bg-indigo-400/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">{g}</span>)}
        </div>
        <div className="text-[11px] text-slate-500">{anime.episodes ? `${anime.episodes} épisodes` : anime.type || "?"}</div>
        <div className="mt-auto flex flex-col gap-2 pt-1.5">
          <span className="text-[10.5px] font-semibold leading-snug text-violet-300">{whyThisPick(anime, selectedMoods)}</span>
          <span className="w-full rounded-full py-1.5 text-center text-[11px] font-bold text-white" style={{ background: GRADIENT_PRIMARY }}>Voir →</span>
        </div>
      </div>
    </div>
  );
}

export function MoodboardView({ onOpenDetail }) {
  const { me, myUsername } = useApp();
  const [selectedMoods, setSelectedMoods] = useState([]);
  const [showMoodInfo, setShowMoodInfo]   = useState(false);
  const [duration, setDuration]           = useState("all");
  const [countries, setCountries]         = useState(["all"]);
  const [mediaTypes, setMediaTypes]       = useState(["all"]);
  const [showFriendHighlights, setShowFriendHighlights] = useState(true);
  const [friendHighlights, setFriendHighlights] = useState({}); // mal_id → [username,...]
  const [results, setResults]             = useState([]);
  const [cursor, setCursor]               = useState(null);
  const [rerollCount, setRerollCount]     = useState(0);
  const [generating, setGenerating]       = useState(false);
  const [hasSearched, setHasSearched]     = useState(false);
  const resultsRef = useRef(null);

  // Load friend highlights on mount
  useEffect(() => {
    if(!myUsername) return;
    (async () => {
      try {
        const following = await follows.getFollowing(myUsername).catch(()=>[]);
        if(!following.length) return;
        const rows = await sb.query(`profiles?username=in.(${following.map(u=>encodeURIComponent(u)).join(",")})&select=username,highlights`);
        const map = {};
        (rows||[]).forEach(p => {
          (p.highlights||[]).forEach(malId => {
            if(!map[malId]) map[malId] = [];
            map[malId].push(p.username);
          });
        });
        setFriendHighlights(map);
      } catch {}
    })();
  }, [myUsername]);

  const toggleMood = id => {
    setHasSearched(false);
    setCursor(null);
    setRerollCount(0);
    setSelectedMoods(prev => prev.includes(id) ? prev.filter(m=>m!==id) : prev.length<3 ? [...prev,id] : prev);
  };
  const toggleMulti = (val, state, setState) => {
    if(val === "all") { setState(["all"]); return; }
    setState(prev => {
      const w = prev.filter(x=>x!=="all");
      if(w.includes(val)) { const n=w.filter(x=>x!==val); return n.length?n:["all"]; }
      return [...w, val];
    });
  };

  const generate = async (reroll=false) => {
    setGenerating(true); setHasSearched(true);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    console.log("[MOODBOARD] generate called — reroll:", reroll, "rerollCount:", rerollCount, "cursor offset:", cursor?.offset, "cursor pool size:", cursor?.pool ? Object.keys(cursor.pool).length : 0, "shownIds:", cursor?.shownIds?.length);
    try {
      const { results: picked, cursor: nextCursor } = await fetchMoodboardCandidates(
        selectedMoods, duration, mediaTypes, countries, me,
        reroll ? cursor : null,
        reroll ? rerollCount : 0,
      );
      console.log("[MOODBOARD] got results:", picked.map(a=>a.mal_id), "nextCursor offset:", nextCursor?.offset, "pool size:", Object.keys(nextCursor?.pool||{}).length);
      setResults(picked);
      setCursor(nextCursor);
      setRerollCount(c => reroll ? c+1 : 1);
    } catch(e) {
      console.error(e);
      setResults([]);
    } finally { setGenerating(false); }
  };

  const excludedCount = Object.keys(me.statuses||{}).filter(id => ["completed","watching","dropped"].includes((me.statuses||{})[id])).length;
  const compat = computeCompatibility(selectedMoods);

  return (
    <div className="min-h-screen w-full px-6 py-10 md:px-10">
      <div className="mx-auto max-w-7xl">
        {/* ── HEADER ── */}
        <div className="mb-10 animate-slide-up">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-5xl">🎭</span>
            <div>
              <h1 className={`text-[40px] font-bold leading-tight tracking-tight md:text-[48px] ${GRADIENT_TEXT}`}>
                Moodboard
              </h1>
            </div>
          </div>
          <p className="text-lg text-slate-400">Trouve ton prochain anime selon ton humeur.</p>
          <p className="mt-1.5 text-sm text-slate-600">Jusqu'à 3 moods · recommandations IA personnalisées</p>
        </div>

        {/* ── DASHBOARD ── */}
        <div className="grid gap-8 lg:grid-cols-[420px_1fr] lg:items-start">
          {/* LEFT — controls */}
          <div className={`flex flex-col gap-8 p-5 ${GLASS}`} style={GLASS_STYLE}>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Mood <span className="font-normal normal-case text-slate-600">(max 3)</span></p>
                <button onClick={() => setShowMoodInfo(true)} className="flex h-5.5 w-5.5 items-center justify-center rounded-full border border-white/15 bg-white/6 text-xs font-black text-slate-400 transition hover:bg-white/12">?</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[...MOODS.slice(0,4), null, ...MOODS.slice(4)].map(m => m
                  ? <MoodCard key={m.id} mood={m} selected={selectedMoods.includes(m.id)} onClick={() => toggleMood(m.id)} />
                  : <MoodGuideTile key="guide" onClick={() => setShowMoodInfo(true)} />
                )}
              </div>
            </div>

            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Durée</p>
              <ChipGroup items={DURATIONS} value={[duration]} onToggle={setDuration} />
            </div>
            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Pays d'origine</p>
              <ChipGroup items={COUNTRIES} value={countries} onToggle={v => toggleMulti(v, countries, setCountries)} />
            </div>
            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Type</p>
              <ChipGroup items={MEDIA_TYPES} value={mediaTypes} onToggle={v => toggleMulti(v, mediaTypes, setMediaTypes)} />
            </div>

            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Coups de cœur amis</p>
              <button onClick={()=>setShowFriendHighlights(p=>!p)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold transition ${showFriendHighlights ? "border border-red-400/30 bg-red-400/10 text-red-400" : "border border-white/8 bg-white/3 text-slate-500"}`}>
                ❤️ {showFriendHighlights ? "Actif — bordure rouge" : "Désactivé"}
              </button>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-400/15 bg-emerald-400/6 px-3 py-2 text-[11px] text-emerald-400">
              ✓ {excludedCount} animés exclus · 🤖 mood IA activé
            </div>
          </div>

          {/* RIGHT — preview / results */}
          <div ref={resultsRef} className="min-h-[420px] animate-slide-up" style={{ scrollMarginTop: "96px" }}>
            {generating && (
              <div className={`flex min-h-[420px] items-center justify-center p-10 ${GLASS}`} style={GLASS_STYLE}>
                <Spinner label="Analyse en cours…" />
              </div>
            )}

            {!generating && hasSearched && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMoods.map(mid => { const m = getMoodObj(mid); return m && (
                      <span key={mid} className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background:`${m.color}22`, border:`1px solid ${m.color}44`, color:m.color }}>{m.emoji} {m.label}</span>
                    ); })}
                  </div>
                  {results.length > 0 && (() => {
                    const locked = rerollCount >= 3;
                    const label = rerollCount <= 1 ? "🎲 Autres suggestions"
                                : rerollCount === 2 ? "🎲 Encore d'autres ?"
                                : "🔒 Modifie ta sélection";
                    return locked ? (
                      <div className="flex flex-col items-end gap-1">
                        <button disabled className="cursor-not-allowed rounded-full border-2 border-white/8 px-4 py-2 text-xs font-extrabold text-slate-600">{label}</button>
                        <span className="text-[10px] text-slate-600">Change les moods pour relancer</span>
                      </div>
                    ) : (
                      <button onClick={() => generate(true)} className="rounded-full border-2 border-indigo-400/30 px-4 py-2 text-xs font-extrabold text-indigo-400 transition hover:border-indigo-400/60">{label}</button>
                    );
                  })()}
                </div>
                {results.length > 0 ? (
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                    {results.map(a => (
                      <MoodResultCard key={a.mal_id} anime={a} selectedMoods={selectedMoods} onClick={onOpenDetail}
                        friendUsers={showFriendHighlights ? (friendHighlights[a.mal_id]||[]) : []}/>
                    ))}
                  </div>
                ) : (
                  <div className={`flex flex-col items-center gap-2 py-16 text-center ${GLASS}`} style={GLASS_STYLE}>
                    <div className="text-4xl">😶</div>
                    <p className="font-bold text-slate-400">Aucun animé trouvé</p>
                    <p className="text-xs text-slate-600">Essaie d'autres filtres</p>
                  </div>
                )}
              </div>
            )}

            {!generating && !hasSearched && selectedMoods.length === 0 && (
              <div className={`flex min-h-[420px] flex-col items-center justify-center gap-6 p-10 text-center ${GLASS}`} style={GLASS_STYLE}>
                <div className="text-7xl">🎭</div>
                <div>
                  <p className="text-lg font-bold text-slate-100">Choisis tes moods.</p>
                  <p className="text-sm text-slate-500">Nous trouverons le meilleur anime.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <StatPill label="12 000 animes" />
                  <StatPill label="Recommandations IA" />
                  <StatPill label="98% de satisfaction" />
                </div>
              </div>
            )}

            {!generating && !hasSearched && selectedMoods.length > 0 && (
              <div className={`flex min-h-[420px] flex-col gap-8 p-8 ${GLASS}`} style={GLASS_STYLE}>
                <div>
                  <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Mood actuel</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedMoods.map(mid => { const m = getMoodObj(mid); return m && (
                      <span key={mid} className="rounded-full px-3 py-1.5 text-sm font-bold" style={{ background:`${m.color}18`, border:`1px solid ${m.color}55`, color:m.color }}>{m.emoji} {m.label}</span>
                    ); })}
                  </div>
                </div>
                <div>
                  <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Genres dominants</p>
                  <div className="flex flex-wrap gap-2">
                    {dominantGenres(selectedMoods).map(g => (
                      <span key={g} className="rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">{g}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Compatibilité</p>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${compat}%`, background: GRADIENT_PRIMARY }} />
                    </div>
                    <span className="text-sm font-extrabold text-violet-300">{compat}%</span>
                  </div>
                </div>
                <p className="mt-auto text-xs text-slate-600">Clique sur « Trouver mon anime » pour voir tes recommandations personnalisées.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="mt-10 flex justify-center">
          <GradientButton onClick={() => generate(false)} disabled={selectedMoods.length===0} className="px-10 py-4 text-base">
            {selectedMoods.length>0 ? "✨ Trouver mon anime" : "Choisis un mood d'abord"}
          </GradientButton>
        </div>
      </div>

      {showMoodInfo && (
        <Modal onClose={() => setShowMoodInfo(false)} maxWidth="max-w-lg">
          {close => (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[15px] font-black text-slate-100">🎭 Les 8 moods</div>
                <button onClick={close} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-sm text-slate-400">✕</button>
              </div>
              <div className="flex flex-col gap-3">
                {MOODS.map(m => (
                  <div key={m.id} className="flex items-start gap-3 rounded-xl p-2.5" style={{ background:`${m.color}08`, border:`1px solid ${m.color}22` }}>
                    <span className="shrink-0 text-xl">{m.emoji}</span>
                    <div>
                      <div className="mb-0.5 text-xs font-black" style={{ color:m.color }}>{m.label}</div>
                      <div className="text-[11px] leading-relaxed text-slate-400">{MOOD_DESCRIPTIONS[m.id]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
