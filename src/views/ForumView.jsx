import { useState, useEffect } from "react";
import { fetchNewAnime, fetchUpcomingAnime, fetchLatestTrailers, supabaseRowToAnime } from "../api/jikan.js";
import { fetchAiredDates } from "../api/anilist.js";
import { sb } from "../api/supabase.js";
import { topMoods } from "../api/moods.js";
import { MOODS, getMoodObj } from "../constants/moods.js";
import { useApp } from "../context/useApp.js";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { NewThreadModal, ThreadModal, TagPill, timeAgo } from "../components/ForumThreadModal.jsx";
import { MoodOctagon } from "../components/MoodOctagon.jsx";
import { WordleGame, PosterGame } from "../components/MiniGames.jsx";
import { Matchmaking, ChainGame, TimelineGame } from "../components/GameSystem.jsx";
import { Modal } from "../components/Modal.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_PRIMARY } from "../constants/theme.js";

const FALLBACK_IMG = "https://placehold.co/64x92/1a1a2e/818cf8?text=?";
const TYPE_EMOJI = { TV:"📺", Movie:"🎬", OVA:"💿", ONA:"🌐", Special:"✨" };
const NEW_ANIME_PREVIEW = 5;

function posterUrl(anime) {
  return anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
}

// Real countdown once AniList gives us a day-level date; falls back to the year
// we already have (from Jikan) rather than showing nothing while it loads.
function countdownLabel(anime, airedDates) {
  const date = airedDates[anime.mal_id];
  if(date) {
    const days = Math.ceil((date - Date.now()) / 86400000);
    if(days > 1) return `⏳ Dans ${days} j`;
    if(days === 1) return "⏳ Demain";
    if(days === 0) return "⏳ Aujourd'hui";
    return "Bientôt disponible";
  }
  return anime.year ? `Prévu en ${anime.year}` : "Date inconnue";
}

function defaultStat(anime) {
  return { primary: anime.score ? `★ ${anime.score}` : "—", secondary: anime.episodes ? `${anime.episodes} eps` : "?" };
}

// ─── One row = one "sujet" — thumbnail, title, blurb, stats, type/year ─────────
function ThreadRow({ anime, onClick, metaLabel, trailerLink, statOverride, dominantMood }) {
  const img = posterUrl(anime);
  const genres = (anime.genres || []).map(g => g.name || g).slice(0, 3).join(" · ");
  const stat = (statOverride || defaultStat)(anime);

  return (
    <div className="flex w-full items-center gap-3.5 border-b border-white/6 px-4 py-3 transition last:border-b-0 hover:bg-white/5 sm:gap-4 sm:px-5">
      <button onClick={() => onClick?.(anime)} className="flex min-w-0 flex-1 items-center gap-3.5 text-left sm:gap-4">
        <img
          src={img || FALLBACK_IMG} alt=""
          onError={e => { e.target.src = FALLBACK_IMG; }}
          className="h-14 w-10 shrink-0 rounded-md object-cover shadow-md"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold text-slate-100">{anime.title}</div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[11px] text-slate-500">{genres || anime.type || "Anime"}</span>
            {dominantMood && (
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: `${dominantMood.color}20`, color: dominantMood.color }}>
                {dominantMood.emoji} {dominantMood.label}
              </span>
            )}
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-0.5 text-right sm:flex">
          <div className="text-[12px] font-black text-amber-400">{stat.primary}</div>
          <div className="text-[10px] text-slate-600">{stat.secondary}</div>
        </div>
        <div className="hidden w-40 shrink-0 items-center gap-2 border-l border-white/6 pl-3 md:flex">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/6 text-xs">
            {TYPE_EMOJI[anime.type] || "🎬"}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-slate-300">{metaLabel(anime)}</div>
            <div className="truncate text-[10px] text-slate-600">{anime.year || "?"} · {anime.type || "?"}</div>
          </div>
        </div>
      </button>
      {trailerLink && anime.trailer?.url && (
        <a
          href={anime.trailer.url} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="shrink-0 rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-bold text-slate-100 transition hover:bg-white/15"
        >
          ▶ Trailer
        </a>
      )}
    </div>
  );
}

