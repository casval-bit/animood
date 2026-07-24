// ─── JIKAN CLIENT ─────────────────────────────────────────────────────────────
import { sb } from "./supabase.js";

const JIKAN_BASE = "https://api.jikan.moe/v4";
export const apiCache = {};
const pendingRequests = {};
let queueRunning = false;
const requestQueue = [];

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    if(!queueRunning) runQueue();
  });
}

async function runQueue() {
  if(queueRunning || requestQueue.length === 0) return;
  queueRunning = true;
  while(requestQueue.length > 0) {
    const { fn, resolve, reject } = requestQueue.shift();
    try { resolve(await fn()); } catch(e) { reject(e); }
    if(requestQueue.length > 0) await new Promise(r => setTimeout(r, 370));
  }
  queueRunning = false;
}

async function jikanFetch(url) {
  for(let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url);
    if(r.status === 429) { await new Promise(res => setTimeout(res, 2000 * Math.pow(2, attempt))); continue; }
    if(!r.ok) throw new Error(`Jikan ${r.status}`);
    return r.json();
  }
  throw new Error("Jikan 429 — réessaie dans quelques secondes");
}

async function jikanCall(key, url) {
  if(apiCache[key]) return apiCache[key];
  if(pendingRequests[key]) return pendingRequests[key];
  const promise = enqueue(() => jikanFetch(url))
    .then(json => { apiCache[key] = json; delete pendingRequests[key]; return json; })
    .catch(e => { delete pendingRequests[key]; throw e; });
  pendingRequests[key] = promise;
  return promise;
}

export function supabaseRowToAnime(row) {
  return {
    mal_id: row.mal_id, title: row.title, title_english: row.title_en,
    title_japanese: row.title_jp, synopsis: row.synopsis, score: row.score,
    scored_by: row.scored_by, rank: row.rank, popularity: row.popularity,
    year: row.year, episodes: row.episodes, duration: row.duration,
    type: row.type, status: row.status, source: row.source, rating: row.rating,
    images: { jpg: { image_url: row.image_url, large_image_url: row.large_image } },
    trailer: row.trailer_url ? { url: row.trailer_url } : null,
    genres: row.genres||[], themes: row.themes||[], demographics: row.demographics||[],
    studios: row.studios||[], producers: row.producers||[], streaming: row.streaming||[],
    staff: row.staff||[], characters: row.characters||[], _fromCache: true,
  };
}

function animeToSupabaseRow(a) {
  return {
    mal_id: a.mal_id, title: a.title, title_en: a.title_english, title_jp: a.title_japanese,
    synopsis: a.synopsis, score: a.score, scored_by: a.scored_by, rank: a.rank,
    popularity: a.popularity, year: a.year || a.aired?.prop?.from?.year,
    episodes: a.episodes, duration: a.duration, type: a.type, status: a.status,
    source: a.source, rating: a.rating, image_url: a.images?.jpg?.image_url,
    large_image: a.images?.jpg?.large_image_url, trailer_url: a.trailer?.url || a.trailer?.embed_url || null,
    genres: a.genres||[], themes: a.themes||[], demographics: a.demographics||[],
    studios: a.studios||[], producers: a.producers||[], streaming: a.streaming||[],
  };
}

async function getAnimeData(mal_id) {
  const key = `anime-${mal_id}`;
  if(apiCache[key]) return apiCache[key];
  try {
    const row = await sb.getAnimeFromCache(mal_id);
    if(row) { const data = supabaseRowToAnime(row); apiCache[key] = { data }; return { data }; }
  } catch { /* fall through to Jikan */ }
  const res = await jikanCall(key, `${JIKAN_BASE}/anime/${mal_id}/full`);
  if(res?.data) sb.upsertAnimeCache(animeToSupabaseRow(res.data)).catch(()=>{});
  return res;
}

export const jikan = {
  searchAnime: async (params) => {
    // Try Supabase cache first — apply type filter if set
    if(params.q && !params.genres && !params.page) {
      try {
        let url = `anime_cache?title=ilike.*${encodeURIComponent(params.q)}*&order=score.desc.nullslast&limit=${params.limit||24}`;
        if(params.type && params.type !== "all") url += `&type=eq.${params.type}`;
        const rows = await sb.query(url);
        if(rows?.length >= 3) return { data: rows.map(supabaseRowToAnime) };
      } catch { /* fall through to Jikan */ }
    }
    // Fallback to Jikan
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => v != null && qs.set(k, String(v)));
    try {
      return await jikanCall(`search-${qs}`, `${JIKAN_BASE}/anime?${qs}`);
    } catch(e) {
      // If Jikan is down, try Supabase without minimum result count
      if(params.q) {
        try {
          let url = `anime_cache?title=ilike.*${encodeURIComponent(params.q)}*&order=score.desc.nullslast&limit=${params.limit||24}`;
          if(params.type && params.type !== "all") url += `&type=eq.${params.type}`;
          const rows = await sb.query(url);
          if(rows?.length) return { data: rows.map(supabaseRowToAnime) };
        } catch { /* Supabase also unavailable — rethrow below */ }
      }
      throw e;
    }
  },
  getAnime: (id) => getAnimeData(id),
  getStaff: (id) => {
    const cached = apiCache[`anime-${id}`];
    if(cached?.data?._fromCache && cached.data.staff?.length) return Promise.resolve({ data: cached.data.staff });
    return jikanCall(`staff-${id}`, `${JIKAN_BASE}/anime/${id}/staff`);
  },
  getCharacters: (id) => {
    const cached = apiCache[`anime-${id}`];
    if(cached?.data?._fromCache && cached.data.characters?.length) return Promise.resolve({ data: cached.data.characters });
    return jikanCall(`chars-${id}`, `${JIKAN_BASE}/anime/${id}/characters`);
  },
  getPerson:        (id) => jikanCall(`person-${id}`,  `${JIKAN_BASE}/people/${id}/full`),
  getPersonVoices:  (id) => jikanCall(`pva-${id}`,     `${JIKAN_BASE}/people/${id}/voices`),
  getPersonAnime:   (id) => jikanCall(`panim-${id}`,   `${JIKAN_BASE}/people/${id}/anime`),
  getProducerAnime: (id) => jikanCall(`prod-${id}`,    `${JIKAN_BASE}/anime?producers=${id}&order_by=score&sort=desc&limit=24`),
  getProducerFull:  (id) => jikanCall(`prodfull-${id}`, `${JIKAN_BASE}/producers/${id}/full`),
};

