import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { jikan, supabaseRowToAnime, fetchPopularAnime, fetchTitleSuggestions } from "../api/jikan.js";
import { searchArtists, fetchPopularArtists } from "../api/animethemes.js";
import { sb, follows } from "../api/supabase.js";
import { ptsStore } from "../api/moods.js";
import { AnimeCard } from "../components/AnimeCard.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { StudioModal } from "../components/StudioModal.jsx";
import { ArtistModal } from "../components/ArtistModal.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_TEXT } from "../constants/theme.js";
import { Chip, ChipGroup, SectionLabel } from "../components/ui.jsx";
import { SEARCH_I18N } from "../constants/searchI18n.js";

const FALLBACK = "https://placehold.co/64x92/1a1a2e/818cf8?text=?";

function getTabs(t) {
  return [
    { id:"anime",   label:t.tabAnime,   emoji:"­ƒô║" },
    { id:"studio",  label:t.tabStudio,  emoji:"­ƒÄ¼" },
    { id:"artist",  label:t.tabArtist,  emoji:"­ƒÄñ" },
    { id:"members", label:t.tabMembers, emoji:"­ƒæÑ" },
  ];
}
function getTypeFilters(t) {
  return [
    { id:"all",   label:t.filterAll,   emoji:"­ƒöÇ" },
    { id:"TV",    label:t.filterAnime, emoji:"­ƒô║" },
    { id:"Movie", label:t.filterMovie, emoji:"­ƒÄ¼" },
    { id:"OVA",   label:t.filterOva,   emoji:"­ƒÆ┐" },
  ];
}

// "Populaires" only makes sense for TV series ÔÇö films & OAV are rarer, so we frame
// them as curated picks instead of implying a huge, ranked pool.
function getPopularLabels(t) {
  return {
    all:   t.popularNow,
    TV:    t.popularNow,
    Movie: t.popularMovies,
    OVA:   t.popularOva,
  };
}

