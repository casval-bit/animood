import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { useSound } from "../context/SoundContext.jsx";
import { STATUS_COLORS, STATUS_PRIORITY, getStatusLabel } from "../constants/statuses.js";
import { PROFILE_I18N } from "../constants/profileI18n.js";
import { MOOD_KEYS } from "../constants/moods.js";
import { jikan } from "../api/jikan.js";
import { follows, sb, posts as postsApi, comments as commentsApi } from "../api/supabase.js";
import { dispatchPostEvent, addPostEventListener } from "../utils/postEvents.js";
import { FRAMES, getUnlockedFrames, getBestFrame, getFrameLabel, getFrameDesc } from "../frames/frames.js";
import { BADGES, getUnlockedBadges, getBestBadge, BadgeDisplay } from "../badges/badges.jsx";
import { FrameSVG } from "../frames/FrameSVG.jsx";
import { getFrameSvg, getExtraFrames, loadFrameFlags, noteNightOwl } from "../frames/framesDesktop.js";
import { Spinner } from "../components/Spinner.jsx";
import { ScoreChart } from "../components/ScoreChart.jsx";
import { MoodOctagon } from "../components/MoodOctagon.jsx";
import { AnimePoster } from "../components/AnimeCard.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Modal } from "../components/Modal.jsx";
import { FavoriteSearchModal } from "../components/FavoriteSearchModal.jsx";
import { FollowListModal } from "../components/FollowListModal.jsx";
import { TabBar, BookmarkIcon } from "../components/ui.jsx";
import { isDesktopApp } from "../utils/streamingLinks.js";
import { openWebUrl } from "../utils/safeUrl.js";
import { GRADIENT_PRIMARY, GRADIENT_TEXT, GLASS, GLASS_STYLE } from "../constants/theme.js";

// ─── PERSONAL MOOD RADAR ──────────────────────────────────────────────────────
function PersonalMoodRadar({ ratings, watched, bare = false }) {
  const { lang } = useLang();
  const t = PROFILE_I18N[lang] || PROFILE_I18N.fr;
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
          const rows = await sb.query(`mood_pts_v4?mal_id=in.(${chunk.join(",")})&select=mal_id,emotional,happy,twisted,chill,in_love,hype,dark,thrills`);
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

  if(loading) return <div className="mb-2"><Spinner label={t.calculating} /></div>;
  if(!avg) return null;

  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.moodProfileTitle}</div>
      <div className="mb-2 text-[10px] text-slate-600">{t.basedOn(count, allIds.length)}</div>
      <MoodOctagon pts={avg} size={bare ? 226 : 340} className={bare ? "" : undefined} />
    </div>
  );
}

// ─── TOP GENRES ───────────────────────────────────────────────────────────────
function TopGenres({ watched }) {
  const { lang } = useLang();
  const t = PROFILE_I18N[lang] || PROFILE_I18N.fr;
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

  if(loading) return <div><div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.topGenresTitle}</div><Spinner label={t.topGenresLoading} /></div>;
  if(top5.length === 0) return null;
  const max = top5[0][1];

  return (
    <div>
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.topGenresTitle}</div>
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

const getTabs = (t) => [{id:"profile",label:t.tabProfile},{id:"journal",label:t.tabJournal},{id:"lists",label:t.tabLists},{id:"posts",label:t.tabPosts},{id:"stats",label:t.tabStats}];

// ─── STATS TAB ────────────────────────────────────────────────────────────────
const MOOD_META_STATS = {
  emotional:{emoji:"💔",color:"#A78BFA",label:"Emotional"},
  happy:    {emoji:"✨",color:"#FFD93D",label:"Happy"},
  hype:     {emoji:"⚡",color:"#F97316",label:"Hype"},
  dark:     {emoji:"🩸",color:"#EF4444",label:"Dark"},
  chill:    {emoji:"🌿",color:"#34D399",label:"Chill"},
  twisted:  {emoji:"🌀",color:"#06B6D4",label:"Twisted"},
  in_love:  {emoji:"🌸",color:"#F9A8D4",label:"In Love"},
  thrills:  {emoji:"🎢",color:"#FB923C",label:"Thrills"},
};

