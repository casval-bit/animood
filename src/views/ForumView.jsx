import { useState, useEffect, useRef } from "react";
import { fetchNewAnime, fetchUpcomingAnime, fetchLatestTrailers, supabaseRowToAnime } from "../api/jikan.js";
import { fetchAiredDates } from "../api/anilist.js";
import { sb } from "../api/supabase.js";
import { topMoods } from "../api/moods.js";
import { MOODS, getMoodObj } from "../constants/moods.js";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { NewThreadModal, ThreadModal, TagPill, timeAgo } from "../components/ForumThreadModal.jsx";
import { Avatar } from "../components/Avatar.jsx";
import { MoodOctagon } from "../components/MoodOctagon.jsx";
import { WordleGame, PosterGame, OpQuizGame } from "../components/MiniGames.jsx";
import { Matchmaking, ChainGame, TimelineGame } from "../components/GameSystem.jsx";
import { Modal } from "../components/Modal.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";
import { FORUM_I18N } from "../constants/forumI18n.js";

const FALLBACK_IMG = "https://placehold.co/64x92/1a1a2e/818cf8?text=?";
const TYPE_EMOJI = { TV:"📺", Movie:"🎬", OVA:"💿", ONA:"🌐", Special:"✨" };
const NEW_ANIME_PREVIEW = 5;

function posterUrl(anime) {
  return anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
}

// Real countdown once AniList gives us a day-level date; falls back to the year
// we already have (from Jikan) rather than showing nothing while it loads.
function countdownLabel(anime, airedDates, t) {
  const date = airedDates[anime.mal_id];
  if(date) {
    const days = Math.ceil((date - Date.now()) / 86400000);
    if(days > 1) return t.countdownDays(days);
    if(days === 1) return t.countdownTomorrow;
    if(days === 0) return t.countdownToday;
    return t.countdownSoon;
  }
  return anime.year ? t.countdownYear(anime.year) : t.countdownUnknown;
}

function defaultStat(anime) {
  return { primary: anime.score ? `★ ${anime.score}` : "—", secondary: anime.episodes ? `${anime.episodes} eps` : "?" };
}

// ─── One row = one "sujet" — thumbnail, title, blurb, stats, type/year ─────────
function ThreadRow({ anime, onClick, metaLabel, trailerLink, statOverride, dominantMood, t }) {
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
            <span className="truncate text-[11px] text-slate-500">{genres || anime.type || t.animeFallback}</span>
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
          {t.trailerBtn}
        </a>
      )}
    </div>
  );
}

// ─── One category = banner header + list of rows, à la forum sub-section ──────
// `maxVisible` trims long lists (e.g. "Nouveaux animes") behind a "Voir plus" toggle
// so obscure/low-interest entries don't dominate the page by default.
function ForumCategory({ emoji, title, subtitle, items, onOpenDetail, metaLabel, trailerLink, statOverride, dominantMoods, maxVisible, t }) {
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
          {t.topicCount(items.length)}
        </div>
      </div>
      <div>
        {visible.map(a => (
          <ThreadRow
            key={a.mal_id} anime={a} onClick={onOpenDetail} metaLabel={metaLabel}
            trailerLink={trailerLink} statOverride={statOverride}
            dominantMood={dominantMoods?.[a.mal_id]} t={t}
          />
        ))}
      </div>
      {maxVisible && items.length > maxVisible && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full border-t border-white/6 px-5 py-2.5 text-center text-[11px] font-bold text-violet-300 transition hover:bg-white/5"
        >
          {expanded ? t.seeLess : t.seeMore(items.length - maxVisible)}
        </button>
      )}
    </div>
  );
}

// ─── Hero card — the single upcoming anime with the best real MAL popularity rank ──
function AnticipatedCard({ anime, airedDates, onOpenDetail, t }) {
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
        <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-fuchsia-300">{t.mostAnticipated}</div>
        <div className="mb-1 truncate text-[19px] font-black text-slate-50 sm:text-[22px]">{anime.title}</div>
        <div className="mb-3 truncate text-[11.5px] text-slate-400">{genres || anime.type}</div>
        <div className="inline-block rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white">{countdownLabel(anime, airedDates, t)}</div>
      </div>
    </button>
  );
}

