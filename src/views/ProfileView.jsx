import { useState, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { STATUS_COLORS, STATUS_PRIORITY } from "../constants/statuses.js";
import { AVATAR_EMOJIS } from "../constants/avatars.js";
import { MOOD_KEYS } from "../constants/moods.js";
import { jikan } from "../api/jikan.js";
import { follows, sb } from "../api/supabase.js";
import { dispatchPostEvent, addPostEventListener } from "../utils/postEvents.js";
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

const TABS = [{id:"profile",label:"Profil"},{id:"journal",label:"Journal"},{id:"lists",label:"Listes"},{id:"posts",label:"Mes Posts"},{id:"stats",label:"Stats"}];

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
            {k==="count"?"Quantité":"Note moy."}
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
          <title>{d.year} — ★{d.avg} ({d.count} animés)</title>
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
          {l:"Animés vus (TV)", v: watched.length},
          {l:"Épisodes vus",    v: statsData.totalEpisodes.toLocaleString()},
          {l:"Animés notés",    v: rated.length},
          {l:"Note moyenne",    v: rated.length
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
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">📊 Distribution des notes</div>
        <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
          <ScoreChart ratings={ratings}/>
        </div>
      </div>

      {/* Courbe note par année */}
      {statsData.yearCurve?.length > 1 && (
        <div className="lg:col-span-2">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">📅 Note moyenne par année</div>
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
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎭 Moods dominants</div>
          <div className="flex justify-end mb-2 gap-1">
            {["count","avg"].map(k => (
              <button key={k} onClick={()=>setMoodSort(k)}
                className="text-[9px] px-2 py-0.5 rounded-full font-bold transition"
                style={{background:moodSort===k?"rgba(124,58,237,0.3)":"rgba(255,255,255,0.05)",
                        color:moodSort===k?"#c084fc":"var(--text-4)"}}>
                {k==="count"?"Nb #1":"Score moy."}
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
                        ? `${item.count} animés${item.avg ? ` · ★${item.avg}` : ""}`
                        : `★${item.avg||"—"} · ${item.count} animés`}
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
  const [liked, setLiked]             = useState((post.likes||[]).includes(myUsername));
  const [likeCount, setLikeCount]     = useState((post.likes||[]).length);
  const [showComments, setShowComments] = useState(false);
  const [postComments, setPostComments] = useState([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);

  const handleLike = async () => {
    const newLiked = !liked;
    const newLikes = newLiked
      ? [...(post.likes||[]), myUsername]
      : (post.likes||[]).filter(u=>u!==myUsername);
    setLiked(newLiked);
    setLikeCount(newLikes.length);
    try {
      await sb.query(`posts?id=eq.${post.id}`, {
        method:"PATCH",
        headers:{...sb.headers,"Prefer":"return=minimal"},
        body:JSON.stringify({likes:newLikes}),
      });
      onLikeUpdate?.(post.id, newLikes);
      dispatchPostEvent("like", { id: post.id, likes: newLikes });
    } catch {}
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
    if(!window.confirm("Supprimer ce post ?")) return;
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
          <img src={post.image_url} alt="" style={{width:"100%",objectFit:"cover",maxHeight:400,display:"block",cursor:"pointer"}}
            onClick={()=>window.open(post.image_url,"_blank")}/>
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
          💬 Commentaires{postComments.length>0||post.comment_count>0?` (${commentsLoaded?postComments.length:post.comment_count||0})`:""} {showComments?"▲":"▼"}
        </button>
      </div>
      {/* Comments — read only */}
      {showComments && (
        <div style={{marginTop:12,borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:10}}>
          {!commentsLoaded ? (
            <div style={{fontSize:10,color:"var(--text-5)"}}>Chargement…</div>
          ) : postComments.length===0 ? (
            <div style={{fontSize:10,color:"var(--text-5)",fontStyle:"italic"}}>Aucun commentaire</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {postComments.map((c,i)=>(
                <div key={c.id||i} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <span style={{fontSize:10,fontWeight:800,color:"#c084fc",marginRight:6}}>@{c.username}</span>
                    <span style={{fontSize:12,color:"var(--text-2)"}}>{c.content}</span>
                  </div>
                  {c.username===myUsername && (
                    <button onClick={()=>handleDeleteComment(c.id)}
                      style={{background:"none",border:"none",color:"var(--text-5)",cursor:"pointer",fontSize:11,flexShrink:0}}
                      onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
                      onMouseLeave={e=>e.currentTarget.style.color="var(--text-5)"}>✕</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GamePtsDisplay({ myUsername, compact }) {
  const [pts, setPts] = useState(null);
  useEffect(() => {
    if(!myUsername) return;
    sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&select=points_total&limit=1`)
      .then(r => { if(r?.[0]) setPts(r[0].points_total||0); })
      .catch(()=>{});
  }, [myUsername]);
  if(pts === null) return compact ? <div/> : null;
  if(compact) return (
    <div className="rounded-xl border border-white/6 bg-white/3 p-3 text-center">
      <div className="text-xl font-black text-violet-400">{pts}</div>
      <div className="mt-0.5 text-[9px] text-slate-500">🎮 Pts jeux</div>
    </div>
  );
  return (
    <>
      <div className="w-px h-3 bg-white/10"/>
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] font-black text-violet-400">{pts}</span>
        <span className="text-[11px] text-slate-500">pts jeux 🎮</span>
      </div>
    </>
  );
}

export function ProfileView({ onOpenDetail, onOpenSettings }) {
  const { me, saveMe, myUsername } = useApp();
  const [tab, setTab] = useState("profile");
  const [journalFilter, setJournalFilter] = useState(null);
  const [customListFilter, setCustomListFilter] = useState(null);
  const [journalGrid, setJournalGrid] = useState(true);
  const [watchlistPage, setWatchlistPage] = useState(0);
  const [animeCache, setAnimeCache] = useState({});
  const [favPopup, setFavPopup] = useState(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [unlockedFrames, setUnlockedFrames] = useState([]);
  const [activeFrame, setActiveFrame] = useState(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState(me.bio||"");
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
        const [followerRows, followingRows, voteRows] = await Promise.all([
          follows.getFollowers(myUsername),
          follows.getFollowing(myUsername).catch(()=>[]),
          sb.query(`user_votes?username=eq.${myUsername}&select=pts_added&limit=1000`),
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
        const unlocked = getUnlockedFrames({ watchedCount: me.watched.length, genreCounts, followerCount: (followerRows||[]).length, userVotes: voteRows||[] });
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
  const customListNames = [...new Set(Object.values(me.anilistSubLists||{}).flat())].sort();
  const journalEntries = allTrackedIds
    .filter(id => !journalFilter || ((me.statuses||{})[id]||"completed") === journalFilter)
    .filter(id => !customListFilter || (me.anilistSubLists||{})[id]?.includes(customListFilter))
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
    const id = `list_${Date.now()}`;
    const newList = { id, name: newListName.trim(), animeIds: [] };
    saveMe({ ...me, customLists: [...customLists, newList] });
    setNewListName(""); setCreatingList(false);
    setOpenList(id);
  };

  const deleteList = (id) => {
    saveMe({ ...me, customLists: customLists.filter(l=>l.id!==id),
      pinnedList: pinnedListId===id ? null : pinnedListId });
  };

  const pinList = (id) => {
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
  const openListData = customLists.find(l=>l.id===openList)||null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <FrameSVG frame={activeFrame} size={112}>
            <button onClick={() => setShowAvatarPicker(true)}
              className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full text-5xl transition hover:scale-105" style={{ background: GRADIENT_PRIMARY }}>
              {(me.avatar_base64 || (me.avatar?.startsWith?.("http") ? me.avatar : null))
                ? <img src={me.avatar_base64 || me.avatar} alt="avatar" className="h-full w-full object-cover" />
                : (me.avatar || "👤")}
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

          {/* Followers / Following */}
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-black text-slate-100">{followerCount}</span>
              <span className="text-[11px] text-slate-500">abonné{followerCount!==1?"s":""}</span>
            </div>
            <div className="w-px h-3 bg-white/10"/>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-black text-slate-100">{followingCount}</span>
              <span className="text-[11px] text-slate-500">abonnement{followingCount!==1?"s":""}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <TabBar tabs={TABS} active={tab} onChange={setTab} className="mb-6" />

      {/* ── PROFIL TAB ── */}
      {tab === "profile" && (
        <div className="grid gap-8 lg:grid-cols-2">

          {/* LEFT — Favoris + Derniers vus + Liste épinglée */}
          <div className="flex flex-col gap-8">
            {/* Favoris — toujours en premier */}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">❤️ Favoris</div>
                <button onClick={()=>setEditingFavs(e=>!e)}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-300 transition">
                  {editingFavs ? "Terminé" : "Modifier"}
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
              {editingFavs && <p className="mt-1.5 text-center text-[9px] text-slate-600">Glisse pour réordonner · ✕ pour retirer</p>}
              <style>{`@keyframes wiggle{from{transform:rotate(-1.5deg)}to{transform:rotate(1.5deg)}}`}</style>
            </div>

            {/* Derniers vus */}
            <div>
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">🕐 Derniers vus</div>
              <div className="grid grid-cols-5 gap-2.5">
                {completed.slice(0,5).map(id => <AnimePoster key={id} anime={getAnime(id)} onClick={onOpenDetail} loading />)}
                {Array.from({length: Math.max(0,5-completed.length)}).map((_,i) => <div key={i} className="aspect-2/3 rounded-lg border-2 border-dashed border-white/6 bg-white/3" />)}
              </div>
            </div>

            {/* Liste épinglée */}
            {pinnedList ? (
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <span>📌</span><span>{pinnedList.name}</span>
                  </div>
                  <button onClick={()=>setTab("lists")} className="text-[10px] text-slate-500 hover:text-slate-300 transition">Voir tout →</button>
                </div>
                <div className="grid grid-cols-5 gap-2.5">
                  {pinnedList.animeIds.slice(0,5).map(id => <AnimePoster key={id} anime={animeCache[id]} onClick={onOpenDetail} loading />)}
                  {pinnedList.animeIds.length===0 && <div className="col-span-5 rounded-xl border border-dashed border-white/8 p-4 text-center text-[11px] text-slate-600">Liste vide — ajoute des animés depuis l'onglet Listes</div>}
                </div>
              </div>
            ) : (
              <button onClick={()=>setTab("lists")} className="flex items-center gap-3 rounded-xl border border-dashed border-white/8 p-4 text-left transition hover:bg-white/3">
                <span className="text-lg">📌</span>
                <div>
                  <div className="text-[12px] font-bold text-slate-400">Épingler une liste</div>
                  <div className="text-[10px] text-slate-600">Affiche une liste perso sur ton profil</div>
                </div>
              </button>
            )}
          </div>

          {/* RIGHT — 3 stats + Distribution + MoodRadar + TopGenres */}
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-4 gap-3">
              {[
                {l:"Vus", v:me.watched.length},
                {l:"Notés", v:rated.length},
                {l:"Moy.", v:rated.length?(rated.reduce((a,id)=>a+(me.ratings[id]?.score||0),0)/rated.length).toFixed(1):"—"},
              ].map(s=>(
                <div key={s.l} className="rounded-xl border border-white/6 bg-white/3 p-3 text-center">
                  <div className="text-xl font-black text-violet-400">{s.v}</div>
                  <div className="mt-0.5 text-[9px] text-slate-500">{s.l}</div>
                </div>
              ))}
              <GamePtsDisplay myUsername={myUsername} compact/>
            </div>
            <div>
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">📊 Distribution des notes</div>
              <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
                {rated.length>0 ? <ScoreChart ratings={me.ratings}/> : <p className="text-center text-[11px] text-slate-500">Note des animés pour voir ta distribution</p>}
              </div>
            </div>
            <PersonalMoodRadar ratings={me.ratings} watched={me.watched}/>
            <TopGenres watched={me.watched}/>
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
                    style={{ border: active ? `1px solid ${v.dot}` : "1px solid rgba(var(--fg-rgb),0.08)", background: active ? `${v.dot}22` : "rgba(var(--fg-rgb),0.03)", color: active ? v.dot : "var(--text-3)" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background:v.dot }} />{v.label}
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
              <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">📋 Sous-listes AniList</span>
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
      {tab === "lists" && (
        <div className="max-w-2xl">

          {/* Watchlist card */}
          <div className="mb-3 flex items-center gap-4 rounded-2xl border border-white/7 bg-white/3 p-4 cursor-pointer hover:bg-white/6 transition"
            onClick={()=>setOpenList("watchlist")}>
            <div className="flex gap-1 shrink-0">
              {watchlistIds.slice(0,4).map(id=>{const a=animeCache[id];const img=a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;return(<div key={id} style={{width:36,height:54,borderRadius:6,overflow:"hidden",background:"rgba(var(--fg-rgb),0.05)",border:"1px solid rgba(var(--fg-rgb),0.08)",flexShrink:0}}>{img&&<img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>);})}
              {watchlistIds.length===0&&<div style={{width:36,height:54,borderRadius:6,background:"rgba(var(--fg-rgb),0.04)",border:"2px dashed rgba(var(--fg-rgb),0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"rgba(var(--fg-rgb),0.2)"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                <span className="text-[13px] font-black text-slate-100">Watchlist</span>
              </div>
              <div className="text-[11px] text-slate-500">{watchlistIds.length} animé{watchlistIds.length!==1?"s":""}</div>
            </div>
            <span className="text-slate-500 text-lg">›</span>
          </div>

          {/* Highlights card */}
          <div className="mb-3 flex items-center gap-4 rounded-2xl border border-white/7 bg-white/3 p-4 cursor-pointer hover:bg-white/6 transition"
            onClick={()=>setOpenList("highlights")}>
            <div className="flex gap-1 shrink-0">
              {(me.highlights||[]).slice(0,4).map(id=>{const a=animeCache[id];const img=a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;return(<div key={id} style={{width:36,height:54,borderRadius:6,overflow:"hidden",background:"rgba(var(--fg-rgb),0.05)",border:"1px solid rgba(var(--fg-rgb),0.08)"}}>{img&&<img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>);})}
              {(me.highlights||[]).length===0&&<div style={{width:36,height:54,borderRadius:6,background:"rgba(var(--fg-rgb),0.04)",border:"2px dashed rgba(var(--fg-rgb),0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span className="text-[13px] font-black text-slate-100">Highlights</span>
              </div>
              <div className="text-[11px] text-slate-500">{(me.highlights||[]).length} animé{(me.highlights||[]).length!==1?"s":""} · Les 5 premiers dans tes favoris</div>
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
                    {preview.map(id=>{const a=animeCache[id];const img=a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;return(<div key={id} style={{width:36,height:54,borderRadius:6,overflow:"hidden",background:"rgba(var(--fg-rgb),0.05)",border:"1px solid rgba(var(--fg-rgb),0.08)"}}>{img&&<img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>);})}
                    {preview.length===0&&<div style={{width:36,height:54,borderRadius:6,background:"rgba(var(--fg-rgb),0.04)",border:"2px dashed rgba(var(--fg-rgb),0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"rgba(var(--fg-rgb),0.2)"}}>📋</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-black text-slate-100">{list.name}</span>
                      {isPinned && <span className="text-[9px] font-bold text-violet-400 bg-violet-400/10 border border-violet-400/20 rounded-full px-1.5 py-0.5">Épinglée</span>}
                    </div>
                    <div className="text-[11px] text-slate-500">{list.animeIds.length} animé{list.animeIds.length!==1?"s":""}</div>
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
                placeholder="Nom de la liste…"
                className="flex-1 bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-600"/>
              <button onClick={createList} className="rounded-lg bg-violet-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-400 transition">Créer</button>
              <button onClick={()=>{setCreatingList(false);setNewListName("");}} className="text-slate-500 hover:text-slate-300 text-sm">✕</button>
            </div>
          ) : (
            <button onClick={()=>setCreatingList(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/8 p-4 text-left transition hover:bg-white/3">
              <span className="text-lg">➕</span>
              <div>
                <div className="text-[12px] font-bold text-slate-400">Créer une liste</div>
                <div className="text-[10px] text-slate-600">Organise tes animés par thème</div>
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
                      <div className="text-[11px] text-slate-500">{(me.highlights||[]).length} animé{(me.highlights||[]).length!==1?"s":""} · Les 5 premiers dans tes favoris du profil</div>
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
                          }} className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-red-500 text-[10px] font-black text-white group-hover:flex">✕</button>
                        </div>
                      ))}
                    </div>
                  ):<EmptyState emoji="❤️" title="Aucun highlight" subtitle="Ajoute des animés via ❤️ sur leurs fiches"/>}
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
                      <div className="text-sm font-black text-slate-100">🎯 Watchlist</div>
                      <div className="text-[11px] text-slate-500">{watchlistIds.length} animé{watchlistIds.length!==1?"s":""}</div>
                    </div>
                    <button onClick={close} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-sm text-slate-400">✕</button>
                  </div>
                  {watchlistIds.length>0?(
                    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                      {watchlistIds.map(id=><AnimePoster key={id} anime={animeCache[id]} onClick={a=>{close();onOpenDetail(a);}} loading/>)}
                    </div>
                  ):<EmptyState emoji="🎯" title="Watchlist vide" subtitle="Ajoute des animés via 🎯 sur leur fiche"/>}
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
                      <div className="text-[11px] text-slate-500">{openListData.animeIds.length} animé{openListData.animeIds.length!==1?"s":""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Pin toggle */}
                      <button onClick={()=>pinList(openListData.id)}
                        className={pinnedListId===openListData.id ? "rounded-lg border border-violet-400/40 bg-violet-400/10 px-2.5 py-1.5 text-[10px] font-bold text-violet-400 transition" : "rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 transition hover:border-white/20"}>
                        {pinnedListId===openListData.id ? "📌 Épinglée" : "📌 Épingler"}
                      </button>
                      {/* Edit toggle */}
                      <button onClick={()=>setEditingList(editingList===openListData.id?null:openListData.id)}
                        className={editingList===openListData.id ? "rounded-lg border border-indigo-400/40 bg-indigo-400/10 px-2.5 py-1.5 text-[10px] font-bold text-indigo-400 transition" : "rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 transition hover:border-white/20"}>
                        {editingList===openListData.id ? "Terminé" : "Modifier"}
                      </button>
                      {/* Delete */}
                      <button onClick={()=>{deleteList(openListData.id);close();}}
                        className="rounded-lg border border-red-500/20 px-2.5 py-1.5 text-[10px] font-bold text-red-500 hover:bg-red-500/10 transition">
                        Supprimer
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
                              className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-red-500 text-[10px] font-black text-white group-hover:flex">✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState emoji="📋" title="Liste vide" subtitle="Recherche des animés à ajouter ci-dessous" className="mb-4"/>
                  )}

                  {/* Add anime search (edit mode) */}
                  {editingList===openListData.id && (
                    <div className="border-t border-white/6 pt-4">
                      <div className="mb-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ajouter un animé</div>
                      <input value={listSearchQuery}
                        onChange={e=>{setListSearchQuery(e.target.value);searchForList(e.target.value);}}
                        placeholder="Rechercher…"
                        className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400/40"/>
                      {listSearchResults.length>0 && (
                        <div className="flex flex-col gap-2">
                          {listSearchResults.map(a=>(
                            <button key={a.mal_id} onClick={()=>{addAnimeToList(openListData.id,a);setListSearchQuery("");setListSearchResults([]);}}
                              className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/3 p-2.5 text-left hover:bg-white/7 transition">
                              <img src={a.images?.jpg?.image_url} alt={a.title} className="h-12 w-8 rounded object-cover"/>
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
          <div className="flex justify-center py-12"><Spinner label="Chargement des posts…"/></div>
        ) : myPosts.length === 0 ? (
          <EmptyState emoji="✍️" title="Aucun post pour l'instant" />
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
          <div className="flex justify-center py-12"><Spinner label="Calcul des stats…"/></div>
        ) : !statsData ? (
          <EmptyState emoji="📊" title="Aucune donnée disponible" />
        ) : (
          <StatsTab statsData={statsData} ratings={me.ratings} watched={me.watched}/>
        )
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
                            style={{ border: isActive?"2px solid #7c3aed":"2px solid transparent", background: isActive?"rgba(124,58,237,0.1)":"rgba(var(--fg-rgb),0.03)" }}>
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
                  style={{ background: me.avatar===e?"rgba(124,58,237,0.3)":"rgba(var(--fg-rgb),0.05)", border: me.avatar===e?"2px solid #7c3aed":"2px solid transparent" }}>
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