function StatBars({ items, color, sortKey, onToggleSort }) {
  const { lang } = useLang();
  const t = PROFILE_I18N[lang] || PROFILE_I18N.fr;
  const sorted = [...items].sort((a,b) => sortKey==="avg"
    ? (parseFloat(b.avg)||0) - (parseFloat(a.avg)||0)
    : b.count - a.count
  );
  const max = Math.max(...sorted.map(x => sortKey==="avg" ? parseFloat(x.avg)||0 : x.count), 1);
  return (
    <div>
      <div className="flex justify-end mb-2 gap-1">
        {["count","avg"].map(k => (
          <button key={k} onClick={()=>onToggleSort(k)}
            className="text-[9px] px-2 py-0.5 rounded-full font-bold transition"
            style={{background:sortKey===k?"rgba(124,58,237,0.3)":"rgba(255,255,255,0.05)",
                    color:sortKey===k?"#c084fc":"var(--text-4)"}}>
            {k==="count"?t.sortCount:t.sortAvgRating}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map(item => {
          const val = sortKey==="avg" ? parseFloat(item.avg)||0 : item.count;
          return (
            <div key={item.name}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-300 font-semibold truncate max-w-[60%]">{item.name}</span>
                <span className="text-slate-500 shrink-0 ml-2">
                  {sortKey==="avg"
                    ? (item.avg ? `★${item.avg} · ${item.count}` : item.count)
                    : (item.count + (item.avg ? ` · ★${item.avg}` : ""))}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{width:`${(val/max)*100}%`, background:color}}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearCurve({ data }) {
  const { lang } = useLang();
  const t = PROFILE_I18N[lang] || PROFILE_I18N.fr;
  if(!data?.length) return null;
  const W = 600, H = 160, PAD = 32;
  const years = data.map(d=>d.year);
  const avgs  = data.map(d=>d.avg);
  const minY = Math.floor(Math.min(...avgs) - 0.5);
  const maxY = Math.ceil(Math.max(...avgs) + 0.5);
  const minX = Math.min(...years), maxX = Math.max(...years);
  const toX = y => PAD + ((y - minX) / Math.max(maxX - minX, 1)) * (W - PAD*2);
  const toY = v => H - PAD - ((v - minY) / Math.max(maxY - minY, 1)) * (H - PAD*2);
  // Smooth bezier path
  const pts = data.map(d => [toX(d.year), toY(d.avg)]);
  let path = `M ${pts[0][0]} ${pts[0][1]}`;
  for(let i=1; i<pts.length; i++) {
    const cpx = (pts[i-1][0] + pts[i][0]) / 2;
    path += ` C ${cpx} ${pts[i-1][1]} ${cpx} ${pts[i][1]} ${pts[i][0]} ${pts[i][1]}`;
  }
  // Y grid lines
  const gridY = [];
  for(let v = Math.ceil(minY); v <= Math.floor(maxY); v++) gridY.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{maxHeight:160}}>
      {gridY.map(v => (
        <g key={v}>
          <line x1={PAD} x2={W-PAD} y1={toY(v)} y2={toY(v)} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
          <text x={PAD-4} y={toY(v)+4} textAnchor="end" fontSize="8" fill="rgba(148,163,184,0.6)">{v}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round"/>
      <path d={path + ` L ${pts[pts.length-1][0]} ${H-PAD} L ${pts[0][0]} ${H-PAD} Z`}
        fill="rgba(124,58,237,0.1)" strokeWidth="0"/>
      {data.map((d,i) => (
        <circle key={i} cx={toX(d.year)} cy={toY(d.avg)} r="3"
          fill="#7c3aed" stroke="#c084fc" strokeWidth="1.5">
          <title>{t.yearTooltip(d.year, d.avg, d.count)}</title>
        </circle>
      ))}
      {/* X axis labels — every 5 years */}
      {data.filter(d=>d.year%5===0).map(d=>(
        <text key={d.year} x={toX(d.year)} y={H-4} textAnchor="middle" fontSize="8" fill="rgba(148,163,184,0.5)">{d.year}</text>
      ))}
    </svg>
  );
}

function StatsTab({ statsData, ratings, watched }) {
  const { lang } = useLang();
  const t = PROFILE_I18N[lang] || PROFILE_I18N.fr;
  const [genreSort,    setGenreSort]    = useState("count");
  const [studioSort,   setStudioSort]   = useState("count");
  const [vaSort,       setVaSort]       = useState("count");
  const [directorSort, setDirectorSort] = useState("count");
  const [moodSort,     setMoodSort]     = useState("count");

  const rated = Object.keys(ratings).map(Number);
  const moodItems = statsData.moodAvgData || [];

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Compteurs globaux */}
      <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {l:t.statAnimeWatchedTV, v: watched.length},
          {l:t.statEpisodesWatched,v: statsData.totalEpisodes.toLocaleString()},
          {l:t.statAnimeRated,     v: rated.length},
          {l:t.statAvgRating,      v: rated.length
            ? (rated.reduce((a,id)=>a+(ratings[id]?.score||0),0)/rated.length).toFixed(2) : "—"},
        ].map(s => (
          <div key={s.l} className="rounded-xl border border-white/6 bg-white/3 p-4 text-center">
            <div className="text-2xl font-black text-violet-400">{s.v}</div>
            <div className="mt-1 text-[10px] text-slate-500">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Histogramme des notes */}
      <div className="lg:col-span-2">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.ratingDistribution}</div>
        <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
          <ScoreChart ratings={ratings}/>
        </div>
      </div>

      {/* Courbe note par année */}
      {statsData.yearCurve?.length > 1 && (
        <div className="lg:col-span-2">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.avgRatingByYear}</div>
          <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
            <YearCurve data={statsData.yearCurve}/>
          </div>
        </div>
      )}

      {/* Top Genres */}
      <div>
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎌 Top Genres</div>
        <StatBars items={statsData.topGenres} color="linear-gradient(90deg,#7c3aed,#4f46e5)"
          sortKey={genreSort} onToggleSort={setGenreSort}/>
      </div>

      {/* Top Studios */}
      <div>
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎬 Top Studios</div>
        <StatBars items={statsData.topStudios} color="linear-gradient(90deg,#ec4899,#f97316)"
          sortKey={studioSort} onToggleSort={setStudioSort}/>
      </div>

      {/* Top Voice Actors */}
      {statsData.topVAs?.length > 0 && (
        <div>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎙️ Top Voice Actors</div>
          <StatBars items={statsData.topVAs} color="linear-gradient(90deg,#34d399,#06b6d4)"
            sortKey={vaSort} onToggleSort={setVaSort}/>
        </div>
      )}

      {/* Top Directors */}
      {statsData.topDirectors?.length > 0 && (
        <div>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎬 Top Réalisateurs</div>
          <StatBars items={statsData.topDirectors} color="linear-gradient(90deg,#f59e0b,#ef4444)"
            sortKey={directorSort} onToggleSort={setDirectorSort}/>
        </div>
      )}

      {/* Moods */}
      {moodItems.length > 0 && (
        <div>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.dominantMoods}</div>
          <div className="flex justify-end mb-2 gap-1">
            {["count","avg"].map(k => (
              <button key={k} onClick={()=>setMoodSort(k)}
                className="text-[9px] px-2 py-0.5 rounded-full font-bold transition"
                style={{background:moodSort===k?"rgba(124,58,237,0.3)":"rgba(255,255,255,0.05)",
                        color:moodSort===k?"#c084fc":"var(--text-4)"}}>
                {k==="count"?t.moodSortCount:t.moodSortAvg}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {[...moodItems].sort((a,b) => moodSort==="avg" ? b.avg-a.avg : b.count-a.count).map(item => {
              const val = moodSort==="avg" ? item.avg : item.count;
              const max = Math.max(...moodItems.map(x => moodSort==="avg" ? x.avg : x.count), 1);
              return (
                <div key={item.key}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300 font-semibold">{MOOD_META_STATS[item.key]?.emoji} {MOOD_META_STATS[item.key]?.label}</span>
                    <span className="text-slate-500">
                      {moodSort==="count"
                        ? t.moodStatCount(item.count, item.avg)
                        : t.moodStatAvg(item.avg, item.count)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{width:`${(val/max)*100}%`, background:MOOD_META_STATS[item.key]?.color||"#7c3aed"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE POST CARD ────────────────────────────────────────────────────────
function ProfilePostCard({ post, myUsername, onLikeUpdate, onDelete }) {
  const { lang } = useLang();
  const t = PROFILE_I18N[lang] || PROFILE_I18N.fr;
  const [liked, setLiked]             = useState((post.likes||[]).includes(myUsername));
  const [likeCount, setLikeCount]     = useState((post.likes||[]).length);
  const [showComments, setShowComments] = useState(false);
  const [postComments, setPostComments] = useState([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);

  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked); setLikeCount(c => c + (newLiked?1:-1));
    const result = await postsApi.toggleLike(post.id, myUsername).catch(()=>null);
    const newLikes = result?.[0]?.likes || (newLiked ? [...(post.likes||[]),myUsername] : (post.likes||[]).filter(u=>u!==myUsername));
    onLikeUpdate?.(post.id, newLikes);
    dispatchPostEvent("like", { id: post.id, likes: newLikes });
  };

  const loadComments = async () => {
    if(commentsLoaded) return;
    try {
      const rows = await sb.query(`comments?post_id=eq.${post.id}&order=created_at.asc&limit=50`);
      setPostComments(rows||[]);
    } catch {}
    setCommentsLoaded(true);
  };

  const toggleComments = () => {
    setShowComments(p => !p);
    if(!commentsLoaded) loadComments();
  };

  const handleDeletePost = async () => {
    if(!window.confirm(t.confirmDeletePost)) return;
    try {
      await sb.query(`posts?id=eq.${post.id}`, { method:"DELETE" });
      onDelete?.(post.id);
      dispatchPostEvent("delete", { id: post.id });
    } catch {}
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await sb.query(`comments?id=eq.${commentId}`, { method:"DELETE" });
      setPostComments(p => p.filter(c=>c.id!==commentId));
    } catch {}
  };

  const toggleCommentLike = async (commentId) => {
    const target = postComments.find(c => c.id === commentId);
    const likes = target?.likes || [];
    const newLikes = likes.includes(myUsername) ? likes.filter(u=>u!==myUsername) : [...likes, myUsername];
    setPostComments(prev => prev.map(c => c.id===commentId ? {...c, likes:newLikes} : c));
    await commentsApi.toggleLike(commentId, myUsername).catch(()=>{});
    dispatchPostEvent("commentLike", { id: commentId, likes: newLikes });
  };

  // Sync comment likes with other views (e.g. liked from the Feed)
  useEffect(() => {
    return addPostEventListener(({ type, id, likes }) => {
      if(type === "commentLike") setPostComments(prev => prev.map(c => c.id===id ? {...c, likes} : c));
    });
  }, []);

  return (
    <div style={{background:"rgba(var(--fg-rgb),0.03)",borderRadius:16,
      border:"1px solid rgba(var(--fg-rgb),0.06)",padding:14,marginBottom:10}}>
      {/* Header */}
      <div style={{display:"flex",gap:10,marginBottom:10,alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
            <span style={{fontSize:10,color:"var(--text-4)"}}>{new Date(post.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{background:post._type==="written"?"rgba(124,58,237,0.2)":"rgba(99,102,241,0.15)",
                      color:post._type==="written"?"#c084fc":"#818cf8"}}>
              {post._type==="written"?"✍️ Post":"💬 Commenté"}
            </span>
            {post.anime_title && <span style={{fontSize:10,color:"#818cf8",fontWeight:600}}>📺 {post.anime_title}</span>}
          </div>
        </div>
        {post._type==="written" && (
          <button onClick={handleDeletePost}
            style={{background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:14}}
            onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
            onMouseLeave={e=>e.currentTarget.style.color="var(--text-4)"}>✕</button>
        )}
      </div>
      {post.spoiler && <div style={{marginBottom:8,fontSize:10,fontWeight:700,color:"#ef4444",background:"rgba(239,68,68,0.1)",padding:"2px 8px",borderRadius:4,width:"fit-content"}}>⚠️ SPOILER</div>}
      <p style={{fontSize:14,color:"var(--text-1)",lineHeight:1.6,margin:"0 0 10px",whiteSpace:"pre-wrap"}}>{post.content}</p>
      {post.image_url && (
        <div style={{borderRadius:10,overflow:"hidden",marginBottom:10,maxHeight:400}}>
          <img loading="lazy" decoding="async" src={post.image_url} alt="" style={{width:"100%",objectFit:"cover",maxHeight:400,display:"block",cursor:"pointer"}}
            onClick={()=>openWebUrl(post.image_url)}/>
        </div>
      )}
      {/* Actions */}
      <div style={{display:"flex",gap:14,alignItems:"center"}}>
        <button onClick={handleLike}
          style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4,
            color:liked?"#ef4444":"var(--text-3)",fontSize:12,fontWeight:700,transition:"color 0.15s"}}>
          {liked?"❤️":"🤍"} {likeCount||""}
        </button>
        <button onClick={toggleComments}
          style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,
            color:showComments?"#818cf8":"var(--text-3)",fontSize:12,fontWeight:700}}>
          {t.commentsLabel}{postComments.length>0||post.comment_count>0?` (${commentsLoaded?postComments.length:post.comment_count||0})`:""} {showComments?"▲":"▼"}
        </button>
      </div>
      {/* Comments — likeable, deletable if yours */}
      {showComments && (
        <div style={{marginTop:12,borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:10}}>
          {!commentsLoaded ? (
            <div style={{fontSize:10,color:"var(--text-5)"}}>{t.loadingComments}</div>
          ) : postComments.length===0 ? (
            <div style={{fontSize:10,color:"var(--text-5)",fontStyle:"italic"}}>{t.noComments}</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {postComments.map((c,i)=>{
                const cLikes = c.likes||[];
                const cLiked = cLikes.includes(myUsername);
                return (
                  <div key={c.id||i} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <span style={{fontSize:10,fontWeight:800,color:"#c084fc",marginRight:6}}>@{c.username}</span>
                      <span style={{fontSize:12,color:"var(--text-2)"}}>{c.content}</span>
                      <div style={{marginTop:3}}>
                        <button onClick={()=>toggleCommentLike(c.id)}
                          style={{background:"none",border:"none",cursor:"pointer",fontSize:10,fontWeight:700,
                            color:cLiked?"#ef4444":"var(--text-4)"}}>
                          {cLiked?"❤️":"🤍"} {cLikes.length||""}
                        </button>
                      </div>
                    </div>
                    {c.username===myUsername && (
                      <button onClick={()=>handleDeleteComment(c.id)}
                        style={{background:"none",border:"none",color:"var(--text-5)",cursor:"pointer",fontSize:11,flexShrink:0}}
                        onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
                        onMouseLeave={e=>e.currentTarget.style.color="var(--text-5)"}>✕</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Profil : petit cercle de stat (Pts jeux / Badges), à gauche de « En boucle » ─
function StatCircle({ size, value, label, icon, ring, glow, onClick, title }) {
  const Tag = onClick ? "button" : "div";
  return (
    <div style={{ width: size + 20, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
      <Tag type={onClick ? "button" : undefined} onClick={onClick} title={title}
        style={{ position: "relative", width: size, height: size, padding: 0, border: "none", background: "none", cursor: onClick ? "pointer" : "default" }}>
        <div style={{ position: "absolute", inset: -10, borderRadius: "50%", background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`, filter: "blur(5px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: ring }} />
        <div style={{ position: "absolute", inset: 4, borderRadius: "50%", background: "#070816", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <span style={{ fontSize: Math.round(size * 0.17), lineHeight: 1 }}>{icon}</span>
          <span style={{ fontSize: Math.round(size * 0.24), fontWeight: 900, lineHeight: 1.1, color: "#f1f5f9", letterSpacing: "-0.02em" }}>{value}</span>
        </div>
      </Tag>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(148,163,184,.85)", textAlign: "center" }}>{label}</div>
    </div>
  );
}

// ─── Points de jeu totaux (même total que le classement du forum) ───────────────────────────────────────────
function useGamePoints(myUsername) {
  const [pts, setPts] = useState(null);
  useEffect(() => {
    if(!myUsername) return;
    let cancelled = false;
    // Même total que le classement des jeux : ELO chaîne + ELO timeline + points de chaque mini-jeu
    sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&select=elo_chain,elo_timeline,pts_wordle,pts_poster,pts_opquiz,pts_cluescale,pts_undercover&limit=1`)
      .then(r => {
        const e = r?.[0];
        const total = e ? (e.elo_chain||400)+(e.elo_timeline||400)+(e.pts_wordle||0)+(e.pts_poster||0)+(e.pts_opquiz||0)+(e.pts_cluescale||0)+(e.pts_undercover||0) : 0;
        if(!cancelled) setPts(total);
      })
      .catch(()=>{ if(!cancelled) setPts(0); });
    return () => { cancelled = true; };
  }, [myUsername]);
  return pts;
}

// 1011 → "1.0K", 1450 → "1.4K", 20300 → "20.3K" ; en dessous de 1000 on garde le nombre exact
function fmtPoints(n) {
  if(n === null || n === undefined) return "—";
  if(n < 1000) return String(n);
  if(n < 1_000_000) return (Math.floor(n / 100) / 10).toFixed(1) + "K";
  return (Math.floor(n / 100_000) / 10).toFixed(1) + "M";
}

// ─── DESKTOP : « En boucle » — UN animé mis en avant dans un cercle cadré ─────
const SPOTLIGHT_CSS = `
@keyframes sp-ring-rot { to { transform: rotate(360deg); } }
@keyframes sp-badge-spin { to { transform: rotate(360deg); } }
.sp-wrap:hover .sp-actions { opacity: 1; }
`;

// compact (site web) : aucun bouton sous le cercle — modification via la pastille ✎ et, au survol, « Changer » / ✕
function SpotlightCircle({ anime, lang, onOpen, onPick, onClear, size = 132, compact = false }) {
  const en = lang === "en";
  const label = en ? "On repeat" : "En boucle";
  const img = anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url || anime?.image_url;
  const SIZE = size;

  return (
    <div className="sp-wrap" style={{ width: SIZE + 36, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
      <style>{SPOTLIGHT_CSS}</style>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.3em", paddingLeft: "0.3em", textTransform: "uppercase", color: "rgba(167,139,250,.85)" }}>
        {label}
      </div>

      <div style={{ position: "relative", width: SIZE, height: SIZE }}>
        {/* halo */}
        <div style={{ position: "absolute", inset: -14, borderRadius: "50%", background: "radial-gradient(circle, rgba(109,91,255,.32) 0%, rgba(236,72,153,.1) 55%, transparent 72%)", filter: "blur(6px)", pointerEvents: "none" }} />
        {/* anneau dégradé de marque qui tourne */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "conic-gradient(from 0deg, #6D5BFF, #8B5CF6, #EC4899, #8B5CF6, #6D5BFF)",
          animation: "sp-ring-rot 9s linear infinite",
          opacity: anime ? 1 : 0.35,
        }} />
        {/* écrin sombre */}
        <div style={{ position: "absolute", inset: 4, borderRadius: "50%", background: "#070816" }} />
        {/* contenu */}
        <button type="button"
          onClick={anime ? onOpen : onPick}
          onContextMenu={(e) => { e.preventDefault(); onPick(); }}
          title={anime ? anime.title : (en ? "Pick an anime" : "Choisir un animé")}
          style={{
            position: "absolute", inset: 7, borderRadius: "50%", overflow: "hidden", border: "none", padding: 0, cursor: "pointer",
            background: anime ? "#0b0c1c" : "repeating-linear-gradient(45deg, rgba(148,163,184,.06) 0 7px, rgba(8,10,22,.7) 7px 14px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          {anime && img
            ? <img loading="lazy" decoding="async" src={img} alt={anime.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: Math.round(SIZE * 0.26), lineHeight: 1, color: "rgba(148,163,184,.7)", fontWeight: 300 }}>＋</span>}
        </button>

        {/* actions au survol */}
        {anime && (
          <div className="sp-actions" style={{ position: "absolute", inset: 7, borderRadius: "50%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 6, paddingBottom: 10, opacity: 0, transition: "opacity .2s", pointerEvents: "none", background: "linear-gradient(180deg, transparent 45%, rgba(4,5,14,.82) 100%)" }}>
            <button type="button" onClick={onPick} style={{ pointerEvents: "auto", fontSize: 10, fontWeight: 800, color: "#e2e8f0", background: "rgba(255,255,255,.14)", border: "none", borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>
              {en ? "Change" : "Changer"}
            </button>
            <button type="button" onClick={onClear} style={{ pointerEvents: "auto", fontSize: 10, fontWeight: 800, color: "#fca5a5", background: "rgba(255,255,255,.1)", border: "none", borderRadius: 999, padding: "3px 7px", cursor: "pointer" }}>✕</button>
          </div>
        )}

        {/* site web : pastille ✎ discrète (toujours visible, utile sans survol) */}
        {compact && (
          <button type="button" onClick={onPick} title={en ? (anime ? "Change" : "Pick an anime") : (anime ? "Changer" : "Choisir un animé")}
            style={{ position: "absolute", right: 0, top: 2, width: 24, height: 24, borderRadius: "50%", background: "#1e1b4b", border: "2px solid #070816", color: "#c4b5fd", fontSize: 11, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
            ✎
          </button>
        )}

        {/* pastille « boucle » */}
        <div style={{
          position: "absolute", right: -2, bottom: 6, width: 28, height: 28, borderRadius: "50%",
          background: GRADIENT_PRIMARY, border: "2px solid #070816", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 12px rgba(139,92,246,.6)", pointerEvents: "none",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "sp-badge-spin 6s linear infinite" }}>
            <path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" />
            <path d="M18.5 2v4h-4M5.5 22v-4h4" />
          </svg>
        </div>
      </div>

      <div style={{ minHeight: 30, textAlign: "center", fontSize: 11.5, fontWeight: 700, lineHeight: 1.3, color: anime ? "#e2e8f0" : "rgba(148,163,184,.7)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {anime ? anime.title : (en ? "Pin an anime" : "Épingle un animé")}
      </div>
      {anime && !compact && (
        <div style={{ display: "flex", gap: 6, marginTop: -2 }}>
          <button type="button" onClick={onPick}
            style={{ fontSize: 10.5, fontWeight: 800, color: "#c4b5fd", background: "rgba(139,92,246,.14)", border: "1px solid rgba(139,92,246,.35)", borderRadius: 999, padding: "3px 11px", cursor: "pointer" }}>
            ✎ {en ? "Change" : "Changer"}
          </button>
          <button type="button" onClick={onClear} title={en ? "Remove" : "Retirer"}
            style={{ fontSize: 10.5, fontWeight: 800, color: "#fca5a5", background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.28)", borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── HUD PANEL — dashboard high-tech style tablette holographique ─────────────
const HUD_CSS = `
@keyframes hud-scan {
  0%   { transform: translateY(-100%); opacity: 0; }
  10%  { opacity: 0.6; }
  90%  { opacity: 0.6; }
  100% { transform: translateY(100%); opacity: 0; }
}
@keyframes hud-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
@keyframes hud-glow-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); }
  50%       { box-shadow: 0 0 0 6px rgba(139,92,246,0.08); }
}
@keyframes counter-up {
  0%   { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes bar-fill {
  0%   { width: 0; }
}
@keyframes hud-flicker {
  0%, 95%, 100% { opacity: 1; }
  96% { opacity: 0.85; }
  97% { opacity: 0.95; }
  98% { opacity: 0.8; }
}
@keyframes hud-corner-pulse {
  0%, 100% { opacity: 0.5; width: 12px; height: 12px; }
  50% { opacity: 1; width: 16px; height: 16px; box-shadow: 0 0 6px rgba(139,92,246,0.6); }
}
@keyframes hud-data-stream {
  0% { transform: translateY(0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-100%); opacity: 0; }
}
@keyframes counter-cascade {
  0% { opacity: 0; transform: translateY(14px) scale(0.8); filter: blur(4px); }
  60% { filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes bd-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2.5px); }
}
@keyframes bd-shine {
  0%, 70%, 100% { opacity: 0; transform: translateX(-120%) skewX(-20deg); }
  85%           { opacity: .9; }
  95%           { opacity: 0; transform: translateX(220%) skewX(-20deg); }
}
@keyframes bd-halo {
  0%, 100% { opacity: .55; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.12); }
}
@keyframes border-glow-sweep {
  0% { box-shadow: 0 0 0 0 transparent, 0 0 15px rgba(139,92,246,0); }
  25% { box-shadow: 0 -1px 0 0 rgba(168,85,247,0.6), 0 0 20px rgba(139,92,246,0.15); }
  75% { box-shadow: 0 0 0 0 transparent, 0 0 10px rgba(139,92,246,0.08); }
  100% { box-shadow: 0 0 0 0 transparent, 0 0 15px rgba(139,92,246,0); }
}
`;

function HudPanel({ me, rated, myUsername, unlockedBadges, activeBadge, onOpenBadges, t, lang = "fr", tilesOnly = false, noTiles = false }) {
  const gamePts = useGamePoints(myUsername);
  const avgScore = rated.length
    ? (rated.reduce((a, id) => a + (me.ratings[id]?.score || 0), 0) / rated.length).toFixed(1)
    : null;

  // Inject CSS once
  useEffect(() => {
    const id = "animood-hud-css";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = HUD_CSS;
      document.head.appendChild(style);
    }
  }, []);

  const hudCard = {
    borderRadius: 16,
    border: "1px solid rgba(139,92,246,0.18)",
    background: "linear-gradient(135deg, rgba(10,6,30,0.85) 0%, rgba(15,9,40,0.75) 100%)",
    backdropFilter: "blur(12px)",
    padding: "14px 16px",
    position: "relative",
    overflow: "hidden",
  };

  const scanLine = {
    position: "absolute",
    left: 0, right: 0,
    height: 40,
    background: "linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.05) 50%, transparent 100%)",
    animation: "hud-scan 5s linear infinite",
    pointerEvents: "none",
  };

  const cornerDeco = (pos) => ({
    position: "absolute",
    [pos.includes("t") ? "top" : "bottom"]: 0,
    [pos.includes("l") ? "left" : "right"]: 0,
    width: 12, height: 12,
    borderTop: pos.includes("t") ? "2px solid rgba(139,92,246,0.5)" : "none",
    borderBottom: pos.includes("b") ? "2px solid rgba(139,92,246,0.5)" : "none",
    borderLeft: pos.includes("l") ? "2px solid rgba(139,92,246,0.5)" : "none",
    borderRight: pos.includes("r") ? "2px solid rgba(139,92,246,0.5)" : "none",
  });

  // Histogramme des notes 1-10
  const histoData = [];
  for (let s = 1; s <= 10; s++) {
    histoData.push({ score: s, count: Object.values(me.ratings || {}).filter(r => r.score === s).length });
  }
  const histoMax = Math.max(...histoData.map(d => d.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: tilesOnly ? "auto" : "100%", animation: "hud-flicker 8s ease-in-out infinite" }}>

      {/* ── ROW 1 — métriques (affichées dans le bandeau du profil sur desktop) ── */}
      {!noTiles && <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {[
          { icon: "▶", label: t.statVus || "Vus",   value: me.watched.length, color: "#a855f7", delay: "0ms" },
          { icon: "★", label: t.statNotes || "Notes", value: rated.length,      color: "#6366f1", delay: "100ms" },
          { icon: "⌀", label: t.statMoy || "Moy.",   value: avgScore ?? "—",   color: "#e879f9", delay: "200ms" },
          { icon: "🏆", label: t.badges || "Badges",  value: unlockedBadges.length, color: "#fbbf24", onClick: onOpenBadges, delay: "300ms" },
          { icon: "🎮", label: t.statPoints || "Points", value: fmtPoints(gamePts), hover: gamePts === null ? undefined : `${gamePts.toLocaleString()} pts`, color: "#ec4899", delay: "400ms" },
        ].map(({ icon, label, value, color, onClick, delay, hover }) => (
          <div key={label}
            onClick={onClick}
            title={hover}
            style={{
              ...hudCard,
              cursor: onClick ? "pointer" : "default",
              textAlign: "center",
              padding: "12px 8px",
              animation: `hud-glow-pulse 4s ease-in-out infinite, border-glow-sweep 3s ease-in-out infinite`,
            }}
          >
            <div style={scanLine} />
            <div style={{ position: "absolute", ...cornerDeco("tl") }} />
            <div style={{ position: "absolute", ...cornerDeco("br") }} />
            <div style={{ fontSize: 11, color, marginBottom: 4, filter: `drop-shadow(0 0 6px ${color}88)` }}>{icon}</div>
            <div style={{
              fontSize: 22, fontWeight: 900,
              color: "#fff",
              letterSpacing: -1,
              animation: `counter-cascade 0.6s cubic-bezier(.34,1.56,.64,1) ${delay} both`,
              textShadow: `0 0 12px ${color}66`,
            }}>{value}</div>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(148,163,184,0.55)", marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>}

      {!tilesOnly && <>
      {/* ── ROW 2 — Histogramme des notes ───────────────────────────────── */}
      <div style={{ ...hudCard, animation: "border-glow-sweep 3s ease-in-out infinite" }}>
        <div style={scanLine} />
        <div style={{ position: "absolute", ...cornerDeco("tl") }} />
        <div style={{ position: "absolute", ...cornerDeco("tr") }} />
        <div style={{ position: "absolute", ...cornerDeco("bl") }} />
        <div style={{ position: "absolute", ...cornerDeco("br") }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "rgba(139,92,246,0.7)" }}>
            DISTRIBUTION DES NOTES
          </div>
          <div style={{ fontSize: 8, color: "rgba(100,116,139,0.5)", fontWeight: 600 }}>
            {rated.length} notés
          </div>
        </div>

        {rated.length > 0 ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, position: "relative" }}>
            {/* Data stream scanner */}
            <div style={{
              position: "absolute", top: 0, bottom: 0, width: 1,
              background: "linear-gradient(180deg, transparent, rgba(139,92,246,0.4), transparent)",
              animation: "hud-data-stream 4s linear infinite",
              pointerEvents: "none",
              left: "50%",
            }} />
            {histoData.map(({ score, count }) => {
              const heightPx = count > 0 ? Math.max(Math.round((count / histoMax) * 76), 4) : 0;
              const isHigh = score >= 8;
              const isMid = score >= 5 && score < 8;
              const barColor = isHigh
                ? "linear-gradient(180deg, #a855f7, #6366f1)"
                : isMid
                  ? "linear-gradient(180deg, #4f46e5, #3730a3)"
                  : "linear-gradient(180deg, #374151, #1f2937)";
              return (
                <div key={score} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  {count > 0 && (
                    <div style={{ fontSize: 7, fontWeight: 700, color: isHigh ? "#c4b5fd" : "rgba(100,116,139,0.6)" }}>
                      {count}
                    </div>
                  )}
                  <div style={{
                    flex: 1, width: "100%",
                    display: "flex", alignItems: "flex-end",
                  }}>
                    <div style={{
                      width: "100%",
                      height: heightPx,
                      background: barColor,
                      borderRadius: "3px 3px 2px 2px",
                      boxShadow: isHigh && count > 0 ? "0 0 6px rgba(168,85,247,0.5)" : "none",
                      animation: "bar-fill 0.8s ease-out",
                      transition: "height 0.5s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 7, fontWeight: 600, color: "rgba(100,116,139,0.4)" }}>{score}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(100,116,139,0.4)", fontSize: 11 }}>
            — notes vides —
          </div>
        )}
      </div>

      {/* ── ROW 3 — MoodOctagon full width ──────────────────────────────── */}
      <div style={{ ...hudCard, minHeight: 180, flex: 1, animation: "border-glow-sweep 3s ease-in-out infinite" }}>
        <div style={scanLine} />
        <div style={{ position: "absolute", ...cornerDeco("tl") }} />
        <div style={{ position: "absolute", ...cornerDeco("br") }} />
        <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "rgba(139,92,246,0.7)", marginBottom: 8 }}>
          MOOD RADAR
        </div>
        <PersonalMoodRadar ratings={me.ratings} watched={me.watched} />
      </div>
      </>}

    </div>
  );
}

// Sélecteur de cadre rapide (ouvert par le petit crayon de l'avatar) — même choix que Paramètres → Profil
function FramePickerModal({ frames, unlocked, active, avatar, lang, onPick, onClose, onOpenSettings }) {
  const en = lang === "en";
  const cats = [["watched", en ? "Watched" : "Visionnage"], ["contribution", en ? "Contribution" : "Contribution"], ["followers", en ? "Followers" : "Abonnés"], ["genre", en ? "Genres" : "Genres"], ["games", en ? "Games" : "Jeux"], ["fun", en ? "Effects & special" : "Effets & spéciaux"]];
  const sz = 44;
  return (
    <Modal onClose={onClose} maxWidth="max-w-xl">
      {(close) => (
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-black text-slate-100">{en ? "Profile frame" : "Cadre de profil"}</div>
            <button type="button" onClick={close} aria-label="Fermer" style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 16, cursor: "pointer" }}>✕</button>
          </div>
          <button type="button" onClick={() => { onPick(null); close(); }}
            className="mb-3 flex w-full items-center gap-3 rounded-xl p-2 text-left"
            style={{ border: !active ? "2px solid #7c3aed" : "2px solid transparent", background: !active ? "rgba(124,58,237,0.1)" : "transparent", cursor: "pointer" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2px dashed rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🚫</div>
            <div className="text-xs font-bold text-slate-100">{en ? "No frame" : "Aucun cadre"}</div>
          </button>
          {cats.map(([cat, label]) => {
            const list = frames.filter(f => f.category === cat);
            if (!list.length) return null;
            return (
              <div key={cat} className="mb-3">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{label}</div>
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  {list.map(frame => {
                    const isUnlocked = unlocked.some(f => f.id === frame.id);
                    const isActive = active?.id === frame.id;
                    return (
                      <button key={frame.id} type="button"
                        onClick={() => { if (isUnlocked) { onPick(frame); close(); } }}
                        title={getFrameLabel(frame, lang) + " — " + getFrameDesc(frame, lang)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 8, borderRadius: 12,
                          cursor: isUnlocked ? "pointer" : "not-allowed",
                          border: isActive ? "2px solid #7c3aed" : "2px solid transparent",
                          background: isActive ? "rgba(124,58,237,0.1)" : "rgba(255,255,255,0.03)",
                          opacity: isUnlocked ? 1 : 0.4, filter: isUnlocked ? "none" : "grayscale(1)" }}>
                        <div style={{ position: "relative", width: sz, height: sz }}>
                          <div style={{ width: sz, height: sz, borderRadius: "50%", overflow: "hidden", background: GRADIENT_PRIMARY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                            {avatar?.startsWith?.("http") || avatar?.startsWith?.("data:") ? <img loading="lazy" decoding="async" src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (avatar || "👤")}
                          </div>
                          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
                            viewBox={`0 0 ${sz} ${sz}`} dangerouslySetInnerHTML={{ __html: getFrameSvg(frame, sz) }} />
                          {!isUnlocked && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: "rgba(0,0,0,0.3)", borderRadius: "50%" }}>🔒</div>}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: isUnlocked ? frame.color : "rgba(148,163,184,0.5)", textAlign: "center", maxWidth: 56, lineHeight: 1.2 }}>{getFrameLabel(frame, lang)}</span>
                        {!isUnlocked && <span style={{ fontSize: 8, color: "rgba(148,163,184,0.7)", textAlign: "center", maxWidth: 72, lineHeight: 1.2 }}>{getFrameDesc(frame, lang)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {onOpenSettings && (
            <button type="button" onClick={() => { close(); onOpenSettings("profile"); }}
              className="mt-1 text-[11px] text-slate-500 underline" style={{ background: "none", border: "none", cursor: "pointer" }}>
              {en ? "Change photo & badge in Settings" : "Photo et badge : Paramètres"}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

export function ProfileView({ onOpenDetail, onOpenSettings, onOpenUser }) {
  const { me, saveMe, myUsername } = useApp();
  const { lang } = useLang();
  const { playSound } = useSound();
  const t = PROFILE_I18N[lang] || PROFILE_I18N.fr;
  const desktop = isDesktopApp();
  const AVATAR = 132; // photo de profil (les cadres s'adaptent à cette taille)
  const [tab, setTab] = useState("profile");
  const [journalFilter, setJournalFilter] = useState(null);
  const [customListFilter, setCustomListFilter] = useState(null);
  const [journalGrid, setJournalGrid] = useState(true);
  const [watchlistPage, setWatchlistPage] = useState(0);
  const [animeCache, setAnimeCache] = useState({});
  const [favPopup, setFavPopup] = useState(null);
  const [unlockedFrames, setUnlockedFrames] = useState([]);
  const [activeFrame, setActiveFrame] = useState(null);
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [activeBadge, setActiveBadge] = useState(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followListMode, setFollowListMode] = useState(null); // "followers" | "following" | null
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState(me.bio||"");
  const [bioSaved, setBioSaved] = useState(false);
  const bioInputRef = useRef(null);
  const [openList, setOpenList] = useState(null);
  const [editingList, setEditingList] = useState(null);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [listSearchResults, setListSearchResults] = useState([]);
  const [editingFavs, setEditingFavs] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  // Posts tab
  const [myPosts, setMyPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  // Stats tab
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchAnime = async (id) => {
    if(!id || animeCache[id]) return;
    try { const r = await jikan.getAnime(id); setAnimeCache(p => ({...p,[id]:r.data})); } catch {}
  };

  // ── « En boucle » (UN animé épinglé dans un cercle cadré) — site et bureau ────
  const spotKey = `animood_spotlight_${myUsername}`;
  const [spotlightId, setSpotlightId] = useState(() => {
    try { const v = localStorage.getItem(spotKey); return v ? parseInt(v) : (me.spotlight ? parseInt(me.spotlight) : null); } catch { return me.spotlight ? parseInt(me.spotlight) : null; }
  });
  const [showSpotlightPicker, setShowSpotlightPicker] = useState(false);
  const [showFramePicker, setShowFramePicker] = useState(false);
  const gamePts = useGamePoints(desktop ? null : myUsername); // desktop : le total est déjà lu par le HudPanel
  // « En boucle » est synchronisé site <-> appli de bureau via la colonne profiles.spotlight
  // (supabase/profile_spotlight.sql, à exécuter une fois). Sans la colonne : mémorisation locale seulement.
  const spotSyncKey = `animood_spotlight_synced_${myUsername}`;
  const persistSpotlight = (id) => {
    setSpotlightId(id);
    try { id ? localStorage.setItem(spotKey, String(id)) : localStorage.removeItem(spotKey); } catch {}
    sb.query(`profiles?username=eq.${encodeURIComponent(myUsername)}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ spotlight: id || null }),
    }).then(() => { try { localStorage.setItem(spotSyncKey, "1"); } catch {} }).catch(()=>{});
  };
  useEffect(() => {
    if(!myUsername) return;
    // Le serveur fait foi dès que la colonne existe ; on relit à l'ouverture et quand la fenêtre reprend le focus.
    const pull = () => {
      sb.query(`profiles?username=eq.${encodeURIComponent(myUsername)}&select=spotlight&limit=1`)
        .then(r => {
          const row = r?.[0];
          if(!row || !("spotlight" in row)) return; // colonne absente : on reste en local
          const v = row.spotlight ? parseInt(row.spotlight) : null;
          let local = null, synced = false;
          try { local = parseInt(localStorage.getItem(spotKey)) || null; synced = localStorage.getItem(spotSyncKey) === "1"; } catch {}
          if(v) {
            setSpotlightId(v);
            try { localStorage.setItem(spotKey, String(v)); localStorage.setItem(spotSyncKey, "1"); } catch {}
          } else if(local && !synced) {
            // choix fait avant l'existence de la colonne : on le monte une fois sur le serveur
            persistSpotlight(local);
          } else if(!v && synced) {
            // retiré depuis l'autre appareil
            setSpotlightId(null);
            try { localStorage.removeItem(spotKey); } catch {}
          }
        }).catch(()=>{});
    };
    pull();
    const onVis = () => { if(document.visibilityState === "visible") pull(); };
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", pull); document.removeEventListener("visibilitychange", onVis); };
  }, [myUsername]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if(spotlightId) fetchAnime(spotlightId); }, [spotlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const priority = [
      ...(me.favorites||[]).filter(Boolean).slice(0,5),
      ...Object.keys(me.statuses||{}).filter(id => (me.statuses||{})[id]==="completed").map(Number)
        .filter(id => !(me.hiddenCompleted||[]).includes(id)).slice(-5).reverse(),
    ];
    // Also load pinned list anime
    if(me.pinnedList) {
      const pl = (me.customLists||[]).find(l=>l.id===me.pinnedList);
      if(pl) pl.animeIds.slice(0,8).forEach(id => priority.push(id));
    }
    // Load highlights anime
    (me.highlights||[]).slice(0,8).forEach(id => priority.push(id));
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

  // Sync likes/deletes from FeedView
  useEffect(() => {
    return addPostEventListener(({ type, id, likes }) => {
      if(type === "like") setMyPosts(prev => prev.map(p => p.id===id ? {...p, likes} : p));
      if(type === "delete") setMyPosts(prev => prev.filter(p => p.id!==id));
    });
  }, []);

  // Load posts when tab is active
  useEffect(() => {
    if(tab !== "posts") return;
    if(myPosts.length > 0) return; // already loaded
    setPostsLoading(true);
    (async () => {
      try {
        const [writtenPosts, commentedPostIds] = await Promise.all([
          sb.query(`posts?username=eq.${encodeURIComponent(myUsername)}&order=created_at.desc&limit=50`),
          sb.query(`comments?username=eq.${encodeURIComponent(myUsername)}&select=post_id&limit=200`),
        ]);
        // Fetch posts where user commented (excluding own posts)
        const ownIds = new Set((writtenPosts||[]).map(p=>p.id));
        const commentedIds = [...new Set((commentedPostIds||[]).map(c=>c.post_id))].filter(id=>!ownIds.has(id));
        let commentedPosts = [];
        if(commentedIds.length > 0) {
          commentedPosts = await sb.query(`posts?id=in.(${commentedIds.join(",")})&order=created_at.desc&limit=50`) || [];
        }
        // Merge and sort by date
        const all = [
          ...(writtenPosts||[]).map(p=>({...p, _type:"written"})),
          ...commentedPosts.map(p=>({...p, _type:"commented"})),
        ].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        setMyPosts(all);
      } catch(e) { console.error(e); }
      setPostsLoading(false);
    })();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load stats when tab is active
  useEffect(() => {
    if(tab !== "stats") return;
    if(statsData) return;
    setStatsLoading(true);
    (async () => {
      try {
        const genreCount = {}, genreScores = {};
        const studioCount = {}, studioScores = {};
        const vaCount = {}, vaScores = {};
        const directorCount = {}, directorScores = {};
        const yearScores = {};
        const moodTotals = {}; const moodDominantCount = {}; const moodScores = {}; let moodCount = 0;
        MOOD_KEYS.forEach(k => { moodTotals[k] = 0; moodDominantCount[k] = 0; moodScores[k] = []; });
        let totalEpisodes = 0;

        const chunks = [];
        for(let i=0;i<me.watched.length;i+=100) chunks.push(me.watched.slice(i,i+100));

        for(const chunk of chunks) {
          try {
            const [animeRows, moodRows] = await Promise.all([
              sb.query(`anime_cache?mal_id=in.(${chunk.join(",")})&select=mal_id,type,genres,studios,characters,staff,episodes,year&limit=${chunk.length}`),
              sb.query(`mood_pts_v4?mal_id=in.(${chunk.join(",")})&select=mal_id,${MOOD_KEYS.join(",")}&limit=${chunk.length}`),
            ]);

            const moodByMalId = {};
            (moodRows||[]).forEach(r => { moodByMalId[r.mal_id] = r; });

            (animeRows||[]).forEach(a => {
              if(a.type && a.type !== "TV") return;
              const userScore = me.ratings[a.mal_id]?.score || null;
              if(a.episodes) totalEpisodes += a.episodes;

              // Genres
              (a.genres||[]).forEach(g => {
                const n = g.name||g;
                genreCount[n] = (genreCount[n]||0) + 1;
                if(userScore) { if(!genreScores[n]) genreScores[n]=[]; genreScores[n].push(userScore); }
              });
              // Studios
              (a.studios||[]).forEach(s => {
                const n = s.name||s;
                studioCount[n] = (studioCount[n]||0) + 1;
                if(userScore) { if(!studioScores[n]) studioScores[n]=[]; studioScores[n].push(userScore); }
              });
              // Voice actors
              (a.characters||[]).forEach(c => {
                if(c.va?.name) {
                  const n = c.va.name;
                  vaCount[n] = (vaCount[n]||0) + 1;
                  if(userScore) { if(!vaScores[n]) vaScores[n]=[]; vaScores[n].push(userScore); }
                }
              });
              // Directors from staff
              (a.staff||[]).forEach(s => {
                if(s.name && (s.positions||[]).includes("Director")) {
                  const n = s.name;
                  directorCount[n] = (directorCount[n]||0) + 1;
                  if(userScore) { if(!directorScores[n]) directorScores[n]=[]; directorScores[n].push(userScore); }
                }
              });
              // Year scores
              if(a.year && userScore) {
                if(!yearScores[a.year]) yearScores[a.year] = [];
                yearScores[a.year].push(userScore);
              }
              // Moods — compte le mood dominant + moyenne des notes utilisateur
              const mp = moodByMalId[a.mal_id];
              if(mp && MOOD_KEYS.some(k=>(mp[k]||0)>0)) {
                const dominant = MOOD_KEYS.reduce((best, k) => (mp[k]||0) > (mp[best]||0) ? k : best, MOOD_KEYS[0]);
                if(!moodDominantCount[dominant]) moodDominantCount[dominant] = 0;
                moodDominantCount[dominant]++;
                // Track user score for this dominant mood
                if(userScore) {
                  if(!moodScores[dominant]) moodScores[dominant] = [];
                  moodScores[dominant].push(userScore);
                }
                moodCount++;
              }
            });
          } catch {}
        }

        const calcAvg = (scores) => scores?.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : null;

        const buildEntries = (count, scores, limit) =>
          Object.entries(count)
            .map(([name, cnt]) => ({ name, count: cnt, avg: calcAvg(scores[name]) }))
            .sort((a,b) => b.count - a.count)
            .slice(0, limit);

        const topGenres    = buildEntries(genreCount, genreScores, 15);
        const topStudios   = buildEntries(studioCount, studioScores, 10);
        const topVAs       = buildEntries(vaCount, vaScores, 10);
        const topDirectors = buildEntries(directorCount, directorScores, 10);

        // Moods — dominant count + moyenne des notes utilisateur
        const moodAvgData = moodCount > 0
          ? MOOD_KEYS.map(k => ({
              key: k,
              count: moodDominantCount[k] || 0,
              avg: moodScores[k]?.length
                ? (moodScores[k].reduce((a,b)=>a+b,0)/moodScores[k].length).toFixed(1)
                : null,
            })).sort((a,b) => b.count - a.count)
          : [];

        // Year curve
        const yearCurve = Object.entries(yearScores)
          .map(([year, scores]) => ({ year: parseInt(year), avg: parseFloat(calcAvg(scores)), count: scores.length }))
          .filter(d => d.year >= 1990 && d.year <= new Date().getFullYear())
          .sort((a,b) => a.year - b.year);

        setStatsData({ topGenres, topStudios, topVAs, topDirectors, moodAvgData, yearCurve, totalEpisodes });
      } catch(e) { console.error(e); }
      setStatsLoading(false);
    })();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      try {
        noteNightOwl(myUsername); // avant la lecture des drapeaux : l'ouverture de nuit compte tout de suite
        const [followerRows, followingRows, voteRows, gameEloRows, frameFlags] = await Promise.all([
          follows.getFollowers(myUsername),
          follows.getFollowing(myUsername).catch(()=>[]),
          sb.query(`user_votes?username=eq.${myUsername}&select=pts_added&limit=1000`),
          sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&select=points_total&limit=1`).catch(()=>[]),
          loadFrameFlags(myUsername).catch(()=>({})),
        ]);
        setFollowerCount((followerRows||[]).length);
        setFollowingCount((followingRows||[]).length);
        const genreCounts = {};
        const chunks = [];
        for(let i=0;i<me.watched.length;i+=100) chunks.push(me.watched.slice(i,i+100));
        for(const chunk of chunks) {
          try {
            const rows = await sb.query(`anime_cache?mal_id=in.(${chunk.join(",")})&select=genres`);
            (rows||[]).forEach(row => { (row.genres||[]).forEach(g => { const name=g.name||g; genreCounts[name]=(genreCounts[name]||0)+1; }); });
          } catch {}
        }
        const gamePoints = gameEloRows?.[0]?.points_total || 0;
        const unlockedF = [
          ...getUnlockedFrames({ watchedCount: me.watched.length, genreCounts, followerCount: (followerRows||[]).length, userVotes: voteRows||[], gamePoints }),
          ...getExtraFrames({ me, followerCount: (followerRows||[]).length, followingCount: (followingRows||[]).length, flags: frameFlags }),
        ];
        setUnlockedFrames(unlockedF);
        const savedFrameId = me.activeFrame;
        const saved = savedFrameId ? FRAMES[savedFrameId] : null;
        const best = getBestFrame(unlockedF);
        setActiveFrame(saved && unlockedF.find(f=>f.id===savedFrameId) ? saved : best);

        // Badges
        const unlockedB = getUnlockedBadges({
          watchedCount: me.watched.length,
          genreCounts,
          followerCount: (followerRows||[]).length,
          userVotes: voteRows||[],
          gamePoints,
          ratedCount: Object.keys(me.ratings||{}).length,
        });
        setUnlockedBadges(unlockedB);
        const savedBadgeId = me.activeBadge;
        const savedBadge = savedBadgeId ? BADGES[savedBadgeId] : null;
        setActiveBadge(savedBadge && unlockedB.find(b=>b.id===savedBadgeId) ? savedBadge : getBestBadge(unlockedB));
      } catch(e) { console.error("Frame load error:", e); }
    })();
  }, [me.watched.length, myUsername]);

  const getAnime = id => animeCache[id] || { mal_id:id, title:`MAL #${id}`, images:{jpg:{}} };
  const rated = Object.keys(me.ratings).map(Number);
  const hidden = me.hiddenCompleted || [];
  const completed = Object.entries(me.statuses||{}).filter(([,s])=>s==="completed").map(([id])=>Number(id)).filter(id=>!hidden.includes(id)).slice(-5).reverse();

  const watchlistIds = Object.entries(me.statuses||{}).filter(([,s])=>s==="watchlist").map(([id])=>parseInt(id));
  const allTrackedIds = [...new Set([...me.watched, ...watchlistIds])];
  const customListNames = [...new Set(Object.values(me.anilistSubLists||{}).flat())].sort();
  const journalEntries = allTrackedIds
    .filter(id => !journalFilter || ((me.statuses||{})[id]||"completed") === journalFilter)
    .filter(id => !customListFilter || (me.anilistSubLists||{})[id]?.includes(customListFilter))
    .sort((a,b) => (STATUS_PRIORITY[(me.statuses||{})[a]||"completed"]??5) - (STATUS_PRIORITY[(me.statuses||{})[b]||"completed"]??5));

  const saveBio = () => {
    playSound("confirm");
    saveMe({ ...me, bio: bioInput });
    setBioSaved(true);
    setTimeout(() => setBioSaved(false), 2000);
  };
  const selectFavorite = (a) => {
    playSound("confirm");
    const newFavs = [...(me.favorites||[null,null,null,null,null])];
    newFavs[favPopup] = a.mal_id;
    saveMe({ ...me, favorites: newFavs });
    setAnimeCache(p => ({...p,[a.mal_id]:a}));
    setFavPopup(null);
  };
  const removeFavorite = (idx) => {
    playSound("click");
    const f=[...(me.favorites||[null,null,null,null,null])]; f[idx]=null; saveMe({...me,favorites:f});
  };

  const handleDragStart = (idx) => setDragging(idx);
  const handleDragOver  = (e, idx) => { e.preventDefault(); setDragOver(idx); };
  const handleDrop      = (idx) => {
    if(dragging === null || dragging === idx) { setDragging(null); setDragOver(null); return; }
    const favs = [...(me.favorites||[null,null,null,null,null])];
    const tmp = favs[dragging]; favs[dragging] = favs[idx]; favs[idx] = tmp;
    saveMe({...me, favorites: favs});
    setDragging(null); setDragOver(null);
  };

  // ── Custom lists helpers ────────────────────────────────────────────────────
  const customLists = me.customLists || [];
  const pinnedListId = me.pinnedList || null;

  const createList = () => {
    if(!newListName.trim()) return;
    playSound("confirm");
    const id = `list_${Date.now()}`;
    const newList = { id, name: newListName.trim(), animeIds: [] };
    saveMe({ ...me, customLists: [...customLists, newList] });
    setNewListName(""); setCreatingList(false);
    setOpenList(id);
  };

  const deleteList = (id) => {
    playSound("click");
    saveMe({ ...me, customLists: customLists.filter(l=>l.id!==id),
      pinnedList: pinnedListId===id ? null : pinnedListId });
  };

  const pinList = (id) => {
    playSound("click");
    saveMe({ ...me, pinnedList: pinnedListId===id ? null : id });
  };

  const addAnimeToList = (listId, anime) => {
    const lists = customLists.map(l =>
      l.id===listId && !l.animeIds.includes(anime.mal_id)
        ? { ...l, animeIds: [...l.animeIds, anime.mal_id] }
        : l
    );
    saveMe({ ...me, customLists: lists });
    setAnimeCache(p => ({...p, [anime.mal_id]: anime}));
  };

  const removeAnimeFromList = (listId, mal_id) => {
    const lists = customLists.map(l =>
      l.id===listId ? { ...l, animeIds: l.animeIds.filter(id=>id!==mal_id) } : l
    );
    saveMe({ ...me, customLists: lists });
  };

  const searchForList = async (q) => {
    if(!q.trim()) { setListSearchResults([]); return; }
    try {
      const res = await jikan.searchAnime({q:q.trim(),limit:8,order_by:"score",sort:"desc"});
      setListSearchResults(res.data||[]);
    } catch {}
  };

  const pinnedList = customLists.find(l=>l.id===pinnedListId)||null;
  // Desktop : chaque bloc de la colonne gauche est une carte ; les cartes s'étirent pour que le bas
  // de la colonne tombe pile au niveau du bas du Mood Radar.
  const leftCard = "flex-auto rounded-2xl border border-white/6 bg-white/3 p-4";
  const openListData = customLists.find(l=>l.id===openList)||null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Banner */}
      {me.banner && (
        <div className="mb-6 -mx-6 -mt-8 relative h-36 sm:h-48 overflow-hidden">
          <img loading="lazy" decoding="async" src={me.banner} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to bottom, transparent 50%, rgba(2,6,23,0.85) 100%)",
          }}/>
        </div>
      )}

      {/* Header */}
      <div className={desktop
        ? `${GLASS} mb-6 flex flex-col gap-6 p-6 sm:flex-row sm:items-center`
        : "mb-6 flex flex-col gap-6 sm:flex-row sm:items-start"}
        style={desktop ? GLASS_STYLE : undefined}>
        <div className="shrink-0" style={{ padding: 10 }}>{/* marge : les cadres dépassent de l'avatar */}
         <div className="relative" style={{ width: AVATAR, height: AVATAR }}>
          {/* Photo et badge : Paramètres → Profil. Le cadre : crayon discret ici (ou Paramètres). */}
          <FrameSVG frame={activeFrame} size={AVATAR}>
            <div className="flex items-center justify-center overflow-hidden rounded-full" style={{ width: AVATAR, height: AVATAR, fontSize: Math.round(AVATAR * 0.43), background: GRADIENT_PRIMARY }}>
              {(me.avatar_base64 || (me.avatar?.startsWith?.("http") ? me.avatar : null))
                ? <img loading="lazy" decoding="async" src={me.avatar_base64 || me.avatar} alt="avatar" className="h-full w-full object-cover" />
                : (me.avatar || "👤")}
            </div>
          </FrameSVG>
          {(
            <button type="button" onClick={() => { playSound("click"); setShowFramePicker(true); }}
              title={lang === "en" ? "Change frame" : "Changer le cadre"}
              aria-label={lang === "en" ? "Change profile frame" : "Changer le cadre de profil"}
              style={{ position: "absolute", right: 2, bottom: 2, width: 26, height: 26, borderRadius: "50%", background: "#1e1b4b", border: "2px solid #070816", color: "#c4b5fd", fontSize: 11, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              ✎
            </button>
          )}
         </div>
        </div>

        <div className={desktop ? "sm:w-[290px] sm:flex-none" : "flex-1"}>
          <div className="mb-1 flex items-center justify-between">
            <div>
              <div className={`text-2xl font-black tracking-tight ${GRADIENT_TEXT}`}>
                {me.name}
              </div>
              <div className="text-xs text-slate-500">@{myUsername} · AniMood</div>
            </div>
          </div>

          {editingBio ? (
            <div className="max-w-md">
              <div className="flex gap-2 items-center">
                <input ref={bioInputRef} value={bioInput} onChange={e => setBioInput(e.target.value)} maxLength={80} placeholder={t.bioPlaceholder}
                  autoFocus
                  className="flex-1 rounded-lg border border-violet-500/50 bg-white/7 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-violet-400/70 transition-colors"
                  onKeyDown={e => { if(e.key==="Enter"){saveBio();setEditingBio(false);} if(e.key==="Escape"){setEditingBio(false);} }} />
                {activeBadge && (
                  <span className="inline-flex align-middle" title={`${activeBadge.label} — ${activeBadge.desc}`}>
                    <BadgeDisplay badge={activeBadge} size={20} />
                  </span>
                )}
                <button onClick={() => { saveBio(); setEditingBio(false); }}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500 transition-colors">✓</button>
                <button onClick={() => setEditingBio(false)}
                  className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">✕</button>
              </div>
              <div className="mt-1 text-right text-[9px] text-slate-600">{bioInput.length}/80</div>
            </div>
          ) : (
            <button onClick={() => { setBioInput(me.bio||""); setEditingBio(true); }}
              className="group relative rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-left text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span>{bioSaved ? (
                  <span className="text-violet-400 font-medium">✓ {t.bioSaved || "Sauvegardé !"}</span>
                ) : (me.bio || t.addBioPlaceholder)}</span>
                {activeBadge && (
                  <span className="inline-flex align-middle" title={`${activeBadge.label} — ${activeBadge.desc}`}>
                    <BadgeDisplay badge={activeBadge} size={16} />
                  </span>
                )}
              </span>
              {desktop && <span className="ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-violet-400">✏️</span>}
            </button>
          )}

          {/* Followers / Following / Stats */}
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <button onClick={() => { playSound("click"); setFollowListMode("followers"); }} className="flex items-center gap-1.5 transition hover:opacity-75">
              <span className="text-[13px] font-black text-slate-100">{followerCount}</span>
              <span className="text-[11px] text-slate-500">{t.followerLabel(followerCount)}</span>
            </button>
            <div className="w-px h-3 bg-white/10"/>
            <button onClick={() => { playSound("click"); setFollowListMode("following"); }} className="flex items-center gap-1.5 transition hover:opacity-75">
              <span className="text-[13px] font-black text-slate-100">{followingCount}</span>
              <span className="text-[11px] text-slate-500">{t.followingLabel(followingCount)}</span>
            </button>
          </div>
        </div>

        {!desktop && (
          // Site web : Pts jeux + Badges (petits cercles) à gauche de « En boucle »
          <div className="flex shrink-0 flex-wrap items-start justify-center gap-3 sm:flex-nowrap">
            <div className="flex items-start gap-1" style={{ marginTop: 20 + (112 - 80) / 2 }}>
              <StatCircle size={80} icon="🎮" value={fmtPoints(gamePts)} label={lang === "en" ? "Game pts" : "Pts jeux"}
                ring="conic-gradient(from 0deg, #6D5BFF, #8B5CF6, #EC4899, #8B5CF6, #6D5BFF)" glow="rgba(109,91,255,.28)"
                title={lang === "en" ? "Total game points" : "Points de jeu totaux"} />
              <StatCircle size={80} icon="🏆" value={unlockedBadges.length} label={t.badges || "Badges"}
                ring="conic-gradient(from 0deg, #f59e0b, #fbbf24, #fde68a, #fbbf24, #f59e0b)" glow="rgba(251,191,36,.22)"
                title={t.badges || "Badges"} />
            </div>
            <SpotlightCircle size={112} compact
              anime={spotlightId ? animeCache[spotlightId] : null}
              lang={lang}
              onOpen={() => animeCache[spotlightId] && onOpenDetail(animeCache[spotlightId])}
              onPick={() => setShowSpotlightPicker(true)}
              onClear={() => persistSpotlight(null)}
            />
          </div>
        )}

        {desktop && (
          <>
            <div className="min-w-0 flex-1">
              <HudPanel tilesOnly me={me} rated={rated} myUsername={myUsername} unlockedBadges={unlockedBadges} t={t} />
            </div>
            <div className="hidden self-stretch sm:block" style={{ width: 1, background: "linear-gradient(180deg, transparent, rgba(255,255,255,.12), transparent)" }} />
            <SpotlightCircle compact
              anime={spotlightId ? animeCache[spotlightId] : null}
              lang={lang}
              onOpen={() => animeCache[spotlightId] && onOpenDetail(animeCache[spotlightId])}
              onPick={() => setShowSpotlightPicker(true)}
              onClear={() => persistSpotlight(null)}
            />
          </>
        )}
      </div>

      {/* Tabs */}
      <TabBar tabs={getTabs(t)} active={tab} onChange={id => { playSound("tab"); setTab(id); }} className="mb-6" />

      {/* ── PROFIL TAB ── */}
      {tab === "profile" && (
        <div className={desktop ? "grid gap-6 lg:grid-cols-2 lg:items-stretch" : "grid gap-8 lg:grid-cols-2 lg:items-stretch"}>

          {/* LEFT — Favoris + Derniers vus + Liste épinglée
              Desktop : la colonne s'étire sur toute la hauteur et répartit ses 3 blocs,
              pour que le bas de la liste épinglée tombe au niveau du bas du Mood Radar. */}
          <div className="flex flex-col gap-4">
            {/* Favoris — toujours en premier */}
            <div className={leftCard}>
              <div className="mb-2.5 flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.favoritesTitle}</div>
                <button onClick={()=>{ playSound("click"); setEditingFavs(e=>!e); }}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-300 transition">
                  {editingFavs ? t.editDone : t.editBtn}
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2.5">
                {(me.favorites||[null,null,null,null,null]).slice(0,5).map((favId, i) => {
                  const isDragOver = dragOver === i;
                  const isBeingDragged = dragging === i;
                  return (
                    <div key={i} className="group relative"
                      style={{opacity: isBeingDragged ? 0.4 : 1, animation: editingFavs && favId ? "wiggle 0.3s ease infinite alternate" : "none"}}
                      draggable={editingFavs && !!favId}
                      onDragStart={()=>handleDragStart(i)}
                      onDragOver={e=>handleDragOver(e,i)}
                      onDrop={()=>handleDrop(i)}
                      onDragEnd={()=>{setDragging(null);setDragOver(null);}}>
                      <div style={{outline: isDragOver ? "2px solid #7c3aed" : "none", borderRadius: 8}}>
                        <AnimePoster
                          anime={favId?getAnime(favId):null}
                          loading={!!favId} empty={!favId}
                          onEmptyClick={()=>setFavPopup(i)}
                          onClick={editingFavs ? undefined : onOpenDetail}/>
                      </div>
                      {editingFavs && favId && (
                        <button onClick={()=>removeFavorite(i)}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-red-500 text-[10px] font-black text-white">✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
              {editingFavs && <p className="mt-1.5 text-center text-[9px] text-slate-600">{t.dragHint}</p>}
              <style>{`@keyframes wiggle{from{transform:rotate(-1.5deg)}to{transform:rotate(1.5deg)}}`}</style>
            </div>

            {/* Derniers vus */}
            <div className={leftCard}>
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.recentlyWatchedTitle}</div>
              <div className="grid grid-cols-5 gap-2.5">
                {completed.slice(0,5).map(id => <AnimePoster key={id} anime={getAnime(id)} onClick={onOpenDetail} loading />)}
                {Array.from({length: Math.max(0,5-completed.length)}).map((_,i) => <div key={i} className="aspect-2/3 rounded-lg border-2 border-dashed border-white/6 bg-white/3" />)}
              </div>
            </div>

            {/* Liste épinglée */}
            {pinnedList ? (
              <div className={leftCard}>
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <span>📌</span><span>{pinnedList.name}</span>
                  </div>
                  <button onClick={()=>setTab("lists")} className="text-[10px] text-slate-500 hover:text-slate-300 transition">{t.seeAllArrow}</button>
                </div>
                <div className="grid grid-cols-5 gap-2.5">
                  {pinnedList.animeIds.slice(0,5).map(id => <AnimePoster key={id} anime={animeCache[id]} onClick={onOpenDetail} loading />)}
                  {pinnedList.animeIds.length===0 && <div className="col-span-5 rounded-xl border border-dashed border-white/8 p-4 text-center text-[11px] text-slate-600">{t.pinnedListEmpty}</div>}
                </div>
              </div>
            ) : (
              <button onClick={()=>setTab("lists")} className="flex items-center gap-3 rounded-xl border border-dashed border-white/8 p-4 text-left transition hover:bg-white/3">
                <span className="text-lg">📌</span>
                <div>
                  <div className="text-[12px] font-bold text-slate-400">{t.pinListTitle}</div>
                  <div className="text-[10px] text-slate-600">{t.pinListDesc}</div>
                </div>
              </button>
            )}
          </div>

          {desktop ? (
          /* RIGHT (desktop) — HUD tablet high-tech stats */
          <HudPanel
            noTiles
            lang={lang}
            activeBadge={activeBadge}
            me={me}
            rated={rated}
            myUsername={myUsername}
            unlockedBadges={unlockedBadges}
            t={t}
          />
          ) : (
          /* RIGHT (web) — 3 stats + Distribution + MoodRadar (le bas s'aligne sur la colonne de gauche) */
          <div className="flex flex-col gap-8 lg:justify-between">
            <div className="grid grid-cols-3 gap-3">
              {[
                {l:t.statVus, v:me.watched.length},
                {l:t.statNotes, v:rated.length},
                {l:t.statMoy, v:rated.length?(rated.reduce((a,id)=>a+(me.ratings[id]?.score||0),0)/rated.length).toFixed(1):"—"},
              ].map(s=>(
                <div key={s.l} className="rounded-xl border border-white/6 bg-white/3 p-3 text-center">
                  <div className="text-xl font-black text-violet-400">{s.v}</div>
                  <div className="mt-0.5 text-[9px] text-slate-500">{s.l}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.ratingDistribution}</div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
                {rated.length>0 ? <ScoreChart ratings={me.ratings}/> : <p className="text-center text-[11px] text-slate-500">{t.rateToSeeDistribution}</p>}
              </div>
            </div>
            <PersonalMoodRadar ratings={me.ratings} watched={me.watched}/>
          </div>
          )}
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
                    style={{ border: active ? `1px solid ${v.dot}` : "1px solid rgba(var(--fg-rgb),0.08)", background: active ? `${v.dot}22` : "rgba(var(--fg-rgb),0.03)", color: active ? v.dot : "var(--text-3)" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background:v.dot }} />{getStatusLabel(k, lang)}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setJournalGrid(g=>!g)}
              className={journalGrid ? "rounded-lg border border-indigo-400/30 bg-indigo-400/12 px-2.5 py-1.5 text-sm text-indigo-300" : "rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-slate-500"}>
              {journalGrid ? "⊞" : "☰"}
            </button>
          </div>

          {customListNames.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">{t.aniListSubLists}</span>
              {customListNames.map(name => {
                const active = customListFilter === name;
                return (
                  <button key={name} onClick={() => setCustomListFilter(active?null:name)}
                    className="rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
                    style={{ border:`1px solid ${active?"#a78bfa":"rgba(var(--fg-rgb),0.08)"}`, background: active?"rgba(167,139,250,0.15)":"rgba(var(--fg-rgb),0.03)", color: active?"#a78bfa":"var(--text-3)" }}>
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {journalEntries.length === 0 && <EmptyState emoji="📖" title={t.journalEmptyTitle} />}

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
                      {img && <img loading="lazy" decoding="async" src={img} alt={a.title} className="h-full w-full object-cover" onError={e=>{e.target.style.display="none";}} />}
                      <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full" style={{ background:sc.dot }} />
                    </div>
                    <div className="flex flex-1 flex-col justify-between py-2 pr-3">
                      <div>
                        <div className="text-xs font-extrabold leading-tight text-slate-100">{a.title}</div>
                        <div className="mt-0.5 text-[10px] font-bold" style={{ color:sc.dot }}>{getStatusLabel(status, lang)}</div>
                      </div>
                      {r ? <span className="text-xs font-extrabold text-amber-400">★ {r.score}/10</span> : <span className="text-[10px] text-slate-700">{t.notRated}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── LISTES TAB ── */}
      {tab === "lists" && (
        <div className="max-w-2xl">

          {/* Watchlist card */}
          <div className="mb-3 flex items-center gap-4 rounded-2xl border border-white/7 bg-white/3 p-4 cursor-pointer hover:bg-white/6 transition"
            onClick={()=>setOpenList("watchlist")}>
            <div className="flex gap-1 shrink-0">
              {watchlistIds.slice(0,4).map(id=>{const a=animeCache[id];const img=a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;return(<div key={id} style={{width:36,height:54,borderRadius:6,overflow:"hidden",background:"rgba(var(--fg-rgb),0.05)",border:"1px solid rgba(var(--fg-rgb),0.08)",flexShrink:0}}>{img&&<img loading="lazy" decoding="async" src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>);})}
              {watchlistIds.length===0&&<div style={{width:36,height:54,borderRadius:6,background:"rgba(var(--fg-rgb),0.04)",border:"2px dashed rgba(var(--fg-rgb),0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"rgba(var(--fg-rgb),0.2)"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                <span className="text-[13px] font-black text-slate-100">Watchlist</span>
              </div>
              <div className="text-[11px] text-slate-500">{t.animeCount(watchlistIds.length)}</div>
            </div>
            <span className="text-slate-500 text-lg">›</span>
          </div>

          {/* Highlights card */}
          <div className="mb-3 flex items-center gap-4 rounded-2xl border border-white/7 bg-white/3 p-4 cursor-pointer hover:bg-white/6 transition"
            onClick={()=>setOpenList("highlights")}>
            <div className="flex gap-1 shrink-0">
              {(me.highlights||[]).slice(0,4).map(id=>{const a=animeCache[id];const img=a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;return(<div key={id} style={{width:36,height:54,borderRadius:6,overflow:"hidden",background:"rgba(var(--fg-rgb),0.05)",border:"1px solid rgba(var(--fg-rgb),0.08)"}}>{img&&<img loading="lazy" decoding="async" src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>);})}
              {(me.highlights||[]).length===0&&<div style={{width:36,height:54,borderRadius:6,background:"rgba(var(--fg-rgb),0.04)",border:"2px dashed rgba(var(--fg-rgb),0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span className="text-[13px] font-black text-slate-100">Highlights</span>
              </div>
              <div className="text-[11px] text-slate-500">{t.animeCount((me.highlights||[]).length)} · {t.highlightsSuffix}</div>
            </div>
            <span className="text-slate-500 text-lg">›</span>
          </div>

          {/* Custom lists */}
          <div className="flex flex-col gap-3 mb-4">
            {customLists.map(list => {
              const preview = list.animeIds.slice(0,4);
              const isPinned = pinnedListId===list.id;
              return (
                <div key={list.id} className="flex items-center gap-4 rounded-2xl border border-white/7 bg-white/3 p-4 cursor-pointer hover:bg-white/6 transition"
                  onClick={()=>setOpenList(list.id)}>
                  <div className="flex gap-1 shrink-0">
                    {preview.map(id=>{const a=animeCache[id];const img=a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;return(<div key={id} style={{width:36,height:54,borderRadius:6,overflow:"hidden",background:"rgba(var(--fg-rgb),0.05)",border:"1px solid rgba(var(--fg-rgb),0.08)"}}>{img&&<img loading="lazy" decoding="async" src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>);})}
                    {preview.length===0&&<div style={{width:36,height:54,borderRadius:6,background:"rgba(var(--fg-rgb),0.04)",border:"2px dashed rgba(var(--fg-rgb),0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"rgba(var(--fg-rgb),0.2)"}}>📋</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-black text-slate-100">{list.name}</span>
                      {isPinned && <span className="text-[9px] font-bold text-violet-400 bg-violet-400/10 border border-violet-400/20 rounded-full px-1.5 py-0.5">{t.pinnedBadge}</span>}
                    </div>
                    <div className="text-[11px] text-slate-500">{t.animeCount(list.animeIds.length)}</div>
                  </div>
                  <span className="text-slate-500 text-lg">›</span>
                </div>
              );
            })}
          </div>

          {/* Create list */}
          {creatingList ? (
            <div className="flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/5 p-3">
              <input autoFocus value={newListName} onChange={e=>setNewListName(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")createList();if(e.key==="Escape"){setCreatingList(false);setNewListName("");}}}
                placeholder={t.createListPlaceholder}
                className="flex-1 bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-600"/>
              <button onClick={createList} className="rounded-lg bg-violet-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-400 transition">{t.createBtn}</button>
              <button onClick={()=>{setCreatingList(false);setNewListName("");}} className="text-slate-500 hover:text-slate-300 text-sm">✕</button>
            </div>
          ) : (
            <button onClick={()=>setCreatingList(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/8 p-4 text-left transition hover:bg-white/3">
              <span className="text-lg">➕</span>
              <div>
                <div className="text-[12px] font-bold text-slate-400">{t.createListTitle}</div>
                <div className="text-[10px] text-slate-600">{t.createListDesc}</div>
              </div>
            </button>
          )}

          {/* Highlights modal */}
          {openList==="highlights" && (
            <Modal onClose={()=>setOpenList(null)} maxWidth="max-w-3xl">
              {close=>(
                <div className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-black text-slate-100">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                        Highlights
                      </div>
                      <div className="text-[11px] text-slate-500">{t.animeCount((me.highlights||[]).length)} · {t.highlightsSuffixModal}</div>
                    </div>
                    <button onClick={close} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-sm text-slate-400">✕</button>
                  </div>
                  {(me.highlights||[]).length>0?(
                    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                      {(me.highlights||[]).map((id,i)=>(
                        <div key={id} className="relative group">
                          <AnimePoster anime={animeCache[id]} onClick={a=>{close();onOpenDetail(a);}} loading/>
                          {i<5&&<div className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[8px] font-black text-black">{i+1}</div>}
                          <button onClick={()=>{
                            const newH=(me.highlights||[]).filter(hid=>hid!==id);
                            const newFavs=[null,null,null,null,null];
                            newH.slice(0,5).forEach((hid,j)=>{newFavs[j]=hid;});
                            saveMe({...me,highlights:newH,favorites:newFavs});
                          }} className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-red-500 text-[10px] font-black text-white group-hover:flex [@media(hover:none)]:flex">✕</button>
                        </div>
                      ))}
                    </div>
                  ):<EmptyState emoji="❤️" title={t.highlightsEmptyTitle} subtitle={t.highlightsEmptySubtitle}/>}
                </div>
              )}
            </Modal>
          )}

          {/* Watchlist modal */}
          {openList==="watchlist" && (
            <Modal onClose={()=>setOpenList(null)} maxWidth="max-w-3xl">
              {close=>(
                <div className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-black text-slate-100"><BookmarkIcon size={15} />Watchlist</div>
                      <div className="text-[11px] text-slate-500">{t.animeCount(watchlistIds.length)}</div>
                    </div>
                    <button onClick={close} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-sm text-slate-400">✕</button>
                  </div>
                  {watchlistIds.length>0?(
                    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                      {watchlistIds.map(id=><AnimePoster key={id} anime={animeCache[id]} onClick={a=>{close();onOpenDetail(a);}} loading/>)}
                    </div>
                  ):<EmptyState emoji={<span className="inline-flex"><BookmarkIcon size={38} /></span>} title={t.watchlistEmptyTitle} subtitle={t.watchlistEmptySubtitle}/>}
                </div>
              )}
            </Modal>
          )}

          {/* Custom list modal */}
          {openList && openList!=="watchlist" && openListData && (
            <Modal onClose={()=>{setOpenList(null);setEditingList(null);setListSearchQuery("");setListSearchResults([]);}} maxWidth="max-w-3xl">
              {close=>(
                <div className="p-5">
                  {/* Header */}
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-black text-slate-100">{openListData.name}</div>
                      <div className="text-[11px] text-slate-500">{t.animeCount(openListData.animeIds.length)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Pin toggle */}
                      <button onClick={()=>pinList(openListData.id)}
                        className={pinnedListId===openListData.id ? "rounded-lg border border-violet-400/40 bg-violet-400/10 px-2.5 py-1.5 text-[10px] font-bold text-violet-400 transition" : "rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 transition hover:border-white/20"}>
                        {pinnedListId===openListData.id ? t.pinBtnActive : t.pinBtnInactive}
                      </button>
                      {/* Edit toggle */}
                      <button onClick={()=>setEditingList(editingList===openListData.id?null:openListData.id)}
                        className={editingList===openListData.id ? "rounded-lg border border-indigo-400/40 bg-indigo-400/10 px-2.5 py-1.5 text-[10px] font-bold text-indigo-400 transition" : "rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 transition hover:border-white/20"}>
                        {editingList===openListData.id ? t.editDone : t.editBtn}
                      </button>
                      {/* Delete */}
                      <button onClick={()=>{deleteList(openListData.id);close();}}
                        className="rounded-lg border border-red-500/20 px-2.5 py-1.5 text-[10px] font-bold text-red-500 hover:bg-red-500/10 transition">
                        {t.deleteBtn}
                      </button>
                      <button onClick={close} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-sm text-slate-400">✕</button>
                    </div>
                  </div>

                  {/* Grid of anime */}
                  {openListData.animeIds.length>0 ? (
                    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6 mb-4">
                      {openListData.animeIds.map(id=>(
                        <div key={id} className="relative group">
                          <AnimePoster anime={animeCache[id]} onClick={a=>{if(editingList!==openListData.id){close();onOpenDetail(a);}}} loading/>
                          {editingList===openListData.id && (
                            <button onClick={()=>removeAnimeFromList(openListData.id,id)}
                              className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-red-500 text-[10px] font-black text-white group-hover:flex [@media(hover:none)]:flex">✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState emoji="📋" title={t.listEmptyTitle} subtitle={t.listEmptySubtitle} className="mb-4"/>
                  )}

                  {/* Add anime search (edit mode) */}
                  {editingList===openListData.id && (
                    <div className="border-t border-white/6 pt-4">
                      <div className="mb-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.addAnimeTitle}</div>
                      <input value={listSearchQuery}
                        onChange={e=>{setListSearchQuery(e.target.value);searchForList(e.target.value);}}
                        placeholder={t.searchPlaceholder}
                        className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400/40"/>
                      {listSearchResults.length>0 && (
                        <div className="flex flex-col gap-2">
                          {listSearchResults.map(a=>(
                            <button key={a.mal_id} onClick={()=>{addAnimeToList(openListData.id,a);setListSearchQuery("");setListSearchResults([]);}}
                              className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/3 p-2.5 text-left hover:bg-white/7 transition">
                              <img loading="lazy" decoding="async" src={a.images?.jpg?.image_url} alt={a.title} className="h-12 w-8 rounded object-cover"/>
                              <div>
                                <div className="text-[12px] font-bold text-slate-100">{a.title}</div>
                                <div className="text-[10px] text-slate-500">{a.year} · {a.type}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Modal>
          )}
        </div>
      )}


      {/* ── MES POSTS TAB ── */}
      {tab === "posts" && (
        postsLoading ? (
          <div className="flex justify-center py-12"><Spinner label={t.loadingPosts}/></div>
        ) : myPosts.length === 0 ? (
          <EmptyState emoji="✍️" title={t.noPostsTitle} />
        ) : (
          <div className="flex max-w-2xl flex-col gap-3">
            {myPosts.map((post, i) => (
              <ProfilePostCard key={post.id||i} post={post} myUsername={myUsername}
                onLikeUpdate={(id, newLikes) => setMyPosts(prev => prev.map(p => p.id===id ? {...p, likes:newLikes} : p))}
                onDelete={(id) => setMyPosts(prev => prev.filter(p => p.id!==id))}/>
            ))}
          </div>
        )
      )}

      {tab === "stats" && (
        statsLoading ? (
          <div className="flex justify-center py-12"><Spinner label={t.calculatingStats}/></div>
        ) : !statsData ? (
          <EmptyState emoji="📊" title={t.noStatsTitle} />
        ) : (
          <StatsTab statsData={statsData} ratings={me.ratings} watched={me.watched}/>
        )
      )}

      {favPopup !== null && <FavoriteSearchModal onSelect={selectFavorite} onClose={() => setFavPopup(null)} />}
      {showSpotlightPicker && (
        <FavoriteSearchModal
          onSelect={(a) => { playSound("confirm"); setAnimeCache(p => ({...p,[a.mal_id]:a})); persistSpotlight(a.mal_id); setShowSpotlightPicker(false); }}
          onClose={() => setShowSpotlightPicker(false)} />
      )}
      {showFramePicker && (
        <FramePickerModal frames={Object.values(FRAMES)} unlocked={unlockedFrames} active={activeFrame}
          avatar={me.avatar_base64 || me.avatar} lang={lang} onOpenSettings={onOpenSettings}
          onPick={(f) => { playSound("click"); setActiveFrame(f); saveMe({ ...me, activeFrame: f?.id || null }); }}
          onClose={() => setShowFramePicker(false)} />
      )}
      {followListMode && (
        <FollowListModal username={myUsername} mode={followListMode} onClose={() => setFollowListMode(null)} onOpenUser={onOpenUser} />
      )}
    </div>
  );
}