function studioInitials(name = "") {
  const words = name.split(/\s+/).filter(Boolean);
  if(words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function studioColor(name = "") {
  let hash = 0;
  for(let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
}

function StudioLogo({ studio }) {
  const [broken, setBroken] = useState(false);
  if(studio.logo && !broken) {
    return <img src={studio.logo} alt={studio.name} onError={() => setBroken(true)} className="h-full w-full object-contain p-2" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-base font-black tracking-tight text-white" style={{ background: `linear-gradient(135deg, ${studioColor(studio.name)}, rgba(0,0,0,.35))` }}>
      {studioInitials(studio.name)}
    </div>
  );
}

function MemberCard({ u, onOpenUser, t }) {
  const avatar = u.avatar_base64 || (u.avatar?.startsWith?.("http") ? u.avatar : null);
  return (
    <button onClick={()=>onOpenUser(u.username)}
      className={`flex items-center gap-3 p-3.5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/15 ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-violet-600 to-fuchsia-500 text-lg">
        {avatar ? <img src={avatar} alt={u.name} className="h-full w-full object-cover"/> : (u.avatar||"­ƒæñ")}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-black ${GRADIENT_TEXT}`}>{u.name||u.username}</div>
        <div className="mt-0.5 text-[10px] text-slate-500">
          @{u.username}{u.watched?.length ? t.memberWatchedCount(u.watched.length) : ""}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {u.followerCount !== undefined && (
            <>
              <span className="text-[10px] text-slate-400"><span className="font-bold text-slate-300">{u.followerCount}</span> {t.followerWord(u.followerCount)}</span>
              <span className="text-slate-600">┬À</span>
              <span className="text-[10px] text-slate-400"><span className="font-bold text-slate-300">{u.followingCount}</span> {t.followingWord(u.followingCount)}</span>
            </>
          )}
          {u.isFollowing && <span className="text-[9px] font-bold text-violet-400 bg-violet-400/10 rounded-full px-1.5 py-0.5">{t.followingBadge}</span>}
          {u.isFollower && <span className="text-[9px] font-bold text-slate-400 bg-white/5 rounded-full px-1.5 py-0.5">{t.followerBadge}</span>}
        </div>
        {u.bio && <div className="mt-0.5 text-[10px] italic text-slate-400 truncate">{u.bio}</div>}
      </div>
      <span className="text-slate-600">ÔÇ║</span>
    </button>
  );
}

function StudioCard({ studio, onClick, t }) {
  return (
    <button onClick={onClick} className={`group flex flex-col gap-3 p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/15 ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <StudioLogo studio={studio} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[15px] font-black text-slate-100">{studio.name}</div>
            {studio.country && (
              <span className="shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">{studio.country.emoji} {studio.country.label}</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500">{studio.count ? t.studioPopularCount(studio.count) : t.studioAnimationDefault}</div>
        </div>
        <span className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5">ÔÇ║</span>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-400">{studio.blurb}</p>
      {studio.titles?.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {studio.titles.map(t => <span key={t} className="rounded-full bg-indigo-400/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">{t}</span>)}
        </div>
      )}
    </button>
  );
}

function ArtistCard({ artist, onClick, t }) {
  return (
    <button onClick={onClick} className={`group flex items-center gap-3 p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/15 ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 text-base font-black tracking-tight text-white"
        style={{ background: `linear-gradient(135deg, ${studioColor(artist.name)}, rgba(0,0,0,.35))` }}>
        {studioInitials(artist.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-black text-slate-100">{artist.name}</div>
        <div className="text-[10px] text-slate-500">{t.artistThemeCount(artist.themes.length)}</div>
      </div>
      <span className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5">ÔÇ║</span>
    </button>
  );
}

// ÔöÇÔöÇÔöÇ Weekly Airing Calendar ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
const DAYS_FR  = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const DAYS_EN  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_ABBR = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

function getBroadcastDay(anime) {
  const b = anime.broadcast;
  if(!b) return null;
  if(typeof b === "object" && b.day) return b.day;
  if(typeof b === "string") {
    const m = b.match(/^(\w+)s?\s+at/i);
    if(m) return m[1];
  }
  return null;
}

function AiringCalendar({ anime, onOpenDetail, me }) {
  const [myOnly, setMyOnly] = useState(false);
  const todayIdx = (new Date().getDay() + 6) % 7; // 0=Mon ÔÇª 6=Sun

  // Build "my anime" set:
  // 1. Anime currently in watching/onhold/watchlist
  // 2. Airing anime whose base title matches a completed/watching series
  const myStatuses = me?.statuses || {};
  const myWatched  = me?.watched  || {};

  // Extract base titles from watched anime (remove season suffixes for matching)
  function baseTitle(title) {
    return (title || "")
      .toLowerCase()
      .replace(/\s*(season|saison|cours|part|cour|2nd|3rd|4th|5th|\d+(?:st|nd|rd|th)|\bii\b|\biii\b|\biv\b|\bv\b)\b.*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // All mal_ids the user has interacted with
  const myIds = new Set(Object.keys(myStatuses).map(Number));

  // Base titles the user has watched/is watching
  const myBaseTitles = new Set();
  Object.entries(myWatched).forEach(([id, a]) => {
    if(a?.title) myBaseTitles.add(baseTitle(a.title));
    if(a?.title_en) myBaseTitles.add(baseTitle(a.title_en));
  });
  // Also from statuses (may have more entries)
  Object.keys(myStatuses).forEach(id => {
    const a = myWatched[id];
    if(a?.title) myBaseTitles.add(baseTitle(a.title));
  });

  // Filter: show anime if:
  // - user has it in watching/onhold/watchlist, OR
  // - user has completed/watched a series with the same base title
  function isMyAnime(a) {
    const status = myStatuses[a.mal_id];
    if(["watching","onhold","watchlist"].includes(status)) return true;
    if(myIds.has(a.mal_id)) return false; // already seen, same anime ÔÇö skip
    // Check if it's a sequel of something they watched
    const bt = baseTitle(a.title);
    const bte = baseTitle(a.title_en || "");
    return myBaseTitles.has(bt) || (bte && myBaseTitles.has(bte));
  }

  const displayed = myOnly ? anime.filter(isMyAnime) : anime;
  const myCount   = anime.filter(isMyAnime).length;

  // Group by day
  const byDay = {};
  DAYS_EN.forEach(d => { byDay[d] = []; });
  const unknownDay = [];
  displayed.forEach(a => {
    const raw = getBroadcastDay(a);
    const key = raw ? DAYS_EN.find(d => d.toLowerCase() === raw.toLowerCase()) : null;
    if(key) byDay[key].push(a);
    else    unknownDay.push(a);
  });

  const hasDayData = Object.values(byDay).some(arr => arr.length > 0);
  const totalWithDay = Object.values(byDay).reduce((s, arr) => s + arr.length, 0);
  const statusColors = {
    completed:"#3b82f6", watching:"#22c55e",
    dropped:"#ef4444", onhold:"#f59e0b", watchlist:"#9ca3af",
  };

  // Fallback grid when no broadcast data
  if(!hasDayData) {
    return (
      <div>
        <div style={{marginBottom:12,fontSize:11,color:"var(--text-5)",textAlign:"center"}}>
          Donn├®es de diffusion non disponibles ÔÇö affichage par popularit├®
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(110px, 1fr))",gap:10}}>
          {displayed.map(a => (
            <button key={a.mal_id} onClick={()=>onOpenDetail(a)} style={{
              background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:12,padding:8,cursor:"pointer",textAlign:"left",transition:"all 0.15s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.07)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
              <img src={a.image_url||a.large_image} alt="" style={{
                width:"100%",aspectRatio:"2/3",objectFit:"cover",borderRadius:8,marginBottom:6,
                border:`2px solid ${statusColors[(me?.statuses||{})[a.mal_id]]||"transparent"}`,
              }} onError={e=>{e.target.style.display="none";}}/>
              <div style={{fontSize:9,fontWeight:700,color:"var(--text-1)",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {a.title_en||a.title}
              </div>
              {a.score && <div style={{fontSize:8,color:"#fbbf24",marginTop:2}}>Ôÿà {a.score}</div>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats bar + toggle */}
      <div style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:16,padding:"8px 16px",borderRadius:12,
        background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",
        flexWrap:"wrap",gap:8,
      }}>
        <div style={{fontSize:11,color:"var(--text-4)"}}>
          <span style={{fontWeight:700,color:"var(--text-2)"}}>{totalWithDay}</span> anim├®s planifi├®s
          {unknownDay.length > 0 && <span style={{marginLeft:8,opacity:0.6}}>+ {unknownDay.length} sans horaire</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:10,color:"var(--text-5)"}}>
            Saison en cours ┬À {new Date().getFullYear()}
          </div>
          {/* Mon calendrier toggle */}
          <button onClick={()=>setMyOnly(p=>!p)} style={{
            display:"flex",alignItems:"center",gap:6,
            padding:"5px 12px",borderRadius:20,fontSize:10,fontWeight:800,
            cursor:"pointer",transition:"all 0.15s",
            background: myOnly ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.05)",
            color: myOnly ? "#c084fc" : "var(--text-4)",
            border: myOnly ? "1px solid rgba(124,58,237,0.4)" : "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{
              width:14,height:14,borderRadius:4,flexShrink:0,
              background: myOnly ? "#7c3aed" : "rgba(255,255,255,0.08)",
              border: myOnly ? "none" : "1px solid rgba(255,255,255,0.15)",
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>
              {myOnly && <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>}
            </div>
            Mon calendrier
            {myCount > 0 && (
              <span style={{
                background:"rgba(124,58,237,0.3)",color:"#c084fc",
                fontSize:9,padding:"1px 5px",borderRadius:10,
              }}>{myCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* 7-day grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7, 1fr)",gap:6}}>
        {DAYS_EN.map((day, idx) => {
          const isToday = idx === todayIdx;
          const animes  = byDay[day] || [];
          return (
            <div key={day} style={{
              borderRadius:14,overflow:"hidden",
              border:`1px solid ${isToday ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.06)"}`,
              background: isToday ? "rgba(124,58,237,0.07)" : "rgba(255,255,255,0.015)",
              boxShadow: isToday ? "0 0 0 1px rgba(124,58,237,0.15), 0 4px 20px rgba(124,58,237,0.08)" : "none",
            }}>
              {/* Day header */}
              <div style={{
                padding:"10px 10px 8px",
                borderBottom:`1px solid ${isToday ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.05)"}`,
                background: isToday ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.02)",
              }}>
                <div style={{
                  fontSize:13,fontWeight:900,
                  color: isToday ? "#c084fc" : "var(--text-2)",
                  letterSpacing: isToday ? 0.3 : 0,
                }}>
                  {DAYS_FR[idx]}
                </div>
                <div style={{
                  display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:2,
                }}>
                  {isToday && (
                    <span style={{
                      fontSize:8,fontWeight:800,
                      background:"rgba(124,58,237,0.3)",color:"#c084fc",
                      padding:"1px 6px",borderRadius:4,letterSpacing:0.5,
                    }}>AUJOURD'HUI</span>
                  )}
                  <span style={{
                    fontSize:9,color: animes.length > 0 ? "var(--text-4)" : "var(--text-6)",
                    marginLeft:"auto",
                  }}>
                    {animes.length > 0 ? `${animes.length} anime${animes.length > 1 ? "s" : ""}` : "ÔÇö"}
                  </span>
                </div>
              </div>

              {/* Anime list */}
              <div style={{padding:6,display:"flex",flexDirection:"column",gap:4,minHeight:40}}>
                {animes.length === 0 ? (
                  <div style={{
                    padding:"12px 4px",textAlign:"center",
                    fontSize:18,opacity:0.08,
                  }}>┬À</div>
                ) : animes.map(a => {
                  const watchStatus = (me?.statuses||{})[a.mal_id];
                  const dotColor = statusColors[watchStatus];
                  return (
                    <button key={a.mal_id} onClick={()=>onOpenDetail(a)} style={{
                      display:"flex",gap:7,alignItems:"center",
                      background:"none",border:"none",cursor:"pointer",
                      textAlign:"left",padding:"4px 4px",borderRadius:8,
                      transition:"background 0.12s",width:"100%",
                    }}
                    onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";}}
                    onMouseLeave={e=>{e.currentTarget.style.background="none";}}>
                      {/* Poster */}
                      <div style={{position:"relative",flexShrink:0}}>
                        <img src={a.image_url||a.large_image} alt="" style={{
                          width:32,height:44,objectFit:"cover",borderRadius:5,display:"block",
                          border: dotColor ? `2px solid ${dotColor}` : "1px solid rgba(255,255,255,0.1)",
                        }} onError={e=>{e.target.style.display="none";}}/>
                        {dotColor && (
                          <div style={{
                            position:"absolute",bottom:-2,right:-2,
                            width:8,height:8,borderRadius:"50%",
                            background:dotColor,border:"1px solid rgba(0,0,0,0.5)",
                          }}/>
                        )}
                      </div>
                      {/* Info */}
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{
                          fontSize:10,fontWeight:700,color:"var(--text-1)",
                          overflow:"hidden",textOverflow:"ellipsis",
                          display:"-webkit-box",WebkitLineClamp:2,
                          WebkitBoxOrient:"vertical",lineHeight:1.3,
                          marginBottom:2,
                        }}>
                          {a.title_en || a.title}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                          {a.score && (
                            <span style={{fontSize:8,color:"#fbbf24",fontWeight:700}}>
                              Ôÿà {a.score}
                            </span>
                          )}
                          {a.year && a.year < 2025 && (
                            <span style={{fontSize:8,color:"var(--text-6)",
                              background:"rgba(255,255,255,0.06)",
                              padding:"1px 4px",borderRadius:3}}>
                              r├®current
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unknown day section */}
      {unknownDay.length > 0 && (
        <div style={{marginTop:16,padding:"12px 16px",borderRadius:12,
          background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)"}}>
          <div style={{fontSize:10,fontWeight:700,color:"var(--text-5)",marginBottom:8}}>
            ­ƒô║ Jour de diffusion non pr├®cis├® ({unknownDay.length})
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {unknownDay.map(a => (
              <button key={a.mal_id} onClick={()=>onOpenDetail(a)} style={{
                display:"flex",gap:6,alignItems:"center",
                background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:8,padding:"5px 8px",cursor:"pointer",transition:"background 0.12s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.07)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
                <img src={a.image_url||a.large_image} alt="" style={{
                  width:18,height:24,objectFit:"cover",borderRadius:3,flexShrink:0,
                }} onError={e=>{e.target.style.display="none";}}/>
                <span style={{fontSize:9,fontWeight:600,color:"var(--text-3)"}}>
                  {a.title_en||a.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchView({ onOpenDetail, onOpenUser }) {
  const { me, myUsername, blockedUsers } = useApp();
  const { lang } = useLang();
  const t = SEARCH_I18N[lang] || SEARCH_I18N.fr;
  const TABS = getTabs(t);
  const TYPE_FILTERS = getTypeFilters(t);
  const POPULAR_LABELS = getPopularLabels(t);
  const [tab, setTab]           = useState("anime");
  const [query, setQuery]       = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [studioModal, setStudioModal] = useState(null);
  const [artistModal, setArtistModal] = useState(null);

  const [popularAnime, setPopularAnime]     = useState([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [airingAnime, setAiringAnime]       = useState([]);
  const [loadingAiring, setLoadingAiring]   = useState(true);
  const [popularStudios, setPopularStudios] = useState([]);
  const [loadingStudios, setLoadingStudios] = useState(true);
  const [popularArtists, setPopularArtists] = useState([]);
  const [loadingArtists, setLoadingArtists] = useState(false);

  const [suggestions, setSuggestions]         = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Default members list (following + followers)
  const [defaultMembers, setDefaultMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if(tab !== "members" || defaultMembers.length) return;
    setLoadingMembers(true);
    (async () => {
      try {
        const [followingList, followerList] = await Promise.all([
          follows.getFollowing(myUsername).catch(()=>[]),
          follows.getFollowers(myUsername).catch(()=>[]),
        ]);
        const allUsernames = [...new Set([...followingList, ...followerList])].filter(u=>u!==myUsername);
        if(!allUsernames.length) { setDefaultMembers([]); setLoadingMembers(false); return; }
        const rows = await sb.query(`profiles?username=in.(${allUsernames.map(u=>encodeURIComponent(u)).join(",")})&select=username,name,avatar,avatar_base64,bio,watched`);
        // Add following/follower counts
        const enriched = await Promise.all((rows||[]).map(async u => {
          const [frs, fng] = await Promise.all([
            follows.getFollowers(u.username).catch(()=>[]),
            follows.getFollowing(u.username).catch(()=>[]),
          ]);
          return { ...u, followerCount: frs.length, followingCount: fng.length,
            isFollowing: followingList.includes(u.username),
            isFollower: followerList.includes(u.username) };
        }));
        setDefaultMembers(enriched);
      } catch {}
      setLoadingMembers(false);
    })();
  }, [tab]);
  // Artist tab is backed by a third-party API ÔÇö fetched lazily on first visit
  // (like the members tab) rather than eagerly on mount (unlike studios,
  // which is a single cheap Supabase query).
  useEffect(() => {
    if(tab !== "artist" || popularArtists.length) return;
    setLoadingArtists(true);
    fetchPopularArtists(16).then(setPopularArtists).catch(() => {}).finally(() => setLoadingArtists(false));
  }, [tab]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 150); return () => clearTimeout(t); }, []);

  // Categories are never empty ÔÇö prefill popular anime, refetched per type filter so
  // "Film"/"OAV" don't just show a TV-dominated list under the wrong label.
  // loadingPopular is flipped back on in changeTypeFilter (the event handler), not here,
  // so the effect body only synchronizes with the fetch instead of driving state itself.
  useEffect(() => {
    let cancelled = false;
    fetchPopularAnime(24, typeFilter==="all" ? null : typeFilter)
      .then(rows => { if(!cancelled) setPopularAnime(rows); })
      .finally(() => { if(!cancelled) setLoadingPopular(false); });
    return () => { cancelled = true; };
  }, [typeFilter]);

  // Fetch airing TV anime with broadcast day for calendar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await sb.query(
          "anime_cache?type=eq.TV&status=eq.Currently%20Airing&select=mal_id,title,title_en,synopsis,score,year,episodes,type,image_url,large_image,genres,status,broadcast&order=score.desc.nullslast&limit=200"
        ).catch(()=>[]);
        if(!cancelled && rows?.length) {
          // Filter out TV Shorts and non-TV (extra safety)
          setAiringAnime(rows.filter(a => a.type === "TV"));
        }
      } catch {}
      if(!cancelled) setLoadingAiring(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Fetch popular studios from anime_cache (no Jikan needed)
    sb.query("anime_cache?select=studios&score=gte.7&order=score.desc.nullslast&limit=200")
      .then(rows => {
        if(cancelled) return;
        const counts = {};
        (rows||[]).forEach(a => {
          (a.studios||[]).forEach(s => {
            const name = s.name || s;
            const id = s.mal_id || s.id || name;
            if(!counts[id]) counts[id] = { mal_id: id, name, count: 0 };
            counts[id].count++;
          });
        });
        const sorted = Object.values(counts)
          .filter(s => s.name && s.count >= 2)
          .sort((a,b) => b.count - a.count)
          .slice(0, 12)
          .map(s => ({ ...s, blurb: `${s.count} anim├®s populaires` }));
        setPopularStudios(sorted);
      })
      .catch(()=>{})
      .finally(() => { if(!cancelled) setLoadingStudios(false); });
    return () => { cancelled = true; };
  }, [lang]);

  // Progressive, non-blocking logo enhancement ÔÇö never gates the initial render.
  useEffect(() => {
    if(!popularStudios.length) return;
    let cancelled = false;
    popularStudios.forEach((s, i) => {
      if("logo" in s) return;
      setTimeout(async () => {
        if(cancelled) return;
        let url = null;
        try { url = (await jikan.getProducerFull(s.mal_id))?.data?.images?.jpg?.image_url || null; } catch { /* keep text logo fallback */ }
        if(!cancelled) setPopularStudios(prev => prev.map(p => p.mal_id === s.mal_id ? { ...p, logo: url } : p));
      }, i * 450);
    });
    return () => { cancelled = true; };
  }, [popularStudios.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDocClick = e => { if(boxRef.current && !boxRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const doSearch = async (q) => {
    const trimmed = q.trim(); if(!trimmed) return;
    setQuery(trimmed); setSubmitted(true); setLoading(true); setError(null); setShowSuggestions(false);
    try {
      if(tab === "anime") {
        const params = { q:trimmed, limit:24, order_by:"score", sort:"desc", sfw:false };
        if(typeFilter !== "all") params.type = typeFilter;
        const res = await jikan.searchAnime(params);
        const raw = res.data||[];
        const tLow = trimmed.toLowerCase();
        const sorted = [...raw].sort((a,b) => {
          const aT=(a.title||"").toLowerCase(), bT=(b.title||"").toLowerCase();
          const aE=(a.title_english||"").toLowerCase(), bE=(b.title_english||"").toLowerCase();
          const s=(ti,en)=>(ti===tLow||en===tLow)?3:(ti.startsWith(tLow)||en.startsWith(tLow))?2:(ti.includes(tLow)||en.includes(tLow))?1:0;
          return s(bT,bE)-s(aT,aE);
        });
        setResults(sorted);
      } else if(tab === "studio") {
        // First try Supabase ÔÇö extract unique studios from anime_cache
        let studios = [];
        try {
          const { sb } = await import("../api/supabase.js");
          const enc = encodeURIComponent(trimmed);
          // Search studios JSONB array for matching names
          const rows = await sb.query(
            `anime_cache?select=studios,country&studios=cs.%5B%7B%22name%22%3A%22${enc}%22%7D%5D&limit=500`
          );
          // Extract unique studio entries
          const studioMap = new Map();
          (rows||[]).forEach(row => {
            (row.studios||[]).forEach(s => {
              if(!s?.name || !s.name.toLowerCase().includes(trimmed.toLowerCase())) return;
              if(!studioMap.has(s.mal_id)) {
                studioMap.set(s.mal_id, { mal_id: s.mal_id, name: s.name, count: 0, blurb: `${s.count || '?'} anim├®s populaires`, titles: [], country: null });
              }
              studioMap.get(s.mal_id).count++;
            });
          });
          studios = [...studioMap.values()].sort((a,b) => b.count - a.count).slice(0,30);
        } catch {}

        // Also try Jikan producers endpoint for broader coverage
        try {
          const r = await fetch(`https://api.jikan.moe/v4/producers?q=${encodeURIComponent(trimmed)}&order_by=count&sort=desc&limit=20`);
          const d = await r.json();
          const jikanStudios = (d.data||[]).map(s => ({
            mal_id: s.mal_id, name: s.titles?.[0]?.title || "Studio", count: s.count,
            established: s.established, logo: s.images?.jpg?.image_url || null,
            blurb: '?? anim├®s', titles: [],
          }));
          // Merge ÔÇö prefer Jikan entries (more complete) but keep Supabase-only ones
          const merged = new Map(studios.map(s => [s.mal_id, s]));
          jikanStudios.forEach(s => { merged.set(s.mal_id, { ...merged.get(s.mal_id)||{}, ...s }); });
          studios = [...merged.values()].sort((a,b) => b.count - a.count).slice(0,30);
        } catch {}

        setResults(studios);
        // Fetch country badges in background
        // getStudioCountries skipped (Jikan down)
      } else if(tab === "artist") {
        setResults(await searchArtists(trimmed, 24));
      } else if(tab === "members") {
        const enc = encodeURIComponent(trimmed);
        const rows = await sb.query(`profiles?or=(name.ilike.*${enc}*,username.ilike.*${enc}*)&select=username,name,avatar,bio,watched&limit=20`);
        setResults((rows||[]).filter(r => !blockedUsers?.has(r.username)));
      }
    } catch(e) {
      if(e.message?.includes("AnimeThemes")) {
        setError(t.animeThemesDown);
      } else if(e.message?.includes("504") || e.message?.includes("Gateway") || e.message?.includes("fetch")) {
        setError(t.jikanDown);
      } else setError(e.message);
    } finally { setLoading(false); }
  };

  const clearSearch = () => { setQuery(""); setSubmitted(false); setResults([]); setSuggestions([]); setShowSuggestions(false); inputRef.current?.focus(); };
  const changeTab = (id) => { setTab(id); setSubmitted(false); setResults([]); setQuery(""); setSuggestions([]); setShowSuggestions(false); };
  const changeTypeFilter = (id) => { setLoadingPopular(true); setTypeFilter(id); };

  const onQueryChange = (val) => {
    setQuery(val);
    setActiveSuggestion(-1);
    if(submitted && !val) { clearSearch(); return; }
    if(tab !== "anime") return;
    if(debounceRef.current) clearTimeout(debounceRef.current);
    if(!val.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const rows = await fetchTitleSuggestions(val, 10);
      setSuggestions(rows);
      setShowSuggestions(true);
    }, 220);
  };

  const selectSuggestion = (row) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setQuery("");
    onOpenDetail(supabaseRowToAnime(row));
  };

  const onInputKeyDown = (e) => {
    if(tab === "anime" && showSuggestions && suggestions.length > 0) {
      if(e.key === "ArrowDown") { e.preventDefault(); setActiveSuggestion(i => (i+1) % suggestions.length); return; }
      if(e.key === "ArrowUp")   { e.preventDefault(); setActiveSuggestion(i => (i-1+suggestions.length) % suggestions.length); return; }
      if(e.key === "Escape")    { setShowSuggestions(false); return; }
      if(e.key === "Enter") {
        e.preventDefault();
        if(activeSuggestion >= 0 && suggestions[activeSuggestion]) selectSuggestion(suggestions[activeSuggestion]);
        else doSearch(query);
        return;
      }
    }
    if(e.key === "Enter") doSearch(query);
    if(e.key === "Escape") setShowSuggestions(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 animate-slide-up">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight text-slate-50 md:text-[32px]">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {TABS.map(tabItem => <Chip key={tabItem.id} label={tabItem.label} emoji={tabItem.emoji} selected={tab===tabItem.id} onClick={() => changeTab(tabItem.id)} />)}
        </div>

        <div ref={boxRef} className="relative w-full sm:w-96">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">­ƒöì</span>
          <input ref={inputRef} value={query}
            onChange={e => onQueryChange(e.target.value)}
            onFocus={() => { if(suggestions.length) setShowSuggestions(true); }}
            onKeyDown={onInputKeyDown}
            placeholder={tab==="anime"?t.placeholderAnime:tab==="studio"?t.placeholderStudio:tab==="artist"?t.placeholderArtist:t.placeholderMembers}
            className="w-full rounded-2xl border border-white/10 bg-white/6 py-3 pl-10 pr-9 text-sm text-slate-100 outline-none transition focus:border-violet-400/50 focus:bg-white/8" />
          {query && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 flex h-5.5 w-5.5 -translate-y-1/2 items-center justify-center rounded-full bg-white/8 text-[11px] text-slate-400">Ô£ò</button>
          )}

          {tab === "anime" && showSuggestions && suggestions.length > 0 && (
            <div className={`absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-y-auto p-1.5 ${GLASS}`} style={GLASS_STYLE}>
              {suggestions.map((row, i) => (
                <button key={row.mal_id}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selectSuggestion(row)}
                  onMouseEnter={() => setActiveSuggestion(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${i===activeSuggestion ? "bg-white/10" : "hover:bg-white/5"}`}>
                  <img src={row.image_url || row.large_image || FALLBACK} alt="" onError={e=>{e.target.src=FALLBACK;}} className="h-12 w-9 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-slate-100">{row.title_en || row.title}</div>
                    <div className="truncate text-[10px] text-slate-500">
                      {row.title_en && row.title_en !== row.title ? `${row.title} ┬À ` : ""}{row.year || "?"}{row.type ? ` ┬À ${row.type}` : ""}
                    </div>
                  </div>
                  {row.score && <span className="shrink-0 text-[11px] font-bold text-amber-400">Ôÿà{row.score}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === "anime" && (
        <div className="mb-6">
          <ChipGroup items={TYPE_FILTERS} value={[typeFilter]} onToggle={changeTypeFilter} />
        </div>
      )}

      {/* ÔöÇÔöÇ ANIME TAB ÔöÇÔöÇ */}
      {tab === "anime" && !submitted && (
        <>
          {/* ÔöÇÔöÇ CALENDRIER SAISONNIER ÔÇö vue par d├®faut, pleine page ÔöÇÔöÇ */}
          {typeFilter === "all" && (
            <div className="mb-10">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div>
                  <div style={{fontSize:15,fontWeight:900,color:"var(--text-1)"}}>Saison en cours</div>
                  <div style={{fontSize:10,color:"var(--text-5)",marginTop:2}}>Anim├®s TV ┬À class├®s par jour de diffusion</div>
                </div>
              </div>
              {loadingAiring
                ? <Spinner label={t.loading}/>
                : <AiringCalendar anime={airingAnime} onOpenDetail={onOpenDetail} me={me}/>
              }
            </div>
          )}

          {/* ÔöÇÔöÇ POPULAIRES ÔÇö en dessous du calendrier ÔöÇÔöÇ */}
          <div style={{
            borderTop: typeFilter === "all" ? "1px solid rgba(255,255,255,0.06)" : "none",
            paddingTop: typeFilter === "all" ? 24 : 0,
          }}>
            <SectionLabel className="mb-3">{POPULAR_LABELS[typeFilter] || POPULAR_LABELS.all}</SectionLabel>
            {loadingPopular ? <Spinner label={t.loading} /> : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {popularAnime.map(a => {
                  const status = (me.statuses||{})[a.mal_id];
                  const statusColors = { completed:"#3b82f6", watching:"#22c55e", dropped:"#ef4444", onhold:"#f59e0b", watchlist:"#9ca3af" };
                  return <AnimeCard key={a.mal_id} anime={a} onClick={onOpenDetail} statusDot={statusColors[status]} moodPts={ptsStore[a.mal_id]} quickAction="watchlist" />;
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ÔöÇÔöÇ STUDIO TAB ÔöÇÔöÇ */}
      {tab === "studio" && !submitted && (
        <>
          <SectionLabel className="mb-3">{t.studiosPopular}</SectionLabel>
          {loadingStudios ? <Spinner label={t.loading} /> : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popularStudios.map(s => (
                <StudioCard key={s.mal_id} studio={s} onClick={() => setStudioModal({ id:s.mal_id, name:s.name })} t={t} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ÔöÇÔöÇ ARTIST TAB ÔöÇÔöÇ */}
      {tab === "artist" && !submitted && (
        <>
          <SectionLabel className="mb-3">{t.artistsPopular}</SectionLabel>
          {loadingArtists ? <Spinner label={t.loading} /> : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popularArtists.map(a => <ArtistCard key={a.slug} artist={a} onClick={() => setArtistModal(a)} t={t} />)}
            </div>
          )}
        </>
      )}

      {/* ÔöÇÔöÇ MEMBERS TAB (search-only) ÔöÇÔöÇ */}
      {tab === "members" && !submitted && (() => {
        // Filtered at render (not just at fetch time) so blocking someone who
        // follows you drops them from this list immediately, without waiting
        // on the once-per-session fetch above to re-run.
        const visibleMembers = defaultMembers.filter(u => !blockedUsers?.has(u.username));
        return (
        <div>
          {loadingMembers && <Spinner label={t.loading}/>}
          {!loadingMembers && visibleMembers.length === 0 && (
            <EmptyState emoji="­ƒæÑ" title={t.noMembersTitle} subtitle={t.noMembersSubtitle} />
          )}
          {!loadingMembers && visibleMembers.length > 0 && (
            <>
              <div className="mb-3 text-[11px] font-semibold text-slate-500">{t.membersYourConnections}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleMembers.map(u => (
                  <MemberCard key={u.username} u={u} onOpenUser={onOpenUser} t={t}/>
                ))}
              </div>
            </>
          )}
        </div>
        );
      })()}

      {/* ÔöÇÔöÇ SEARCH RESULTS (any tab) ÔöÇÔöÇ */}
      {submitted && (
        <>
          <div className="mb-3 text-[11px] font-semibold text-slate-500">{loading ? t.searching : t.resultCount(results.length)}</div>
          {loading && <Spinner label={t.searchingInProgress} />}
          {error && <div className="py-8 text-center text-xs text-red-400">{t.errorPrefix(error)}</div>}
          {!loading && !error && results.length === 0 && <EmptyState emoji="­ƒöì" title={t.noResultsTitle} subtitle={t.noResultsSubtitle} />}

          {!loading && tab === "anime" && results.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {results.map(a => {
                const status = (me.statuses||{})[a.mal_id];
                const statusColors = { completed:"#3b82f6", watching:"#22c55e", dropped:"#ef4444", onhold:"#f59e0b", watchlist:"#9ca3af" };
                return <AnimeCard key={a.mal_id} anime={a} onClick={onOpenDetail} statusDot={statusColors[status]} moodPts={ptsStore[a.mal_id]} quickAction="watchlist" />;
              })}
            </div>
          )}

          {!loading && tab === "studio" && results.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(s => <StudioCard key={s.mal_id} studio={s} onClick={() => setStudioModal({ id:s.mal_id, name:s.name })} t={t} />)}
            </div>
          )}

          {!loading && tab === "artist" && results.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(a => <ArtistCard key={a.slug} artist={a} onClick={() => setArtistModal(a)} t={t} />)}
            </div>
          )}

          {!loading && tab === "members" && results.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(u => <MemberCard key={u.username} u={u} onOpenUser={onOpenUser} t={t}/>)}
            </div>
          )}
        </>
      )}

      {studioModal && <StudioModal studioId={studioModal.id} studioName={studioModal.name} onClose={() => setStudioModal(null)} onOpenDetail={a => { setStudioModal(null); onOpenDetail(a); }} />}
      {artistModal && <ArtistModal artist={artistModal} onClose={() => setArtistModal(null)} onOpenDetail={a => { setArtistModal(null); onOpenDetail(a); }} />}
    </div>
  );
}
