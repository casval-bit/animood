import { useState, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { STATUS_COLORS, STATUS_PRIORITY } from "../constants/statuses.js";
import { AVATAR_EMOJIS } from "../constants/avatars.js";
import { MOOD_KEYS } from "../constants/moods.js";
import { jikan } from "../api/jikan.js";
import { follows, sb } from "../api/supabase.js";
import { FRAMES, getUnlockedFrames, getBestFrame } from "../frames/frames.js";
import { FrameSVG } from "../frames/FrameSVG.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { ScoreChart } from "../components/ScoreChart.jsx";
import { MoodOctagon } from "../components/MoodOctagon.jsx";
import { AnimePoster } from "../components/AnimeCard.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Modal } from "../components/Modal.jsx";
import { FavoriteSearchModal } from "../components/FavoriteSearchModal.jsx";
import { TabBar } from "../components/ui.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

// ─── PERSONAL MOOD RADAR ──────────────────────────────────────────────────────
function PersonalMoodRadar({ ratings, watched }) {
  const [avg, setAvg] = useState(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const allIds = watched.length > 0 ? watched : Object.keys(ratings).map(Number);

  useEffect(() => {
    if(allIds.length === 0) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const totals = {}; MOOD_KEYS.forEach(k => { totals[k] = 0; });
      let cnt = 0;
      const chunks = [];
      for(let i=0;i<allIds.length;i+=100) chunks.push(allIds.slice(i,i+100));
      for(const chunk of chunks) {
        try {
          const rows = await sb.query(`mood_pts_v2?mal_id=in.(${chunk.join(",")})&select=mal_id,emotional,happy,twisted,chill,in_love,hype,dark,thrills`);
          (rows||[]).forEach(row => {
            const hasData = MOOD_KEYS.some(k => (row[k]||0) > 0);
            if(hasData) { MOOD_KEYS.forEach(k => { totals[k] += row[k]||0; }); cnt++; }
          });
        } catch {}
      }
      if(cancelled) return;
      if(cnt > 0) {
        const a = {}; MOOD_KEYS.forEach(k => { a[k] = Math.round(totals[k]/cnt); });
        setAvg(a); setCount(cnt);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [allIds.length, watched.length]);

  if(loading) return <div className="mb-2"><Spinner label="Calcul en cours…" /></div>;
  if(!avg) return null;

  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎭 Ton profil émotionnel</div>
      <div className="mb-2 text-[10px] text-slate-600">Basé sur {count} animés vus sur {allIds.length}</div>
      <MoodOctagon pts={avg} />
    </div>
  );
}

// ─── TOP GENRES ───────────────────────────────────────────────────────────────
function TopGenres({ watched }) {
  const [top5, setTop5] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if(watched.length === 0) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const genreCount = {};
      const chunks = [];
      for(let i=0;i<watched.length;i+=100) chunks.push(watched.slice(i,i+100));
      for(const chunk of chunks) {
        try {
          const rows = await sb.query(`anime_cache?mal_id=in.(${chunk.join(",")})&select=genres`);
          (rows||[]).forEach(row => { (row.genres||[]).forEach(g => { const name=g.name||g; genreCount[name]=(genreCount[name]||0)+1; }); });
        } catch {}
      }
      if(cancelled) return;
      setTop5(Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,5));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [watched.length]);

  if(loading) return <div><div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎌 Genres les plus vus</div><Spinner label="Chargement…" /></div>;
  if(top5.length === 0) return null;
  const max = top5[0][1];

  return (
    <div>
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎌 Genres les plus vus</div>
      <div className="flex flex-col gap-2">
        {top5.map(([name,count]) => (
          <div key={name}>
            <div className="mb-1 flex justify-between"><span className="text-[11px] font-semibold text-slate-300">{name}</span><span className="text-[10px] text-slate-500">{count}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width:`${(count/max)*100}%`, background: GRADIENT_PRIMARY }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [{id:"profile",label:"Profil"},{id:"journal",label:"Journal"},{id:"lists",label:"Listes"},{id:"posts",label:"Mes Posts"}];

export function ProfileView({ onOpenDetail, onOpenSettings }) {
  const { me, saveMe, myUsername } = useApp();
  const [tab, setTab] = useState("profile");
  const [journalFilter, setJournalFilter] = useState(null);
  const [journalGrid, setJournalGrid] = useState(true);
  const [watchlistPage, setWatchlistPage] = useState(0);
  const [animeCache, setAnimeCache] = useState({});
  const [favPopup, setFavPopup] = useState(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [unlockedFrames, setUnlockedFrames] = useState([]);
  const [activeFrame, setActiveFrame] = useState(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState(me.bio||"");

  const fetchAnime = async (id) => {
    if(!id || animeCache[id]) return;
    try { const r = await jikan.getAnime(id); setAnimeCache(p => ({...p,[id]:r.data})); } catch {}
  };

  useEffect(() => {
    const priority = [
      ...(me.favorites||[]).filter(Boolean).slice(0,5),
      ...Object.keys(me.statuses||{}).filter(id => (me.statuses||{})[id]==="completed").map(Number)
        .filter(id => !(me.hiddenCompleted||[]).includes(id)).slice(-5).reverse(),
    ];
    priority.forEach(id => fetchAnime(id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if(tab !== "journal") return;
    const watchlistIds = Object.entries(me.statuses||{}).filter(([,s])=>s==="watchlist").map(([id])=>parseInt(id));
    const ids = [...new Set([...me.watched, ...watchlistIds])].reverse();
    ids.forEach(id => fetchAnime(id));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if(tab !== "lists") return;
    const watchlistIds = Object.entries(me.statuses||{}).filter(([,s])=>s==="watchlist").map(([id])=>parseInt(id));
    watchlistIds.forEach(id => fetchAnime(id));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        const [followerRows, voteRows] = await Promise.all([
          follows.getFollowers(myUsername),
          sb.query(`user_votes?username=eq.${myUsername}&select=pts_added&limit=1000`),
        ]);
        const genreCounts = {};
        const chunks = [];
        for(let i=0;i<me.watched.length;i+=100) chunks.push(me.watched.slice(i,i+100));
        for(const chunk of chunks) {
          try {
            const rows = await sb.query(`anime_cache?mal_id=in.(${chunk.join(",")})&select=genres`);
            (rows||[]).forEach(row => { (row.genres||[]).forEach(g => { const name=g.name||g; genreCounts[name]=(genreCounts[name]||0)+1; }); });
          } catch {}
        }
        const unlocked = getUnlockedFrames({ watchedCount: me.watched.length, genreCounts, followerCount: followerRows.length, userVotes: voteRows||[] });
        setUnlockedFrames(unlocked);
        const savedFrameId = me.activeFrame;
        const saved = savedFrameId ? FRAMES[savedFrameId] : null;
        const best = getBestFrame(unlocked);
        setActiveFrame(saved && unlocked.find(f=>f.id===savedFrameId) ? saved : best);
      } catch(e) { console.error("Frame load error:", e); }
    })();
  }, [me.watched.length, myUsername]);

  const getAnime = id => animeCache[id] || { mal_id:id, title:`MAL #${id}`, images:{jpg:{}} };
  const rated = Object.keys(me.ratings).map(Number);
  const avgScore = rated.length ? (rated.reduce((a,id)=>a+me.ratings[id].score,0)/rated.length).toFixed(1) : "—";
  const hidden = me.hiddenCompleted || [];
  const completed = Object.entries(me.statuses||{}).filter(([,s])=>s==="completed").map(([id])=>Number(id)).filter(id=>!hidden.includes(id)).slice(-5).reverse();

  const watchlistIds = Object.entries(me.statuses||{}).filter(([,s])=>s==="watchlist").map(([id])=>parseInt(id));
  const allTrackedIds = [...new Set([...me.watched, ...watchlistIds])];
  const journalEntries = allTrackedIds
    .filter(id => !journalFilter || ((me.statuses||{})[id]||"completed") === journalFilter)
    .sort((a,b) => (STATUS_PRIORITY[(me.statuses||{})[a]||"completed"]??5) - (STATUS_PRIORITY[(me.statuses||{})[b]||"completed"]??5));

  const saveBio = () => saveMe({ ...me, bio: bioInput });
  const setAvatar = (e) => { saveMe({ ...me, avatar: e }); setShowAvatarPicker(false); };
  const setFrame = (frame) => { setActiveFrame(frame); saveMe({ ...me, activeFrame: frame?.id||null }); setShowFramePicker(false); };
  const selectFavorite = (a) => {
    const newFavs = [...(me.favorites||[null,null,null,null,null])];
    newFavs[favPopup] = a.mal_id;
    saveMe({ ...me, favorites: newFavs });
    setAnimeCache(p => ({...p,[a.mal_id]:a}));
    setFavPopup(null);
  };
  const removeFavorite = (idx) => { const f=[...(me.favorites||[null,null,null,null,null])]; f[idx]=null; saveMe({...me,favorites:f}); };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <FrameSVG frame={activeFrame} size={96}>
            <button onClick={() => setShowAvatarPicker(true)}
              className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full text-4xl transition hover:scale-105" style={{ background: GRADIENT_PRIMARY }}>
              {me.avatar && me.avatar.startsWith("http") ? <img src={me.avatar} alt="avatar" className="h-full w-full object-cover" /> : me.avatar}
            </button>
          </FrameSVG>
          <div onClick={() => setShowAvatarPicker(true)} className="absolute bottom-0 right-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-slate-950 bg-violet-600 text-[10px]">✏️</div>
          {unlockedFrames.length > 0 && (
            <div onClick={() => setShowFramePicker(true)} className="absolute right-0 top-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-slate-950 bg-indigo-600 text-[10px]">🖼</div>
          )}
        </div>

        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between">
            <div>
              <div className="text-2xl font-black tracking-tight text-slate-100">{me.name}</div>
              <div className="text-xs text-slate-500">@{me.name?.toLowerCase()} · AniMood</div>
            </div>
            <button onClick={onOpenSettings} className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-xs font-bold text-slate-400">⚙️</button>
          </div>

          <div className="my-4 grid grid-cols-3 gap-3 sm:max-w-sm">
            {[{l:"Vus",v:me.watched.length},{l:"Notés",v:rated.length},{l:"Moy.",v:avgScore}].map(s => (
              <div key={s.l} className="rounded-xl bg-white/3 py-2.5 text-center">
                <div className="text-lg font-black text-purple-300">{s.v}</div>
                <div className="mt-0.5 text-[9px] text-slate-500">{s.l}</div>
              </div>
            ))}
          </div>

          {editingBio ? (
            <div className="flex max-w-md gap-2">
              <input value={bioInput} onChange={e => setBioInput(e.target.value)} maxLength={80} placeholder="Ton style d'anime…"
                className="flex-1 rounded-lg border border-violet-600/40 bg-white/7 px-2.5 py-1.5 text-xs text-slate-100 outline-none"
                onKeyDown={e => { if(e.key==="Enter"){saveBio();setEditingBio(false);} if(e.key==="Escape")setEditingBio(false); }} />
              <button onClick={() => { saveBio(); setEditingBio(false); }} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white">✓</button>
            </div>
          ) : (
            <button onClick={() => { setBioInput(me.bio||""); setEditingBio(true); }} className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-left text-[11px] text-slate-500">
              {me.bio || "✏️ Ajoute une bio…"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <TabBar tabs={TABS} active={tab} onChange={setTab} className="mb-6" />

      {/* ── PROFIL TAB ── */}
      {tab === "profile" && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">❤️ Favoris</div>
              </div>
              <div className="grid grid-cols-5 gap-2.5">
                {(me.favorites||[null,null,null,null,null]).slice(0,5).map((favId, i) => (
                  <div key={i} className="group relative">
                    <AnimePoster
                      anime={favId ? getAnime(favId) : null}
                      loading={!!favId}
                      empty={!favId}
                      onEmptyClick={() => setFavPopup(i)}
                      onClick={onOpenDetail}
                    />
                    {favId && (
                      <button onClick={() => removeFavorite(i)}
                        className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-red-500 text-[10px] font-black text-white group-hover:flex">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">✅ Derniers complétés</div>
              <div className="grid grid-cols-5 gap-2.5">
                {completed.slice(0,5).map(id => <AnimePoster key={id} anime={getAnime(id)} onClick={onOpenDetail} loading />)}
                {Array.from({length: Math.max(0,5-completed.length)}).map((_,i) => <div key={i} className="aspect-2/3 rounded-lg border-2 border-dashed border-white/6 bg-white/3" />)}
              </div>
            </div>

            <div>
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">📊 Distribution des notes</div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
                {rated.length>0 ? <ScoreChart ratings={me.ratings} /> : <p className="text-center text-[11px] text-slate-500">Note des animés pour voir ta distribution</p>}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <PersonalMoodRadar ratings={me.ratings} watched={me.watched} />
            <TopGenres watched={me.watched} />
          </div>
        </div>
      )}

      {/* ── JOURNAL TAB ── */}
      {tab === "journal" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATUS_COLORS).map(([k,v]) => {
                const active = journalFilter === k;
                return (
                  <button key={k} onClick={() => setJournalFilter(active?null:k)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
                    style={{ border:`1px solid ${active?v.dot:"rgba(255,255,255,0.08)"}`, background: active?`${v.dot}22`:"rgba(255,255,255,0.03)", color: active?v.dot:"#6b7280" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background:v.dot }} />{v.label}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setJournalGrid(g=>!g)} className={`rounded-lg border px-2.5 py-1.5 text-sm ${journalGrid?"border-indigo-400/30 bg-indigo-400/12 text-indigo-300":"border-white/10 text-slate-500"}`}>
              {journalGrid ? "⊞" : "☰"}
            </button>
          </div>

          {journalEntries.length === 0 && <EmptyState emoji="📖" title="Ton journal est vide" />}

          {journalGrid && journalEntries.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {journalEntries.map(id => {
                const status = (me.statuses||{})[id]||"completed";
                const sc = STATUS_COLORS[status]||STATUS_COLORS.completed;
                return <AnimePoster key={id} anime={getAnime(id)} onClick={onOpenDetail} statusDot={sc.dot} />;
              })}
            </div>
          )}

          {!journalGrid && journalEntries.length > 0 && (
            <div className="flex flex-col gap-2">
              {journalEntries.map(id => {
                const status = (me.statuses||{})[id]||"completed";
                const sc = STATUS_COLORS[status]||STATUS_COLORS.completed;
                const a = getAnime(id); const r = me.ratings[id];
                const img = a?.images?.jpg?.image_url||a?.images?.jpg?.large_image_url;
                return (
                  <button key={id} onClick={() => onOpenDetail(a)} className="flex gap-3 overflow-hidden rounded-xl text-left" style={{ border:`1px solid ${sc.border}`, background:sc.bg }}>
                    <div className="relative h-19 w-13 shrink-0 bg-black/20">
                      {img && <img src={img} alt={a.title} className="h-full w-full object-cover" onError={e=>{e.target.style.display="none";}} />}
                      <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full" style={{ background:sc.dot }} />
                    </div>
                    <div className="flex flex-1 flex-col justify-between py-2 pr-3">
                      <div>
                        <div className="text-xs font-extrabold leading-tight text-slate-100">{a.title}</div>
                        <div className="mt-0.5 text-[10px] font-bold" style={{ color:sc.dot }}>{sc.label}</div>
                      </div>
                      {r ? <span className="text-xs font-extrabold text-amber-400">★ {r.score}/10</span> : <span className="text-[10px] text-slate-700">Non noté</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── LISTES TAB ── */}
      {tab === "lists" && (() => {
        const WATCHLIST_PAGE_SIZE = 24;
        const pageCount = Math.max(1, Math.ceil(watchlistIds.length / WATCHLIST_PAGE_SIZE));
        const page = Math.min(watchlistPage, pageCount - 1);
        const paged = watchlistIds.slice(page * WATCHLIST_PAGE_SIZE, (page + 1) * WATCHLIST_PAGE_SIZE);
        return (
          <div className="max-w-2xl">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="text-[13px] font-black text-slate-100">🎯 Watchlist</div>
              <div className="text-[11px] text-slate-500">{watchlistIds.length} animé{watchlistIds.length!==1?"s":""}</div>
            </div>
            {watchlistIds.length > 0 ? (
              <>
                <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                  {paged.map(id => <AnimePoster key={id} anime={animeCache[id]} onClick={onOpenDetail} loading />)}
                </div>
                {pageCount > 1 && (
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button onClick={() => setWatchlistPage(p => Math.max(0, p-1))} disabled={page===0}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-400 transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-30">
                      ‹ Précédent
                    </button>
                    <span className="text-[11px] text-slate-500">Page {page+1} / {pageCount}</span>
                    <button onClick={() => setWatchlistPage(p => Math.min(pageCount-1, p+1))} disabled={page===pageCount-1}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-400 transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-30">
                      Suivant ›
                    </button>
                  </div>
                )}
              </>
            ) : <EmptyState emoji="🎯" title="Watchlist vide" subtitle="Ajoute des animés via 🎯 sur leur fiche" />}
          </div>
        );
      })()}

      {/* ── MES POSTS TAB ── */}
      {tab === "posts" && (
        (me.posts||[]).length === 0
          ? <EmptyState emoji="✍️" title="Aucun post pour l'instant" />
          : <div className="flex max-w-2xl flex-col gap-2.5">
              {(me.posts||[]).map((post,i) => (
                <div key={i} className="rounded-xl border border-white/7 bg-white/4 p-3.5">
                  <div className="mb-1.5 text-[10px] text-slate-600">{post.source} · {post.date}</div>
                  <div className="text-[13px] text-slate-200">{post.content}</div>
                </div>
              ))}
            </div>
      )}

      {/* Frame picker */}
      {showFramePicker && (
        <Modal onClose={() => setShowFramePicker(false)} maxWidth="max-w-lg">
          <div className="p-6">
            <div className="mb-1 text-center text-sm font-black text-slate-100">🖼 Cadres débloqués</div>
            <div className="mb-4 text-center text-[11px] text-slate-500">{unlockedFrames.length} cadre{unlockedFrames.length!==1?"s":""} débloqué{unlockedFrames.length!==1?"s":""}</div>
            <button onClick={() => setFrame(null)}
              className="mb-2.5 flex w-full items-center gap-3 rounded-xl p-2.5 text-left"
              style={{ border: !activeFrame ? "2px solid #7c3aed" : "2px solid transparent", background: !activeFrame ? "rgba(124,58,237,0.1)" : "transparent" }}>
              <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-white/15 bg-white/5 text-lg">🚫</div>
              <div><div className="text-xs font-bold text-slate-100">Aucun cadre</div><div className="text-[10px] text-slate-500">Avatar sans cadre</div></div>
            </button>
            <div className="flex flex-col gap-2">
              {["watched","contribution","followers","genre"].map(cat => {
                const catFrames = unlockedFrames.filter(f=>f.category===cat);
                if(!catFrames.length) return null;
                const catLabels = {watched:"📺 Animés vus",contribution:"🗳️ Contribution",followers:"👥 Followers",genre:"🎌 Genre"};
                return (
                  <div key={cat}>
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{catLabels[cat]}</div>
                    <div className="flex flex-wrap gap-2">
                      {catFrames.map(frame => {
                        const isActive = activeFrame?.id===frame.id;
                        return (
                          <button key={frame.id} onClick={() => setFrame(frame)}
                            className="flex flex-col items-center gap-1 rounded-xl p-2"
                            style={{ border: isActive?"2px solid #7c3aed":"2px solid transparent", background: isActive?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.03)" }}>
                            <div className="relative h-11 w-11">
                              <div className="flex h-11 w-11 items-center justify-center rounded-full text-lg" style={{ background: GRADIENT_PRIMARY }}>👤</div>
                              <svg className="absolute inset-0" viewBox="0 0 44 44" dangerouslySetInnerHTML={{ __html: frame.svg(44) }} />
                            </div>
                            <div className="max-w-13 text-center text-[9px] font-bold leading-tight" style={{ color:frame.color }}>{frame.label}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {/* Avatar picker */}
      {showAvatarPicker && (
        <Modal onClose={() => setShowAvatarPicker(false)} maxWidth="max-w-md">
          <div className="p-6">
            <div className="mb-4 text-center text-sm font-black text-slate-100">Choisir un avatar</div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {AVATAR_EMOJIS.map(e => (
                <button key={e} onClick={() => setAvatar(e)}
                  className="flex h-12.5 w-12.5 items-center justify-center rounded-xl text-2xl"
                  style={{ background: me.avatar===e?"rgba(124,58,237,0.3)":"rgba(255,255,255,0.05)", border: me.avatar===e?"2px solid #7c3aed":"2px solid transparent" }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {favPopup !== null && <FavoriteSearchModal onSelect={selectFavorite} onClose={() => setFavPopup(null)} />}
    </div>
  );
}