// ─── Popular anime prefill — used so category pages are never empty ───────────
// `type` narrows to a single Jikan type (TV, Movie, OVA…) so the Search page can
// show a type-appropriate "populaires" list instead of one dominated by TV series.
export async function fetchPopularAnime(limit = 24, type = null) {
  try {
    const typeParam = type ? `&type=eq.${encodeURIComponent(type)}` : "";
    const rows = await sb.query(`anime_cache?order=score.desc.nullslast&limit=${limit}${typeParam}&select=mal_id,title,title_en,synopsis,score,rank,year,episodes,type,image_url,large_image,genres,studios`);
    if(rows?.length) return rows.map(supabaseRowToAnime);
  } catch { /* fall through to Jikan */ }
  try {
    const params = { order_by:"score", sort:"desc", limit, sfw:false };
    if(type) params.type = type;
    const data = await jikan.searchAnime(params);
    return data.data || [];
  } catch { return []; }
}

// ─── Live title suggestions for the search autocomplete — Supabase-only, no rate limit ───
// Prefix match first (so "Att" surfaces "Attack on Titan" via its English title before
// unrelated mid-word hits), falling back to a substring search when too few prefix hits exist.
export async function fetchTitleSuggestions(q, limit = 10) {
  const t = q.trim();
  if(!t) return [];
  const enc = encodeURIComponent(t);
  const select = "mal_id,title,title_en,image_url,large_image,score,year,type,episodes,genres";
  try {
    const prefixRows = await sb.query(`anime_cache?or=(title.ilike.${enc}*,title_en.ilike.${enc}*)&order=score.desc.nullslast&limit=${limit}&select=${select}`);
    if(prefixRows?.length >= 3) return prefixRows;
    const substrRows = await sb.query(`anime_cache?or=(title.ilike.*${enc}*,title_en.ilike.*${enc}*)&order=score.desc.nullslast&limit=${limit}&select=${select}`);
    return substrRows?.length ? substrRows : (prefixRows || []);
  } catch { return []; }
}

// ─── Forum "actus" feed — new arrivals, upcoming releases, latest trailers ───
const NEWS_SELECT = "mal_id,title,title_en,synopsis,score,year,episodes,type,image_url,large_image,genres,status,fetched_at,trailer_url,popularity";
const NEWS_TYPES = "TV,Movie,OVA,ONA,Special"; // excludes CM/Music/etc — junk for a news feed

export async function fetchNewAnime(limit = 12) {
  try {
    const rows = await sb.query(`anime_cache?type=in.(${NEWS_TYPES})&status=neq.Not%20yet%20aired&order=fetched_at.desc.nullslast&limit=${limit}&select=${NEWS_SELECT}`);
    return (rows||[]).map(supabaseRowToAnime);
  } catch { return []; }
}

export async function fetchUpcomingAnime(limit = 12) {
  const year = new Date().getFullYear();
  try {
    const rows = await sb.query(`anime_cache?type=in.(${NEWS_TYPES})&status=eq.Not%20yet%20aired&year=gte.${year}&order=year.asc,popularity.asc.nullslast&limit=${limit}&select=${NEWS_SELECT}`);
    return (rows||[]).map(supabaseRowToAnime);
  } catch { return []; }
}

export async function fetchLatestTrailers(limit = 12) {
  try {
    const rows = await sb.query(`anime_cache?type=in.(${NEWS_TYPES})&trailer_url=not.is.null&order=fetched_at.desc.nullslast&limit=${limit}&select=${NEWS_SELECT}`);
    return (rows||[]).map(supabaseRowToAnime);
  } catch { return []; }
}

export function prefetchAnimes(ids) {
  ids.slice(0, 5).forEach((id, i) => {
    setTimeout(() => { if(!apiCache[`anime-${id}`]) jikan.getAnime(id).catch(()=>{}); }, i * 400);
  });
}