// ─── One category = banner header + list of rows, à la forum sub-section ──────
// `maxVisible` trims long lists (e.g. "Nouveaux animes") behind a "Voir plus" toggle
// so obscure/low-interest entries don't dominate the page by default.
function ForumCategory({ emoji, title, subtitle, items, onOpenDetail, metaLabel, trailerLink, statOverride, dominantMoods, maxVisible }) {
  const [expanded, setExpanded] = useState(false);
  if(!items.length) return null;
  const visible = maxVisible && !expanded ? items.slice(0, maxVisible) : items;

  return (
    <div className={`mb-6 overflow-hidden ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
        <div>
          <div className="text-[13px] font-black uppercase tracking-wide text-white">{emoji} {title}</div>
          {subtitle && <div className="text-[10.5px] text-white/70">{subtitle}</div>}
        </div>
        <div className="shrink-0 rounded-full bg-black/20 px-2.5 py-1 text-[10px] font-bold text-white/90">
          {items.length} sujet{items.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div>
        {visible.map(a => (
          <ThreadRow
            key={a.mal_id} anime={a} onClick={onOpenDetail} metaLabel={metaLabel}
            trailerLink={trailerLink} statOverride={statOverride}
            dominantMood={dominantMoods?.[a.mal_id]}
          />
        ))}
      </div>
      {maxVisible && items.length > maxVisible && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full border-t border-white/6 px-5 py-2.5 text-center text-[11px] font-bold text-violet-300 transition hover:bg-white/5"
        >
          {expanded ? "▲ Voir moins" : `▼ Voir plus (${items.length - maxVisible})`}
        </button>
      )}
    </div>
  );
}

// ─── Hero card — the single upcoming anime with the best real MAL popularity rank ──
function AnticipatedCard({ anime, airedDates, onOpenDetail }) {
  if(!anime) return null;
  const img = posterUrl(anime);
  const genres = (anime.genres || []).map(g => g.name || g).slice(0, 3).join(" · ");
  return (
    <button
      onClick={() => onOpenDetail?.(anime)}
      className={`mb-6 flex w-full items-center gap-5 overflow-hidden p-5 text-left ${GLASS}`}
      style={{ background: `linear-gradient(135deg, rgba(139,92,246,.22), rgba(236,72,153,.14)), ${GLASS_STYLE.background}`, boxShadow: GLASS_STYLE.boxShadow }}
    >
      <img src={img || FALLBACK_IMG} alt="" onError={e => { e.target.src = FALLBACK_IMG; }} className="h-32 w-24 shrink-0 rounded-xl object-cover shadow-lg sm:h-36 sm:w-26" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-fuchsia-300">🔥 Anime le plus attendu — meilleure popularité MAL</div>
        <div className="mb-1 truncate text-[19px] font-black text-slate-50 sm:text-[22px]">{anime.title}</div>
        <div className="mb-3 truncate text-[11.5px] text-slate-400">{genres || anime.type}</div>
        <div className="inline-block rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white">{countdownLabel(anime, airedDates)}</div>
      </div>
    </button>
  );
}

// ─── Community mood pulse — real aggregation of user_votes.moods over 7 days ──
function CommunityMoodBlock({ loaded, counts, total }) {
  if(!loaded) return null;
  const ranked = MOODS.map(m => ({ ...m, count: counts[m.id] || 0 }))
    .sort((a, b) => b.count - a.count)
    .filter(m => m.count > 0)
    .map(m => ({ ...m, pct: Math.round((m.count / total) * 100) }));

  return (
    <div className={`mb-6 p-5 ${GLASS}`} style={GLASS_STYLE}>
      <div className="mb-0.5 text-[13px] font-black text-slate-100">😊 Humeur de la communauté</div>
      {total === 0 ? (
        <div className="mt-1 text-[11px] text-slate-500">Pas encore assez de votes cette semaine pour dégager une tendance.</div>
      ) : (
        <>
          <div className="mb-4 text-[10.5px] text-slate-500">Cette semaine, d'après {total} réaction{total !== 1 ? "s" : ""} de mood</div>
          <MoodOctagon
            pts={counts} size={190} title={null}
            className="mx-auto mb-4 w-fit rounded-xl border border-white/6 bg-white/3 p-2.5"
          />
          <div className="flex flex-col gap-2">
            {ranked.map(m => (
              <div key={m.id} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-300">{m.emoji} {m.label}</span>
                <span className="shrink-0 text-[11px] font-bold text-slate-400">{m.pct}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Real discussions — threads + reply counts, no reactions/pagination ───────
function DiscussionsBlock({ threads, replyCounts, unreadCounts, loaded, onOpenThread, onNewThread }) {
  return (
    <div className={`mb-6 overflow-hidden ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
        <div className="text-[13px] font-black uppercase tracking-wide text-white">🔥 Discussions</div>
        <button onClick={onNewThread} className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[12px] font-black text-violet-700 shadow-md transition hover:scale-105 hover:shadow-lg">
          ➕ Nouveau sujet
        </button>
      </div>
      {!loaded ? (
        <div className="p-5"><Spinner small label="Chargement…" /></div>
      ) : threads.length === 0 ? (
        <div className="p-6 text-center">
          <div className="mb-1 text-sm font-bold text-slate-300">Aucune discussion pour l'instant</div>
          <div className="mb-4 text-[11px] text-slate-500">Lance la première conversation de la communauté.</div>
          <button onClick={onNewThread} className="rounded-xl bg-linear-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white">
            ➕ Créer un sujet
          </button>
        </div>
      ) : (
        <div>
          {threads.map(t => {
            const unread = unreadCounts[t.id] || 0;
            return (
              <button
                key={t.id} onClick={() => onOpenThread(t)}
                className="flex w-full items-start gap-3 border-b border-white/6 px-5 py-3.5 text-left transition last:border-b-0 hover:bg-white/5"
              >
                {t.image_url && (
                  <img src={t.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" onError={e=>{e.target.style.display="none";}} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-slate-100">💬 {t.title}</div>
                  <div className="mb-1 truncate text-[11px] text-slate-500">@{t.username} · {timeAgo(t.created_at)}</div>
                  {t.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.tags.map(id => <TagPill key={id} id={id} />)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className={`text-[11px] font-bold ${unread > 0 ? "text-slate-100" : "text-slate-400"}`}>
                    {replyCounts[t.id] || 0} réponse{(replyCounts[t.id] || 0) !== 1 ? "s" : ""}
                  </div>
                  {unread > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-[3px] text-[9px] font-black leading-none text-white" style={{ background: "#f43f5e" }}>
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ForumView({ onOpenDetail, onOpenUser }) {
  const { myUsername, activityNotifications, markActivityRead } = useApp();
  const [newAnime, setNewAnime] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [airedDates, setAiredDates] = useState({});
  const [dominantMoods, setDominantMoods] = useState({});

  const [moodCounts, setMoodCounts] = useState({});
  const [moodTotal, setMoodTotal]   = useState(0);
  const [moodLoaded, setMoodLoaded] = useState(false);

  const [favorites, setFavorites]         = useState([]); // [{anime, count}]
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  const [threads, setThreads]         = useState([]);
  const [replyCounts, setReplyCounts] = useState({});
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [openThread, setOpenThread]       = useState(null);
  const [showWordle, setShowWordle]       = useState(false);
  const [showPoster, setShowPoster]       = useState(false);
  const [matchmaking, setMatchmaking]     = useState(null); // 'chain' | 'timeline' | null
  const [activeRoom, setActiveRoom]       = useState(null);
  const [activeGame, setActiveGame]       = useState(null); // 'chain' | 'timeline'

  // Sourced from the same activityNotifications the header bell reads — so the
  // inline badge below and the bell always agree on what's actually unread.
  const unreadCounts = {};
  (activityNotifications || []).forEach(n => {
    if(n.type === "thread" || n.type === "thread-mention") unreadCounts[n.id] = (unreadCounts[n.id] || 0) + n.count;
  });

  const openThreadRead = (t) => { markActivityRead("thread", t.id); markActivityRead("thread-mention", t.id); setOpenThread(t); };

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchUpcomingAnime(15), fetchNewAnime(15), fetchLatestTrailers(15)])
      .then(([u, n, t]) => { if(!cancelled) { setUpcoming(u); setNewAnime(n); setTrailers(t); } })
      .finally(() => { if(!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Progressive enhancement — exact air dates for the countdown, fetched after
  // the upcoming list itself has rendered so it never blocks first paint.
  useEffect(() => {
    if(!upcoming.length) return;
    let cancelled = false;
    fetchAiredDates(upcoming.map(a => a.mal_id)).then(dates => { if(!cancelled) setAiredDates(dates); });
    return () => { cancelled = true; };
  }, [upcoming]);

  // Dominant mood per visible anime — one batched query for every row on the page.
  useEffect(() => {
    const ids = [...new Set([...upcoming, ...newAnime, ...trailers, ...favorites.map(f => f.anime)].map(a => a.mal_id))];
    if(!ids.length) return;
    let cancelled = false;
    sb.getMoodPtsBatch(ids).then(rows => {
      if(cancelled) return;
      const out = {};
      Object.entries(rows).forEach(([id, pts]) => {
        const [topId] = topMoods(pts, 1)[0] || [];
        if(topId) out[id] = getMoodObj(topId);
      });
      setDominantMoods(out);
    });
    return () => { cancelled = true; };
  }, [upcoming, newAnime, trailers, favorites]);

  useEffect(() => {
    let cancelled = false;
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    sb.getRecentMoodVotes(since).then(rows => {
      if(cancelled) return;
      const counts = {};
      let total = 0;
      rows.forEach(r => (r.moods || []).forEach(m => { counts[m] = (counts[m] || 0) + 1; total++; }));
      setMoodCounts(counts);
      setMoodTotal(total);
    }).finally(() => { if(!cancelled) setMoodLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // Real "most favorited" — tallies every profile's pinned favorites (4-slot showcase),
  // no fabricated counts.
  useEffect(() => {
    let cancelled = false;
    sb.getAllFavorites().then(async profiles => {
      if(cancelled) return;
      const counts = {};
      profiles.forEach(p => (p.favorites || []).forEach(id => { if(id) counts[id] = (counts[id] || 0) + 1; }));
      const topIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => parseInt(id));
      if(!topIds.length) { setFavoritesLoaded(true); return; }
      const rows = await sb.getAnimeCacheByIds(topIds).catch(() => []);
      const byId = {}; rows.forEach(r => { byId[r.mal_id] = supabaseRowToAnime(r); });
      const list = topIds.filter(id => byId[id]).map(id => ({ anime: byId[id], count: counts[id] }));
      if(!cancelled) setFavorites(list);
    }).finally(() => { if(!cancelled) setFavoritesLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    sb.listThreads(20).then(async rows => {
      if(cancelled) return;
      setThreads(rows);
      const counts = await sb.getReplyCounts(rows.map(r => r.id));
      if(!cancelled) setReplyCounts(counts);
    }).finally(() => { if(!cancelled) setThreadsLoaded(true); });
    return () => { cancelled = true; };
  }, [myUsername]);

  const empty = !loading && !upcoming.length && !newAnime.length && !trailers.length;
  const mostAnticipated = upcoming.reduce((best, a) => {
    if(a.popularity == null) return best;
    if(!best || a.popularity < best.popularity) return a;
    return best;
  }, null);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 animate-slide-up">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight text-slate-50 md:text-[32px]">💬 Forum</h1>
        <p className="text-sm text-slate-500">Le pouls de la communauté — humeur du moment, sorties à venir, nouveautés et derniers trailers.</p>
      </div>

      {loading && <Spinner label="Chargement des actus…" />}
      {empty && <EmptyState emoji="💬" title="Rien pour l'instant" subtitle="Reviens bientôt pour les dernières actus." />}

      {!loading && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <DiscussionsBlock
              threads={threads} replyCounts={replyCounts} unreadCounts={unreadCounts} loaded={threadsLoaded}
              onOpenThread={openThreadRead} onNewThread={() => setShowNewThread(true)}
            />
            <AnticipatedCard anime={mostAnticipated} airedDates={airedDates} onOpenDetail={onOpenDetail} />

            <ForumCategory
              emoji="📅" title="Prochaines sorties" subtitle="Annonces à venir"
              items={upcoming} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={a => countdownLabel(a, airedDates)}
            />
            <ForumCategory
              emoji="🎬" title="Derniers trailers" subtitle="Bandes-annonces récentes"
              items={trailers} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={() => "Trailer"} trailerLink
            />
            {favoritesLoaded && favorites.length > 0 && (
              <ForumCategory
                emoji="❤️" title="Les plus ajoutés en favoris" subtitle="D'après les favoris épinglés des membres"
                items={favorites.map(f => f.anime)} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
                metaLabel={() => "Favori"}
                statOverride={a => {
                  const f = favorites.find(x => x.anime.mal_id === a.mal_id);
                  return { primary: `❤️ ${f?.count ?? 0}`, secondary: (f?.count ?? 0) > 1 ? "favoris" : "favori" };
                }}
              />
            )}
            <ForumCategory
              emoji="🆕" title="Nouveaux animes ajoutés" subtitle="Derniers ajouts à la base"
              items={newAnime} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={() => "Nouveau"} maxVisible={NEW_ANIME_PREVIEW}
            />
          </div>

          <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[280px]">
            <CommunityMoodBlock loaded={moodLoaded} counts={moodCounts} total={moodTotal} />

            {/* Mini-jeux */}
            <div className="mt-4 rounded-2xl border border-white/8 bg-white/3 p-4">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎮 Mini-jeux du jour</div>
              <div className="flex gap-3 justify-center">
                <button onClick={()=>setShowWordle(true)}
                  title="Wordle Animé"
                  style={{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(124,58,237,0.4)",
                    background:"rgba(124,58,237,0.12)",cursor:"pointer",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(124,58,237,0.25)";e.currentTarget.style.transform="scale(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(124,58,237,0.12)";e.currentTarget.style.transform="scale(1)";}}>
                  <span style={{fontSize:20}}>🎯</span>
                  <span style={{fontSize:8,color:"#c084fc",fontWeight:700}}>Wordle</span>
                </button>
                <button onClick={()=>setShowPoster(true)}
                  title="Poster Mystère"
                  style={{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(236,72,153,0.4)",
                    background:"rgba(236,72,153,0.1)",cursor:"pointer",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(236,72,153,0.22)";e.currentTarget.style.transform="scale(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(236,72,153,0.1)";e.currentTarget.style.transform="scale(1)";}}>
                  <span style={{fontSize:20}}>🖼</span>
                  <span style={{fontSize:8,color:"#f9a8d4",fontWeight:700}}>Poster</span>
                </button>
                <button onClick={()=>setMatchmaking("chain")}
                  title="Chaîne Animé — 1v1"
                  style={{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(251,191,36,0.4)",
                    background:"rgba(251,191,36,0.08)",cursor:"pointer",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(251,191,36,0.2)";e.currentTarget.style.transform="scale(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(251,191,36,0.08)";e.currentTarget.style.transform="scale(1)";}}>
                  <span style={{fontSize:20}}>⛓</span>
                  <span style={{fontSize:8,color:"#fbbf24",fontWeight:700}}>Chaîne</span>
                </button>
                <button onClick={()=>setMatchmaking("timeline")}
                  title="Timeline — 1v1"
                  style={{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(34,197,94,0.4)",
                    background:"rgba(34,197,94,0.08)",cursor:"pointer",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(34,197,94,0.2)";e.currentTarget.style.transform="scale(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(34,197,94,0.08)";e.currentTarget.style.transform="scale(1)";}}>
                  <span style={{fontSize:20}}>📅</span>
                  <span style={{fontSize:8,color:"#22c55e",fontWeight:700}}>Timeline</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {showNewThread && (
        <NewThreadModal
          username={myUsername}
          onClose={() => setShowNewThread(false)}
          onCreated={t => { setShowNewThread(false); setThreads(list => [t, ...list]); }}
        />
      )}
      {openThread && (
        <ThreadModal thread={openThread} username={myUsername} onClose={() => setOpenThread(null)} onOpenUser={onOpenUser} />
      )}
      {showWordle && (
        <Modal onClose={()=>setShowWordle(false)} maxWidth="max-w-2xl">
          {() => <WordleGame onClose={()=>setShowWordle(false)}/>}
        </Modal>
      )}
      {showPoster && (
        <Modal onClose={()=>setShowPoster(false)} maxWidth="max-w-lg">
          {() => <PosterGame onClose={()=>setShowPoster(false)}/>}
        </Modal>
      )}
      {matchmaking && !activeRoom && (
        <Modal onClose={()=>setMatchmaking(null)} maxWidth="max-w-sm">
          {() => <Matchmaking gameType={matchmaking} onClose={()=>setMatchmaking(null)}
            onMatch={room=>{setActiveRoom(room);setActiveGame(matchmaking);setMatchmaking(null);}}/>}
        </Modal>
      )}
      {activeRoom && activeGame === "chain" && (
        <Modal onClose={()=>{setActiveRoom(null);setActiveGame(null);}} maxWidth="max-w-2xl">
          {() => <ChainGame room={activeRoom} onClose={()=>{setActiveRoom(null);setActiveGame(null);}}/>}
        </Modal>
      )}
      {activeRoom && activeGame === "timeline" && (
        <Modal onClose={()=>{setActiveRoom(null);setActiveGame(null);}} maxWidth="max-w-3xl">
          {() => <TimelineGame room={activeRoom} onClose={()=>{setActiveRoom(null);setActiveGame(null);}}/>}
        </Modal>
      )}
    </div>
  );
}
