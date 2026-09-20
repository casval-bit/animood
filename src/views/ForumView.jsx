import { useState, useEffect, useRef } from "react";
import { fetchNewAnime, fetchUpcomingAnime, supabaseRowToAnime } from "../api/jikan.js";
import { fetchAiredDates } from "../api/anilist.js";
import { sb, follows } from "../api/supabase.js";
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
import { Matchmaking, ChainGame, TimelineGame, CluescaleMatchmaking, CluescaleGame } from "../components/GameSystem.jsx";
import { Modal } from "../components/Modal.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";
import { FORUM_I18N } from "../constants/forumI18n.js";

const FALLBACK_IMG = "https://placehold.co/64x92/1a1a2e/818cf8?text=?";
const TYPE_EMOJI = { TV:"📺", Movie:"🎬", OVA:"💿", ONA:"🌐", Special:"✨" };
const NEW_ANIME_PREVIEW = 5;

function posterUrl(anime) {
  return anime.large_image || anime.image_url || anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
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
function ThreadRow({ anime, onClick, metaLabel, trailerLink, convLink, statOverride, dominantMood, t }) {
  const img = posterUrl(anime);
  const genres = (anime.genres || []).map(g => g.name || g).slice(0, 3).join(" · ");
  const stat = (statOverride || defaultStat)(anime);
  const [convThreads, setConvThreads] = useState([]);
  const [showConvMenu, setShowConvMenu] = useState(false);
  const [openThread, setOpenThread] = useState(null);
  const { myUsername } = useApp();

  useEffect(() => {
    if(!convLink || !anime.mal_id) return;
    sb.query(`forum_threads?anime_id=eq.${anime.mal_id}&order=created_at.desc&limit=2`)
      .then(rows => { if(rows?.length) setConvThreads(rows); })
      .catch(()=>{});
  }, [convLink, anime.mal_id]);

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
            {!(trailerLink && anime.trailer?.url) && (
              <div className="truncate text-[11px] font-semibold text-slate-300">{metaLabel(anime)}</div>
            )}
            <div className="truncate text-[10px] text-slate-600">{anime.year || "?"} · {anime.type || "?"}</div>
          </div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {trailerLink && anime.trailer?.url && (
          <a
            href={anime.trailer.url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="shrink-0 rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-bold text-slate-100 transition hover:bg-white/15"
          >
            {t.trailerBtn}
          </a>
        )}
        {convLink && (
          <div className="relative">
            <button
              onClick={e=>{e.stopPropagation();setShowConvMenu(p=>!p);}}
              className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition"
              style={{background:"rgba(124,58,237,0.15)",color:"#c084fc",border:"1px solid rgba(124,58,237,0.2)"}}>
              💬
            </button>
            {showConvMenu && (
              <div onClick={e=>e.stopPropagation()}
                style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:50,
                  background:"#161226",border:"1px solid rgba(255,255,255,0.1)",
                  borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
                  minWidth:220,padding:8}}>
                {convThreads.length > 0 ? convThreads.map(th => (
                  <button key={th.id} onClick={()=>{setOpenThread(th);setShowConvMenu(false);}}
                    style={{display:"block",width:"100%",textAlign:"left",padding:"8px 10px",
                      borderRadius:8,background:"none",border:"none",cursor:"pointer",
                      color:"var(--text-1)",fontSize:11,fontWeight:600}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                    onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    💬 {th.title}
                  </button>
                )) : (
                  <div style={{fontSize:10,color:"var(--text-4)",padding:"6px 10px"}}>Aucune conversation</div>
                )}
                <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",marginTop:4,paddingTop:4}}>
                  <button onClick={()=>{onClick?.(anime);setShowConvMenu(false);}}
                    style={{display:"block",width:"100%",textAlign:"left",padding:"6px 10px",
                      borderRadius:8,background:"none",border:"none",cursor:"pointer",
                      color:"#c084fc",fontSize:11,fontWeight:700}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(124,58,237,0.08)"}
                    onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    + Nouvelle discussion
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {openThread && (
        <ThreadModal thread={openThread} username={myUsername}
          onClose={()=>setOpenThread(null)} onOpenUser={null}/>
      )}
    </div>
  );
}

// ─── One category = banner header + list of rows, à la forum sub-section ──────
// `maxVisible` trims long lists (e.g. "Nouveaux animes") behind a "Voir plus" toggle
// so obscure/low-interest entries don't dominate the page by default.
function ForumCategory({ emoji, title, subtitle, items, onOpenDetail, metaLabel, trailerLink, convLink, statOverride, dominantMoods, maxVisible, t }) {
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
            trailerLink={trailerLink} convLink={convLink} statOverride={statOverride}
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
  const hasTrailer = !!anime.trailer?.url;
  return (
    <div
      className={`mb-6 flex w-full items-center gap-5 overflow-hidden p-5 text-left ${GLASS}`}
      style={{ background: `linear-gradient(135deg, rgba(139,92,246,.22), rgba(236,72,153,.14)), ${GLASS_STYLE.background}`, boxShadow: GLASS_STYLE.boxShadow }}
    >
      <button onClick={() => onOpenDetail?.(anime)} className="flex min-w-0 flex-1 items-center gap-5 text-left">
        <img src={img || FALLBACK_IMG} alt="" onError={e => { e.target.src = FALLBACK_IMG; }} className="h-32 w-24 shrink-0 rounded-xl object-cover shadow-lg sm:h-36 sm:w-26" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-fuchsia-300">{t.mostAnticipated}</div>
          <div className="mb-1 truncate text-[19px] font-black text-slate-50 sm:text-[22px]">{anime.title}</div>
          <div className="mb-3 truncate text-[11.5px] text-slate-400">{genres || anime.type}</div>
          <div className="flex items-center gap-2">
            <div className={`inline-block rounded-full bg-white/10 px-3 py-1.5 font-bold text-white ${hasTrailer ? "text-[10.5px] text-white/70" : "text-[12px]"}`}>
              {countdownLabel(anime, airedDates, t)}
            </div>
          </div>
        </div>
      </button>
      {hasTrailer && (
        <a
          href={anime.trailer.url} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-black text-violet-700 shadow-md transition hover:scale-105 hover:shadow-lg"
        >
          {t.trailerBtn}
        </a>
      )}
    </div>
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

// Unified game panel: a 2-column grid of buttons (each showing the player's own
// score for that game) plus an inline top-20 leaderboard ranked by points_total,
// with the player's own rank shown below it when they're outside the top 20.
function GamePanel({ myUsername, following, onWordle, onPoster, onOpQuiz, onChain, onTimeline, onCluescale, t }) {
  const [elo, setElo]                 = useState(null);
  const [hover, setHover]             = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank]           = useState(null);

  useEffect(() => {
    if(!myUsername) return;
    sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`)
      .then(r => { if(r?.[0]) setElo(r[0]); })
      .catch(()=>{});
  }, [myUsername]);

  useEffect(() => {
    // points_total is the server-maintained aggregate (kept in sync by
    // awardSoloPoints.js, updateElo and the Cluescale award in GameSystem.jsx),
    // so ranking by it directly avoids re-deriving a total client-side.
    sb.query("game_elo?select=username,points_total&order=points_total.desc&limit=200")
      .then(rows => {
        if(!rows?.length) return;
        setLeaderboard(rows.slice(0,20));
        const pos = rows.findIndex(r=>r.username===myUsername);
        setMyRank(pos>=0 ? {rank:pos+1, points_total:rows[pos].points_total} : null);
      }).catch(()=>{});
  }, [myUsername]);

  const followingSet = new Set(following||[]);
  function usernameColor(u) {
    if(u===myUsername) return "#c084fc";
    if(followingSet.has(u)) return "#22c55e";
    return "var(--text-2)";
  }

  const GAMES = [
    {id:"wordle",    emoji:"🎯", label:t.wordleLabel,    color:"124,58,237", pts:elo?.pts_wordle||0,     onClick:onWordle,   type:"solo"},
    {id:"poster",    emoji:"🖼", label:t.posterLabel,    color:"236,72,153", pts:elo?.pts_poster||0,     onClick:onPoster,   type:"solo"},
    {id:"opquiz",    emoji:"🎵", label:t.opquizLabel,    color:"56,189,248", pts:elo?.pts_opquiz||0,     onClick:onOpQuiz,   type:"solo"},
    {id:"chain",     emoji:"⛓", label:t.chainLabel,     color:"251,191,36", pts:elo?.elo_chain||400,    onClick:onChain,    type:"vs"},
    {id:"timeline",  emoji:"📅", label:t.timelineLabel,  color:"34,197,94",  pts:elo?.elo_timeline||400, onClick:onTimeline, type:"vs"},
    {id:"cluescale", emoji:"🎭", label:t.cluescaleLabel, color:"251,113,133",pts:elo?.pts_cluescale||0,  onClick:onCluescale,type:"multi"},
  ];

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
        {GAMES.map(g => {
          const isHover = hover===g.id, rgb=g.color;
          return (
            <button key={g.id} onClick={g.onClick}
              onMouseEnter={()=>setHover(g.id)} onMouseLeave={()=>setHover(null)}
              style={{display:"flex",alignItems:"center",gap:7,padding:"7px 9px",borderRadius:10,cursor:"pointer",
                border:`1px solid rgba(${rgb},${isHover?0.45:0.22})`,
                background:isHover?`rgba(${rgb},0.15)`:`rgba(${rgb},0.07)`,
                transition:"all 0.15s",textAlign:"left"}}>
              <span style={{fontSize:16,flexShrink:0,lineHeight:1}}>{g.emoji}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,fontWeight:800,color:`rgb(${rgb})`,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.label}</div>
                <div style={{fontSize:8,color:"var(--text-5)",marginTop:1}}>{g.type==="vs"?"elo":g.type==="multi"?"multi":"solo · pts"}</div>
              </div>
              <div style={{fontSize:11,fontWeight:900,color:`rgb(${rgb})`,background:`rgba(${rgb},0.12)`,borderRadius:6,padding:"2px 7px",flexShrink:0,minWidth:28,textAlign:"center"}}>
                {elo?g.pts:"—"}
              </div>
            </button>
          );
        })}
      </div>

      {elo && (
        <div style={{marginTop:7,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:9,
          background:"linear-gradient(90deg,rgba(124,58,237,0.08),rgba(56,189,248,0.05))",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontSize:9,color:"var(--text-5)",fontWeight:700}}>{t.unlocksFramesLabel}</div>
          <div style={{fontSize:13,fontWeight:900,color:"var(--text-1)"}}>{elo.points_total||0}</div>
        </div>
      )}

      {leaderboard.length>0 && (
        <div style={{marginTop:12}}>
          <div style={{fontSize:10,fontWeight:800,color:"var(--text-5)",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{t.leaderboardTitle}</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {leaderboard.map((r,i) => {
              const isMe=r.username===myUsername, isFriend=followingSet.has(r.username);
              const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
              return (
                <div key={r.username} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,
                  background:isMe?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.02)",
                  border:isMe?"1px solid rgba(124,58,237,0.2)":"1px solid transparent"}}>
                  <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{medal||`${i+1}`}</div>
                  <div style={{flex:1,fontSize:10,fontWeight:isMe||isFriend?800:500,color:usernameColor(r.username),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {r.username}{isMe && <span style={{marginLeft:4,fontSize:9,color:"#c084fc"}}>({t.youLabel})</span>}
                  </div>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{r.points_total}</div>
                </div>
              );
            })}
            {myRank && myRank.rank>20 && (
              <>
                <div style={{padding:"3px 8px",textAlign:"center",fontSize:9,color:"var(--text-6)"}}>·  ·  ·</div>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)"}}>
                  <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{myRank.rank}</div>
                  <div style={{flex:1,fontSize:10,fontWeight:800,color:"#c084fc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{myUsername}</div>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{myRank.points_total}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ForumView({ onOpenDetail, onOpenUser }) {
  const { myUsername, activityNotifications, markActivityRead, blockedUsers } = useApp();
  const [followingList, setFollowingList] = useState([]);
  useEffect(() => {
    if(!myUsername) return;
    follows.getFollowing(myUsername).then(setFollowingList).catch(()=>{});
  }, [myUsername]);
  const { lang } = useLang();
  const t = FORUM_I18N[lang] || FORUM_I18N.fr;
  const [newAnime, setNewAnime] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [airingAnime, setAiringAnime] = useState([]);
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
  const [showCluescale, setShowCluescale] = useState(false);
  const [cluescaleRoom, setCluescaleRoom] = useState(null);
  const [matchmaking, setMatchmaking]     = useState(null);
  const [activeRoom, setActiveRoom]       = useState(null);
  const [activeGame, setActiveGame]       = useState(null);
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
    Promise.all([fetchUpcomingAnime(30), fetchNewAnime(15)])
      .then(([u, n]) => { if(!cancelled) { setUpcoming(u); setNewAnime(n); } })
      .finally(() => { if(!cancelled) setLoading(false); });
    // Airing TV anime for seasonal section
    sb.query("anime_cache?type=eq.TV&status=eq.Currently%20Airing&select=mal_id,title,title_en,synopsis,score,year,episodes,type,image_url,large_image,genres,status,trailer_url&order=score.desc.nullslast&limit=24")
      .then(rows => { if(!cancelled && rows?.length) setAiringAnime(rows); })
      .catch(()=>{});
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
    const ids = [...new Set([...upcoming, ...newAnime, ...favorites.map(f => f.anime)].map(a => a.mal_id))];
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
  }, [upcoming, newAnime, favorites]);

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

  const empty = !loading && !upcoming.length && !newAnime.length;
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

            {/* 1. Animés saisonniers en cours — avec bouton 💬 discussion */}
            {airingAnime.length > 0 && (
              <ForumCategory
                emoji="📡" title="Animés de la saison" subtitle="En cours de diffusion"
                items={airingAnime} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
                metaLabel={a => a.score ? `★ ${a.score}` : "En cours"} convLink t={t}
              />
            )}

            {/* 2. Prochaines sorties — avec bouton trailer si dispo */}
            <ForumCategory
              emoji="📅" title={t.upcomingTitle} subtitle={t.upcomingSubtitle}
              items={upcoming} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={a => countdownLabel(a, airedDates, t)} trailerLink t={t}
            />

            {/* 3. Nouveaux animés ajoutés — sans trailer ni convo, plus compact */}
            <ForumCategory
              emoji="🆕" title={t.newAnimeTitle} subtitle={t.newAnimeSubtitle}
              items={newAnime} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={() => t.metaNew} maxVisible={NEW_ANIME_PREVIEW} t={t}
            />

            {/* 4. Les + favoris — sans trailer ni convo */}
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
          </div>

          <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[280px]">
            <CommunityMoodBlock loaded={moodLoaded} counts={moodCounts} total={moodTotal} t={t} />

            {/* Mini-jeux + classement */}
            <div className="mt-4 rounded-2xl border border-white/8 bg-white/3 p-4">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.miniGamesTitle}</div>
              <GamePanel
                myUsername={myUsername}
                following={followingList}
                onWordle={()=>setShowWordle(true)}
                onPoster={()=>setShowPoster(true)}
                onOpQuiz={()=>setShowOpQuiz(true)}
                onChain={()=>setMatchmaking("chain")}
                onTimeline={()=>setMatchmaking("timeline")}
                onCluescale={()=>setShowCluescale(true)}
                t={t}
              />
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
      {showCluescale && !cluescaleRoom && (
        <Modal onClose={()=>setShowCluescale(false)} maxWidth="max-w-sm">
          {() => <CluescaleMatchmaking
            onClose={()=>setShowCluescale(false)}
            onMatch={room=>{setCluescaleRoom(room);setShowCluescale(false);}}/>}
        </Modal>
      )}
      {cluescaleRoom && (
        <Modal onClose={()=>setCluescaleRoom(null)} maxWidth="max-w-lg">
          {() => <CluescaleGame room={cluescaleRoom} onClose={()=>setCluescaleRoom(null)}/>}
        </Modal>
      )}
    </div>
  );
}
