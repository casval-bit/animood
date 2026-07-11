// ─── Sync new anime from Jikan to Supabase ───────────────────────────────────
// Only fetches anime with mal_id > max(mal_id) in our DB

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const JIKAN_BASE    = "https://api.jikan.moe/v4";
const DELAY_MS      = 1100;
const BATCH_SIZE    = 10;

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

async function main() {
  console.log("🔄 Sync new anime — Jikan → Supabase");

  // Get highest mal_id in our DB
  const rows = await sbQuery("anime_cache?select=mal_id&order=mal_id.desc&limit=1");
  const maxId = rows?.[0]?.mal_id || 0;
  console.log(`   Highest mal_id in DB: ${maxId}`);

  // Fetch pages sorted by mal_id desc — stop when we hit known IDs
  let page = 1;
  let totalInserted = 0;
  let done = false;
  let batch = [];

  while(!done) {
    const data = await jikanGet(`/anime?page=${page}&limit=25&order_by=mal_id&sort=desc`);
    await sleep(DELAY_MS);

    if(!data?.data?.length) break;

    for(const anime of data.data) {
      if(anime.mal_id <= maxId) { done = true; break; }
      try {
        const full = await jikanGet(`/anime/${anime.mal_id}/full`);
        await sleep(DELAY_MS);
        if(full?.data) {
          batch.push(parseAnime(full.data));
          process.stdout.write("✓");
          totalInserted++;
        }
        if(batch.length >= BATCH_SIZE) { await sbUpsert(batch); batch = []; }
      } catch(e) { console.error(`\n  Error ${anime.mal_id}: ${e.message}`); }
    }

    if(!data.pagination?.has_next_page) break;
    page++;
  }

  if(batch.length > 0) await sbUpsert(batch);

  console.log(`\n✅ Done — ${totalInserted} new anime added`);
}

main().catch(console.error);
