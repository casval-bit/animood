// ─── ANIMETHEMES.MOE CLIENT — real anime opening/ending + artist data ─────────
// Public, unauthenticated API. No local caching/table to maintain: artist ↔
// anime ↔ song links are fetched live, same spirit as the Jikan producers
// lookup used for studios.
const BASE = "https://api.animethemes.moe";

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

export async function searchArtists(query, limit = 24) {
  const q = query.trim();
  if(!q) return [];
  const url = `${BASE}/artist?q=${encodeURIComponent(q)}&page[size]=${limit}&include=songs.animethemes.anime`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`AnimeThemes ${res.status}`);
  const json = await res.json();
  return (json.artists || []).map(normalizeArtist).filter(a => a.themes.length);
}

// A hand-picked set of well-known OP/ED singers and bands, spanning decades —
// so the Artist tab isn't a blank search box on first visit. Verified against
// the live API (exact-name match, non-empty theme list) before being added here.
const POPULAR_ARTIST_NAMES = [
  "LiSA", "YOASOBI", "Aimer", "ClariS", "Linked Horizon", "FLOW",
  "Kenshi Yonezu", "UVERworld", "MAN WITH A MISSION", "Asian Kung-Fu Generation",
  "RADWIMPS", "Kalafina", "fripSide", "Konomi Suzuki", "Minami Kuribayashi", "Eir Aoi",
];

let popularArtistsCache = null;

export async function fetchPopularArtists(limit = 16) {
  if(popularArtistsCache) return popularArtistsCache.slice(0, limit);
  const names = POPULAR_ARTIST_NAMES.slice(0, limit);
  const results = await Promise.all(names.map(async name => {
    try {
      const found = await searchArtists(name, 3);
      return found.find(a => a.name.toLowerCase() === name.toLowerCase()) || found[0] || null;
    } catch { return null; }
  }));
  const artists = results.filter(Boolean);
  if(artists.length) popularArtistsCache = artists;
  return artists;
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
