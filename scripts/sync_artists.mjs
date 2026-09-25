// ─── Sync artist cache — copy the Artist tab's popular OP/ED artists from
// AnimeThemes.moe into the artist_cache table, with each theme's MAL id
// resolved up front, so the tab keeps working when AnimeThemes is down.
//
// Run manually with SUPABASE_URL/SUPABASE_ANON set (npm run sync:artists),
// or via the scheduled GitHub Action in .github/workflows/sync-anime.yml.
// Exits cleanly (no rows touched) when AnimeThemes is unreachable, so an
// outage never wipes the last good copy.

import { POPULAR_ARTIST_NAMES } from "../src/constants/popularArtists.js";

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const ANIMETHEMES_BASE = "https://api.animethemes.moe";
const DELAY_MS = 300; // politeness delay between AnimeThemes requests
// Cloudflare in front of AnimeThemes answers 403 to Node's default fetch
// (no User-Agent) — identify the script explicitly.
const AT_HEADERS = { "User-Agent": "AniMood-sync/1.0 (+https://github.com/casval-bit/animood)" };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

async function sbUpsert(table, rows, key) {
  if(!rows.length) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${key}`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if(!r.ok) throw new Error(await r.text());
}

async function atFetch(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${ANIMETHEMES_BASE}${path}`, { signal: ctrl.signal, headers: AT_HEADERS });
    if(!res.ok) throw new Error(`AnimeThemes ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

function extractMalId(resources) {
  const r = (resources || []).find(res => res.site === "MyAnimeList");
  return r ? r.external_id : null;
}

// Same shape as src/api/animethemes.js's normalizeArtist — kept standalone
// here since this script runs outside the Vite/browser build.
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
        animeId: anime.id, animeSlug: anime.slug, animeTitle: anime.name,
        year: anime.year || null, type: theme.type, slug: theme.slug, songTitle: song.title,
      });
    });
  });
  themes.sort((a, b) => (b.year || 0) - (a.year || 0));
  return { slug: artist.slug, name: artist.name, themes };
}

async function main() {
  if(!SUPABASE_URL || !SUPABASE_ANON) { console.error("SUPABASE_URL / SUPABASE_ANON missing"); process.exit(1); }

  // Health probe — one request instead of a wall of timeouts during an outage.
  try { await atFetch("/artist?page[size]=1"); }
  catch(e) { console.log(`AnimeThemes unreachable (${e.message}) — artist_cache left untouched.`); return; }

  const malIds = new Map(); // anime slug → MAL id, shared across artists
  const rows = [];
  for(const [rank, name] of POPULAR_ARTIST_NAMES.entries()) {
    try {
      const json = await atFetch(`/artist?q=${encodeURIComponent(name)}&page[size]=3&include=songs.animethemes.anime`);
      const found = (json.artists || []).map(normalizeArtist).filter(a => a.themes.length);
      const artist = found.find(a => a.name.toLowerCase() === name.toLowerCase()) || found[0];
      if(!artist) { console.log(`✗ ${name}: not found`); continue; }
      for(const theme of artist.themes) {
        if(!malIds.has(theme.animeSlug)) {
          await sleep(DELAY_MS);
          const anime = await atFetch(`/anime/${encodeURIComponent(theme.animeSlug)}?include=resources`).catch(() => null);
          malIds.set(theme.animeSlug, extractMalId(anime?.anime?.resources));
        }
        theme.malId = malIds.get(theme.animeSlug);
      }
      rows.push({ slug: artist.slug, name: artist.name, themes: artist.themes, popular_rank: rank, updated_at: new Date().toISOString() });
      console.log(`✓ ${artist.name}: ${artist.themes.length} themes`);
    } catch(e) { console.log(`✗ ${name}: ${e.message}`); }
    await sleep(DELAY_MS);
  }

  await sbUpsert("artist_cache", rows, "slug");
  console.log(`Done — ${rows.length}/${POPULAR_ARTIST_NAMES.length} artists cached.`);
}

main().catch(e => { console.error(e); process.exit(1); });
