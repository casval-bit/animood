import { useState, useEffect } from "react";
import { sb } from "../../api/supabase.js";
import { STATUS_COLORS } from "../../constants/statuses.js";
import { Spinner } from "../Spinner.jsx";
import { isVisibleInCalendar } from "../../utils/adultContent.js";
import { sameFamily, isTvShort } from "../../utils/franchise.js";

// ─── Weekly Airing Calendar ────────────────────────────────────────────────────
const DAYS_EN = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

// The airing list only changes weekly — cached for the session so switching
// back to the Saison tab doesn't refetch 200 rows every time.
let airingCache = null;

// ONA / OVA (ex. des séries Netflix comme JoJo Steel Ball Run) sont chargés
// à part : une seule requête triée par note les noierait sous les séries TV.
// (ils ne sont gardés que s'ils ont un jour de diffusion — voir fetchAiringAnime)
const AIRING_SELECT = "mal_id,title,title_en,synopsis,score,year,episodes,type,image_url,large_image,genres,themes,rating,duration,status,broadcast,streaming,aired_from,scored_by,country";
const SPECIAL_TYPES = new Set(["ONA", "OVA"]);
// Petite étiquette pour distinguer ce qui n'est pas une série TV classique.
const typeTag = (a) => a?.type === "OVA" ? "OAV" : a?.type === "ONA" ? "ONA" : null;

async function fetchAiringAnime() {
  if(airingCache) return airingCache;
  const [rows, extra] = await Promise.all([
    sb.query(
      `anime_cache?type=eq.TV&status=eq.Currently%20Airing&select=${AIRING_SELECT}&order=score.desc.nullslast&limit=200`
    ).catch(()=>[]),
    sb.query(
      `anime_cache?type=in.(ONA,OVA)&status=eq.Currently%20Airing&select=${AIRING_SELECT}&order=score.desc.nullslast&limit=60`
    ).catch(()=>[]),
  ]);
  if(rows?.length) {
    airingCache = [
      ...rows.filter(a => a.type === "TV"),
      // ONA/OVA : seulement ceux qui ont un vrai jour de sortie (série hebdo type Netflix). Beaucoup d'OAV restent
      // « Currently Airing » sur MAL alors qu'ils sortent en un bloc ou au compte-gouttes : pas de place dans un calendrier.
      ...(extra || []).filter(a => SPECIAL_TYPES.has(a.type) && getBroadcastDay(a)),
    ];
  } else {
    const res = await fetch("https://api.jikan.moe/v4/seasons/now?limit=50").catch(()=>null);
    const data = res?.ok ? await res.json() : null;
    airingCache = (data?.data || []).filter(a => a.type === "TV");
  }
  return airingCache;
}

// Recently finished TV anime — started within the last ~4 months (one season
// plus margin) and already marked finished. aired_from is capped at today
// because a few MAL rows carry bogus far-future dates.
let finishedCache = null;
async function fetchFinishedAnime() {
  if(finishedCache) return finishedCache;
  const threeMonthsAgo = new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10);
  const rows = await sb.query(
    `anime_cache?type=in.(TV,ONA,OVA)&status=eq.Finished%20Airing&aired_from=gte.${threeMonthsAgo}` +
    "&select=mal_id,title,title_en,score,year,episodes,duration,type,image_url,large_image,genres,themes,rating,aired_from,scored_by,country&order=score.desc.nullslast&limit=80"
  ).catch(()=>[]);
  finishedCache = rows || [];
  return finishedCache;
}

