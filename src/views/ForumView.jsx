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
import { Modal, GameModal } from "../components/Modal.jsx";
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
  const genres = (anime.genres || []).map(g => g.name || g).slice(0, 2).join(" · ");
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
    <div style={{display:"flex",alignItems:"center",gap:10,
      padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.04)",
      transition:"background 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.025)"}
      onMouseLeave={e=>e.currentTarget.style.background="none"}>

      {/* Poster */}
      <button onClick={() => onClick?.(anime)} style={{background:"none",border:"none",padding:0,cursor:"pointer",flexShrink:0}}>
        <img src={img || FALLBACK_IMG} alt=""
          onError={e => { e.target.src = FALLBACK_IMG; }}
          style={{width:32,height:46,borderRadius:6,objectFit:"cover",display:"block"}}/>
      </button>

      {/* Info */}
      <button onClick={() => onClick?.(anime)}
        style={{flex:1,minWidth:0,background:"none",border:"none",padding:0,cursor:"pointer",textAlign:"left"}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--text-1)",
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>
          {anime.title}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
          {genres && <span style={{fontSize:9,color:"var(--text-5)"}}>{genres}</span>}
          {dominantMood && (
            <span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:4,
              background:`${dominantMood.color}18`,color:dominantMood.color}}>
              {dominantMood.emoji} {dominantMood.label}
            </span>
          )}
        </div>
        <div style={{fontSize:9,color:"var(--text-5)",marginTop:2}}>{metaLabel(anime)}</div>
      </button>

      {/* Score */}
      {stat.primary && (
        <div style={{textAlign:"right",flexShrink:0,marginLeft:4}}>
          <div style={{fontSize:11,fontWeight:900,color:"#fbbf24"}}>{stat.primary}</div>
          <div style={{fontSize:8,color:"var(--text-5)"}}>{stat.secondary}</div>
        </div>
      )}

      {/* Actions */}
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        {trailerLink && anime.trailer?.url && (
          <a href={anime.trailer.url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{padding:"4px 10px",borderRadius:20,fontSize:9,fontWeight:700,
              background:"rgba(255,255,255,0.06)",color:"var(--text-2)",
              border:"1px solid rgba(255,255,255,0.08)",textDecoration:"none",
              transition:"background 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}>
            ▶ Trailer
          </a>
        )}
        {convLink && (
          <div style={{position:"relative"}}>
            <button onClick={e=>{e.stopPropagation();setShowConvMenu(p=>!p);}}
              style={{padding:"4px 10px",borderRadius:20,fontSize:9,fontWeight:700,
                background:"rgba(124,58,237,0.12)",color:"#c084fc",
                border:"1px solid rgba(124,58,237,0.2)",cursor:"pointer",
                transition:"background 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(124,58,237,0.22)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(124,58,237,0.12)"}>
              💬 Convo
            </button>
            {showConvMenu && (
              <div onClick={e=>e.stopPropagation()}
                style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:50,
                  background:"#161226",border:"1px solid rgba(255,255,255,0.1)",
                  borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
                  minWidth:200,padding:6}}>
                {convThreads.length > 0 ? convThreads.map(th => (
                  <button key={th.id} onClick={()=>{setOpenThread(th);setShowConvMenu(false);}}
                    style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",
                      borderRadius:8,background:"none",border:"none",cursor:"pointer",
                      color:"var(--text-1)",fontSize:10,fontWeight:600}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                    onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    {th.title}
                  </button>
                )) : (
                  <div style={{fontSize:9,color:"var(--text-4)",padding:"6px 10px"}}>Aucune conversation</div>
                )}
                <div style={{borderTop:"1px solid rgba(255,255,255,0.05)",marginTop:4,paddingTop:4}}>
                  <button onClick={()=>{onClick?.(anime);setShowConvMenu(false);}}
                    style={{display:"block",width:"100%",textAlign:"left",padding:"6px 10px",
                      borderRadius:8,background:"none",border:"none",cursor:"pointer",
                      color:"#c084fc",fontSize:10,fontWeight:700}}
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
    <div style={{marginBottom:20,borderRadius:16,overflow:"hidden",
      background:"rgba(15,12,30,0.6)",border:"1px solid rgba(255,255,255,0.06)"}}>
      {/* Category header — minimal, no gradient */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"12px 18px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:15,opacity:0.7}}>{emoji}</span>
          <div>
            <div style={{fontSize:12,fontWeight:800,color:"var(--text-1)"}}>{title}</div>
            {subtitle && <div style={{fontSize:9,color:"var(--text-5)",marginTop:1}}>{subtitle}</div>}
          </div>
        </div>
        <div style={{fontSize:9,fontWeight:700,color:"var(--text-5)",
          background:"rgba(255,255,255,0.05)",borderRadius:6,padding:"3px 7px"}}>
          {items.length}
        </div>
      </div>

      {/* Rows */}
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
        <button onClick={() => setExpanded(e => !e)}
          style={{width:"100%",padding:"10px",textAlign:"center",fontSize:10,fontWeight:700,
            color:"#c084fc",background:"none",border:"none",borderTop:"1px solid rgba(255,255,255,0.04)",
            cursor:"pointer",transition:"background 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
          onMouseLeave={e=>e.currentTarget.style.background="none"}>
          {expanded ? "Voir moins ↑" : `Voir ${items.length - maxVisible} de plus ↓`}
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
    <div className="mb-6 overflow-hidden rounded-2xl" style={{background:"rgba(15,12,30,0.7)",border:"1px solid rgba(255,255,255,0.07)"}}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)",letterSpacing:0.2}}>{t.discussions}</div>
          <div style={{fontSize:10,color:"var(--text-5)",marginTop:1}}>{threads.length} sujet{threads.length!==1?"s":""}</div>
        </div>
        <button onClick={onNewThread}
          style={{padding:"7px 14px",borderRadius:20,fontSize:11,fontWeight:800,cursor:"pointer",
            background:"rgba(124,58,237,0.2)",color:"#c084fc",border:"1px solid rgba(124,58,237,0.3)",
            transition:"all 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(124,58,237,0.3)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(124,58,237,0.2)";}}>
          + Nouveau sujet
        </button>
      </div>

      {/* Divider */}
      <div style={{height:1,background:"rgba(255,255,255,0.05)",margin:"0 20px"}}/>

      {!loaded ? (
        <div className="p-5"><Spinner small label={t.loading} /></div>
      ) : threads.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div style={{fontSize:28,marginBottom:8,opacity:0.4}}>✍️</div>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text-2)",marginBottom:4}}>{t.noDiscussions}</div>
          <div style={{fontSize:10,color:"var(--text-5)",marginBottom:16}}>{t.noDiscussionsSub}</div>
          <button onClick={onNewThread}
            style={{padding:"8px 20px",borderRadius:20,fontSize:11,fontWeight:800,cursor:"pointer",
              background:"linear-gradient(135deg,#7c3aed,#6d28d9)",color:"#fff",border:"none"}}>
            {t.createTopicBtn}
          </button>
        </div>
      ) : (
        <div>
          {threads.map((th, i) => {
            const unread = unreadCounts[th.id] || 0;
            const replies = replyCounts[th.id] || 0;
            const profile = profileCache[th.username];
            const isLast = i === threads.length - 1;
            return (
              <button key={th.id} onClick={() => onOpenThread(th)}
                style={{display:"flex",width:"100%",alignItems:"flex-start",gap:12,
                  padding:"14px 20px",textAlign:"left",background:"none",border:"none",
                  borderBottom:isLast?"none":"1px solid rgba(255,255,255,0.04)",
                  cursor:"pointer",transition:"background 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
                onMouseLeave={e=>e.currentTarget.style.background="none"}>

                {/* Avatar */}
                <Avatar profile={profile} size={34} fallback={th.username.slice(0,2).toUpperCase()} className="mt-0.5 text-[10px] shrink-0"/>

                {/* Thread image if any */}
                {th.image_url && (
                  <img src={th.image_url} alt="" style={{width:40,height:40,borderRadius:8,objectFit:"cover",flexShrink:0}}
                    onError={e=>{e.target.style.display="none";}} />
                )}

                {/* Content */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text-1)",
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>
                    {th.title}
                  </div>
                  <div style={{fontSize:10,color:"var(--text-4)",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,color:"var(--text-3)"}}>{profile?.name || th.username}</span>
                    <span style={{opacity:0.4}}>·</span>
                    <span>{timeAgo(th.created_at, lang)}</span>
                  </div>
                  {th.tags?.length > 0 && (
                    <div style={{display:"flex",gap:4,marginTop:5,flexWrap:"wrap"}}>
                      {th.tags.map(id => <TagPill key={id} id={id} />)}
                    </div>
                  )}
                </div>

                {/* Replies + unread */}
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:unread>0?"var(--text-1)":"var(--text-5)"}}>
                    {replies} rép.
                  </div>
                  {unread > 0 && (
                    <span style={{display:"flex",alignItems:"center",justifyContent:"center",
                      minWidth:16,height:16,borderRadius:8,padding:"0 3px",
                      fontSize:9,fontWeight:900,color:"#fff",background:"#7c3aed"}}>
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

// ── Unified game panel: button + score on same row per game ──────────────────
function GamePanel({ myUsername, onWordle, onPoster, onOpQuiz, onChain, onTimeline, onCluescale, following }) {
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
    sb.query("game_elo?select=username,elo_chain,elo_timeline,pts_wordle,pts_poster,pts_opquiz,pts_cluescale&limit=200")
      .then(rows => {
        if(!rows?.length) return;
        const ranked = rows.map(r => ({
          username: r.username,
          total: (r.elo_chain||400)+(r.elo_timeline||400)+(r.pts_wordle||0)+(r.pts_poster||0)+(r.pts_opquiz||0)+(r.pts_cluescale||0),
        })).sort((a,b)=>b.total-a.total);
        setLeaderboard(ranked.slice(0,20));
        const pos = ranked.findIndex(r=>r.username===myUsername);
        setMyRank(pos>=0 ? {rank:pos+1, total:ranked[pos].total} : null);
      }).catch(()=>{});
  }, [myUsername]);

  const total = elo
    ? (elo.elo_chain||400)+(elo.elo_timeline||400)+(elo.pts_wordle||0)+(elo.pts_poster||0)+(elo.pts_opquiz||0)+(elo.pts_cluescale||0)
    : null;

  const followingSet = new Set(following||[]);

  function usernameColor(u) {
    if(u===myUsername) return "#c084fc";
    if(followingSet.has(u)) return "#22c55e";
    return "var(--text-2)";
  }

  const GAMES = [
    {id:"anidle",    emoji:"🎯", label:"Anidle",   color:"124,58,237", pts:elo?.pts_wordle||0,     onClick:onWordle,    type:"solo"},
    {id:"poster",    emoji:"🖼", label:"Poster",   color:"236,72,153", pts:elo?.pts_poster||0,     onClick:onPoster,    type:"solo"},
    {id:"opening",   emoji:"🎵", label:"Opening",  color:"56,189,248", pts:elo?.pts_opquiz||0,     onClick:onOpQuiz,    type:"solo"},
    {id:"linkup",    emoji:"🔗", label:"LinkUp",   color:"251,191,36", pts:elo?.elo_chain||400,    onClick:onChain,     type:"vs"},
    {id:"timeline",  emoji:"📅", label:"Timeline", color:"34,197,94",  pts:elo?.elo_timeline||400, onClick:onTimeline,  type:"vs"},
    {id:"cluescale", emoji:"🎭", label:"Cluescale",color:"167,139,250",pts:elo?.pts_cluescale||0,  onClick:onCluescale, type:"multi"},
  ];

  return (
    <div>
      <div style={{fontSize:10,fontWeight:800,color:"var(--text-5)",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>🎮 Mini-jeux</div>
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

      {total!==null && (
        <div style={{marginTop:7,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:9,
          background:"linear-gradient(90deg,rgba(124,58,237,0.08),rgba(56,189,248,0.05))",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontSize:9,color:"var(--text-5)",fontWeight:700}}>🏆 Total</div>
          <div style={{fontSize:13,fontWeight:900,color:"var(--text-1)"}}>{total}</div>
        </div>
      )}

      {leaderboard.length>0 && (
        <div style={{marginTop:12}}>
          <div style={{fontSize:10,fontWeight:800,color:"var(--text-5)",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>🥇 Classement général</div>
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
                    {r.username}
                  </div>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{r.total}</div>
                </div>
              );
            })}
            {myRank&&myRank.rank>20&&(
              <>
                <div style={{padding:"3px 8px",textAlign:"center",fontSize:9,color:"var(--text-6)"}}>·  ·  ·</div>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)"}}>
                  <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{myRank.rank}</div>
                  <div style={{flex:1,fontSize:10,fontWeight:800,color:"#c084fc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{myUsername}</div>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{myRank.total}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Per-game Elo leaderboard ──────────────────────────────────────────────────
function EloLeaderboard({ gameType, myUsername, following }) {
  const [rows, setRows]     = useState([]);
  const [myRank, setMyRank] = useState(null);
  const field = gameType === "chain" ? "elo_chain" : "elo_timeline";
  const followingSet = new Set(following||[]);

  useEffect(() => {
    sb.query(`game_elo?select=username,${field}&order=${field}.desc&limit=200`)
      .then(data => {
        if(!data?.length) return;
        const sorted = [...data].sort((a,b)=>(b[field]||400)-(a[field]||400));
        setRows(sorted.slice(0,20).map((r,i)=>({username:r.username, pts:r[field]||400, rank:i+1})));
        const pos = sorted.findIndex(r=>r.username===myUsername);
        if(pos>=20) setMyRank({rank:pos+1, pts:sorted[pos][field]||400});
      }).catch(()=>{});
  }, [gameType, myUsername]);

  if(!rows.length) return null;

  function uColor(u) {
    if(u===myUsername) return "#c084fc";
    if(followingSet.has(u)) return "#22c55e";
    return "var(--text-2)";
  }

  return (
    <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
      <div style={{fontSize:9,fontWeight:800,color:"var(--text-5)",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>
        🏆 Classement {gameType==="chain"?"LinkUp":"Timeline"}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {rows.map(r=>{
          const isMe=r.username===myUsername;
          const medal=r.rank===1?"🥇":r.rank===2?"🥈":r.rank===3?"🥉":null;
          return (
            <div key={r.username} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,
              background:isMe?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.02)",
              border:isMe?"1px solid rgba(124,58,237,0.2)":"1px solid transparent"}}>
              <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{medal||r.rank}</div>
              <div style={{flex:1,fontSize:10,fontWeight:isMe||followingSet.has(r.username)?800:500,
                color:uColor(r.username),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {r.username}
              </div>
              <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{r.pts}</div>
            </div>
          );
        })}
        {myRank&&(
          <>
            <div style={{padding:"3px 8px",textAlign:"center",fontSize:9,color:"var(--text-6)"}}>·  ·  ·</div>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,
              background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)"}}>
              <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{myRank.rank}</div>
              <div style={{flex:1,fontSize:10,fontWeight:800,color:"#c084fc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{myUsername}</div>
              <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{myRank.pts}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ForumView({ onOpenDetail, onOpenUser, pendingJoinGame, onClearPendingJoin }) {
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
  // Handle game invite from notification bell
  useEffect(() => {
    if(!pendingJoinGame) return;
    const { gameType, roomId, privateCode } = pendingJoinGame;
    onClearPendingJoin?.();
    if(gameType === "cluescale") {
      sb.query(`game_rooms?id=eq.${roomId}&limit=1`).then(rows => {
        const r = rows?.[0];
        if(r) setCluescaleRoom({...r, players: r.state?.players||[r.player1,r.player2].filter(Boolean)});
      }).catch(()=>{});
    } else {
      sb.query(`game_rooms?private_code=eq.${encodeURIComponent(privateCode)}&status=eq.waiting&limit=1`).then(async rows => {
        const r = rows?.[0];
        if(!r) return;
        await sb.query(`game_rooms?id=eq.${r.id}`, {
          method:"PATCH",headers:{...sb.headers,"Prefer":"return=minimal"},
          body:JSON.stringify({player2:myUsername,elo2:400,status:"active"}),
        }).catch(()=>{});
        setActiveRoom({...r,player2:myUsername,elo2:400});
        setActiveGame(gameType);
      }).catch(()=>{});
    }
  }, [pendingJoinGame]); // eslint-disable-line react-hooks/exhaustive-deps
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
    Promise.all([fetchUpcomingAnime(15), fetchNewAnime(15)])
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
              <GamePanel
                myUsername={myUsername}
                following={followingList}
                onWordle={()=>setShowWordle(true)}
                onPoster={()=>setShowPoster(true)}
                onOpQuiz={()=>setShowOpQuiz(true)}
                onChain={()=>setMatchmaking("chain")}
                onTimeline={()=>setMatchmaking("timeline")}
                onCluescale={()=>setShowCluescale(true)}
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
        <GameModal onClose={()=>setShowWordle(false)} title="🎯 Anidle" maxWidth="680px">
          {() => <WordleGame onClose={()=>setShowWordle(false)}/>}
        </GameModal>
      )}
      {showPoster && (
        <GameModal onClose={()=>setShowPoster(false)} title="🖼 Devine le Poster" maxWidth="600px">
          {() => <PosterGame onClose={()=>setShowPoster(false)}/>}
        </GameModal>
      )}

      {matchmaking && !activeRoom && (
        <GameModal onClose={()=>setMatchmaking(null)} title={`${matchmaking === "chain" ? "🔗 LinkUp" : "📅 Timeline"} — Recherche`} maxWidth="520px">
          {() => (
            <div>
              <Matchmaking gameType={matchmaking} onClose={()=>setMatchmaking(null)}
                onMatch={room=>{setActiveRoom(room);setActiveGame(matchmaking);setMatchmaking(null);}}/>
              <div style={{padding:"0 20px 20px"}}>
                <EloLeaderboard gameType={matchmaking} myUsername={myUsername} following={followingList}/>
              </div>
            </div>
          )}
        </GameModal>
      )}
      {activeRoom && activeGame === "chain" && (
        <GameModal onClose={async()=>handleGameClose(chainCloseRef.current)} title="🔗 LinkUp" subtitle="Relier les animés par studio ou genre" maxWidth="960px">
          {() => <ChainGame room={activeRoom}
            onClose={async()=>{ await handleGameClose(chainCloseRef.current); }}
            onReady={(forfaitFn)=>{ chainCloseRef.current = forfaitFn; }}/>}
        </GameModal>
      )}
      {activeRoom && activeGame === "timeline" && (
        <GameModal onClose={async()=>handleGameClose(timelineCloseRef.current)} title="📅 Timeline" subtitle="Place les animés dans l'ordre" maxWidth="1120px">
          {() => <TimelineGame room={activeRoom}
            onClose={async()=>{ await handleGameClose(timelineCloseRef.current); }}
            onReady={(forfaitFn)=>{ timelineCloseRef.current = forfaitFn; }}/>}
        </GameModal>
      )}
      {showOpQuiz && (
        <GameModal onClose={()=>setShowOpQuiz(false)} title="🎵 Opening Quiz" subtitle="Reconnais l'animé par son opening" maxWidth="700px">
          {() => <OpQuizGame onClose={()=>setShowOpQuiz(false)}/>}
        </GameModal>
      )}
      {showCluescale && !cluescaleRoom && (
        <GameModal onClose={()=>setShowCluescale(false)} title="🎭 Cluescale" subtitle="Juge & Jury — 2 à 4 joueurs" maxWidth="460px">
          {() => <CluescaleMatchmaking
            onClose={()=>setShowCluescale(false)}
            onMatch={room=>{setCluescaleRoom(room);setShowCluescale(false);}}/>}
        </GameModal>
      )}
      {cluescaleRoom && (
        <GameModal onClose={()=>setCluescaleRoom(null)} title="🎭 Cluescale" maxWidth="600px">
          {() => <CluescaleGame room={cluescaleRoom} onClose={()=>setCluescaleRoom(null)}/>}
        </GameModal>
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
