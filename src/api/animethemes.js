// ─── ANIMETHEMES.MOE CLIENT — real anime opening/ending + artist data ─────────
// Public, unauthenticated API. No local caching/table to maintain: artist ↔
// anime ↔ song links are fetched live, same spirit as the Jikan producers
// lookup used for studios.
import { sb } from "./supabase.js";
import { POPULAR_ARTIST_NAMES } from "../constants/popularArtists.js";
import { ARTIST_SEED } from "../constants/artistSeed.js";

const BASE = "https://api.animethemes.moe";

// AnimeThemes sits behind Cloudflare and its origin sometimes hangs (522)
// instead of failing fast — cap each request so the UI can show an error
// rather than an endless spinner.
function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .catch(() => { throw new Error("AnimeThemes unreachable"); })
    .finally(() => clearTimeout(timer));
}

function extractMalId(resources) {
  const r = (resources || []).find(r => r.site === "MyAnimeList");
  return r ? r.external_id : null;
}

// The artist endpoint rejects an include nested past 3 levels (e.g.
// "songs.animethemes.anime.resources" → 422), so the MAL id isn't available
// up front here — we only get each anime's AnimeThemes slug. resolveMalId()
// looks it up lazily (by slug, a single-anime lookup does allow ".resources").
function normalizeArtist(artist) {
  const seen = new Set();
  const themes = [];
  (artist.songs || []).forEach(song => {
    (song.animethemes || []).forEach(theme => {
      const anime = theme.anime;
      if(!anime) return;
      const key = `${anime.id}-${theme.slug}`;
      if(seen.has(key)) return;
      seen.add(key);
      themes.push({
        animeId: anime.id,
        animeSlug: anime.slug,
        animeTitle: anime.name,
        year: anime.year || null,
        type: theme.type,     // "OP" or "ED"
        slug: theme.slug,     // e.g. "OP1", "ED2"
        songTitle: song.title,
      });
    });
  });
  themes.sort((a, b) => (b.year || 0) - (a.year || 0));
  return { slug: artist.slug, name: artist.name, themes };
}

// ─── artist_cache (Supabase) — copy kept by scripts/sync_artists.mjs so the
// Artist tab survives AnimeThemes outages. Rows look like live artists, plus a
// resolved malId on each theme. Empty/missing table → [] (live API only).
const rowToArtist = (row) => ({ slug: row.slug, name: row.name, themes: row.themes || [] });

async function cachedPopularArtists(limit) {
  const rows = await sb.query(`artist_cache?popular_rank=not.is.null&order=popular_rank.asc&limit=${limit}&select=slug,name,themes`).catch(() => []);
  return (rows || []).map(rowToArtist).filter(a => a.themes.length);
}

async function cachedSearchArtists(query, limit) {
  const enc = encodeURIComponent(query);
  const rows = await sb.query(`artist_cache?name=ilike.*${enc}*&limit=${limit}&select=slug,name,themes`).catch(() => []);
  return (rows || []).map(rowToArtist).filter(a => a.themes.length);
}

const seedSearch = (q, limit) =>
  ARTIST_SEED.filter(a => a.name.toLowerCase().includes(q.toLowerCase())).slice(0, limit);

// Live search → cached copy → bundled seed. Never throws: an outage just
// narrows the results instead of showing an error.
export async function searchArtists(query, limit = 24) {
  const q = query.trim();
  if(!q) return [];
  try {
    return await searchArtistsLive(q, limit);
  } catch {
    const cached = await cachedSearchArtists(q, limit);
    return cached.length ? cached : seedSearch(q, limit);
  }
}

async function searchArtistsLive(q, limit, timeoutMs) {
  const url = `${BASE}/artist?q=${encodeURIComponent(q)}&page[size]=${limit}&include=songs.animethemes.anime`;
  const res = await fetchWithTimeout(url, timeoutMs);
  if(!res.ok) throw new Error(`AnimeThemes ${res.status}`);
  const json = await res.json();
  return (json.artists || []).map(normalizeArtist).filter(a => a.themes.length);
}

