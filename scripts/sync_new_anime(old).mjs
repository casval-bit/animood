// ─── Sync new/missing anime from Jikan to Supabase ───────────────────────────
// Strategy: fetch all mal_ids from DB, then scan Jikan pages sorted by
// start_date desc — stop when we've seen 3 consecutive pages with all IDs
// already in DB (means we're past the new entries)

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const JIKAN_BASE    = "https://api.jikan.moe/v4";
const DELAY_MS      = 1100;
const BATCH_SIZE    = 10;
const MAX_CONSECUTIVE_KNOWN_PAGES = 3; // stop after 3 pages of all-known anime

const sleep = ms => new Promise(r => setTimeout(r, ms));

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

async function sbQuery(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbUpsert(rows) {
  if(!rows.length) return;
  const deduped = [...new Map(rows.map(r=>[r.mal_id,r])).values()];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?on_conflict=mal_id`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(deduped),
  });
  if(!r.ok) throw new Error(await r.text());
}

async function jikanGet(path) {
  for(let attempt=0; attempt<4; attempt++) {
    const r = await fetch(`${JIKAN_BASE}${path}`);
    if(r.status === 429) { await sleep(3000*Math.pow(2,attempt)); continue; }
    if(r.status === 404) return null;
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
}

function parseAnime(a) {
  return {
    mal_id: a.mal_id, title: a.title, title_en: a.title_english,
    title_jp: a.title_japanese, synopsis: a.synopsis, score: a.score,
    scored_by: a.scored_by, rank: a.rank, popularity: a.popularity,
    year: a.year || a.aired?.prop?.from?.year, episodes: a.episodes,
    duration: a.duration, type: a.type, status: a.status, source: a.source,
    rating: a.rating, image_url: a.images?.jpg?.image_url,
    large_image: a.images?.jpg?.large_image_url, trailer_url: a.trailer?.url,
    genres: a.genres||[], themes: a.themes||[], demographics: a.demographics||[],
    studios: a.studios||[], producers: a.producers||[], streaming: a.streaming||[],
  };
}

async function getAllExistingIds() {
  console.log("📦 Loading all existing IDs from DB...");
  const ids = new Set();
  let offset = 0;
  while(true) {
    const rows = await sbQuery(`anime_cache?select=mal_id&limit=1000&offset=${offset}`);
    if(!rows.length) break;
    rows.forEach(r => ids.add(r.mal_id));
    if(rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`   ${ids.size} anime already in DB`);
  return ids;
}

async function main() {
  console.log("🔄 Sync anime — Jikan → Supabase (full scan with skip)");

  const existingIds = await getAllExistingIds();

  let page = 1;
  let totalInserted = 0;
  let consecutiveKnownPages = 0;
  let batch = [];

  // Scan pages sorted by start_date desc (newest first)
  // This catches recent additions AND old entries added late to MAL
  while(consecutiveKnownPages < MAX_CONSECUTIVE_KNOWN_PAGES) {
    const data = await jikanGet(`/anime?page=${page}&limit=25&order_by=start_date&sort=desc&sfw=false`);
    await sleep(DELAY_MS);

    if(!data?.data?.length) break;

    const pageIds = data.data.map(a => a.mal_id);
    const allKnown = pageIds.every(id => existingIds.has(id));

    if(allKnown) {
      consecutiveKnownPages++;
      process.stdout.write(`[page ${page} all known — ${consecutiveKnownPages}/${MAX_CONSECUTIVE_KNOWN_PAGES}]\n`);
    } else {
      consecutiveKnownPages = 0; // reset counter if we find new ones

      for(const anime of data.data) {
        if(existingIds.has(anime.mal_id)) {
          process.stdout.write("·");
          continue;
        }
        try {
          const full = await jikanGet(`/anime/${anime.mal_id}/full`);
          await sleep(DELAY_MS);
          if(full?.data) {
            batch.push(parseAnime(full.data));
            existingIds.add(anime.mal_id);
            process.stdout.write("✓");
            totalInserted++;
          }
          if(batch.length >= BATCH_SIZE) { await sbUpsert(batch); batch = []; }
        } catch(e) { console.error(`\n  Error ${anime.mal_id}: ${e.message}`); }
      }
    }

    if(!data.pagination?.has_next_page) break;
    page++;
    process.stdout.write(`\n[page ${page} | inserted: ${totalInserted}]\n`);
  }

  if(batch.length > 0) await sbUpsert(batch);
  console.log(`\n✅ Done — ${totalInserted} new anime added (scanned ${page} pages)`);
}

main().catch(console.error);