// Streaming platforms shown in the filter — `names` are the labels Jikan uses
// in anime_cache.streaming.
const PLATFORMS = [
  { id:"crunchyroll", label:"Crunchyroll", names:["Crunchyroll"],                  color:"#f47521" },
  { id:"netflix",     label:"Netflix",     names:["Netflix"],                      color:"#e50914" },
  { id:"amazon",      label:"Prime Video", names:["Amazon Prime Video"],           color:"#00a8e0" },
  { id:"disney",      label:"Disney+",     names:["Disney Plus","Disney+"],        color:"#113ccf" },
  { id:"adn",         label:"ADN",         names:["Anime Digital Network","ADN"],  color:"#0090d0" },
  { id:"hidive",      label:"HIDIVE",      names:["HIDIVE"],                       color:"#00aeef" },
  { id:"hulu",        label:"Hulu",        names:["Hulu"],                         color:"#1ce783" },
  { id:"max",         label:"Max",         names:["Max"],                          color:"#0030ff" },
  { id:"bilibili",    label:"Bilibili",    names:["Bilibili","Bilibili Global"],   color:"#00a1d6" },
  { id:"muse",        label:"Muse Asia",   names:["Muse Asia"],                    color:"#e4007c" },
  { id:"anione",      label:"Ani-One",     names:["Ani-One Asia"],                 color:"#ff6600" },
  { id:"bahamut",     label:"Bahamut",     names:["Bahamut Anime Crazy"],          color:"#1ba7b4" },
  { id:"aniplus",     label:"Aniplus",     names:["Aniplus TV","Aniplus Asia"],    color:"#e11d48" },
];
function platformIds(anime) {
  const names = Array.isArray(anime.streaming) ? anime.streaming.map(s => s?.name) : [];
  return new Set(PLATFORMS.filter(p => p.names.some(n => names.includes(n))).map(p => p.id));
}

// Selected platforms: the anime must be on at least one of them.
function matchesPlatforms(anime, platformFilters) {
  if(!platformFilters.size) return true;
  const ids = platformIds(anime);
  return [...platformFilters].some(id => ids.has(id));
}

function getBroadcastDay(anime) {
  const b = anime.broadcast;
  if(!b) return null;
  if(typeof b === "object" && b.day) return b.day.replace(/s$/i, "");
  if(typeof b === "string") {
    const m = b.match(/^(\w+)s?\s+at/i);
    if(m) return m[1];
  }
  return null;
}

// "23:00" from either Jikan's broadcast object or the cached "Mondays at 23:00 (JST)".
function getBroadcastTime(anime) {
  const b = anime.broadcast;
  if(!b) return null;
  if(typeof b === "object") return b.time || null;
  const m = typeof b === "string" && b.match(/at\s+(\d{1,2}:\d{2})/i);
  return m ? m[1] : null;
}

// Jikan gives broadcast day + time in Japan time (JST = UTC+9, no DST). A
// late-night Japanese slot often lands on the *previous* day in Europe, so
// both are shifted into the viewer's timezone. Returns null when the day is
// unknown; without a time the JST day is kept as-is (can't shift it).
const WEEK_MIN = 7 * 1440;
const pad2 = (n) => String(n).padStart(2, "0");
function broadcastLocal(anime) {
  const raw = getBroadcastDay(anime);
  const jstDay = raw ? DAYS_EN.findIndex(d => d.toLowerCase() === raw.toLowerCase()) : -1;
  if(jstDay < 0) return null;
  const jstTime = getBroadcastTime(anime);
  if(!jstTime) return { dayIdx: jstDay, time: null, jstTime: null };
  const [h, m] = jstTime.split(":").map(Number);
  const utcMin   = jstDay * 1440 + h * 60 + m - 9 * 60;
  const localMin = ((utcMin - new Date().getTimezoneOffset()) % WEEK_MIN + WEEK_MIN) % WEEK_MIN;
  return {
    dayIdx: Math.floor(localMin / 1440),
    time: `${pad2(Math.floor((localMin % 1440) / 60))}:${pad2(localMin % 60)}`,
    jstTime,
  };
}
const byLocalTime = (a, b) => (broadcastLocal(a)?.time || "99").localeCompare(broadcastLocal(b)?.time || "99");

// Day / week choice is a per-viewer convenience — storage may be unavailable.
const VIEW_KEY = "animood.calendarView";
function readSavedView() {
  try { return localStorage.getItem(VIEW_KEY) === "week" ? "week" : "day"; } catch { return "day"; }
}
function saveView(view) {
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* not persisted */ }
}

const statusDot = (status) => STATUS_COLORS[status]?.dot;

