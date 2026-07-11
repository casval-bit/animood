import { useState, useEffect, useRef, createContext, useContext } from "react";

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
// Replace these two values with your own from supabase.com → Project Settings → API
const SUPABASE_URL    = "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";

const sb = {
  headers: { "Content-Type":"application/json", "apikey":SUPABASE_ANON, "Authorization":`Bearer ${SUPABASE_ANON}` },

  async query(path, opts={}) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: this.headers, ...opts });
    if(!r.ok) { const e = await r.text(); throw new Error(e); }
    if(r.status === 204) return null;
    return r.json();
  },

  // profiles
  async getProfile(username) {
    const rows = await this.query(`profiles?username=eq.${username}&limit=1`);
    return rows?.[0] || null;
  },
  async upsertProfile(data) {
    return this.query("profiles?on_conflict=username", {
      method:"POST",
      headers:{...this.headers,"Prefer":"resolution=merge-duplicates"},
      body: JSON.stringify(data),
    });
  },

  // mood_pts
  async getMoodPts(mal_id) {
    const rows = await this.query(`mood_pts?mal_id=eq.${mal_id}&limit=1`);
    return rows?.[0] || null;
  },
  // mood_pts_v2 — the unified 8-mood table
  async getMoodPts(mal_id) {
    try {
      const rows = await this.query(`mood_pts_v2?mal_id=eq.${mal_id}&limit=1`);
      if(rows?.[0]) return rows[0];
    } catch {}
    return null;
  },
  async upsertMoodPts(mal_id, pts, totalVotes) {
    return this.query("mood_pts_v2?on_conflict=mal_id", {
      method:"POST",
      headers:{...this.headers,"Prefer":"resolution=merge-duplicates"},
      body: JSON.stringify({ mal_id, ...pts }),
    });
  },
  async upsertMoodPtsAvg(mal_id, pts) {
    return this.query("mood_pts_v2?on_conflict=mal_id", {
      method:"POST",
      headers:{...this.headers,"Prefer":"resolution=merge-duplicates"},
      body: JSON.stringify({ mal_id, ...pts }),
    });
  },

  // anime_cache
  async getAnimeFromCache(mal_id) {
    const rows = await this.query(`anime_cache?mal_id=eq.${mal_id}&limit=1`);
    return rows?.[0] || null;
  },
  async searchAnimeCache(q, limit=24) {
    // Full-text search on title
    const enc = encodeURIComponent(q);
    return this.query(`anime_cache?title=ilike.*${enc}*&order=score.desc.nullslast&limit=${limit}`);
  },
  async getAnimeCacheByIds(ids) {
    if(!ids.length) return [];
    return this.query(`anime_cache?mal_id=in.(${ids.join(",")})&limit=${ids.length}`);
  },
  async upsertAnimeCache(row) {
    return this.query("anime_cache?on_conflict=mal_id", {
      method:"POST",
      headers:{...this.headers,"Prefer":"resolution=merge-duplicates"},
      body: JSON.stringify(row),
    });
  },
  async getUserVote(username, mal_id) {
    const rows = await this.query(`user_votes?username=eq.${username}&mal_id=eq.${mal_id}&limit=1`);
    return rows?.[0] || null;
  },
  async upsertUserVote(username, mal_id, moods, ptsAdded) {
    return this.query("user_votes?on_conflict=username,mal_id", {
      method:"POST",
      headers:{...this.headers,"Prefer":"resolution=merge-duplicates"},
      body: JSON.stringify({ username, mal_id, moods, pts_added: ptsAdded, voted_at: new Date().toISOString() }),
    });
  },
};

// ─── AUTH CONFIG ──────────────────────────────────────────────────────────────
const ACCOUNTS = {
  brice: { password: "123456789", name: "Brice", avatar: "🎮" },
};

const AUTH_KEY = "animood_session";

function loadSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
function saveSession(s)  { try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch {} }
function clearSession()  { try { localStorage.removeItem(AUTH_KEY); } catch {} }

// Profile: Supabase primary, localStorage fallback
async function loadProfile(username) {
  try {
    const remote = await sb.getProfile(username);
    if(remote) {
      localStorage.setItem(`animood_profile_${username}`, JSON.stringify(remote));
      return remote;
    }
  } catch {}
  try { return JSON.parse(localStorage.getItem(`animood_profile_${username}`)); } catch { return null; }
}

async function saveProfile(username, data) {
  // Always save locally first (instant)
  try { localStorage.setItem(`animood_profile_${username}`, JSON.stringify(data)); } catch {}
  // Then sync to Supabase in background
  try { await sb.upsertProfile({ username, ...data, updated_at: new Date().toISOString() }); } catch(e) { console.warn("Profile sync failed:", e); }
}

// ─── JIKAN CLIENT — global queue, retry on 429 ────────────────────────────────
const JIKAN_BASE = "https://api.jikan.moe/v4";
const apiCache = {};
const pendingRequests = {};

// Global serial queue — never more than 1 request in flight at a time
let queueRunning = false;
const requestQueue = [];

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    if (!queueRunning) runQueue();
  });
}

async function runQueue() {
  if (queueRunning || requestQueue.length === 0) return;
  queueRunning = true;
  while (requestQueue.length > 0) {
    const { fn, resolve, reject } = requestQueue.shift();
    try { resolve(await fn()); }
    catch(e) { reject(e); }
    // 370ms between requests = ~2.7 req/sec, safely under Jikan's 3/sec limit
    if (requestQueue.length > 0) await new Promise(r => setTimeout(r, 370));
  }
  queueRunning = false;
}

async function jikanFetch(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url);
    if (r.status === 429) {
      // Back off: 2s, 4s, 8s
      await new Promise(res => setTimeout(res, 2000 * Math.pow(2, attempt)));
      continue;
    }
    if (!r.ok) throw new Error(`Jikan ${r.status}`);
    return r.json();
  }
  throw new Error("Jikan 429 — trop de requêtes, réessaie dans quelques secondes");
}

async function jikanCall(key, url) {
  if (apiCache[key]) return apiCache[key];
  if (pendingRequests[key]) return pendingRequests[key];

  const promise = enqueue(() => jikanFetch(url))
    .then(json => { apiCache[key] = json; delete pendingRequests[key]; return json; })
    .catch(e => { delete pendingRequests[key]; throw e; });

  pendingRequests[key] = promise;
  return promise;
}

// ─── ANIME DATA — Supabase cache first, Jikan fallback ────────────────────────
async function getAnimeData(mal_id) {
  const key = `anime-${mal_id}`;
  if (apiCache[key]) return apiCache[key];

  // 1. Supabase cache (fast, no rate limit)
  try {
    const row = await sb.getAnimeFromCache(mal_id);
    if (row) {
      // Reshape to match Jikan response format
      const data = supabaseRowToAnime(row);
      apiCache[key] = { data };
      return { data };
    }
  } catch {}

  // 2. Fallback to Jikan (and save to Supabase in background)
  const res = await jikanCall(key, `${JIKAN_BASE}/anime/${mal_id}/full`);
  if (res?.data) {
    sb.upsertAnimeCache(animeToSupabaseRow(res.data)).catch(()=>{});
  }
  return res;
}

// Convert Supabase row → Jikan-like object
function supabaseRowToAnime(row) {
  return {
    mal_id:          row.mal_id,
    title:           row.title,
    title_english:   row.title_en,
    title_japanese:  row.title_jp,
    synopsis:        row.synopsis,
    score:           row.score,
    scored_by:       row.scored_by,
    rank:            row.rank,
    popularity:      row.popularity,
    year:            row.year,
    episodes:        row.episodes,
    duration:        row.duration,
    type:            row.type,
    status:          row.status,
    source:          row.source,
    rating:          row.rating,
    images:          { jpg: { image_url: row.image_url, large_image_url: row.large_image } },
    trailer:         row.trailer_url ? { url: row.trailer_url } : null,
    genres:          row.genres || [],
    themes:          row.themes || [],
    demographics:    row.demographics || [],
    studios:         row.studios || [],
    producers:       row.producers || [],
    streaming:       row.streaming || [],
    staff:           row.staff || [],
    characters:      row.characters || [],
    _fromCache:      true,
  };
}

// Convert Jikan anime → Supabase row
function animeToSupabaseRow(a) {
  return {
    mal_id:      a.mal_id,
    title:       a.title,
    title_en:    a.title_english,
    title_jp:    a.title_japanese,
    synopsis:    a.synopsis,
    score:       a.score,
    scored_by:   a.scored_by,
    rank:        a.rank,
    popularity:  a.popularity,
    year:        a.year || a.aired?.prop?.from?.year,
    episodes:    a.episodes,
    duration:    a.duration,
    type:        a.type,
    status:      a.status,
    source:      a.source,
    rating:      a.rating,
    image_url:   a.images?.jpg?.image_url,
    large_image: a.images?.jpg?.large_image_url,
    trailer_url: a.trailer?.url,
    genres:      a.genres || [],
    themes:      a.themes || [],
    demographics:a.demographics || [],
    studios:     a.studios || [],
    producers:   a.producers || [],
    streaming:   a.streaming || [],
  };
}

const jikan = {
  searchAnime: async (params) => {
    // Text search: try Supabase first if no special filters
    if (params.q && !params.genres && !params.page) {
      try {
        const rows = await sb.searchAnimeCache(params.q, params.limit || 24);
        if (rows?.length >= 3) return { data: rows.map(supabaseRowToAnime) };
      } catch {}
    }
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => v != null && qs.set(k, String(v)));
    return jikanCall(`search-${qs}`, `${JIKAN_BASE}/anime?${qs}`);
  },
  getAnime: (id) => getAnimeData(id),
  getStaff: (id) => {
    const cached = apiCache[`anime-${id}`];
    if (cached?.data?._fromCache && cached.data.staff?.length)
      return Promise.resolve({ data: cached.data.staff });
    return jikanCall(`staff-${id}`, `${JIKAN_BASE}/anime/${id}/staff`);
  },
  getCharacters: (id) => {
    const cached = apiCache[`anime-${id}`];
    if (cached?.data?._fromCache && cached.data.characters?.length)
      return Promise.resolve({ data: cached.data.characters });
    return jikanCall(`chars-${id}`, `${JIKAN_BASE}/anime/${id}/characters`);
  },
  getPerson:        (id) => jikanCall(`person-${id}`,  `${JIKAN_BASE}/people/${id}/full`),
  getPersonVoices:  (id) => jikanCall(`pva-${id}`,     `${JIKAN_BASE}/people/${id}/voices`),
  getPersonAnime:   (id) => jikanCall(`panim-${id}`,   `${JIKAN_BASE}/people/${id}/anime`),
  getProducerAnime: (id) => jikanCall(`prod-${id}`,    `${JIKAN_BASE}/anime?producers=${id}&order_by=score&sort=desc&limit=24`),
};
function prefetchAnimes(ids) {
  ids.slice(0, 5).forEach((id, i) => {
    setTimeout(() => {
      if (!apiCache[`anime-${id}`]) jikan.getAnime(id).catch(()=>{});
    }, i * 400);
  });
}

// Fallback: derive rough percentages from MAL genres
function genresToPct(genres) {
  const n = genres.map(g=>(g.name||g).toLowerCase());
  // Start with small base values on all moods so octagon is never empty
  const out = {feelgood:3,emotional:3,hype:3,dark:3,chill:3,twisted:3,comedy:3,wholesome:3,epic:3};
  if(n.some(g=>["action","fighting","martial arts"].includes(g))) { out.hype+=32; out.epic+=12; }
  if(n.some(g=>["thriller","mystery"].includes(g)))               { out.twisted+=30; out.dark+=8; }
  if(n.some(g=>["psychological"].includes(g)))                    { out.twisted+=25; out.dark+=12; }
  if(n.some(g=>["horror"].includes(g)))                           { out.dark+=35; out.twisted+=5; }
  if(n.some(g=>["drama"].includes(g)))                            { out.emotional+=22; out.wholesome+=5; }
  if(n.some(g=>["comedy","parody"].includes(g)))                  { out.comedy+=30; out.feelgood+=12; }
  if(n.some(g=>["slice of life","iyashikei"].includes(g)))        { out.chill+=30; out.wholesome+=12; }
  if(n.some(g=>["romance"].includes(g)))                          { out.wholesome+=25; out.emotional+=8; }
  if(n.some(g=>["adventure","fantasy"].includes(g)))              { out.epic+=22; out.hype+=5; }
  if(n.some(g=>["sci-fi","mecha","space"].includes(g)))           { out.epic+=18; out.twisted+=8; }
  if(n.some(g=>["sports"].includes(g)))                           { out.feelgood+=25; out.hype+=18; }
  const total = Object.values(out).reduce((a,b)=>a+b,0)||100;
  Object.keys(out).forEach(k=>{ out[k]=Math.round(out[k]*100/total); });
  return out;
}

async function claudeTagPct(anime) {
  const prompt = `Tu es un expert en anime. Analyse "${anime.title}" et distribue 100 points entre ces 9 moods.

RÈGLE IMPORTANTE: Tu DOIS donner une valeur > 0 à AU MOINS 5 moods différents. Un animé a toujours plusieurs dimensions émotionnelles même si certaines sont secondaires. Ne mets jamais 0 sauf si le mood est vraiment ABSENT de l'animé.

Informations:
- Genres MAL: ${(anime.genres||[]).map(g=>g.name||g).join(", ")}
- Synopsis: ${(anime.synopsis||"Pas de synopsis").slice(0,400)}
- Score MAL: ${anime.score||"?"} | Année: ${anime.year||anime.aired?.prop?.from?.year||"?"}

Exemple pour Kaguya-sama (romance+comedy):
{"feelgood":8,"emotional":15,"hype":3,"dark":2,"chill":10,"twisted":12,"comedy":35,"wholesome":10,"epic":5}
→ comedy dominant, twisted présent (mind games), emotional secondaire, mais TOUS > 0 sauf dark et hype très faibles

Moods:
- feelgood: fun positif, énergie légère, satisfaction
- emotional: larmes, drama, feels profonds
- hype: action, adrénaline, combat, tension
- dark: sombre, mature, violent, glauque, désespoir
- chill: contemplatif, calme, apaisant, slice-of-life
- twisted: psychologique, mind games, plot twists, suspense
- comedy: humour, gags, situations comiques, rires
- wholesome: réconfortant, doux, amour sain, mignon
- epic: grande aventure, fresque, légendaire, grandiose

Total = 100 exactement. JSON uniquement:`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        model:"claude-sonnet-4-20250514", max_tokens:150,
        tools:[{ type:"web_search_20250305", name:"web_search" }],
        messages:[{role:"user",content:prompt}],
      }),
    });
    const data = await res.json();
    const text = (data.content||[])
      .filter(b=>b.type==="text")
      .map(b=>b.text).join("") || "{}";
    const pct = JSON.parse(text.replace(/```json|```/g,"").trim());
    const KEYS = ["feelgood","emotional","hype","dark","chill","twisted","comedy","wholesome","epic"];
    const valid = {};
    KEYS.forEach(k => { valid[k] = Math.max(0, parseInt(pct[k]||0)); });
    // Ensure at least 5 moods have value > 0 — distribute remainder if needed
    const nonZero = KEYS.filter(k=>valid[k]>0).length;
    if(nonZero < 5) {
      const zeroes = KEYS.filter(k=>valid[k]===0);
      zeroes.slice(0, 5-nonZero).forEach(k=>{ valid[k]=2; });
    }
    const total = Object.values(valid).reduce((a,b)=>a+b,0)||100;
    KEYS.forEach(k => { valid[k] = Math.round(valid[k]*100/total); });
    return valid;
  } catch { return genresToPct(anime.genres||[]); }
}

