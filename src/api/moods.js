// ─── MOOD POINTS STORE ────────────────────────────────────────────────────────
import { sb } from "./supabase.js";
import { MOOD_KEYS } from "../constants/moods.js";

const PTS_CACHE_KEY       = "animood_mood_pts_v4"; // bump cache key to force refresh
const COMMUNITY_CACHE_KEY = "animood_community_votes";

function loadPtsCache()        { try { return JSON.parse(localStorage.getItem(PTS_CACHE_KEY)||"{}"); } catch { return {}; } }
function savePtsCache(s)       { try { localStorage.setItem(PTS_CACHE_KEY, JSON.stringify(s)); } catch {} }
function loadCommunityCache()  { try { return JSON.parse(localStorage.getItem(COMMUNITY_CACHE_KEY)||"{}"); } catch { return {}; } }
function saveCommunityCache(s) { try { localStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify(s)); } catch {} }

export let ptsStore       = loadPtsCache();
export let communityStore = loadCommunityCache();

export function getCombinedPts(mal_id) {
  const base = ptsStore[mal_id] || {};
  const comm = communityStore[mal_id] || {};
  const out = {};
  MOOD_KEYS.forEach(k => { out[k] = (base[k]||0) + (comm[k]||0); });
  return out;
}

export function ptsToPct(pts) {
  if(!pts) return {};
  const total = MOOD_KEYS.reduce((a,k) => a + (pts[k]||0), 0) || 1;
  const out = {};
  MOOD_KEYS.forEach(k => { out[k] = Math.round((pts[k]||0) / total * 100); });
  return out;
}

export function getMoodTags(pts) {
  if(!pts) return [];
  const total = MOOD_KEYS.reduce((a,k) => a + (pts[k]||0), 0);
  if(!total) return [];
  return MOOD_KEYS
    .map(k => [k, (pts[k]||0)/total*100])
    .filter(([,pct]) => pct >= 15)
    .sort((a,b) => b[1]-a[1])
    .slice(0,3)
    .map(([k]) => k);
}

export function topMoods(pts, n=3) {
  if(!pts) return [];
  const total = MOOD_KEYS.reduce((a,k) => a + (pts[k]||0), 0) || 1;
  return MOOD_KEYS
    .map(k => [k, Math.round((pts[k]||0) / total * 100)])
    .filter(([,v]) => v > 0)
    .sort((a,b) => b[1]-a[1])
    .slice(0,n);
}

export function genreFallbackV2(anime) {
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
  const exceptThrills = {...out}; delete exceptThrills.thrills;
  const total = Object.values(exceptThrills).reduce((a,b)=>a+b,0)||100;
  Object.keys(exceptThrills).forEach(k=>{out[k]=Math.round(out[k]*100/total);});
  out.thrills = Math.min(33, out.thrills);
  return out;
}

export async function addUserVote(username, mal_id, newMoods) {
  let prevPts = {};
  try {
    const rows = await sb.query(`user_votes?username=eq.${encodeURIComponent(username)}&mal_id=eq.${mal_id}&select=pts_added&limit=1`);
    if(rows?.[0]?.pts_added) prevPts = rows[0].pts_added;
  } catch {}
  let commBase = {};
  try {
    const row = await sb.getCommunityVotes(mal_id);
    if(row) MOOD_KEYS.forEach(k => { commBase[k] = row[k]||0; });
  } catch {}
  Object.entries(prevPts).forEach(([k,v]) => { commBase[k] = Math.max(0, (commBase[k]||0) - v); });
  const pointsPerMood = newMoods.length === 1 ? 4 : newMoods.length === 2 ? 2 : 1;
  const addedPts = {};
  newMoods.forEach(m => { addedPts[m] = pointsPerMood; commBase[m] = (commBase[m]||0) + pointsPerMood; });
  communityStore[mal_id] = commBase;
  saveCommunityCache(communityStore);
  try {
    await Promise.all([
      sb.upsertCommunityVotes(mal_id, commBase),
      sb.upsertUserVote(username, mal_id, newMoods, addedPts),
    ]);
  } catch(e) { console.warn("Vote sync failed:", e); }
  return getCombinedPts(mal_id);
}

export async function getPtsForAnime(anime) {
  const id = anime.mal_id;
  if(ptsStore[id] === undefined) {
    try {
      // ── Use mood_pts_v4 ──
      const rows = await sb.query(`mood_pts_v4?mal_id=eq.${id}&limit=1`);
      if(rows?.[0]) {
        const pts = {};
        MOOD_KEYS.forEach(k => { pts[k] = rows[0][k]||0; });
        ptsStore[id] = pts;
        savePtsCache(ptsStore);
      }
    } catch {}
  }
  try {
    const row = await sb.getCommunityVotes(id);
    if(row) { const comm = {}; MOOD_KEYS.forEach(k => { comm[k] = row[k]||0; }); communityStore[id] = comm; }
    else communityStore[id] = {};
    saveCommunityCache(communityStore);
  } catch { if(communityStore[id] === undefined) communityStore[id] = {}; }
  if(!ptsStore[id]) { ptsStore[id] = genreFallbackV2(anime); savePtsCache(ptsStore); }
  return getCombinedPts(id);
}

// Version groupée de getPtsForAnime : 2 requêtes pour tout un lot (au lieu de 2 par animé), pour pouvoir
// analyser un large éventail de candidats dans le Moodboard.
export async function getPtsBatch(animes) {
  const ids = [...new Set(animes.map(a => a.mal_id))];
  const missing = ids.filter(id => ptsStore[id] === undefined);
  const chunk = (arr, n) => { const out = []; for(let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  if(missing.length) {
    const parts = await Promise.all(chunk(missing, 120).map(c => sb.getMoodPtsBatch(c)));
    const rows = Object.assign({}, ...parts);
    missing.forEach(id => {
      const r = rows[id];
      if(!r) return;
      const pts = {};
      MOOD_KEYS.forEach(k => { pts[k] = r[k]||0; });
      ptsStore[id] = pts;
    });
    savePtsCache(ptsStore);
  }
  const toVote = ids.filter(id => communityStore[id] === undefined);
  if(toVote.length) {
    const parts = await Promise.all(chunk(toVote, 120).map(async c => {
      try { return await sb.query(`mood_community_votes?mal_id=in.(${c.join(",")})&limit=${c.length}`) || []; } catch { return null; }
    }));
    const got = new Map();
    parts.forEach(rows => (rows||[]).forEach(r => got.set(r.mal_id, r)));
    toVote.forEach((id, i) => {
      if(parts[Math.floor(i / 120)] === null) return; // lot en erreur : on réessaiera plus tard
      const row = got.get(id);
      const comm = {};
      if(row) MOOD_KEYS.forEach(k => { comm[k] = row[k]||0; });
      communityStore[id] = comm;
    });
    saveCommunityCache(communityStore);
  }
  const byId = new Map(animes.map(a => [a.mal_id, a]));
  const out = {};
  ids.forEach(id => {
    if(!ptsStore[id]) ptsStore[id] = genreFallbackV2(byId.get(id));
    out[id] = getCombinedPts(id);
  });
  savePtsCache(ptsStore);
  return out;
}