// ─── Community mood pulse — real aggregation of user_votes.moods over 7 days ──
function CommunityMoodBlock({ loaded, counts, total, t }) {
  if(!loaded) return null;
  const ranked = MOODS.map(m => ({ ...m, count: counts[m.id] || 0 }))
    .sort((a, b) => b.count - a.count)
    .filter(m => m.count > 0)
    .map(m => ({ ...m, pct: Math.round((m.count / total) * 100) }));

  return (
    <div className={`mb-6 p-5 ${GLASS}`} style={GLASS_STYLE}>
      <div className="mb-0.5 text-[13px] font-black text-slate-100">{t.communityMood}</div>
      {total === 0 ? (
        <div className="mt-1 text-[11px] text-slate-500">{t.communityMoodEmpty}</div>
      ) : (
        <>
          <div className="mb-4 text-[10.5px] text-slate-500">{t.communityMoodSubtitle(total)}</div>
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
function DiscussionsBlock({ threads, replyCounts, unreadCounts, loaded, profileCache, onOpenThread, onNewThread, t, lang }) {
  return (
    <div className={`mb-6 overflow-hidden ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
        <div className="text-[13px] font-black uppercase tracking-wide text-white">{t.discussions}</div>
        <button onClick={onNewThread} className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[12px] font-black text-violet-700 shadow-md transition hover:scale-105 hover:shadow-lg">
          {t.newTopicBtn}
        </button>
      </div>
      {!loaded ? (
        <div className="p-5"><Spinner small label={t.loading} /></div>
      ) : threads.length === 0 ? (
        <div className="p-6 text-center">
          <div className="mb-1 text-sm font-bold text-slate-300">{t.noDiscussions}</div>
          <div className="mb-4 text-[11px] text-slate-500">{t.noDiscussionsSub}</div>
          <button onClick={onNewThread} className="rounded-xl bg-linear-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white">
            {t.createTopicBtn}
          </button>
        </div>
      ) : (
        <div>
          {threads.map(th => {
            const unread = unreadCounts[th.id] || 0;
            const profile = profileCache[th.username];
            return (
              <button
                key={th.id} onClick={() => onOpenThread(th)}
                className="flex w-full items-start gap-3 border-b border-white/6 px-5 py-3.5 text-left transition last:border-b-0 hover:bg-white/5"
              >
                <Avatar profile={profile} size={36} fallback={th.username.slice(0,2).toUpperCase()} className="mt-0.5 text-[11px]"/>
                {th.image_url && (
                  <img src={th.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" onError={e=>{e.target.style.display="none";}} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-slate-100">💬 {th.title}</div>
                  <div className="mb-1 truncate text-[11px] text-slate-500">
                    <span className={`font-bold ${GRADIENT_TEXT}`}>{profile?.name || th.username}</span> · @{th.username} · {timeAgo(th.created_at, lang)}
                  </div>
                  {th.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {th.tags.map(id => <TagPill key={id} id={id} />)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className={`text-[11px] font-bold ${unread > 0 ? "text-slate-100" : "text-slate-400"}`}>
                    {t.replyCount(replyCounts[th.id] || 0)}
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

function GameEloDisplay({ myUsername }) {
  const { lang } = useLang();
  const t = FORUM_I18N[lang] || FORUM_I18N.fr;
  const [elo, setElo] = useState(null);
  useEffect(() => {
    if(!myUsername) return;
    sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`)
      .then(r => { if(r?.[0]) setElo(r[0]); })
      .catch(()=>{});
  }, [myUsername]);
  if(!elo) return null;
  return (
    <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)",
      display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
      <div style={{textAlign:"center",padding:"6px 4px",borderRadius:8,background:"rgba(251,191,36,0.06)"}}>
        <div style={{fontSize:13,fontWeight:900,color:"#fbbf24"}}>{elo.elo_chain||400}</div>
        <div style={{fontSize:8,color:"rgba(148,163,184,0.6)"}}>{t.eloChainLabel}</div>
      </div>
      <div style={{textAlign:"center",padding:"6px 4px",borderRadius:8,background:"rgba(34,197,94,0.06)"}}>
        <div style={{fontSize:13,fontWeight:900,color:"#22c55e"}}>{elo.elo_timeline||400}</div>
        <div style={{fontSize:8,color:"rgba(148,163,184,0.6)"}}>{t.eloTimelineLabel}</div>
      </div>
      <div style={{gridColumn:"1/-1",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
        <div style={{textAlign:"center",padding:"6px 4px",borderRadius:8,background:"rgba(124,58,237,0.06)"}}>
          <div style={{fontSize:13,fontWeight:900,color:"#c084fc"}}>{elo.streak_wordle||0}</div>
          <div style={{fontSize:8,color:"rgba(148,163,184,0.6)"}}>{t.wordlePtsLabel}</div>
        </div>
        <div style={{textAlign:"center",padding:"6px 4px",borderRadius:8,background:"rgba(236,72,153,0.06)"}}>
          <div style={{fontSize:13,fontWeight:900,color:"#f9a8d4"}}>{elo.streak_poster||0}</div>
          <div style={{fontSize:8,color:"rgba(148,163,184,0.6)"}}>{t.posterPtsLabel}</div>
        </div>
        <div style={{textAlign:"center",padding:"6px 4px",borderRadius:8,background:"rgba(56,189,248,0.06)"}}>
          <div style={{fontSize:13,fontWeight:900,color:"#7dd3fc"}}>{elo.streak_opquiz||0}</div>
          <div style={{fontSize:8,color:"rgba(148,163,184,0.6)"}}>{t.opquizPtsLabel}</div>
        </div>
      </div>
      <div style={{gridColumn:"1/-1",textAlign:"center",padding:"4px",borderRadius:8,background:"rgba(255,255,255,0.03)"}}>
        <div style={{fontSize:11,fontWeight:900,color:"var(--text-2)"}}>{t.totalPtsLabel(elo.points_total||0)}</div>
        <div style={{fontSize:8,color:"rgba(148,163,184,0.5)"}}>{t.unlocksFramesLabel}</div>
      </div>
    </div>
  );
}

export function ForumView({ onOpenDetail, onOpenUser }) {
  const { myUsername, activityNotifications, markActivityRead, blockedUsers } = useApp();
  const { lang } = useLang();
  const t = FORUM_I18N[lang] || FORUM_I18N.fr;
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
  const [profileCache, setProfileCache] = useState({});
  const [showNewThread, setShowNewThread] = useState(false);
  const [openThread, setOpenThread]       = useState(null);
  const [showWordle, setShowWordle]       = useState(false);
  const [showPoster, setShowPoster]       = useState(false);
  const [showOpQuiz, setShowOpQuiz]       = useState(false);
  const [matchmaking, setMatchmaking]     = useState(null); // 'chain' | 'timeline' | null
  const [activeRoom, setActiveRoom]       = useState(null);
  const [activeGame, setActiveGame]       = useState(null); // 'chain' | 'timeline'
  const chainCloseRef    = useRef(null);
  const timelineCloseRef = useRef(null);

  const handleGameClose = async (gameRef) => {
    if(gameRef) {
      const confirmed = window.confirm("Êtes-vous sûr de vouloir quitter ? Cela comptera comme un abandon.");
      if(!confirmed) return;
      await gameRef();
    }
    setActiveRoom(null);
    setActiveGame(null);
  };

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
    fetchAiredDates(upcoming.map(a => a.mal_id), lang).then(dates => { if(!cancelled) setAiredDates(dates); });
    return () => { cancelled = true; };
  }, [upcoming, lang]);

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
      const visible = blockedUsers?.size ? rows.filter(t => !blockedUsers.has(t.username)) : rows;
      setThreads(visible);
      const counts = await sb.getReplyCounts(visible.map(r => r.id), [...(blockedUsers||[])]);
      if(!cancelled) setReplyCounts(counts);
      const usernames = [...new Set(visible.map(t => t.username))];
      if(usernames.length) {
        try {
          const profs = await sb.query(`profiles?username=in.(${usernames.map(u=>encodeURIComponent(u)).join(",")})&select=username,name,avatar,avatar_base64`);
          if(!cancelled && profs?.length) {
            const cache = {};
            profs.forEach(p => { cache[p.username] = p; });
            setProfileCache(cache);
          }
        } catch {}
      }
    }).finally(() => { if(!cancelled) setThreadsLoaded(true); });
    return () => { cancelled = true; };
  }, [myUsername, blockedUsers]);

  const empty = !loading && !upcoming.length && !newAnime.length && !trailers.length;
  const mostAnticipated = upcoming.reduce((best, a) => {
    if(a.popularity == null) return best;
    if(!best || a.popularity < best.popularity) return a;
    return best;
  }, null);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 animate-slide-up">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight text-slate-50 md:text-[32px]">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      {loading && <Spinner label={t.loadingNews} />}
      {empty && <EmptyState emoji="💬" title={t.emptyTitle} subtitle={t.emptySubtitle} />}

      {!loading && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <DiscussionsBlock
              threads={threads} replyCounts={replyCounts} unreadCounts={unreadCounts} loaded={threadsLoaded}
              profileCache={profileCache} onOpenThread={openThreadRead} onNewThread={() => setShowNewThread(true)}
              t={t} lang={lang}
            />
            <AnticipatedCard anime={mostAnticipated} airedDates={airedDates} onOpenDetail={onOpenDetail} t={t} />

            <ForumCategory
              emoji="📅" title={t.upcomingTitle} subtitle={t.upcomingSubtitle}
              items={upcoming} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={a => countdownLabel(a, airedDates, t)} t={t}
            />
            <ForumCategory
              emoji="🎬" title={t.trailersTitle} subtitle={t.trailersSubtitle}
              items={trailers} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={() => t.metaTrailer} trailerLink t={t}
            />
            {favoritesLoaded && favorites.length > 0 && (
              <ForumCategory
                emoji="❤️" title={t.favoritesTitle} subtitle={t.favoritesSubtitle}
                items={favorites.map(f => f.anime)} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
                metaLabel={() => t.metaFavorite} t={t}
                statOverride={a => {
                  const f = favorites.find(x => x.anime.mal_id === a.mal_id);
                  return { primary: `❤️ ${f?.count ?? 0}`, secondary: t.favoritesUnit(f?.count ?? 0) };
                }}
              />
            )}
            <ForumCategory
              emoji="🆕" title={t.newAnimeTitle} subtitle={t.newAnimeSubtitle}
              items={newAnime} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={() => t.metaNew} maxVisible={NEW_ANIME_PREVIEW} t={t}
            />
          </div>

          <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[280px]">
            <CommunityMoodBlock loaded={moodLoaded} counts={moodCounts} total={moodTotal} t={t} />

            {/* Mini-jeux */}
            <div className="mt-4 rounded-2xl border border-white/8 bg-white/3 p-4">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.miniGamesTitle}</div>
              <div className="flex gap-3 justify-center">
                <button onClick={()=>setShowWordle(true)}
                  title={t.wordleTitle}
                  style={{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(124,58,237,0.4)",
                    background:"rgba(124,58,237,0.12)",cursor:"pointer",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(124,58,237,0.25)";e.currentTarget.style.transform="scale(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(124,58,237,0.12)";e.currentTarget.style.transform="scale(1)";}}>
                  <span style={{fontSize:20}}>🎯</span>
                  <span style={{fontSize:8,color:"#c084fc",fontWeight:700}}>{t.wordleLabel}</span>
                </button>
                <button onClick={()=>setShowPoster(true)}
                  title={t.posterTitle}
                  style={{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(236,72,153,0.4)",
                    background:"rgba(236,72,153,0.1)",cursor:"pointer",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(236,72,153,0.22)";e.currentTarget.style.transform="scale(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(236,72,153,0.1)";e.currentTarget.style.transform="scale(1)";}}>
                  <span style={{fontSize:20}}>🖼</span>
                  <span style={{fontSize:8,color:"#f9a8d4",fontWeight:700}}>{t.posterLabel}</span>
                </button>
                <button onClick={()=>setShowOpQuiz(true)}
                  title={t.opquizTitle}
                  style={{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(56,189,248,0.4)",
                    background:"rgba(56,189,248,0.1)",cursor:"pointer",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(56,189,248,0.22)";e.currentTarget.style.transform="scale(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(56,189,248,0.1)";e.currentTarget.style.transform="scale(1)";}}>
                  <span style={{fontSize:20}}>🎵</span>
                  <span style={{fontSize:8,color:"#7dd3fc",fontWeight:700}}>{t.opquizLabel}</span>
                </button>
                <button onClick={()=>setMatchmaking("chain")}
                  title={t.chainTitle}
                  style={{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(251,191,36,0.4)",
                    background:"rgba(251,191,36,0.08)",cursor:"pointer",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(251,191,36,0.2)";e.currentTarget.style.transform="scale(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(251,191,36,0.08)";e.currentTarget.style.transform="scale(1)";}}>
                  <span style={{fontSize:20}}>⛓</span>
                  <span style={{fontSize:8,color:"#fbbf24",fontWeight:700}}>{t.chainLabel}</span>
                </button>
                <button onClick={()=>setMatchmaking("timeline")}
                  title={t.timelineTitle}
                  style={{width:56,height:56,borderRadius:"50%",border:"2px solid rgba(34,197,94,0.4)",
                    background:"rgba(34,197,94,0.08)",cursor:"pointer",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(34,197,94,0.2)";e.currentTarget.style.transform="scale(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(34,197,94,0.08)";e.currentTarget.style.transform="scale(1)";}}>
                  <span style={{fontSize:20}}>📅</span>
                  <span style={{fontSize:8,color:"#22c55e",fontWeight:700}}>{t.timelineLabel}</span>
                </button>
              </div>
              <GameEloDisplay myUsername={myUsername}/>
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
        <ThreadModal thread={openThread} username={myUsername} onClose={() => setOpenThread(null)} onOpenUser={onOpenUser}
          onLikeUpdate={(id, likes) => setThreads(list => list.map(th => th.id===id ? {...th, likes} : th))} />
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
      {showOpQuiz && (
        <Modal onClose={()=>setShowOpQuiz(false)} maxWidth="max-w-2xl">
          {() => <OpQuizGame onClose={()=>setShowOpQuiz(false)}/>}
        </Modal>
      )}
      {matchmaking && !activeRoom && (
        <Modal onClose={()=>setMatchmaking(null)} maxWidth="max-w-sm">
          {() => <Matchmaking gameType={matchmaking} onClose={()=>setMatchmaking(null)}
            onMatch={room=>{setActiveRoom(room);setActiveGame(matchmaking);setMatchmaking(null);}}/>}
        </Modal>
      )}
      {activeRoom && activeGame === "chain" && (
        <Modal onClose={async()=>handleGameClose(chainCloseRef.current)} maxWidth="max-w-4xl">
          {() => <ChainGame room={activeRoom}
            onClose={async()=>{
              await handleGameClose(chainCloseRef.current);
            }}
            onReady={(forfaitFn)=>{ chainCloseRef.current = forfaitFn; }}/>}
        </Modal>
      )}
      {activeRoom && activeGame === "timeline" && (
        <Modal onClose={async()=>handleGameClose(timelineCloseRef.current)} maxWidth="max-w-6xl">
          {() => <TimelineGame room={activeRoom}
            onClose={async()=>{
              await handleGameClose(timelineCloseRef.current);
            }}
            onReady={(forfaitFn)=>{ timelineCloseRef.current = forfaitFn; }}/>}
        </Modal>
      )}
    </div>
  );
}