// ─── POINTS STORE — Supabase primary, localStorage cache ─────────────────────
const PTS_CACHE_KEY = "animood_mood_pts_v2";

function loadPtsCache()  { try { return JSON.parse(localStorage.getItem(PTS_CACHE_KEY)||"{}"); } catch { return {}; } }
function savePtsCache(s) { try { localStorage.setItem(PTS_CACHE_KEY, JSON.stringify(s)); } catch {} }

let ptsStore = loadPtsCache();

const MOOD_KEYS = ["emotional","happy","twisted","chill","in_love","hype","dark","thrills"];

function pctToPoints(pct) {
  const pts = {};
  MOOD_KEYS.forEach(k => { pts[k] = Math.round(pct[k] || 0); });
  return pts;
}

// Add user mood votes — idempotent, syncs to Supabase
async function addUserVote(username, mal_id, newMoods, currentPts) {
  // Reverse previous local vote
  const prevKey = `${mal_id}_vote`;
  const prev = ptsStore[prevKey] || { moods:[], pts:{} };
  const base = { ...currentPts };
  Object.entries(prev.pts).forEach(([k,v]) => { base[k] = Math.max(0, (base[k]||0) - v); });

  // Apply new vote
  const pointsPerMood = newMoods.length === 1 ? 6 : newMoods.length === 2 ? 3 : 2;
  const addedPts = {};
  newMoods.forEach(m => { addedPts[m] = pointsPerMood; base[m] = (base[m]||0) + pointsPerMood; });

  // Count votes (approximate from total pts)
  const totalVotes = (ptsStore[`${mal_id}_votecount`] || 0) + (prev.moods.length === 0 ? 1 : 0);

  // Save locally
  ptsStore[mal_id]    = base;
  ptsStore[prevKey]   = { moods: newMoods, pts: addedPts };
  ptsStore[`${mal_id}_votecount`] = totalVotes;
  savePtsCache(ptsStore);

  // Sync to Supabase in background
  try {
    await Promise.all([
      sb.upsertMoodPts(mal_id, base, totalVotes),
      sb.upsertUserVote(username, mal_id, newMoods, addedPts),
    ]);
  } catch(e) { console.warn("Vote sync failed:", e); }

  return base;
}

async function getPtsForAnime(anime) {
  const id = anime.mal_id;

  // 1. Local cache hit — instant
  if(ptsStore[id]) return ptsStore[id];

  // 2. Supabase mood_pts_v2 (unified 8-mood table)
  try {
    const row = await sb.getMoodPts(id);
    if(row) {
      const pts = {};
      MOOD_KEYS.forEach(k => { pts[k] = row[k] || 0; });
      ptsStore[id] = pts;
      savePtsCache(ptsStore);
      return pts;
    }
  } catch {}

  // 3. Fallback: genre-based approximation
  const pts = genreFallbackV2(anime);
  ptsStore[id] = pts;
  savePtsCache(ptsStore);
  return pts;
}

// Genre fallback for v2 8 moods
function genreFallbackV2(anime) {
  const n = (anime.genres||[]).map(g=>(g.name||g).toLowerCase());
  const out = {emotional:5,happy:5,hype:5,dark:5,chill:5,twisted:5,in_love:5,thrills:3};
  if(n.some(g=>["action","fighting","martial arts"].includes(g)))  {out.hype+=25;}
  if(n.some(g=>["thriller","mystery"].includes(g)))                {out.twisted+=23;out.thrills+=8;}
  if(n.some(g=>["psychological"].includes(g)))                     {out.twisted+=20;out.thrills+=6;}
  if(n.some(g=>["horror"].includes(g)))                            {out.dark+=28;out.thrills+=10;}
  if(n.some(g=>["drama"].includes(g)))                             {out.emotional+=18;}
  if(n.some(g=>["comedy","parody"].includes(g)))                   {out.happy+=25;}
  if(n.some(g=>["slice of life","iyashikei"].includes(g)))         {out.chill+=23;}
  if(n.some(g=>["romance"].includes(g)))                           {out.in_love+=22;out.emotional+=5;}
  if(n.some(g=>["adventure","fantasy"].includes(g)))               {out.hype+=10;out.thrills+=4;}
  if(n.some(g=>["sports"].includes(g)))                            {out.happy+=15;out.hype+=10;out.thrills+=5;}
  // normalize everything except thrills to ~100
  const exceptThrills = {...out}; delete exceptThrills.thrills;
  const total = Object.values(exceptThrills).reduce((a,b)=>a+b,0)||100;
  Object.keys(exceptThrills).forEach(k=>{out[k]=Math.round(out[k]*100/total);});
  out.thrills = Math.min(33, out.thrills);
  return out;
}

// Get mood tags: moods with ≥17% of total pts, max 3 (highest first)
// thrills uses 0-33 scale so normalize before comparing
function getMoodTags(pts) {
  if(!pts) return [];
  const normalized = {...pts};
  if(normalized.thrills !== undefined) {
    normalized.thrills = Math.round((normalized.thrills / 33) * 100);
  }
  const total = Object.values(normalized).reduce((a,b)=>a+b, 0);
  if(!total) return [];
  return Object.entries(normalized)
    .map(([k,v]) => [k, (v/total)*100])
    .filter(([,pct]) => pct >= 17)
    .sort((a,b) => b[1]-a[1])
    .slice(0,3)
    .map(([k]) => k);
}

// For display: pct of total per mood (thrills normalized to 0-100 first)
function ptsToPct(pts) {
  const normalized = {...(pts||{})};
  if(normalized.thrills !== undefined) {
    normalized.thrills = Math.round((normalized.thrills / 33) * 100);
  }
  const total = Object.values(normalized).reduce((a,b)=>a+b, 0) || 1;
  const out = {};
  Object.entries(normalized).forEach(([k,v]) => { out[k] = Math.round(v/total*100); });
  return out;
}

// Top N moods by pts
function topMoods(pts, n=3) {
  const normalized = {...(pts||{})};
  if(normalized.thrills !== undefined) {
    normalized.thrills = Math.round((normalized.thrills / 33) * 100);
  }
  return Object.entries(normalized)
    .filter(([,v])=>v>0)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,n);
}