function TypeTag({ a }) {
  return (
    <span style={{fontSize:8,fontWeight:800,color:"#67e8f9",background:"rgba(103,232,249,0.12)",
      padding:"1px 4px",borderRadius:3}}>{typeTag(a)}</span>
  );
}

// One day at a time: a day picker, then that day's anime as larger cards
// sorted by broadcast time — readable on a phone, unlike the 7-column week.
function DayView({ byDay, dayIdx, setDayIdx, todayIdx, myStatuses, currentYear, onOpenDetail, t }) {
  const animes = byDay[DAYS_EN[dayIdx]] || [];
  return (
    <div>
      {/* Day picker */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7, minmax(0, 1fr))",gap:6,marginBottom:16}}>
        {DAYS_EN.map((day, idx) => {
          const selected = idx === dayIdx;
          const isToday  = idx === todayIdx;
          const count    = byDay[day].length;
          return (
            <button key={day} onClick={()=>setDayIdx(idx)} aria-pressed={selected} style={{
              padding:"8px 2px",borderRadius:12,cursor:"pointer",transition:"all 0.15s",
              display:"flex",flexDirection:"column",alignItems:"center",gap:2,minWidth:0,
              background: selected ? "rgba(124,58,237,0.22)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${selected ? "rgba(124,58,237,0.5)" : isToday ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)"}`,
            }}>
              <span style={{fontSize:11,fontWeight:900,color: selected || isToday ? "#c084fc" : "var(--text-2)"}}>
                {t.days[idx].slice(0, 3)}
              </span>
              <span style={{fontSize:9,color: count ? "var(--text-4)" : "var(--text-6)"}}>{count || "—"}</span>
            </button>
          );
        })}
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:13,fontWeight:900,color:"var(--text-1)"}}>{t.days[dayIdx]}</span>
        {dayIdx === todayIdx && (
          <span style={{fontSize:8,fontWeight:800,background:"rgba(124,58,237,0.3)",color:"#c084fc",
            padding:"1px 6px",borderRadius:4,letterSpacing:0.5}}>{t.today}</span>
        )}
        {animes.length > 0 && <span style={{fontSize:10,color:"var(--text-5)"}}>{t.dayAnimeCount(animes.length)}</span>}
      </div>

      {animes.length === 0 ? (
        <div style={{padding:"28px 0",textAlign:"center",fontSize:11,color:"var(--text-5)"}}>{t.noAnimeThisDay}</div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(130px, 1fr))",gap:12}}>
          {animes.map(a => {
            const dotColor = statusDot(myStatuses[a.mal_id]);
            const local = broadcastLocal(a);
            return (
              <button key={a.mal_id} onClick={()=>onOpenDetail(a)} style={{
                background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:12,padding:8,cursor:"pointer",textAlign:"left",transition:"all 0.15s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.07)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
                <div style={{position:"relative",marginBottom:6}}>
                  <img loading="lazy" decoding="async" src={a.image_url||a.large_image} alt="" style={{
                    width:"100%",aspectRatio:"2/3",objectFit:"cover",borderRadius:8,display:"block",
                    border:`2px solid ${dotColor||"transparent"}`,
                  }} onError={e=>{e.target.style.display="none";}}/>
                  {local?.time && (
                    <span title={t.jstTooltip(local.jstTime)} style={{position:"absolute",top:6,left:6,fontSize:9,fontWeight:800,
                      background:"rgba(0,0,0,0.7)",color:"#fff",padding:"2px 6px",borderRadius:6}}>
                      {local.time}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize:11,fontWeight:700,color:"var(--text-1)",lineHeight:1.3,
                  overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",
                }}>
                  {a.title_en||a.title}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginTop:3}}>
                  {a.score && <span style={{fontSize:9,color:"#fbbf24",fontWeight:700}}>★ {a.score}</span>}
                  {typeTag(a) && <TypeTag a={a} />}
                  {a.year && a.year < currentYear && (
                    <span style={{fontSize:8,color:"var(--text-6)",background:"rgba(255,255,255,0.06)",
                      padding:"1px 4px",borderRadius:3}}>{t.recurring}</span>
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

// Titres des animés que l'utilisateur a vus / terminés / commence : sert à reconnaître « la saison 2 d'une œuvre dont j'ai vu la saison 1 »
const seenTitleCache = new Map();
async function loadSeenTitles(ids) {
  const missing = ids.filter(id => !seenTitleCache.has(id));
  for(let i = 0; i < missing.length; i += 150) {
    const chunk = missing.slice(i, i + 150);
    const rows = await sb.query(`anime_cache?mal_id=in.(${chunk.join(",")})&select=mal_id,title,title_en`).catch(() => null);
    if(!rows) continue; // échec réseau : on réessaiera
    chunk.forEach(id => seenTitleCache.set(id, null));
    rows.forEach(r => seenTitleCache.set(r.mal_id, r));
  }
  return ids.map(id => seenTitleCache.get(id)).filter(Boolean);
}

export function AiringCalendar({ onOpenDetail, me, t }) {
  const [anime, setAnime]     = useState(airingCache || []);
  const [loading, setLoading] = useState(!airingCache);
  const [myOnly, setMyOnly]   = useState(false);
  const [platformFilters, setPlatformFilters] = useState(() => new Set());
  const [showPlatforms, setShowPlatforms] = useState(false);
  const [finished, setFinished] = useState(finishedCache || []);
  const todayIdx    = (new Date().getDay() + 6) % 7; // 0=Mon … 6=Sun
  const currentYear = new Date().getFullYear();
  const [view, setView]       = useState(readSavedView);
  const [dayIdx, setDayIdx]   = useState(todayIdx);
  const changeView = (v) => { setView(v); saveView(v); };

  const [seenRows, setSeenRows] = useState([]);
  useEffect(() => {
    const ids = [...new Set([
      ...(Array.isArray(me?.watched) ? me.watched.map(Number) : []),
      ...Object.entries(me?.statuses || {}).filter(([, st]) => st === "completed" || st === "watching").map(([id]) => Number(id)),
    ])].filter(Boolean);
    if(!ids.length) return;
    let cancelled = false;
    loadSeenTitles(ids).then(rows => { if(!cancelled) setSeenRows(rows); });
    return () => { cancelled = true; };
  }, [me?.watched, me?.statuses]);

  useEffect(() => {
    let cancelled = false;
    fetchFinishedAnime().then(rows => { if(!cancelled) setFinished(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Close the platform dropdown on any outside click
  useEffect(() => {
    if(!showPlatforms) return;
    const close = () => setShowPlatforms(false);
    const id = setTimeout(() => document.addEventListener("click", close), 0);
    return () => { clearTimeout(id); document.removeEventListener("click", close); };
  }, [showPlatforms]);

  useEffect(() => {
    if(airingCache) return;
    let cancelled = false;
    fetchAiringAnime()
      .then(rows => { if(!cancelled) setAnime(rows); })
      .catch(() => {})
      .finally(() => { if(!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if(loading) return <Spinner label={t.loading} />;

  // "My anime": en cours / en pause / à voir, ou nouvelle saison d'une œuvre déjà vue
  const myStatuses = me?.statuses || {};
  const myRatings  = me?.ratings  || {};
  const myIds = new Set(Object.keys(myStatuses).map(Number));
  const seenEarlier = (a) => seenRows.some(r => r.mal_id !== a.mal_id && sameFamily(a, r));

  function isMyAnime(a) {
    const status = myStatuses[a.mal_id];
    if(["watching","onhold","watchlist"].includes(status)) return true;
    if(myIds.has(a.mal_id)) return false; // already seen, same anime — skip
    return seenEarlier(a);
  }

  // Ce qu'on garde dans le calendrier (sauf si c'est dans MA liste / noté par moi : alors toujours visible) :
  //  · séries TV « classiques » : japonaises, avec une image, lancées il y a moins d'un an et demi OU bien notées (les longues séries type One Piece) ;
  //  · quelques ONA/OAV de la saison (type JoJo SBR) : japonais, récents, bien notés, hebdomadaires, max 6 ;
  //  · jamais : hentai/doujin, TV Short (< 15 min), ONA chinois en 3D & co, vieilles séries restées « en cours » sans intérêt.
  const acted = (a) => !!myStatuses[a.mal_id] || myRatings[a.mal_id]?.score != null;
  const recent = (a) => (a.year || 0) >= currentYear - 1;
  const japanese = (a) => !a.country || a.country === "JP";
  const hasImage = (a) => !!(a.image_url || a.large_image || a.images?.jpg?.image_url);
  const classicTv = (a) => japanese(a) && hasImage(a) && (recent(a) || (a.score || 0) >= 7);
  const seasonalSpecial = (a) => japanese(a) && hasImage(a) && recent(a) && (a.score || 0) >= 7.3;
  const topSpecials = new Set(
    [...anime, ...finished].filter(a => SPECIAL_TYPES.has(a.type) && !isTvShort(a) && seasonalSpecial(a))
      .sort((x, y) => (y.score || 0) - (x.score || 0)).slice(0, 6).map(a => a.mal_id)
  );
  const passesRules = (a) => {
    if(!isVisibleInCalendar(a, myStatuses)) return false;
    if(acted(a)) return true;
    if(isTvShort(a)) return false;
    if(SPECIAL_TYPES.has(a.type)) return topSpecials.has(a.mal_id) || (a.type === "ONA" && seenEarlier(a));
    if(a.type === "TV") return classicTv(a) || seenEarlier(a);
    return true;
  };
  const visibleAnime = anime.filter(passesRules);
  const finishedShown = finished.filter(passesRules).slice(0, 30);
  const displayed = visibleAnime.filter(a => (!myOnly || isMyAnime(a)) && matchesPlatforms(a, platformFilters));
  const filtersActive = platformFilters.size > 0;
  // Only offer platforms that at least one airing anime is actually on
  const availablePlatforms = PLATFORMS.filter(p => visibleAnime.some(a => platformIds(a).has(p.id)));
  const togglePlatform = (id) => setPlatformFilters(prev => {
    const next = new Set(prev);
    if(next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const filterBar = (
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",width:"100%"}}>
      <div style={{position:"relative"}}>
        <button onClick={()=>setShowPlatforms(p=>!p)} aria-expanded={showPlatforms} style={{
          display:"flex",alignItems:"center",gap:6,
          padding:"4px 12px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all 0.15s",
          background: platformFilters.size ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
          color: platformFilters.size ? "var(--text-1)" : "var(--text-4)",
          border: platformFilters.size ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.07)",
        }}>
          {t.platformsBtn}
          {platformFilters.size > 0 && (
            <span style={{background:"rgba(255,255,255,0.2)",color:"var(--text-1)",fontSize:9,padding:"1px 5px",borderRadius:8}}>{platformFilters.size}</span>
          )}
        </button>
        {showPlatforms && (
          <div onClick={e=>e.stopPropagation()} style={{
            position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:50,
            background:"var(--surface-1-strong)",border:"1px solid rgba(255,255,255,0.1)",
            borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",padding:8,minWidth:190,
          }}>
            <div style={{fontSize:9,fontWeight:700,color:"var(--text-5)",padding:"2px 6px 6px",textTransform:"uppercase",letterSpacing:1}}>
              {t.filterByPlatform}
            </div>
            {availablePlatforms.length === 0 && (
              <div style={{fontSize:10,color:"var(--text-5)",padding:"4px 6px"}}>{t.noPlatformData}</div>
            )}
            {availablePlatforms.map(p => {
              const checked = platformFilters.has(p.id);
              return (
                <button key={p.id} onClick={()=>togglePlatform(p.id)} style={{
                  display:"flex",alignItems:"center",gap:8,width:"100%",padding:"6px 8px",borderRadius:8,
                  background:"none",border:"none",cursor:"pointer",textAlign:"left",
                }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                  <div style={{width:14,height:14,borderRadius:3,flexShrink:0,
                    background: checked ? p.color : "rgba(255,255,255,0.08)",
                    border: checked ? "none" : "1px solid rgba(255,255,255,0.15)",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {checked && <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                      <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>}
                  </div>
                  <span style={{fontSize:10,fontWeight:600,color: checked ? p.color : "var(--text-3)"}}>{p.label}</span>
                </button>
              );
            })}
            {filtersActive && (
              <button onClick={()=>{ setPlatformFilters(new Set()); }} style={{
                width:"100%",marginTop:4,padding:"5px 8px",borderRadius:8,background:"none",border:"none",
                cursor:"pointer",fontSize:9,color:"var(--text-5)",textAlign:"center"}}>
                {t.resetFilters}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const finishedSection = finishedShown.length > 0 && (
    <div style={{marginTop:24}}>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 4px",marginBottom:6,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <span style={{fontSize:11}}>🎬</span>
        <span style={{fontSize:12,fontWeight:900,color:"var(--text-2)"}}>{t.finishedTitle}</span>
        <span style={{fontSize:9,color:"var(--text-5)",marginLeft:4}}>{t.finishedCount(finishedShown.length)}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))",gap:4}}>
        {finishedShown.map(a => (
          <button key={a.mal_id} onClick={()=>onOpenDetail(a)} style={{
            display:"flex",gap:7,alignItems:"center",background:"none",border:"none",cursor:"pointer",
            textAlign:"left",padding:4,borderRadius:8,transition:"background 0.12s",width:"100%",
          }}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="none";}}>
            <img loading="lazy" decoding="async" src={a.image_url||a.large_image} alt="" style={{
              width:32,height:44,objectFit:"cover",borderRadius:5,flexShrink:0,
              border:`${statusDot(myStatuses[a.mal_id]) ? "2px" : "1px"} solid ${statusDot(myStatuses[a.mal_id]) || "rgba(255,255,255,0.1)"}`,display:"block",
            }} onError={e=>{e.target.style.display="none";}}/>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--text-1)",overflow:"hidden",textOverflow:"ellipsis",
                display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",lineHeight:1.3,marginBottom:2}}>
                {a.title_en||a.title}
              </div>
              {a.score && <span style={{fontSize:8,color:"#fbbf24",fontWeight:700}}>★ {a.score}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
  const myCount   = visibleAnime.filter(isMyAnime).length;

  const byDay = {};
  DAYS_EN.forEach(d => { byDay[d] = []; });
  // Les animés sans jour de diffusion connu ne sont plus listés (pas de place dans un calendrier)
  displayed.forEach(a => {
    const local = broadcastLocal(a);
    if(local) byDay[DAYS_EN[local.dayIdx]].push(a);
  });
  DAYS_EN.forEach(d => byDay[d].sort(byLocalTime));

  // Judged on the unfiltered list, so a filter that empties the week keeps
  // the normal layout (and its filter bar) instead of the fallback grid.
  const hasDayData = visibleAnime.some(a => broadcastLocal(a));
  const totalWithDay = Object.values(byDay).reduce((s, arr) => s + arr.length, 0);

  // Fallback grid when no broadcast data
  if(!hasDayData) {
    return (
      <div>
        <div style={{marginBottom:12}}>{filterBar}</div>
        <div style={{marginBottom:12,fontSize:11,color:"var(--text-5)",textAlign:"center"}}>
          {t.noBroadcastData}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(110px, 1fr))",gap:10}}>
          {displayed.map(a => (
            <button key={a.mal_id} onClick={()=>onOpenDetail(a)} style={{
              background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:12,padding:8,cursor:"pointer",textAlign:"left",transition:"all 0.15s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.07)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
              <img loading="lazy" decoding="async" src={a.image_url||a.large_image} alt="" style={{
                width:"100%",aspectRatio:"2/3",objectFit:"cover",borderRadius:8,marginBottom:6,
                border:`2px solid ${statusDot(myStatuses[a.mal_id])||"transparent"}`,
              }} onError={e=>{e.target.style.display="none";}}/>
              <div style={{fontSize:9,fontWeight:700,color:"var(--text-1)",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {a.title_en||a.title}
              </div>
              {a.score && <div style={{fontSize:8,color:"#fbbf24",marginTop:2}}>★ {a.score}</div>}
            </button>
          ))}
        </div>
        {finishedSection}
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
          <span style={{fontWeight:700,color:"var(--text-2)"}}>{totalWithDay}</span> {t.scheduledWord(totalWithDay)}
          {filtersActive && <span style={{marginLeft:6,color:"#c084fc"}}>{t.filteredTag}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{fontSize:10,color:"var(--text-5)"}}>
            {t.seasonYear(currentYear)}
          </div>
          {/* Jour / Semaine toggle */}
          <div role="group" style={{display:"flex",padding:2,borderRadius:20,
            background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
            {[["day", t.viewDay], ["week", t.viewWeek]].map(([id, label]) => (
              <button key={id} onClick={()=>changeView(id)} aria-pressed={view===id} style={{
                padding:"4px 11px",borderRadius:16,fontSize:10,fontWeight:800,
                border:"none",cursor:"pointer",transition:"all 0.15s",
                background: view===id ? "rgba(124,58,237,0.3)" : "transparent",
                color: view===id ? "#c084fc" : "var(--text-4)",
              }}>{label}</button>
            ))}
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
            {t.myCalendar}
            {myCount > 0 && (
              <span style={{
                background:"rgba(124,58,237,0.3)",color:"#c084fc",
                fontSize:9,padding:"1px 5px",borderRadius:10,
              }}>{myCount}</span>
            )}
          </button>
        </div>
        {filterBar}
      </div>

      <div style={{fontSize:9,color:"var(--text-5)",margin:"-8px 0 12px 2px"}}>🕒 {t.localTimeNote}</div>

      {view === "day" && (
        <DayView byDay={byDay} dayIdx={dayIdx} setDayIdx={setDayIdx} todayIdx={todayIdx}
          myStatuses={myStatuses} currentYear={currentYear} onOpenDetail={onOpenDetail} t={t} />
      )}

      {/* 7-day grid */}
      {view === "week" && (
      <div style={{overflowX:"auto",paddingBottom:8}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7, minmax(120px, 1fr))",gap:6,minWidth:840}}>
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
                  {t.days[idx]}
                </div>
                <div style={{
                  display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:2,
                }}>
                  {isToday && (
                    <span style={{
                      fontSize:8,fontWeight:800,
                      background:"rgba(124,58,237,0.3)",color:"#c084fc",
                      padding:"1px 6px",borderRadius:4,letterSpacing:0.5,
                    }}>{t.today}</span>
                  )}
                  <span style={{
                    fontSize:9,color: animes.length > 0 ? "var(--text-4)" : "var(--text-6)",
                    marginLeft:"auto",
                  }}>
                    {animes.length > 0 ? t.dayAnimeCount(animes.length) : "—"}
                  </span>
                </div>
              </div>

              {/* Anime list */}
              <div style={{padding:6,display:"flex",flexDirection:"column",gap:4,minHeight:40}}>
                {animes.length === 0 ? (
                  <div style={{
                    padding:"12px 4px",textAlign:"center",
                    fontSize:18,opacity:0.08,
                  }}>·</div>
                ) : animes.map(a => {
                  const dotColor = statusDot(myStatuses[a.mal_id]);
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
                        <img loading="lazy" decoding="async" src={a.image_url||a.large_image} alt="" style={{
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
                          {broadcastLocal(a)?.time && (
                            <span title={t.jstTooltip(broadcastLocal(a).jstTime)} style={{fontSize:8,color:"var(--text-4)",fontWeight:700}}>
                              {broadcastLocal(a).time}
                            </span>
                          )}
                          {a.score && (
                            <span style={{fontSize:8,color:"#fbbf24",fontWeight:700}}>
                              ★ {a.score}
                            </span>
                          )}
                          {typeTag(a) && <TypeTag a={a} />}
                          {a.year && a.year < currentYear && (
                            <span style={{fontSize:8,color:"var(--text-6)",
                              background:"rgba(255,255,255,0.06)",
                              padding:"1px 4px",borderRadius:3}}>
                              {t.recurring}
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
      </div>
      )}

      {finishedSection}
    </div>
  );
}