let popularArtistsCache = null;

// Cached copy first (one Supabase query, works during AnimeThemes outages),
// then the live API, then the bundled seed. Never throws.
export async function fetchPopularArtists(limit = 16) {
  if(popularArtistsCache) return popularArtistsCache.slice(0, limit);
  const cached = await cachedPopularArtists(limit);
  if(cached.length) { popularArtistsCache = cached; return cached; }

  const live = await fetchPopularArtistsLive(limit).catch(() => []);
  if(live.length) { popularArtistsCache = live; return live; }
  return ARTIST_SEED.slice(0, limit);
}

async function fetchPopularArtistsLive(limit) {
  const names = POPULAR_ARTIST_NAMES.slice(0, limit);
  const pick = (name, found) => found.find(a => a.name.toLowerCase() === name.toLowerCase()) || found[0] || null;
  // Probe with the first name alone, on a short timeout: during an outage the
  // seed shows up after ~3s instead of 16 requests that all hang.
  const first = pick(names[0], await searchArtistsLive(names[0], 3, 3000));
  const rest = await Promise.all(names.slice(1).map(name =>
    searchArtistsLive(name, 3).then(found => pick(name, found)).catch(() => null)));
  return [first, ...rest].filter(Boolean);
}

// Resolves a MAL id from an AnimeThemes anime slug — called on demand (e.g.
// when a user clicks a theme in the artist modal) rather than up front.
export async function resolveMalId(animeSlug) {
  if(!animeSlug) return null;
  const url = `${BASE}/anime/${encodeURIComponent(animeSlug)}?include=resources`;
  const res = await fetch(url);
  if(!res.ok) return null;
  const json = await res.json();
  return extractMalId(json.anime?.resources);
}

// Finds the openings/endings for one anime (matched by MAL id among the
// title's search results) — used to show "🎵 Opening sung by …" reciprocally
// on the anime detail page.
export async function fetchThemesForAnime(title, malId) {
  if(!title) return [];
  const url = `${BASE}/anime?q=${encodeURIComponent(title)}&page[size]=5&include=animethemes.song.artists,resources`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`AnimeThemes ${res.status}`);
  const json = await res.json();
  const list = json.anime || [];
  const match = list.find(a => extractMalId(a.resources) === malId) || list[0];
  if(!match) return [];
  return (match.animethemes || [])
    .map(theme => ({
      slug: theme.slug,
      type: theme.type,
      songTitle: theme.song?.title || null,
      artists: (theme.song?.artists || []).map(ar => ({ name: ar.name, slug: ar.slug })),
    }))
    .filter(theme => theme.artists.length > 0);
}

// Resolves a direct, always-playable audio (and video) link for one anime's
// opening — used by scripts/sync_opquiz_pool.mjs to build the blind-test pool.
// AnimeThemes hosts the files itself (no YouTube region-lock/Content-ID risk),
// so unlike animeOpenings.js's youtubeId picks, these don't need per-entry
// manual verification. Returns null when no OP with a resolvable audio file
// exists for this anime.
export async function fetchOpeningAudio(title, malId) {
  if(!title) return null;
  const url = `${BASE}/anime?q=${encodeURIComponent(title)}&page[size]=5&include=animethemes.animethemeentries.videos.audio,resources`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`AnimeThemes ${res.status}`);
  const json = await res.json();
  const list = json.anime || [];
  const match = list.find(a => extractMalId(a.resources) === malId) || (malId ? null : list[0]);
  if(!match) return null;
  const openings = (match.animethemes || []).filter(t => t.type === "OP");
  for(const theme of openings) {
    for(const entry of theme.animethemeentries || []) {
      for(const video of entry.videos || []) {
        const audioLink = video.audio?.link || null;
        if(audioLink || video.link) {
          return { audioUrl: audioLink || video.link, videoUrl: video.link || null };
        }
      }
    }
  }
  return null;
}