// ─── OCTAGON COMPONENT (8 moods) ─────────────────────────────────────────────
function MoodOctagon({pts}) {
  const KEYS = ["emotional","happy","hype","dark","chill","twisted","in_love","thrills"];
  const size = 300, center = 150, levels = [25,50,75,100];

  const MOOD_META = {
    emotional:{emoji:"💔",color:"#A78BFA"},
    happy:    {emoji:"✨",color:"#FFD93D"},
    hype:     {emoji:"⚡",color:"#F97316"},
    dark:     {emoji:"🩸",color:"#EF4444"},
    chill:    {emoji:"🌿",color:"#34D399"},
    twisted:  {emoji:"🌀",color:"#06B6D4"},
    in_love:  {emoji:"🌸",color:"#F9A8D4"},
    thrills:  {emoji:"🎢",color:"#FB923C"},
  };

  // For thrills (0-33 scale) normalize to 0-100 for display only
  const displayPts = {...(pts||{})};
  if(displayPts.thrills !== undefined) {
    displayPts.thrills = Math.round((displayPts.thrills / 33) * 100);
  }

  // Find max value for scaling (use 100 as reference)
  const maxRef = 100;

  const ptsList = KEYS.map((k,i) => {
    const angle = (Math.PI*2*i/KEYS.length) - Math.PI/2;
    const maxR  = 108;  // bigger colored area
    const v     = Math.min(displayPts[k] || 0, 100);
    const r     = (v/maxRef)*maxR;
    return {
      key:k,
      rawPts: pts?.[k] || 0,
      x:  center + Math.cos(angle)*r,
      y:  center + Math.sin(angle)*r,
      lx: center + Math.cos(angle)*(maxR+30),
      ly: center + Math.sin(angle)*(maxR+30),
      meta: MOOD_META[k] || {emoji:"?",color:"#818cf8"},
    };
  });

  const gridMaxR = 108;
  const polygon  = ptsList.map(p=>`${p.x},${p.y}`).join(" ");
  const dominant = Object.entries(pts||{}).filter(([k])=>k!=="thrills").sort((a,b)=>b[1]-a[1])[0]?.[0] || "hype";
  const fillColor = MOOD_META[dominant]?.color || "#818cf8";

  return (
    <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"16px",border:"1px solid rgba(255,255,255,0.08)",padding:"14px",marginBottom:"14px"}}>
      <div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"4px",textAlign:"center"}}>
        Profil émotionnel
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} style={{width:"100%",maxWidth:"300px",display:"block",margin:"0 auto"}}>
        {/* Grid */}
        {levels.map(lvl => {
          const gPts = KEYS.map((_,i) => {
            const a=(Math.PI*2*i/KEYS.length)-Math.PI/2;
            return `${center+Math.cos(a)*(lvl/100)*gridMaxR},${center+Math.sin(a)*(lvl/100)*gridMaxR}`;
          }).join(" ");
          return <polygon key={lvl} points={gPts} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>;
        })}
        {/* Axes */}
        {KEYS.map((_,i) => {
          const a=(Math.PI*2*i/KEYS.length)-Math.PI/2;
          return <line key={i} x1={center} y1={center} x2={center+Math.cos(a)*gridMaxR} y2={center+Math.sin(a)*gridMaxR} stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>;
        })}
        {/* Shape */}
        <polygon points={polygon} fill={`${fillColor}28`} stroke={fillColor} strokeWidth="2.5" strokeLinejoin="round"/>
        {/* Emoji labels only */}
        {ptsList.map(p=>(
          <g key={p.key}>
            <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle" fontSize="16">{p.meta.emoji}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── MOOD → GENRE MAP ─────────────────────────────────────────────────────────
const MOOD_TO_GENRES = {
  hype:     ["1,17,31"],
  dark:     ["14,37"],
  twisted:  ["7,40,38"],
  emotional:["8,22"],
  chill:    ["36,46"],
  in_love:  ["22,36"],
  happy:    ["4,30"],
  thrills:  ["14,7,37"],
};

// ─── XML PARSER — imports all statuses ───────────────────────────────────────
const STATUS_MAP = {
  "Completed":    "completed",
  "Watching":     "watching",
  "Plan to Watch":"watchlist",
  "Dropped":      "dropped",
  "On-Hold":      "onhold",
};
const STATUS_COLORS = {
  completed: {border:"#1e3a5f", bg:"rgba(30,58,95,0.25)", label:"Complété",   dot:"#3b82f6"},
  watching:  {border:"#14532d", bg:"rgba(20,83,45,0.25)",  label:"En cours",   dot:"#22c55e"},
  watchlist: {border:"#374151", bg:"rgba(55,65,81,0.2)",   label:"À voir",     dot:"#9ca3af"},
  dropped:   {border:"#7f1d1d", bg:"rgba(127,29,29,0.25)", label:"Abandonné",  dot:"#ef4444"},
  onhold:    {border:"#78350f", bg:"rgba(120,53,15,0.25)", label:"En pause",   dot:"#f59e0b"},
};

function parseMALXml(xmlString) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xmlString, "text/xml");
  const entries = doc.querySelectorAll("anime");
  const statuses = {}, ratings = {};

  entries.forEach(entry => {
    const rawStatus = entry.querySelector("my_status")?.textContent;
    const id        = parseInt(entry.querySelector("series_animedb_id")?.textContent);
    const score     = parseInt(entry.querySelector("my_score")?.textContent || "0");
    if(!id || isNaN(id) || !rawStatus) return;
    const status = STATUS_MAP[rawStatus];
    if(!status) return;
    statuses[id] = status;
    if(score > 0) ratings[id] = { score, moods:[] };
  });

  // watched = all that aren't just watchlist
  const watched = Object.entries(statuses)
    .filter(([,s]) => s !== "watchlist")
    .map(([id]) => parseInt(id));

  return { watched, ratings, statuses };
}

// ─── DEFAULT PROFILE ──────────────────────────────────────────────────────────
const DEFAULT_PROFILE = {
  id:"brice", name:"Brice", avatar:"🎮",
  watched:[5114,199,16498,1535,9253,38000,11061,32281,32935,28851,6594,40748,45576],
  statuses:{
    5114:"completed",199:"completed",16498:"completed",1535:"completed",
    9253:"completed",38000:"completed",11061:"completed",32281:"completed",
    32935:"completed",28851:"completed",6594:"completed",40748:"completed",45576:"completed",
  },
  ratings:{
    5114:{score:10,moods:["epic","emotional"]}, 199:{score:8,moods:["hype","comedy"]},
    16498:{score:9,moods:["dark","epic"]},       1535:{score:9,moods:["dark","twisted"]},
    9253:{score:10,moods:["twisted","dark"]},    38000:{score:8,moods:["hype","dark"]},
    11061:{score:10,moods:["hype","epic"]},      32281:{score:8,moods:["comedy","feelgood"]},
    32935:{score:9,moods:["emotional","wholesome"]}, 28851:{score:8,moods:["emotional"]},
    6594:{score:7,moods:["chill","wholesome"]},  40748:{score:7,moods:["comedy","wholesome"]},
    45576:{score:8,moods:["dark","hype"]},
  },
  favorites:[null,null,null,null,null], // 5 slots, null = empty
  hiddenCompleted: [], // IDs hidden from "derniers complétés"
  posts: [], // future Feed/Forum posts
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MOOD_KEYS_V2 = ["emotional","happy","twisted","chill","in_love","hype","dark","thrills"];

const MOODS = [
  {id:"emotional", label:"Emotional",  emoji:"💔", color:"#A78BFA"},
  {id:"happy",     label:"Happy",      emoji:"✨", color:"#FFD93D"},
  {id:"hype",      label:"Hype",       emoji:"⚡", color:"#F97316"},
  {id:"dark",      label:"Dark",       emoji:"🩸", color:"#EF4444"},
  {id:"chill",     label:"Chill",      emoji:"🌿", color:"#34D399"},
  {id:"twisted",   label:"Twisted",    emoji:"🌀", color:"#06B6D4"},
  {id:"in_love",   label:"In Love",    emoji:"🌸", color:"#F9A8D4"},
  {id:"thrills",   label:"Thrills",    emoji:"🎢", color:"#FB923C"},
];
const DURATIONS  = [{id:"all",label:"Tout",emoji:"🔀"},{id:"short",label:"Court",emoji:"⚡"},{id:"medium",label:"Moyen",emoji:"📺"},{id:"long",label:"Long",emoji:"📚"}];
const MEDIA_TYPES= [{id:"all",label:"Tout",emoji:"🔀"},{id:"TV",label:"Animé",emoji:"📺"},{id:"Movie",label:"Film",emoji:"🎬"},{id:"OVA",label:"OAV",emoji:"💿"}];
const STREAMING_COLORS = {"Netflix":"#E50914","Crunchyroll":"#F47521","ADN":"#00AEEF","Hidive":"#00BCD4","Amazon Prime Video":"#00A8E0","Funimation":"#410099"};

// ─── CONTEXT ──────────────────────────────────────────────────────────────────
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);
const getMoodObj = id => MOODS.find(m=>m.id===id);

// ─── STUDIO → COUNTRY MAPPING ────────────────────────────────────────────────
const CN_STUDIOS = new Set([
  // Streaming/production platforms
  "bilibili","tencent video","iqiyi","youku","mango tv","b.cmay pictures",
  "beijing enlight pictures","nice boat animation","haoliners animation league",
  "coloroom pictures","motion magic","eastman animation","samsara animation studio",
  "tms entertainment china","dragonar academy","aiyan animation","sirius animation",
  "sparkly key animation studio","Wanhao Tianyi","Foch Films","djinn power",
  "liden films beijing","wawayu animation","dongman etv",
  "yuewen animation & comics","comic wind","fanworks","g.cmay pictures & animation",
  "emon animation company","pb animation co. ltd","ruo hong culture",
  "tencent penguin pictures","beijing photon sky",
]);

const KR_STUDIOS = new Set([
  "dr movie","dong woo animation","studio mir","iconix","daewon media",
  "sunwoo entertainment","tmw media","a. real film","digital emation",
  "crunchyroll korea","madhouse korea","paperplane production",
  "wb21","production ig korea","samji animation","janim",
]);

// Detect country from studios + producers arrays
function detectCountry(studios = [], producers = []) {
  const all = [...studios, ...producers]
    .map(s => (s.name || s || "").toLowerCase().trim());

  // Check CN
  if (all.some(n => [...CN_STUDIOS].some(cn => n.includes(cn)))) return "CN";
  // Check KR
  if (all.some(n => [...KR_STUDIOS].some(kr => n.includes(kr)))) return "KR";
  // Default JP
  return "JP";
}

async function fetchMoodboardCandidates(selectedMoods, duration, mediaTypes, countries, me) {
  const countryFilter = countries.includes("all") ? null : countries;
  const userScores    = Object.values(me.ratings).map(r=>r.score);
  const avgScore      = userScores.length ? userScores.reduce((a,b)=>a+b,0)/userScores.length : 8;
  const isNiche       = avgScore >= 8.5;

  const baseParams = {
    order_by: "score", sort: "desc",
    limit: 25, min_score: isNiche ? 5.5 : 6.5,
    sfw: false,
  };
  if(!mediaTypes.includes("all")) baseParams.type = mediaTypes[0];

  const allResults = new Map();
  const pagesToFetch = isNiche ? [1,2,3] : [1,2];
  const perPage = 50;

  // ── Primary source: Supabase anime_cache ──────────────────────────────────
  // Filter by country via studios/producers directly in DB
  try {
    let url = `anime_cache?select=mal_id,title,title_en,synopsis,score,year,episodes,type,source,image_url,large_image,genres,studios,producers,demographics&order=score.desc.nullslast&limit=${perPage * pagesToFetch.length}`;

    // Country filter via studio/producer names in Supabase
    if(countryFilter && !countryFilter.includes("JP") && !countryFilter.includes("all")) {
      const patterns = [];
      if(countryFilter.includes("CN")) [...CN_STUDIOS].slice(0,6).forEach(s=>patterns.push(s));
      if(countryFilter.includes("KR")) [...KR_STUDIOS].slice(0,6).forEach(s=>patterns.push(s));

      // Use Supabase OR filter on studios/producers jsonb
      // Fetch broader set and filter client-side (jsonb contains is exact match)
      const rows = await sb.query(url);
      if(rows?.length) {
        rows.forEach(row => {
          const country = detectCountry(row.studios||[], row.producers||[]);
          if(countryFilter.includes(country)) {
            allResults.set(row.mal_id, supabaseRowToAnime(row));
          }
        });
        // If not enough CN/KR results, fetch more pages
        if(allResults.size < 10) {
          const rows2 = await sb.query(url.replace(`limit=${perPage * pagesToFetch.length}`, `limit=200&offset=${perPage * pagesToFetch.length}`));
          if(rows2?.length) {
            rows2.forEach(row => {
              const country = detectCountry(row.studios||[], row.producers||[]);
              if(countryFilter.includes(country)) {
                allResults.set(row.mal_id, supabaseRowToAnime(row));
              }
            });
          }
        }
      }
    } else {
      // JP or all: fetch top scored anime from Supabase
      for(const page of pagesToFetch) {
        const offset = (page-1) * perPage;
        const rows = await sb.query(`anime_cache?select=mal_id,title,title_en,synopsis,score,year,episodes,type,source,image_url,large_image,genres,studios,producers&order=score.desc.nullslast&limit=${perPage}&offset=${offset}`);
        if(rows?.length) rows.forEach(row => {
          if(!allResults.has(row.mal_id)) allResults.set(row.mal_id, supabaseRowToAnime(row));
        });
      }    }
  } catch(e) {
    console.error("Supabase fetch failed, falling back to Jikan:", e);
    // ── Fallback: Jikan if Supabase unavailable ────────────────────────────
    for(const page of pagesToFetch) {
      try {
        const data = await jikan.searchAnime({...baseParams, page});
        (data.data||[]).forEach(a => { if(!allResults.has(a.mal_id)) allResults.set(a.mal_id, a); });
      } catch(e2){ console.error(e2); }
    }
  }


  let candidates = [...allResults.values()].filter(a => {
    // Exclude watched AND watching
    const status = (me.statuses||{})[a.mal_id];
    if(me.watched.includes(a.mal_id)) return false;
    if(status === "watching" || status === "onhold") return false;
    // Exclude specials, music videos, promos
    if(["Special","Music","CM","PV"].includes(a.type)) return false;
    return true;
  });

  // Country filter — JP vs Autres based on studio names
  if(countryFilter) {
    const filtered = candidates.filter(a => {
      const country = detectCountry(a.studios||[], a.producers||[]);
      if(countryFilter.includes("JP") && country === "JP") return true;
      if(countryFilter.includes("other") && country !== "JP") return true;
      return false;
    });
    if(filtered.length >= 3) candidates = filtered;
  }

  // Deduplicate franchises — keep only best-scored per franchise root
  // (prevents 8 Gintama entries: detect by title prefix similarity)
  const seenTitles = new Map();
  candidates = candidates.filter(a => {
    const root = (a.title||"").split(/[:\-–]/)[0].trim().toLowerCase().slice(0,20);
    if(seenTitles.has(root)) {
      // Keep whichever has the higher score
      if((a.score||0) > (seenTitles.get(root).score||0)) {
        seenTitles.set(root, a);
        return false; // will be re-added via the map
      }
      return false;
    }
    seenTitles.set(root, a);
    return true;
  });

  // Duration filter
  if(duration !== "all") {
    candidates = candidates.filter(a => {
      const eps = a.episodes || 0;
      if(duration === "short")  return eps > 0 && eps <= 13;
      if(duration === "medium") return eps > 13 && eps <= 50;
      if(duration === "long")   return eps > 50;
      return true;
    });
  }


  // Get pts for all candidates — queue handles rate limiting automatically
  const withPts = [];
  const slice = candidates.slice(0, 21);
  for (let i = 0; i < slice.length; i += 3) {
    const batch = slice.slice(i, i+3);
    const res = await Promise.all(batch.map(async a => ({...a, _pts: await getPtsForAnime(a)})));
    withPts.push(...res);
  }

  // Filter: SUM of selected moods must be >= 25% of total pts
  const MIN_TOTAL_PCT = 26;
  const matched = withPts.filter(a => {
    const pct = ptsToPct(a._pts || {});
    const total = selectedMoods.reduce((acc,m) => acc + (pct[m]||0), 0);
    return total >= MIN_TOTAL_PCT;
  });

  // Relax to 15% if too few results
  const pool = matched.length >= 3 ? matched : withPts.filter(a => {
    const pct = ptsToPct(a._pts || {});
    const total = selectedMoods.reduce((acc,m) => acc + (pct[m]||0), 0);
    return total >= 15;
  });

  const final = pool.length >= 3 ? pool : withPts;

  // Score: sum of selected mood percentages + MAL score bonus
  return final.map(a => ({
    ...a,
    _score: selectedMoods.reduce((acc,m) => acc + (ptsToPct(a._pts||{})[m]||0)*2, 0) + (a.score||7) * 3,
  })).sort((a,b) => b._score - a._score);
}


// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function Spinner({small,label}) {
  const size=small?18:28, border=small?2:3;
  return (
    <div style={{display:"flex",justifyContent:"center",padding:small?"8px":"40px",alignItems:"center",gap:"8px"}}>
      <div style={{width:`${size}px`,height:`${size}px`,border:`${border}px solid rgba(255,255,255,0.1)`,borderTop:`${border}px solid #818cf8`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      {label&&<span style={{fontSize:"12px",color:"#4b5563"}}>{label}</span>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function StarRating({value,onChange}) {
  const [hov,setHov]=useState(null);
  return (
    <div style={{display:"flex",gap:"3px"}}>
      {[1,2,3,4,5,6,7,8,9,10].map(n=>(
        <span key={n} onMouseEnter={()=>setHov(n)} onMouseLeave={()=>setHov(null)} onClick={()=>onChange(n)}
          style={{cursor:"pointer",fontSize:"15px",color:n<=(hov??value??0)?"#fbbf24":"#374151",transition:"color 0.1s"}}>★</span>
      ))}
    </div>
  );
}


function ScoreChart({ratings}) {
  const [tooltip, setTooltip] = useState(null);
  const counts = Array(10).fill(0);
  Object.values(ratings).forEach(r=>{ if(r.score>=1&&r.score<=10) counts[r.score-1]++; });
  const max = Math.max(...counts,1);
  return (
    <div style={{position:"relative"}}>
      <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"52px"}}>
        {counts.map((c,i)=>(
          <div key={i}
            onMouseEnter={()=>setTooltip(i)} onMouseLeave={()=>setTooltip(null)}
            onTouchStart={()=>setTooltip(tooltip===i?null:i)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"2px",cursor:"pointer",position:"relative"}}>
            {tooltip===i&&c>0&&(
              <div style={{position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.9)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:"6px",padding:"4px 8px",fontSize:"11px",fontWeight:800,color:"#f3f4f6",whiteSpace:"nowrap",marginBottom:"4px",zIndex:10}}>
                {c} animé{c>1?"s":""}
              </div>
            )}
            <div style={{width:"100%",borderRadius:"3px 3px 0 0",background:c>0?"linear-gradient(180deg,#c084fc,#818cf8)":"rgba(255,255,255,0.06)",height:`${Math.max((c/max)*42,c>0?4:2)}px`,transition:"height 0.3s"}}/>
            <span style={{fontSize:"7px",color:"#4b5563"}}>{i+1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FAVORITE SEARCH POPUP ────────────────────────────────────────────────────
function FavoriteSearchPopup({onSelect, onClose}) {
  const [q, setQ]             = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  useEffect(()=>{ setTimeout(()=>inputRef.current?.focus(),100); },[]);
  const search = async (val) => {
    setQ(val);
    if(!val.trim()) { setResults([]); return; }
    setLoading(true);
    try { const d=await jikan.searchAnime({q:val,limit:8,order_by:"score",sort:"desc"}); setResults(d.data||[]); }
    catch {}
    setLoading(false);
  };
  return (
    <div onClick={onClose} style={{position:"absolute",inset:0,zIndex:500,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0d0b18",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.09)",padding:"16px 16px 40px",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"0 auto 16px"}}/>
        <div style={{fontSize:"14px",fontWeight:800,color:"#f3f4f6",marginBottom:"12px"}}>Ajouter un favori</div>
        <div style={{position:"relative",marginBottom:"14px"}}>
          <span style={{position:"absolute",left:"11px",top:"50%",transform:"translateY(-50%)",color:"#6b7280",fontSize:"14px",pointerEvents:"none"}}>🔍</span>
          <input ref={inputRef} value={q} onChange={e=>search(e.target.value)} placeholder="Rechercher un animé…"
            style={{width:"100%",boxSizing:"border-box",padding:"11px 11px 11px 34px",borderRadius:"12px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",color:"#f3f4f6",fontSize:"14px",outline:"none"}}/>
        </div>
        {loading&&<Spinner small/>}
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {results.map(a=>(
            <button key={a.mal_id} onClick={()=>onSelect(a)} style={{display:"flex",gap:"10px",alignItems:"center",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"12px",overflow:"hidden",cursor:"pointer",padding:0,textAlign:"left",width:"100%"}}>
              <img src={a.images?.jpg?.image_url} alt={a.title} style={{width:"44px",height:"62px",objectFit:"cover",flexShrink:0}} onError={e=>{e.target.src="https://placehold.co/44x62/1a1a2e/818cf8?text=?";}}/>
              <div style={{flex:1,padding:"8px 10px 8px 0"}}>
                <div style={{fontSize:"12px",fontWeight:700,color:"#f3f4f6",lineHeight:1.3}}>{a.title}</div>
                <div style={{fontSize:"10px",color:"#6b7280",marginTop:"2px"}}>{a.year||"?"} · {a.type}{a.score?` · ★${a.score}`:""}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────
function ProfilePage({onOpenDetail, onOpenSettings}) {
  const {me, setMe}             = useApp();
  const [tab, setTab]           = useState("profile");
  const [journalFilter, setJournalFilter] = useState(null);
  const [animeCache, setAnimeCache] = useState({});
  const [favPopup, setFavPopup] = useState(null);
  const [holdTimer, setHoldTimer] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const fetchAnime = async (id) => {
    if(!id || animeCache[id]) return;
    try { const r = await jikan.getAnime(id); setAnimeCache(p=>({...p,[id]:r.data})); } catch {}
  };

  // On mount: only fetch favorites + top 5 completed — nothing else
  useEffect(()=>{
    const priority = [
      ...(me.favorites||[]).filter(Boolean).slice(0,5),
      ...Object.keys(me.statuses||{})
        .filter(id=>(me.statuses||{})[id]==="completed")
        .map(Number).filter(id=>!(me.hiddenCompleted||[]).includes(id))
        .slice(-5).reverse(),
    ];
    // Fetch sequentially via the queue — no burst
    priority.forEach(id => fetchAnime(id));
  }, []);

  // When switching to journal tab, fetch visible entries progressively
  useEffect(()=>{
    if(tab !== "journal") return;
    const ids = [...me.watched].reverse().slice(0, 30);
    ids.forEach(id => fetchAnime(id));
  }, [tab]);

  const getAnime = id => animeCache[id] || {mal_id:id, title:`MAL #${id}`, images:{jpg:{}}};
  const rated    = Object.keys(me.ratings).map(Number);
  const avgScore = rated.length?(rated.reduce((a,id)=>a+me.ratings[id].score,0)/rated.length).toFixed(1):"—";

  const hidden    = me.hiddenCompleted || [];
  const completed = Object.entries(me.statuses||{})
    .filter(([,s])=>s==="completed").map(([id])=>Number(id))
    .filter(id=>!hidden.includes(id))
    .slice(-5).reverse();

  const startHold = (type,payload) => {
    const t = setTimeout(()=>setConfirmRemove({type,payload}), 600);
    setHoldTimer(t);
  };
  const cancelHold = () => { if(holdTimer){clearTimeout(holdTimer);setHoldTimer(null);} };

  const TABS = [{id:"profile",label:"Profil"},{id:"journal",label:"Journal"},{id:"lists",label:"Listes"},{id:"posts",label:"Mes Posts"}];

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",paddingBottom:"80px"}}>
      <div style={{padding:"16px 18px 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:"22px",fontWeight:900,color:"#f3f4f6",letterSpacing:"-0.5px"}}>{me.name}</div>
          <div style={{fontSize:"11px",color:"#4b5563",marginTop:"1px"}}>@{me.name.toLowerCase()} · AniMood</div>
        </div>
        <button onClick={onOpenSettings} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"10px",padding:"8px 12px",color:"#9ca3af",fontSize:"12px",fontWeight:700,cursor:"pointer"}}>⚙️ Settings</button>
      </div>
      <div style={{padding:"14px 18px 0",flexShrink:0,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{display:"flex"}}>
          {TABS.map(t=>{
            const active=tab===t.id;
            return <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",padding:"8px 0 12px",textAlign:"center",position:"relative"}}>
              <span style={{fontSize:"11px",fontWeight:active?700:500,color:active?"#f3f4f6":"#4b5563"}}>{t.label}</span>
              {active&&<div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:"2px",borderRadius:"2px",background:"linear-gradient(90deg,#7c3aed,#818cf8)"}}/>}
            </button>;
          })}
        </div>
      </div>

      {/* ── PROFIL ── */}
      {tab==="profile"&&(
        <div style={{flex:1,overflowY:"auto",padding:"18px 18px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:"16px",marginBottom:"22px"}}>
            <div style={{width:"72px",height:"72px",borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"32px",flexShrink:0,boxShadow:"0 0 0 3px rgba(124,58,237,0.3)"}}>{me.avatar}</div>
            <div style={{flex:1}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
                {[{l:"Vus",v:me.watched.length},{l:"Notés",v:rated.length},{l:"Moy.",v:avgScore}].map(s=>(
                  <div key={s.l} style={{textAlign:"center"}}>
                    <div style={{fontSize:"18px",fontWeight:900,color:"#c084fc"}}>{s.v}</div>
                    <div style={{fontSize:"9px",color:"#6b7280",marginTop:"1px"}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Favoris */}
          <div style={{marginBottom:"22px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>❤️ Favoris</div>
            <div style={{display:"flex",gap:"6px"}}>
              {(me.favorites||[null,null,null,null,null]).slice(0,5).map((favId,slotIdx)=>{
                const a = favId ? getAnime(favId) : null;
                const img = a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url;
                return (
                  <div key={slotIdx}
                    style={{flex:1,aspectRatio:"2/3",borderRadius:"8px",overflow:"hidden",maxWidth:"64px",
                      background:a?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.03)",
                      border:a?"1px solid rgba(255,255,255,0.08)":"2px dashed rgba(255,255,255,0.1)",cursor:"pointer",position:"relative"}}
                    onClick={()=>{if(!a)setFavPopup(slotIdx);else onOpenDetail(a);}}
                    onMouseDown={()=>{if(a)startHold("fav",slotIdx);}}
                    onMouseUp={cancelHold} onMouseLeave={cancelHold}
                    onTouchStart={()=>{if(a)startHold("fav",slotIdx);}}
                    onTouchEnd={cancelHold}>
                    {a&&img?<img src={img} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/64x96/1a1a2e/818cf8?text=?";}}/>
                     :a?<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner small/></div>
                     :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",color:"rgba(255,255,255,0.2)"}}>+</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Derniers complétés */}
          <div style={{marginBottom:"22px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>✅ Derniers complétés</div>
            <div style={{display:"flex",gap:"6px"}}>
              {completed.slice(0,5).map(id=>{
                const a=getAnime(id);
                const img=a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;
                return (
                  <div key={id}
                    style={{flex:1,aspectRatio:"2/3",borderRadius:"8px",overflow:"hidden",maxWidth:"64px",cursor:"pointer",background:"rgba(255,255,255,0.04)",border:"1px solid #1e3a5f"}}
                    onClick={()=>onOpenDetail(a)}
                    onMouseDown={()=>startHold("completed",id)}
                    onMouseUp={cancelHold} onMouseLeave={cancelHold}
                    onTouchStart={()=>startHold("completed",id)} onTouchEnd={cancelHold}>
                    {img?<img src={img} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/64x96/1a1a2e/818cf8?text=?";}}/>
                       :<div style={{width:"100%",height:"100%",background:"rgba(30,58,95,0.3)",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner small/></div>}
                  </div>
                );
              })}
              {Array.from({length:Math.max(0,5-completed.length)}).map((_,i)=>(
                <div key={i} style={{flex:1,aspectRatio:"2/3",borderRadius:"8px",background:"rgba(255,255,255,0.03)",border:"2px dashed rgba(255,255,255,0.06)",maxWidth:"64px"}}/>
              ))}
            </div>
          </div>

          {/* Distribution notes */}
          <div style={{marginBottom:"22px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>📊 Distribution des notes</div>
            <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"12px",padding:"14px",border:"1px solid rgba(255,255,255,0.06)"}}>
              {rated.length>0?<ScoreChart ratings={me.ratings}/>:<p style={{fontSize:"11px",color:"#4b5563",textAlign:"center",margin:0}}>Note des animés pour voir ta distribution</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── JOURNAL ── */}
      {tab==="journal"&&(
        <div style={{flex:1,overflowY:"auto",padding:"18px"}}>
          {/* Légende cliquable — filtre par statut */}
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"14px"}}>
            {Object.entries(STATUS_COLORS).map(([k,v])=>{
              const active = journalFilter === k;
              return (
                <button key={k} onClick={()=>setJournalFilter(active ? null : k)}
                  style={{display:"flex",alignItems:"center",gap:"5px",padding:"5px 10px",borderRadius:"20px",border:`1px solid ${active?v.dot:"rgba(255,255,255,0.08)"}`,background:active?`${v.dot}22`:"rgba(255,255,255,0.03)",cursor:"pointer",transition:"all 0.15s"}}>
                  <div style={{width:"7px",height:"7px",borderRadius:"50%",background:v.dot,flexShrink:0}}/>
                  <span style={{fontSize:"10px",color:active?v.dot:"#6b7280",fontWeight:active?700:500}}>{v.label}</span>
                </button>
              );
            })}
            {journalFilter&&(
              <button onClick={()=>setJournalFilter(null)} style={{padding:"5px 10px",borderRadius:"20px",border:"1px solid rgba(255,255,255,0.08)",background:"transparent",cursor:"pointer",fontSize:"10px",color:"#4b5563"}}>✕ Tout</button>
            )}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"9px"}}>
            {[...me.watched].reverse()
              .filter(id => !journalFilter || ((me.statuses||{})[id]||"completed") === journalFilter)
              .map(id=>{
                const status=(me.statuses||{})[id]||"completed";
                const sc=STATUS_COLORS[status]||STATUS_COLORS.completed;
                const a=getAnime(id); const r=me.ratings[id];
                const img=a?.images?.jpg?.image_url||a?.images?.jpg?.large_image_url;
                return (
                  <div key={id} onClick={()=>onOpenDetail(a)}
                    style={{display:"flex",gap:"12px",borderRadius:"12px",border:`1px solid ${sc.border}`,background:sc.bg,overflow:"hidden",cursor:"pointer"}}>
                    <div style={{width:"52px",height:"76px",flexShrink:0,background:"rgba(0,0,0,0.2)",position:"relative"}}>
                      {img&&<img src={img} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>}
                      <div style={{position:"absolute",bottom:"3px",left:"3px",width:"6px",height:"6px",borderRadius:"50%",background:sc.dot}}/>
                    </div>
                    <div style={{flex:1,padding:"9px 9px 9px 0",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:"12px",fontWeight:800,color:"#f3f4f6",lineHeight:1.3}}>{a.title}</div>
                        <div style={{fontSize:"9px",color:sc.dot,fontWeight:700,marginTop:"2px"}}>{sc.label}</div>
                      </div>
                      {r?<span style={{fontSize:"12px",color:"#fbbf24",fontWeight:800}}>★ {r.score}/10</span>
                        :<span style={{fontSize:"10px",color:"#374151"}}>Non noté</span>}
                    </div>
                  </div>
                );
            })}
            {me.watched.length===0&&<div style={{textAlign:"center",padding:"40px",color:"#374151"}}><div style={{fontSize:"34px",marginBottom:"8px"}}>📖</div><p>Ton journal est vide</p></div>}
          </div>
        </div>
      )}

      {/* ── LISTES ── */}
      {tab==="lists"&&(
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"12px",color:"#374151"}}>
          <div style={{fontSize:"40px"}}>📋</div>
          <p style={{fontWeight:700,color:"#4b5563"}}>Listes — bientôt</p>
        </div>
      )}

      {/* ── MES POSTS ── */}
      {tab==="posts"&&(
        <div style={{flex:1,overflowY:"auto",padding:"18px"}}>
          {(me.posts||[]).length===0
            ?<div style={{textAlign:"center",padding:"40px",color:"#374151"}}>
               <div style={{fontSize:"40px",marginBottom:"12px"}}>✍️</div>
               <p style={{fontWeight:700,color:"#4b5563"}}>Aucun post pour l'instant</p>
               <p style={{fontSize:"12px",color:"#374151",marginTop:"6px"}}>Tes posts du Feed et du Forum apparaîtront ici</p>
             </div>
            :<div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
               {(me.posts||[]).map((post,i)=>(
                 <div key={i} style={{background:"rgba(255,255,255,0.04)",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.07)",padding:"12px 14px"}}>
                   <div style={{fontSize:"10px",color:"#4b5563",marginBottom:"6px"}}>{post.source} · {post.date}</div>
                   <div style={{fontSize:"13px",color:"#e5e7eb"}}>{post.content}</div>
                 </div>
               ))}
             </div>}
        </div>
      )}

      {/* Favorite search popup */}
      {favPopup!==null&&(
        <FavoriteSearchPopup
          onSelect={a=>{
            const newFavs=[...(me.favorites||[null,null,null,null,null])];
            newFavs[favPopup]=a.mal_id;
            const updated={...me,favorites:newFavs};
            setMe(updated); saveProfile("brice",updated);
            setAnimeCache(p=>({...p,[a.mal_id]:a}));
            setFavPopup(null);
          }}
          onClose={()=>setFavPopup(null)}
        />
      )}

      {/* Confirm remove */}
      {confirmRemove&&(
        <div onClick={()=>setConfirmRemove(null)} style={{position:"absolute",inset:0,zIndex:600,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#161226",borderRadius:"20px",border:"1px solid rgba(255,255,255,0.1)",padding:"24px",width:"100%",maxWidth:"300px"}}>
            <div style={{fontSize:"15px",fontWeight:800,color:"#f3f4f6",marginBottom:"8px"}}>
              {confirmRemove.type==="fav"?"Retirer des favoris ?":"Ne pas afficher ?"}
            </div>
            <p style={{fontSize:"12px",color:"#6b7280",marginBottom:"20px",lineHeight:1.5}}>
              {confirmRemove.type==="fav"
                ?"Ce slot deviendra vide."
                :"Cet animé sera masqué de tes derniers complétés. Le suivant le remplacera."}
            </p>
            <div style={{display:"flex",gap:"10px"}}>
              <button onClick={()=>setConfirmRemove(null)} style={{flex:1,padding:"11px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#9ca3af",fontWeight:700,fontSize:"13px",cursor:"pointer"}}>Annuler</button>
              <button onClick={()=>{
                if(confirmRemove.type==="fav"){
                  const newFavs=[...(me.favorites||[null,null,null,null,null])];
                  newFavs[confirmRemove.payload]=null;
                  const updated={...me,favorites:newFavs};
                  setMe(updated); saveProfile("brice",updated);
                } else {
                  const updated={...me,hiddenCompleted:[...(me.hiddenCompleted||[]),confirmRemove.payload]};
                  setMe(updated); saveProfile("brice",updated);
                }
                setConfirmRemove(null);
              }} style={{flex:1,padding:"11px",borderRadius:"10px",border:"none",background:"rgba(239,68,68,0.2)",color:"#ef4444",fontWeight:700,fontSize:"13px",cursor:"pointer"}}>
                {confirmRemove.type==="fav"?"Retirer":"Ne pas afficher"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({onLogin}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [showPw, setShowPw]     = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    const acc = ACCOUNTS[username.toLowerCase()];
    if(!acc) { setError("Utilisateur inconnu"); return; }
    if(acc.password !== password) { setError("Mot de passe incorrect"); return; }
    const session = { username: username.toLowerCase(), loginAt: Date.now() };
    saveSession(session);
    onLogin(session);
  };

  return (
    <div style={{minHeight:"100vh",background:"#09080f",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      {/* Logo */}
      <div style={{textAlign:"center",marginBottom:"48px"}}>
        <div style={{fontSize:"48px",marginBottom:"12px"}}>🌀</div>
        <h1 style={{margin:0,fontSize:"28px",fontWeight:900,letterSpacing:"-1px",background:"linear-gradient(90deg,#c084fc,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>AniMood</h1>
        <p style={{margin:"8px 0 0",fontSize:"13px",color:"#4b5563"}}>Trouve ton prochain animé selon ton humeur</p>
      </div>

      {/* Form */}
      <form onSubmit={handleLogin} style={{width:"100%",maxWidth:"340px",display:"flex",flexDirection:"column",gap:"14px"}}>
        <div>
          <label style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",display:"block",marginBottom:"6px"}}>Nom d'utilisateur</label>
          <input value={username} onChange={e=>{setUsername(e.target.value);setError("");}}
            placeholder="brice"
            style={{width:"100%",boxSizing:"border-box",padding:"13px 14px",borderRadius:"12px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#f3f4f6",fontSize:"15px",outline:"none"}}
          />
        </div>
        <div>
          <label style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",display:"block",marginBottom:"6px"}}>Mot de passe</label>
          <div style={{position:"relative"}}>
            <input value={password} onChange={e=>{setPassword(e.target.value);setError("");}}
              type={showPw?"text":"password"} placeholder="••••••••"
              style={{width:"100%",boxSizing:"border-box",padding:"13px 44px 13px 14px",borderRadius:"12px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#f3f4f6",fontSize:"15px",outline:"none"}}
            />
            <button type="button" onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:"12px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"16px"}}>
              {showPw?"🙈":"👁️"}
            </button>
          </div>
        </div>

        {error&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:"8px",padding:"10px 12px",fontSize:"12px",color:"#ef4444"}}>{error}</div>}

        <button type="submit" style={{marginTop:"8px",padding:"15px",borderRadius:"14px",border:"none",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,fontSize:"15px",cursor:"pointer",boxShadow:"0 6px 24px rgba(124,58,237,0.4)"}}>
          Se connecter
        </button>
      </form>
    </div>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage({onLogout}) {
  const {me, setMe} = useApp();
  const [importStatus, setImportStatus] = useState(null); // null | "importing" | "done" | "error"
  const [importStats, setImportStats]   = useState(null);
  const [newPw, setNewPw]               = useState("");
  const [pwConfirm, setPwConfirm]       = useState("");
  const [pwMsg, setPwMsg]               = useState(null);
  const fileRef = useRef(null);

  const handleXmlImport = (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    setImportStatus("importing");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { watched, ratings, statuses } = parseMALXml(ev.target.result);
        const merged = {
          ...me,
          watched: [...new Set([...me.watched, ...watched])],
          ratings: { ...me.ratings, ...ratings },
          statuses: { ...(me.statuses||{}), ...statuses },
        };
        setMe(merged);
        saveProfile("brice", merged);
        setImportStats({ watched: watched.length, rated: Object.keys(ratings).length });
        setImportStatus("done");
      } catch(err) {
        setImportStatus("error");
      }
    };
    reader.readAsText(file);
  };

  const handleChangePw = () => {
    if(newPw.length < 6) { setPwMsg({type:"error",text:"Mot de passe trop court (min 6)"}); return; }
    if(newPw !== pwConfirm) { setPwMsg({type:"error",text:"Les mots de passe ne correspondent pas"}); return; }
    // In a real app this would hit a backend. Here we just update the in-memory config.
    ACCOUNTS.brice.password = newPw;
    setNewPw(""); setPwConfirm("");
    setPwMsg({type:"success",text:"Mot de passe mis à jour (jusqu'au rechargement)"});
  };

  return (
    <div style={{flex:1,overflowY:"auto",padding:"18px 18px 100px"}}>
      <div style={{fontSize:"20px",fontWeight:900,color:"#f3f4f6",marginBottom:"24px"}}>⚙️ Paramètres</div>

      {/* Import MAL */}
      <Section title="📥 Importer ma liste MAL / AniList">
        <p style={{fontSize:"12px",color:"#6b7280",margin:"0 0 12px",lineHeight:1.6}}>
          Exporte ta liste depuis AniList (XML MAL) et importe-la ici. Les animés "Completed" seront ajoutés à ton historique avec leurs notes.
        </p>
        <input ref={fileRef} type="file" accept=".xml" onChange={handleXmlImport} style={{display:"none"}}/>
        <button onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:"13px",borderRadius:"12px",border:"2px dashed rgba(129,140,248,0.4)",background:"rgba(129,140,248,0.06)",color:"#818cf8",fontWeight:700,fontSize:"14px",cursor:"pointer"}}>
          {importStatus==="importing" ? "Import en cours…" : "📂 Choisir un fichier XML"}
        </button>
        {importStatus==="done"&&importStats&&(
          <div style={{marginTop:"10px",background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:"10px",padding:"10px 12px",fontSize:"12px",color:"#34D399"}}>
            ✅ Import réussi — {importStats.watched} animés importés · {importStats.rated} notes récupérées
          </div>
        )}
        {importStatus==="error"&&(
          <div style={{marginTop:"10px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"10px",padding:"10px 12px",fontSize:"12px",color:"#ef4444"}}>
            ❌ Erreur lors de l'import — vérifie que le fichier est bien un XML MAL/AniList
          </div>
        )}
      </Section>

      {/* Change password */}
      <Section title="🔑 Changer le mot de passe">
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          <input value={newPw} onChange={e=>setNewPw(e.target.value)} type="password" placeholder="Nouveau mot de passe"
            style={{padding:"11px 12px",borderRadius:"10px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#f3f4f6",fontSize:"14px",outline:"none"}}/>
          <input value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} type="password" placeholder="Confirmer"
            style={{padding:"11px 12px",borderRadius:"10px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#f3f4f6",fontSize:"14px",outline:"none"}}/>
          <button onClick={handleChangePw} style={{padding:"11px",borderRadius:"10px",border:"none",background:"rgba(129,140,248,0.15)",color:"#818cf8",fontWeight:700,fontSize:"13px",cursor:"pointer"}}>
            Mettre à jour
          </button>
          {pwMsg&&<div style={{fontSize:"11px",color:pwMsg.type==="error"?"#ef4444":"#34D399"}}>{pwMsg.text}</div>}
        </div>
      </Section>

      {/* Stats */}
      <Section title="📊 Mes statistiques">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
          {[
            {l:"Vus",v:me.watched.length},
            {l:"Notés",v:Object.keys(me.ratings).length},
            {l:"Moy.",v:Object.keys(me.ratings).length?(Object.values(me.ratings).reduce((a,r)=>a+r.score,0)/Object.keys(me.ratings).length).toFixed(1):"—"},
          ].map(s=>(
            <div key={s.l} style={{background:"rgba(255,255,255,0.04)",borderRadius:"12px",padding:"12px",textAlign:"center",border:"1px solid rgba(255,255,255,0.07)"}}>
              <div style={{fontSize:"20px",fontWeight:900,color:"#c084fc"}}>{s.v}</div>
              <div style={{fontSize:"10px",color:"#6b7280",marginTop:"2px"}}>{s.l}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Logout */}
      <Section title="🚪 Déconnexion">
        <button onClick={onLogout} style={{width:"100%",padding:"13px",borderRadius:"12px",border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.06)",color:"#ef4444",fontWeight:700,fontSize:"14px",cursor:"pointer"}}>
          Se déconnecter
        </button>
      </Section>
    </div>
  );
}

function Section({title,children}) {
  return (
    <div style={{marginBottom:"24px"}}>
      <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>{title}</div>
      <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"14px",padding:"16px",border:"1px solid rgba(255,255,255,0.06)"}}>{children}</div>
    </div>
  );
}

// ─── PERSON SHEET ─────────────────────────────────────────────────────────────
function PersonSheet({personId,onClose,onOpenDetail}) {
  const [visible,setVisible]=useState(false);
  const [data,setData]=useState(null);
  const [animes,setAnimes]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{requestAnimationFrame(()=>setVisible(true));},[]);
  useEffect(()=>{
    if(!personId) return;
    (async()=>{
      try {
        const [person,voices,animeRoles]=await Promise.all([jikan.getPerson(personId),jikan.getPersonVoices(personId),jikan.getPersonAnime(personId)]);
        setData(person.data);
        const map={};
        ;(animeRoles.data||[]).forEach(a=>{const id=a.anime?.mal_id;if(id)map[id]={mal_id:id,title:a.anime?.title,img:a.anime?.images?.jpg?.image_url,role:a.position};});
        ;(voices.data||[]).forEach(v=>{const id=v.anime?.mal_id;if(id&&!map[id])map[id]={mal_id:id,title:v.anime?.title,img:v.anime?.images?.jpg?.image_url,role:`VA · ${v.character?.name}`};});
        setAnimes(Object.values(map).slice(0,24));
      } catch(e){console.error(e);}
      finally{setLoading(false);}
    })();
  },[personId]);

  const close=()=>{setVisible(false);setTimeout(onClose,280);};
  return (
    <div onClick={close} style={{position:"absolute",inset:0,zIndex:400,background:visible?"rgba(0,0,0,0.85)":"rgba(0,0,0,0)",backdropFilter:visible?"blur(10px)":"none",transition:"all 0.28s",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#161226 0%,#0d0b18 100%)",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.09)",maxHeight:"88vh",overflowY:"auto",paddingBottom:"30px",transform:visible?"translateY(0)":"translateY(100%)",transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)"}}>
        <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"12px auto 0"}}/>
        {loading&&<Spinner label="Chargement…"/>}
        {data&&(
          <div style={{padding:"16px"}}>
            <div style={{display:"flex",gap:"14px",alignItems:"center",marginBottom:"16px"}}>
              <img src={data.images?.jpg?.image_url} alt={data.name} style={{width:"64px",height:"64px",borderRadius:"50%",objectFit:"cover",border:"2px solid rgba(255,255,255,0.1)"}} onError={e=>{e.target.src="https://placehold.co/64x64/1a1a2e/818cf8?text=?";}}/>
              <div>
                <div style={{fontSize:"16px",fontWeight:900,color:"#f3f4f6"}}>{data.name}</div>
                {data.name_kanji&&<div style={{fontSize:"12px",color:"#6b7280"}}>{data.name_kanji}</div>}
                {data.favorites&&<div style={{fontSize:"11px",color:"#4b5563",marginTop:"2px"}}>❤️ {data.favorites.toLocaleString()} favoris</div>}
              </div>
            </div>
            {data.about&&<p style={{fontSize:"11px",color:"#6b7280",lineHeight:1.6,marginBottom:"16px"}}>{data.about.slice(0,300)}…</p>}
            <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>Animés ({animes.length})</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px"}}>
              {animes.map(a=>(
                <div key={a.mal_id} onClick={()=>{close();setTimeout(()=>onOpenDetail(a),300);}} style={{cursor:"pointer"}}>
                  <div style={{aspectRatio:"2/3",borderRadius:"8px",overflow:"hidden",marginBottom:"4px"}}>
                    <img src={a.img||"https://placehold.co/80x120/1a1a2e/818cf8?text=?"} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/80x120/1a1a2e/818cf8?text=?";}}/>
                  </div>
                  <div style={{fontSize:"8px",color:"#9ca3af",lineHeight:1.2,textAlign:"center"}}>{a.title?.slice(0,20)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STUDIO SHEET ─────────────────────────────────────────────────────────────
function StudioSheet({studioId,studioName,onClose,onOpenDetail}) {
  const [visible,setVisible]=useState(false);
  const [animes,setAnimes]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{requestAnimationFrame(()=>setVisible(true));},[]);
  useEffect(()=>{
    if(!studioId) return;
    jikan.getProducerAnime(studioId).then(r=>setAnimes(r.data||[])).catch(console.error).finally(()=>setLoading(false));
  },[studioId]);

  const close=()=>{setVisible(false);setTimeout(onClose,280);};
  return (
    <div onClick={close} style={{position:"absolute",inset:0,zIndex:400,background:visible?"rgba(0,0,0,0.85)":"rgba(0,0,0,0)",backdropFilter:visible?"blur(10px)":"none",transition:"all 0.28s",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#161226 0%,#0d0b18 100%)",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.09)",maxHeight:"88vh",overflowY:"auto",paddingBottom:"30px",transform:visible?"translateY(0)":"translateY(100%)",transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)"}}>
        <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"12px auto 0"}}/>
        <div style={{padding:"16px"}}>
          <div style={{fontSize:"18px",fontWeight:900,color:"#f3f4f6",marginBottom:"4px"}}>🎬 {studioName}</div>
          <div style={{fontSize:"11px",color:"#6b7280",marginBottom:"16px"}}>Animés triés par score MAL</div>
          {loading&&<Spinner/>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"9px"}}>
            {animes.map(a=>(
              <div key={a.mal_id} onClick={()=>{close();setTimeout(()=>onOpenDetail(a),300);}} style={{cursor:"pointer"}}>
                <div style={{aspectRatio:"2/3",borderRadius:"10px",overflow:"hidden",marginBottom:"4px",position:"relative"}}>
                  <img src={a.images?.jpg?.large_image_url||a.images?.jpg?.image_url} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/100x150/1a1a2e/818cf8?text=?";}}/>
                  {a.score&&<div style={{position:"absolute",bottom:"4px",right:"4px",background:"rgba(0,0,0,0.8)",borderRadius:"4px",padding:"1px 4px",fontSize:"9px",fontWeight:800,color:"#fbbf24"}}>★{a.score}</div>}
                </div>
                <div style={{fontSize:"9px",color:"#9ca3af",lineHeight:1.3,textAlign:"center"}}>{a.title?.slice(0,24)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ANIME DETAIL ─────────────────────────────────────────────────────────────
function AnimeDetail({malId,seedData,onClose}) {
  const {me,setMe}=useApp();
  const [visible,setVisible]=useState(false);
  const [anime,setAnime]=useState(null);
  const [staff,setStaff]=useState([]);
  const [characters,setCharacters]=useState([]);
  const [animePts,setAnimePts]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [rating,setRating]=useState(me.ratings[malId]?.score??null);
  const [selMoods,setSelMoods]=useState(()=>{
    const prevVote = ptsStore[`${malId}_vote`];
    return prevVote?.moods || me.ratings[malId]?.moods || [];
  });
  const [personSheet,setPersonSheet]=useState(null);
  const [studioSheet,setStudioSheet]=useState(null);

  const isWatched=me.watched.includes(malId);
  const a=anime||seedData;

  useEffect(()=>{requestAnimationFrame(()=>setVisible(true));},[]);
  useEffect(()=>{
    if(!malId) return;
    (async()=>{
      try {
        const [ad, sd, cd] = await Promise.all([
          jikan.getAnime(malId),
          jikan.getStaff(malId),
          jikan.getCharacters(malId),
        ]);
        setAnime(ad.data);
        // If from Supabase cache, staff/chars already in ad.data
        const staffList = ad.data?._fromCache && ad.data.staff?.length
          ? ad.data.staff.map(s => ({ person: { mal_id:s.mal_id, name:s.name, images:{jpg:{image_url:s.image}} }, positions: s.positions }))
          : (sd.data || []);
        const charsList = ad.data?._fromCache && ad.data.characters?.length
          ? ad.data.characters.map(c => ({ character:{mal_id:c.mal_id,name:c.name,images:{jpg:{image_url:c.image}}}, role:c.role, voice_actors: c.va ? [{language:"Japanese",person:{mal_id:c.va.mal_id,name:c.va.name,images:{jpg:{image_url:c.va.image}}}}] : [] }))
          : (cd.data || []);
        setStaff(staffList.slice(0,10));
        setCharacters(charsList.slice(0,8));
        setLoading(false);

        // Show octagon immediately with cached or genre-based pts
        if(ptsStore[ad.data.mal_id]) {
          // Already cached — instant
          setAnimePts(ptsStore[ad.data.mal_id]);
        } else {
          // Show genre fallback immediately, then replace with Claude result
          const fallback = pctToPoints(genresToPct(ad.data.genres||[]));
          setAnimePts(fallback);
          // Claude tags in background — replaces fallback when done
          getPtsForAnime(ad.data).then(pts => setAnimePts(pts)).catch(()=>{});
        }
      } catch(e){ setError(e.message); setLoading(false); }
    })();
  },[malId]);

  const close=()=>{setVisible(false);setTimeout(onClose,280);};
  const save=async()=>{
    if(!rating) return;
    if(selMoods.length>0 && animePts) {
      const newPts = await addUserVote("brice", malId, selMoods, animePts);
      setAnimePts(newPts);
    }
    const updated={...me,watched:me.watched.includes(malId)?me.watched:[...me.watched,malId],ratings:{...me.ratings,[malId]:{score:rating,moods:selMoods}}};
    setMe(updated); saveProfile("brice",updated);
  };

  const img=a?.images?.jpg?.large_image_url||a?.img||"https://placehold.co/400x180/1a1a2e/818cf8?text=?";
  const title=a?.title||"—";
  const synopsis=a?.synopsis;
  const year=a?.year||a?.aired?.prop?.from?.year;
  const eps=a?.episodes; const type=a?.type; const score=a?.score;
  const genres=a?.genres?.map(g=>g.name||g)||[];
  const studios=a?.studios||[];
  const streaming=a?.streaming||seedData?.streaming||[];
  const trailer=a?.trailer?.url;

  return (
    <>
      <div onClick={close} style={{position:"absolute",inset:0,zIndex:300,background:visible?"rgba(0,0,0,0.85)":"rgba(0,0,0,0)",backdropFilter:visible?"blur(10px)":"none",transition:"all 0.28s",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#161226 0%,#0d0b18 100%)",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.09)",maxHeight:"92vh",overflowY:"auto",paddingBottom:"30px",transform:visible?"translateY(0)":"translateY(100%)",transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)"}}>
          <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"12px auto 0"}}/>
          <div style={{position:"relative",height:"180px",margin:"14px 14px 0",borderRadius:"16px",overflow:"hidden"}}>
            <img src={img} alt={title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/400x180/1a1a2e/818cf8?text=?";}}/>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(0deg,rgba(13,11,24,0.96) 0%,rgba(0,0,0,0.1) 60%)"}}/>
            <div style={{position:"absolute",bottom:"12px",left:"12px",right:"50px"}}>
              <div style={{fontSize:"15px",fontWeight:900,color:"#fff",lineHeight:1.3,marginBottom:"5px"}}>{title}</div>
              <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
                {type&&<span style={{fontSize:"10px",background:"rgba(255,255,255,0.1)",color:"#9ca3af",borderRadius:"5px",padding:"2px 6px"}}>{type}</span>}
                {eps&&<span style={{fontSize:"10px",background:"rgba(255,255,255,0.1)",color:"#9ca3af",borderRadius:"5px",padding:"2px 6px"}}>{eps} eps</span>}
                {year&&<span style={{fontSize:"10px",background:"rgba(255,255,255,0.1)",color:"#9ca3af",borderRadius:"5px",padding:"2px 6px"}}>{year}</span>}
                {me.ratings[malId]&&<span style={{fontSize:"10px",background:"rgba(251,191,36,0.15)",color:"#fbbf24",borderRadius:"5px",padding:"2px 6px"}}>Ma note : {me.ratings[malId].score}/10</span>}
              </div>
            </div>
            {score&&<div style={{position:"absolute",top:"10px",right:"10px",background:"rgba(0,0,0,0.75)",borderRadius:"8px",padding:"4px 8px",fontSize:"13px",fontWeight:800,color:"#fbbf24"}}>★ {score}</div>}
          </div>

          <div style={{padding:"14px 14px 0"}}>
            {loading&&<Spinner small label="Chargement…"/>}
            {studios.length>0&&<div style={{marginBottom:"10px",display:"flex",gap:"6px",flexWrap:"wrap"}}>
              {studios.map(s=><button key={s.mal_id} onClick={()=>setStudioSheet({id:s.mal_id,name:s.name})} style={{background:"rgba(129,140,248,0.1)",border:"1px solid rgba(129,140,248,0.25)",color:"#818cf8",borderRadius:"8px",padding:"4px 10px",fontSize:"11px",fontWeight:700,cursor:"pointer"}}>🎬 {s.name}</button>)}
            </div>}
            <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"12px"}}>
              {genres.map(g=><span key={g} style={{fontSize:"11px",background:"rgba(129,140,248,0.12)",color:"#818cf8",borderRadius:"6px",padding:"3px 8px",fontWeight:600}}>{g}</span>)}
            </div>

            {/* OCTAGON — only here, above synopsis */}
            {animePts && <MoodOctagon pts={animePts}/>}

            {synopsis&&<div style={{marginBottom:"14px"}}><div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Synopsis</div><p style={{fontSize:"12px",color:"#9ca3af",lineHeight:1.6,margin:0}}>{synopsis.length>280?synopsis.slice(0,280)+"…":synopsis}</p></div>}
            {streaming.length>0&&<div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"7px"}}>Disponible sur</div><div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>{streaming.map(s=>{const name=s.name||s;return<span key={name} style={{fontSize:"11px",fontWeight:800,color:"#fff",background:STREAMING_COLORS[name]||"#444",borderRadius:"6px",padding:"4px 10px"}}>{name}</span>;})}</div></div>}
            {staff.length>0&&<div style={{marginBottom:"14px"}}><div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>Staff</div><div style={{display:"flex",flexDirection:"column",gap:"6px"}}>{staff.slice(0,6).map((s,i)=><button key={i} onClick={()=>setPersonSheet(s.person?.mal_id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"8px",padding:"7px 10px",cursor:"pointer",width:"100%",textAlign:"left"}}><div style={{display:"flex",alignItems:"center",gap:"8px"}}><img src={s.person?.images?.jpg?.image_url} alt={s.person?.name} style={{width:"28px",height:"28px",borderRadius:"50%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/28x28/1a1a2e/818cf8?text=?";}}/>  <span style={{fontSize:"12px",color:"#e5e7eb",fontWeight:600}}>{s.person?.name}</span></div><span style={{fontSize:"10px",color:"#6b7280"}}>{s.positions?.slice(0,1).join(", ")}</span></button>)}</div></div>}
            {characters.length>0&&<div style={{marginBottom:"14px"}}><div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>Personnages & Seiyuu</div><div style={{display:"flex",gap:"10px",overflowX:"auto",paddingBottom:"4px"}}>{characters.slice(0,6).map((c,i)=>{const va=c.voice_actors?.find(v=>v.language==="Japanese");return(<div key={i} style={{flexShrink:0,width:"68px",textAlign:"center"}}><img src={c.character?.images?.jpg?.image_url} alt={c.character?.name} style={{width:"52px",height:"52px",borderRadius:"50%",objectFit:"cover",marginBottom:"3px",border:"2px solid rgba(255,255,255,0.1)"}} onError={e=>{e.target.src="https://placehold.co/52x52/1a1a2e/818cf8?text=?";}}/>  <div style={{fontSize:"8px",color:"#9ca3af",lineHeight:1.2,marginBottom:"3px"}}>{c.character?.name?.split(" ").slice(-1)[0]}</div>{va&&<button onClick={()=>setPersonSheet(va.person?.mal_id)} style={{background:"none",border:"none",cursor:"pointer",padding:0}}><img src={va.person?.images?.jpg?.image_url} alt={va.person?.name} style={{width:"36px",height:"36px",borderRadius:"50%",objectFit:"cover",border:"2px solid rgba(192,132,252,0.4)"}} onError={e=>{e.target.src="https://placehold.co/36x36/1a1a2e/c084fc?text=?";}}/>  <div style={{fontSize:"7px",color:"#c084fc",marginTop:"2px"}}>{va.person?.name?.split(",")[0]?.slice(0,12)}</div></button>}</div>);})}</div></div>}
            <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"14px",padding:"13px",marginBottom:"12px"}}>
              <div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"9px"}}>Ma note</div>
              <StarRating value={rating} onChange={setRating}/>
              <div style={{fontSize:"10px",color:"#6b7280",margin:"8px 0 7px"}}>Ton ressenti (max 3 moods) :</div>
              <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"11px"}}>{MOODS.map(m=>{const sel=selMoods.includes(m.id);return<button key={m.id} onClick={()=>setSelMoods(p=>p.includes(m.id)?p.filter(x=>x!==m.id):p.length<3?[...p,m.id]:p)} style={{border:sel?`1px solid ${m.color}`:"1px solid rgba(255,255,255,0.1)",background:sel?`${m.color}18`:"transparent",color:sel?m.color:"#6b7280",borderRadius:"20px",padding:"3px 8px",fontSize:"10px",fontWeight:700,cursor:"pointer",transition:"all 0.15s"}}>{m.emoji} {m.label}</button>;})}</div>
              <div style={{display:"flex",gap:"8px"}}>
                <button onClick={save} disabled={!rating} style={{flex:1,padding:"10px",borderRadius:"10px",border:"none",background:rating?"linear-gradient(135deg,#7c3aed,#4f46e5)":"rgba(255,255,255,0.05)",color:rating?"#fff":"#374151",fontWeight:700,fontSize:"13px",cursor:rating?"pointer":"not-allowed"}}>Sauvegarder</button>
                <button onClick={()=>{const updated={...me,watched:isWatched?me.watched.filter(id=>id!==malId):[...me.watched,malId]};setMe(updated);saveProfile("brice",updated);}} style={{padding:"10px 12px",borderRadius:"10px",border:isWatched?"1px solid #34D399":"1px solid rgba(255,255,255,0.1)",background:isWatched?"rgba(52,211,153,0.1)":"transparent",color:isWatched?"#34D399":"#6b7280",fontWeight:700,fontSize:"13px",cursor:"pointer"}}>{isWatched?"✓ Vu":"Marquer vu"}</button>
              </div>
            </div>
            {trailer&&<a href={trailer} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",padding:"12px",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",color:"#9ca3af",textDecoration:"none",fontSize:"13px",fontWeight:700}}>▶ Voir le trailer</a>}
            {error&&<div style={{textAlign:"center",padding:"12px",color:"#ef4444",fontSize:"11px"}}>Erreur: {error}</div>}
          </div>
        </div>
      </div>
      {personSheet&&<PersonSheet personId={personSheet} onClose={()=>setPersonSheet(null)} onOpenDetail={a=>{setPersonSheet(null);}}/>}
      {studioSheet&&<StudioSheet studioId={studioSheet.id} studioName={studioSheet.name} onClose={()=>setStudioSheet(null)} onOpenDetail={a=>{setStudioSheet(null);}}/>}
    </>
  );
}

// ─── RESULTS OVERLAY ─────────────────────────────────────────────────────────
function ResultsOverlay({results,onClose,onReroll,onOpenDetail,selectedMoods,generating}) {
  const [visible,setVisible]=useState(false);
  useEffect(()=>{requestAnimationFrame(()=>setVisible(true));},[]);
  const close=()=>{setVisible(false);setTimeout(onClose,300);};
  const cards=(results||[]).slice(0,3).map(a=>({anime:a}));

  return (
    <div onClick={close} style={{position:"absolute",inset:0,zIndex:200,background:visible?"rgba(0,0,0,0.78)":"rgba(0,0,0,0)",backdropFilter:visible?"blur(6px)":"none",transition:"all 0.3s",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#13101f 0%,#0d0b18 100%)",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.08)",maxHeight:"88vh",overflowY:"auto",paddingBottom:"28px",transform:visible?"translateY(0)":"translateY(100%)",transition:"transform 0.35s cubic-bezier(0.32,0.72,0,1)"}}>
        <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"12px auto 14px"}}/>
        <div style={{padding:"0 18px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <h3 style={{margin:"0 0 5px",fontSize:"16px",fontWeight:800,color:"#f3f4f6"}}>{generating?"Analyse en cours…":"Sélection pour toi"}</h3>
            <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
              {selectedMoods.map(mid=>{const m=getMoodObj(mid);return m&&<span key={mid} style={{background:`${m.color}22`,border:`1px solid ${m.color}44`,color:m.color,borderRadius:"20px",padding:"2px 8px",fontSize:"10px",fontWeight:700}}>{m.emoji} {m.label}</span>;})}
            </div>
          </div>
          <button onClick={close} style={{background:"rgba(255,255,255,0.07)",border:"none",color:"#9ca3af",borderRadius:"50%",width:"30px",height:"30px",cursor:"pointer",fontSize:"13px"}}>✕</button>
        </div>
        {generating&&<Spinner label="L'IA analyse les moods…"/>}
        {!generating&&<>
          <div style={{padding:"0 14px",display:"flex",flexDirection:"column",gap:"11px"}}>
            {cards.map(({anime},i)=>{
              const malId=anime.mal_id;
              const rawPts = ptsStore[malId] || anime._pts || {}; const pct = ptsToPct(rawPts);
              const img=anime.images?.jpg?.large_image_url||anime.images?.jpg?.image_url||anime.img||"https://placehold.co/72x108/1a1a2e/818cf8?text=?";
              const title = anime.title||"—";
              return (
                <div key={malId||i} onClick={()=>onOpenDetail(anime)} style={{display:"flex",gap:"11px",cursor:"pointer",background:"rgba(255,255,255,0.04)",borderRadius:"15px",border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden",animation:`slideUp 0.4s ${i*0.08}s both`}}>
                  <div style={{width:"72px",flexShrink:0,position:"relative"}}>
                    <img src={img} alt={title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",minHeight:"108px"}} onError={e=>{e.target.src="https://placehold.co/72x108/1a1a2e/818cf8?text=?";}}/>
                    {anime.score&&<div style={{position:"absolute",bottom:"5px",left:"5px",background:"rgba(0,0,0,0.75)",borderRadius:"5px",padding:"1px 5px",fontSize:"10px",fontWeight:800,color:"#fbbf24"}}>★{anime.score}</div>}
                  </div>
                  <div style={{flex:1,padding:"11px 11px 11px 0",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:"13px",fontWeight:800,color:"#f3f4f6",lineHeight:1.3,marginBottom:"2px"}}>{title}</div>
                      <div style={{fontSize:"10px",color:"#6b7280",marginBottom:"6px"}}>{anime.year||anime.aired?.prop?.from?.year||"?"} · {anime.type}</div>
                      <div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>
                        {(anime.genres||[]).slice(0,2).map(g=>{const name=g.name||g;return<span key={name} style={{fontSize:"9px",background:"rgba(129,140,248,0.12)",color:"#818cf8",borderRadius:"4px",padding:"2px 5px",fontWeight:600}}>{name}</span>;})}
                      </div>
                    </div>
                    {/* Top moods ≥17% only — max 3 */}
                    <div style={{display:"flex",gap:"4px",flexWrap:"wrap",marginTop:"7px"}}>
                      {getMoodTags(rawPts).map(mid=>{
                        const m=getMoodObj(mid);
                        const val=pct[mid]||0;
                        return m?<span key={mid} style={{fontSize:"9px",background:`${m.color}18`,color:m.color,border:`1px solid ${m.color}40`,borderRadius:"20px",padding:"2px 7px",fontWeight:700}}>{m.emoji} {val}%</span>:null;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {cards.length===0&&<div style={{textAlign:"center",padding:"30px",color:"#4b5563"}}><div style={{fontSize:"32px",marginBottom:"8px"}}>😶</div><p style={{fontSize:"12px"}}>Aucun animé trouvé</p></div>}
          </div>
          <div style={{padding:"14px 14px 0"}}>
            <button onClick={onReroll} style={{width:"100%",padding:"13px",borderRadius:"13px",border:"2px solid rgba(129,140,248,0.3)",background:"transparent",color:"#818cf8",fontWeight:800,fontSize:"14px",cursor:"pointer"}}>🎲 Autres suggestions</button>
          </div>
        </>}
      </div>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ─── MOODBOARD PAGE ───────────────────────────────────────────────────────────
const COUNTRIES = [
  {id:"all",    label:"Tout",    emoji:"🔀"},
  {id:"JP",     label:"Japonais",emoji:"🇯🇵"},
  {id:"other",  label:"Autres",  emoji:"🌍"},
];

function MoodboardPage({onShowResults}) {
  const {me}=useApp();
  const [selectedMoods, setSelectedMoods] = useState([]);
  const [duration,      setDuration]      = useState("all");
  const [countries,     setCountries]     = useState(["all"]);
  const [mediaTypes,    setMediaTypes]    = useState(["all"]);
  const [friendReco,    setFriendReco]    = useState(false);

  const toggleMood = id => setSelectedMoods(prev =>
    prev.includes(id) ? prev.filter(m=>m!==id) : prev.length<3 ? [...prev,id] : prev
  );

  const toggleMulti = (val, state, setState) => {
    if(val==="all") { setState(["all"]); return; }
    setState(prev => {
      const w = prev.filter(x=>x!=="all");
      if(w.includes(val)) { const n=w.filter(x=>x!==val); return n.length?n:["all"]; }
      return [...w, val];
    });
  };

  const handleGenerate = async () => {
    onShowResults({results:[], selectedMoods, generating:true, onReroll:null});
    try {
      const candidates = await fetchMoodboardCandidates(selectedMoods, duration, mediaTypes, countries, me);
      onShowResults({
        results: candidates.slice(0,3),
        selectedMoods,
        generating: false,
        onReroll: async () => {
          const fresh = await fetchMoodboardCandidates(selectedMoods, duration, mediaTypes, countries, me);
          return { results: [...fresh].sort(()=>Math.random()-0.5).slice(0,3) };
        },
      });
    } catch(e) {
      onShowResults({results:[], selectedMoods, generating:false, onReroll:null});
    }
  };

  const chipStyle = (sel, color="818cf8") => ({
    flexShrink:0,
    border: sel ? `2px solid #${color}` : "2px solid rgba(255,255,255,0.07)",
    borderRadius:"20px", padding:"7px 13px",
    background: sel ? `rgba(${parseInt(color.slice(0,2),16)},${parseInt(color.slice(2,4),16)},${parseInt(color.slice(4,6),16)},0.15)` : "rgba(255,255,255,0.03)",
    cursor:"pointer", color: sel ? `#${color}` : "#9ca3af",
    fontSize:"12px", fontWeight:600, whiteSpace:"nowrap",
    display:"flex", alignItems:"center", gap:"5px", transition:"all 0.15s",
  });

  return (
    <div style={{height:"100%",overflowY:"auto",paddingBottom:"80px"}}>
      <div style={{padding:"24px 20px 10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"3px"}}>
          <span style={{fontSize:"22px"}}>🎭</span>
          <h2 style={{margin:0,fontSize:"20px",fontWeight:800,letterSpacing:"-0.5px",background:"linear-gradient(90deg,#c084fc,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Moodboard</h2>
        </div>
        <p style={{margin:0,fontSize:"12px",color:"#6b7280"}}>Dis-moi ce que tu ressens → l'IA trouve ton anime</p>
      </div>

      {/* MOODS */}
      <div style={{padding:"4px 20px 0"}}>
        <p style={{margin:"0 0 11px",fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>
          Mood <span style={{color:"#4b5563",fontWeight:400,textTransform:"none"}}>(max 3)</span>
        </p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
          {MOODS.map(m=>{const sel=selectedMoods.includes(m.id);return(
            <button key={m.id} onClick={()=>toggleMood(m.id)} style={{border:sel?`2px solid ${m.color}`:"2px solid rgba(255,255,255,0.07)",borderRadius:"14px",padding:"14px 6px 12px",background:sel?`${m.color}18`:"rgba(255,255,255,0.03)",cursor:"pointer",transition:"all 0.18s",textAlign:"center",transform:sel?"scale(1.04)":"scale(1)"}}>
              <div style={{fontSize:"24px",marginBottom:"6px"}}>{m.emoji}</div>
              <div style={{fontSize:"11px",fontWeight:700,color:sel?m.color:"#e5e7eb"}}>{m.label}</div>
            </button>
          );})}
        </div>
      </div>

      {/* DURÉE */}
      <div style={{padding:"16px 20px 0"}}>
        <p style={{margin:"0 0 9px",fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>Durée</p>
        <div style={{display:"flex",gap:"7px",overflowX:"auto",paddingBottom:"3px"}}>
          {DURATIONS.map(d=>(
            <button key={d.id} onClick={()=>setDuration(d.id)} style={chipStyle(duration===d.id)}>
              <span>{d.emoji}</span>{d.label}
            </button>
          ))}
        </div>
      </div>

      {/* PAYS D'ORIGINE */}
      <div style={{padding:"12px 20px 0"}}>
        <p style={{margin:"0 0 9px",fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>Pays d'origine</p>
        <div style={{display:"flex",gap:"7px",overflowX:"auto",paddingBottom:"3px"}}>
          {COUNTRIES.map(c=>{
            const sel = countries.includes(c.id);
            return (
              <button key={c.id} onClick={()=>toggleMulti(c.id, countries, setCountries)}
                style={chipStyle(sel,"34D399")}>
                <span>{c.emoji}</span>{c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TYPE */}
      <div style={{padding:"12px 20px 0"}}>
        <p style={{margin:"0 0 9px",fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>Type</p>
        <div style={{display:"flex",gap:"7px",overflowX:"auto",paddingBottom:"3px"}}>
          {MEDIA_TYPES.map(t=>{
            const sel = mediaTypes.includes(t.id);
            return (
              <button key={t.id} onClick={()=>toggleMulti(t.id, mediaTypes, setMediaTypes)}
                style={chipStyle(sel,"c084fc")}>
                <span>{t.emoji}</span>{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* RECO D'AMIS */}
      <div style={{padding:"12px 20px 0"}}>
        <p style={{margin:"0 0 9px",fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>Recommandations d'amis</p>
        <div style={{display:"flex",gap:"7px"}}>
          <button onClick={()=>setFriendReco(false)} style={chipStyle(!friendReco,"6b7280")}>
            <span>🚫</span>Désactivé
          </button>
          <button onClick={()=>setFriendReco(true)} style={{
            ...chipStyle(friendReco,"c084fc"),
            opacity: 0.45, cursor:"not-allowed",
          }} title="Ajoute des amis d'abord">
            <span>👥</span>Activé <span style={{fontSize:"9px",color:"#4b5563",marginLeft:"2px"}}>— bientôt</span>
          </button>
        </div>
      </div>

      {/* STATUS */}
      <div style={{padding:"12px 20px 0"}}>
        <div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.15)",borderRadius:"10px",padding:"8px 12px",fontSize:"11px",color:"#34D399",display:"flex",alignItems:"center",gap:"6px"}}>
          ✓ {me.watched.length} animés vus exclus · 🤖 mood IA activé
        </div>
      </div>

      {/* CTA */}
      <div style={{padding:"18px 20px 0"}}>
        <button onClick={handleGenerate} disabled={selectedMoods.length===0} style={{width:"100%",padding:"16px",borderRadius:"16px",border:"none",background:selectedMoods.length>0?"linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%)":"rgba(255,255,255,0.05)",color:selectedMoods.length>0?"#fff":"#374151",fontWeight:800,fontSize:"15px",cursor:selectedMoods.length>0?"pointer":"not-allowed",boxShadow:selectedMoods.length>0?"0 6px 24px rgba(124,58,237,0.45)":"none"}}>
          {selectedMoods.length>0?"🎬 Générer mes animes":"Choisis un mood d'abord"}
        </button>
      </div>
    </div>
  );
}

// ─── SEARCH PAGE ──────────────────────────────────────────────────────────────
function SearchPage({onOpenDetail}) {
  const {me}=useApp();
  const [query,setQuery]=useState("");
  const [submitted,setSubmitted]=useState(false);
  const [recent,setRecent]=useState(["Berserk","Monster","Psycho-Pass","Seinen"]);
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [filterMood,setFilterMood]=useState(null);
  const [filterType,setFilterType]=useState("all");
  const inputRef=useRef(null);

  useEffect(()=>{ const t=setTimeout(()=>inputRef.current?.focus(),150); return()=>clearTimeout(t); },[]);

  const doSearch=async q=>{
    const t=q.trim(); if(!t) return;
    setQuery(t); setSubmitted(true); setLoading(true); setError(null);
    setRecent(prev=>[t,...prev.filter(r=>r.toLowerCase()!==t.toLowerCase())].slice(0,6));
    try {
      const params={q:t,limit:24,order_by:"score",sort:"desc",sfw:false};
      if(filterType!=="all") params.type=filterType;
      const res=await jikan.searchAnime(params);
      const raw = res.data||[];
      const tLow = t.toLowerCase();
      // Sort: exact match first, then starts-with, then contains, then score
      const sorted = [...raw].sort((a,b)=>{
        const aTitle = (a.title||"").toLowerCase();
        const bTitle = (b.title||"").toLowerCase();
        const aEn    = (a.title_english||"").toLowerCase();
        const bEn    = (b.title_english||"").toLowerCase();
        const score = (x,title,en) =>
          (title===tLow||en===tLow) ? 3 :
          (title.startsWith(tLow)||en.startsWith(tLow)) ? 2 :
          (title.includes(tLow)||en.includes(tLow)) ? 1 : 0;
        return score(b,bTitle,bEn) - score(a,aTitle,aEn);
      });
      setResults(sorted);
    } catch(e){setError(e.message);}
    finally{setLoading(false);}
  };

  const clearSearch=()=>{setQuery("");setSubmitted(false);setResults([]);setFilterMood(null);inputRef.current?.focus();};
  const filtered=results.filter(a=>!filterMood||getMoodTags(ptsStore[a.mal_id]||{}).includes(filterMood));

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",paddingBottom:"80px"}}>
      <div style={{padding:"14px 14px 12px",flexShrink:0}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",fontSize:"15px",pointerEvents:"none",color:"#6b7280"}}>🔍</span>
          <input ref={inputRef} value={query} onChange={e=>{setQuery(e.target.value);if(submitted&&e.target.value==="")clearSearch();}} onKeyDown={e=>e.key==="Enter"&&doSearch(query)} placeholder="Titre, genre…" style={{width:"100%",boxSizing:"border-box",padding:"13px 40px 13px 38px",borderRadius:"14px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",color:"#f3f4f6",fontSize:"15px",outline:"none"}}/>
          {query&&<button onClick={clearSearch} style={{position:"absolute",right:"12px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"16px"}}>✕</button>}
        </div>
      </div>
      {!submitted&&(
        <div style={{flex:1,padding:"4px 16px 0"}}>
          <div style={{fontSize:"11px",fontWeight:700,color:"#4b5563",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>Recherches récentes</div>
          {recent.map((r,i)=>(
            <button key={i} onClick={()=>doSearch(r)} style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 4px",background:"none",border:"none",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.05)",width:"100%",textAlign:"left"}}>
              <span style={{fontSize:"14px",color:"#4b5563"}}>🕐</span>
              <span style={{fontSize:"14px",color:"#9ca3af",fontWeight:500}}>{r}</span>
              <span style={{marginLeft:"auto",fontSize:"12px",color:"#374151",transform:"rotate(45deg)",display:"inline-block"}}>↗</span>
            </button>
          ))}
        </div>
      )}
      {submitted&&<>
        <div style={{padding:"0 14px 8px",flexShrink:0}}>
          <div style={{display:"flex",gap:"6px",overflowX:"auto",paddingBottom:"3px"}}>
            <button onClick={()=>setFilterMood(null)} style={{flexShrink:0,borderRadius:"20px",padding:"5px 11px",border:!filterMood?"2px solid #818cf8":"2px solid rgba(255,255,255,0.07)",background:!filterMood?"rgba(129,140,248,0.15)":"rgba(255,255,255,0.03)",color:!filterMood?"#818cf8":"#6b7280",fontSize:"10px",fontWeight:700,cursor:"pointer"}}>Tous</button>
            {MOODS.map(m=><button key={m.id} onClick={()=>setFilterMood(filterMood===m.id?null:m.id)} style={{flexShrink:0,borderRadius:"20px",padding:"5px 10px",border:filterMood===m.id?`2px solid ${m.color}`:"2px solid rgba(255,255,255,0.07)",background:filterMood===m.id?`${m.color}18`:"rgba(255,255,255,0.03)",color:filterMood===m.id?m.color:"#6b7280",fontSize:"10px",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{m.emoji} {m.label}</button>)}
          </div>
        </div>
        <div style={{padding:"0 14px 6px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <span style={{fontSize:"10px",color:"#4b5563"}}>{loading?"Recherche MAL…":`${filtered.length} résultats`}</span>
          <div style={{display:"flex",gap:"4px"}}>
            {["all","TV","Movie","OVA"].map(t=><button key={t} onClick={()=>setFilterType(t)} style={{borderRadius:"7px",padding:"4px 8px",border:filterType===t?"1px solid #c084fc":"1px solid rgba(255,255,255,0.08)",background:filterType===t?"rgba(192,132,252,0.15)":"transparent",color:filterType===t?"#c084fc":"#6b7280",fontSize:"9px",fontWeight:700,cursor:"pointer"}}>{t}</button>)}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 14px"}}>
          {loading&&<Spinner label="Recherche en cours…"/>}
          {error&&<div style={{textAlign:"center",padding:"30px",color:"#ef4444",fontSize:"12px"}}>Erreur API: {error}</div>}
          {!loading&&filtered.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#374151"}}><div style={{fontSize:"34px",marginBottom:"8px"}}>😶</div><p>Aucun résultat</p></div>}
          {!loading&&(<div style={{display:"flex",flexDirection:"column",gap:"9px"}}>
            {filtered.map(a=>{
              const isW=me.watched.includes(a.mal_id),myR=me.ratings[a.mal_id];
              return (
                <div key={a.mal_id} onClick={()=>onOpenDetail(a)} style={{display:"flex",gap:"11px",background:"rgba(255,255,255,0.04)",borderRadius:"14px",border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden",cursor:"pointer"}}>
                  <div style={{width:"64px",flexShrink:0,position:"relative"}}>
                    <img src={a.images?.jpg?.large_image_url||a.images?.jpg?.image_url} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",minHeight:"96px"}} onError={e=>{e.target.src="https://placehold.co/64x96/1a1a2e/818cf8?text=?";}}/>
                    {isW&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px"}}>✓</div>}
                    {a.score&&<div style={{position:"absolute",bottom:"4px",right:"4px",background:"rgba(0,0,0,0.75)",borderRadius:"4px",padding:"1px 4px",fontSize:"9px",fontWeight:800,color:"#fbbf24"}}>★{a.score}</div>}
                  </div>
                  <div style={{flex:1,padding:"9px 9px 9px 0",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:"12px",fontWeight:800,color:"#f3f4f6",lineHeight:1.3,marginBottom:"2px"}}>{a.title}</div>
                      <div style={{fontSize:"10px",color:"#6b7280",marginBottom:"4px"}}>{a.year||"?"} · {a.type}{a.episodes?` · ${a.episodes} eps`:""}</div>
                      <div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>{(a.genres||[]).slice(0,2).map(g=><span key={g.name} style={{fontSize:"9px",background:"rgba(129,140,248,0.12)",color:"#818cf8",borderRadius:"4px",padding:"1px 5px",fontWeight:600}}>{g.name}</span>)}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"5px",marginTop:"5px"}}>
                      {myR&&<span style={{fontSize:"10px",color:"#a78bfa"}}>Moi:{myR.score}/10</span>}
                      <div style={{marginLeft:"auto",display:"flex",gap:"3px",flexWrap:"wrap"}}>
                        {topMoods(ptsToPct(ptsStore[a.mal_id]||{}),3).map(([mid,val])=>{
                          const m=getMoodObj(mid);
                          return m?<span key={mid} style={{fontSize:"9px",color:m.color,fontWeight:700}}>{m.emoji}{val}%</span>:null;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>)}
        </div>
      </>}
    </div>
  );
}

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────
function FeedPage()  { return <div style={{padding:"80px 20px",color:"#6b7280",textAlign:"center"}}><div style={{fontSize:"48px",marginBottom:"12px"}}>🏠</div><p style={{fontWeight:700,color:"#9ca3af"}}>Feed — bientôt</p></div>; }
function ForumPage() { return <div style={{padding:"80px 20px",color:"#6b7280",textAlign:"center"}}><div style={{fontSize:"48px",marginBottom:"12px"}}>💬</div><p style={{fontWeight:700,color:"#9ca3af"}}>Forum — bientôt</p></div>; }

function SearchTabIcon({active}) {
  const [anim,setAnim]=useState(false);
  const [spiral,setSpiral]=useState(false);
  useEffect(()=>{
    if(active){setAnim(true);const t1=setTimeout(()=>setSpiral(true),220),t2=setTimeout(()=>setAnim(false),500);return()=>{clearTimeout(t1);clearTimeout(t2);};}
    else{setAnim(true);setSpiral(false);const t=setTimeout(()=>setAnim(false),300);return()=>clearTimeout(t);}
  },[active]);
  return (
    <div style={{width:"28px",height:"28px",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.25s",transform:anim?"scale(1.3) rotate(20deg)":"scale(1) rotate(0deg)",filter:active?"none":"grayscale(1) opacity(0.4)"}}>
      {spiral?<span style={{fontSize:"20px",animation:"spinIn 0.25s ease-out"}}>🌀</span>
        :<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke={active?"#c084fc":"#6b7280"} strokeWidth="2"/><line x1="12.5" y1="12.5" x2="17" y2="17" stroke={active?"#c084fc":"#6b7280"} strokeWidth="2" strokeLinecap="round"/></svg>}
      <style>{`@keyframes spinIn{from{transform:rotate(-180deg) scale(0.5);opacity:0}to{transform:rotate(0deg) scale(1);opacity:1}}`}</style>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function AniMoodApp() {
  const [session, setSession]       = useState(()=>loadSession());
  const [activeTab, setActiveTab]   = useState("moodboard");
  const [showSettings, setShowSettings] = useState(false);
  const [overlay, setOverlay]       = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [profileReady, setProfileReady] = useState(false);

  const [me, setMe] = useState(DEFAULT_PROFILE);

  // Load profile async (Supabase first, localStorage fallback)
  useEffect(()=>{
    if(!session) return;
    loadProfile("brice").then(p => {
      if(p) setMe(p);
      setProfileReady(true);
    });
  }, [session]);

  const handleLogin  = (s) => { saveSession(s); setSession(s); };
  const handleLogout = () => { clearSession(); setSession(null); setProfileReady(false); };

  if(!session) return <LoginScreen onLogin={handleLogin}/>;
  if(!profileReady) return (
    <div style={{minHeight:"100vh",background:"#09080f",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"16px"}}>
      <span style={{fontSize:"32px"}}>🌀</span>
      <Spinner label="Chargement du profil…"/>
    </div>
  );

  if(!session) return <LoginScreen onLogin={handleLogin}/>;

  const ctx = { me, setMe };
  const openDetail  = a => setDetailData({mal_id:a.mal_id, seedData:a});
  const closeDetail = () => setDetailData(null);

  const TABS_CFG = [
    {id:"feed",      label:"Feed",   icon:()=><span style={{fontSize:"20px",filter:activeTab==="feed"?"none":"grayscale(1) opacity(0.4)"}}>🏠</span>},
    {id:"moodboard", label:"Mood",   icon:()=><span style={{fontSize:"20px",filter:activeTab==="moodboard"?"none":"grayscale(1) opacity(0.4)"}}>🎭</span>},
    {id:"search",    label:"Search", icon:()=><SearchTabIcon active={activeTab==="search"}/>},
    {id:"forum",     label:"Forum",  icon:()=><span style={{fontSize:"20px",filter:activeTab==="forum"?"none":"grayscale(1) opacity(0.4)"}}>💬</span>},
    {id:"profile",   label:"Profil", icon:()=><span style={{fontSize:"20px",filter:activeTab==="profile"?"none":"grayscale(1) opacity(0.4)"}}>👤</span>},
  ];

  const pages = {
    feed:      <FeedPage/>,
    moodboard: <MoodboardPage onShowResults={d=>setOverlay(d)}/>,
    search:    <SearchPage onOpenDetail={openDetail}/>,
    forum:     <ForumPage/>,
    profile:   <ProfilePage onOpenDetail={openDetail} onOpenSettings={()=>setShowSettings(true)}/>,
  };

  return (
    <AppContext.Provider value={ctx}>
      <div style={{maxWidth:"430px",margin:"0 auto",height:"100vh",background:"#09080f",color:"#f3f4f6",fontFamily:"'SF Pro Display',-apple-system,sans-serif",display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>

        {/* TOP BAR */}
        <div style={{position:"absolute",top:0,left:0,right:0,zIndex:10,padding:"16px 20px 12px",background:"linear-gradient(180deg,rgba(9,8,15,0.98) 0%,rgba(9,8,15,0) 100%)",display:"flex",alignItems:"center",justifyContent:"space-between",pointerEvents:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
            <span style={{fontSize:"18px"}}>🌀</span>
            <span style={{fontWeight:900,fontSize:"16px",letterSpacing:"-0.5px",background:"linear-gradient(90deg,#c084fc,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>AniMood</span>
          </div>
          <div style={{pointerEvents:"all",cursor:"pointer"}} onClick={()=>setActiveTab("profile")}>
            <span style={{fontSize:"13px",color:"#6b7280"}}>{me.avatar} {me.name}</span>
          </div>
        </div>

        {/* PAGE */}
        <div style={{flex:1,overflowY:"auto",paddingTop:"56px"}}>{pages[activeTab]}</div>

        {/* BOTTOM NAV */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(9,8,15,0.95)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",padding:"8px 0 20px",zIndex:100}}>
          {TABS_CFG.map(tab=>{
            const active=tab.id===activeTab;
            return <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"3px",padding:"6px 0"}}>
              {tab.icon()}
              <span style={{fontSize:"10px",fontWeight:active?700:500,color:active?"#c084fc":"#4b5563"}}>{tab.label}</span>
              {active&&<div style={{width:"16px",height:"2px",borderRadius:"2px",background:"linear-gradient(90deg,#7c3aed,#818cf8)",marginTop:"1px"}}/>}
            </button>;
          })}
        </div>

        {/* SETTINGS OVERLAY */}
        {showSettings&&(
          <div style={{position:"absolute",inset:0,zIndex:500,background:"#09080f",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:"12px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              <button onClick={()=>setShowSettings(false)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:"20px",padding:0}}>←</button>
              <span style={{fontSize:"16px",fontWeight:800,color:"#f3f4f6"}}>Paramètres</span>
            </div>
            <SettingsPage onLogout={()=>{handleLogout();setShowSettings(false);}}/>
          </div>
        )}

        {/* MOODBOARD RESULTS */}
        {overlay&&(
          <ResultsOverlay
            results={overlay.results} selectedMoods={overlay.selectedMoods} generating={overlay.generating}
            onClose={()=>setOverlay(null)}
            onReroll={async()=>{
              if(!overlay.onReroll) return;
              setOverlay(p=>({...p,generating:true}));
              const{results}=await overlay.onReroll();
              setOverlay(p=>({...p,results,generating:false}));
            }}
            onOpenDetail={a=>{setOverlay(null);openDetail(a);}}
          />
        )}

        {/* ANIME DETAIL */}
        {detailData&&<AnimeDetail malId={detailData.mal_id} seedData={detailData.seedData} onClose={closeDetail}/>}
      </div>
    </AppContext.Provider>
  );
}
