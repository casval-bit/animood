// ─── Sync anime: add new entries + refresh scores ────────────────────────────
// 1. Adds new anime not yet in DB (scans by start_date desc)
// 2. Refreshes score/rank/episodes for ALL existing anime in batches
// 3. Fetches season labels from AniList for new anime

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const JIKAN_BASE    = "https://api.jikan.moe/v4";
const ANILIST_URL   = "https://graphql.anilist.co";
const DELAY_MS      = 1100;
const BATCH_SIZE    = 10;
const MAX_CONSECUTIVE_KNOWN = 3;

const SEASON_MAP = { WINTER:"Hiver", SPRING:"Printemps", SUMMER:"Été", FALL:"Automne" };
const SEASON_MONTH = { WINTER:1, SPRING:4, SUMMER:7, FALL:10 };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

// Fetch season data from AniList for a batch of MAL IDs
async function fetchAniListSeasons(malIds) {
  const query = `query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){idMal season seasonYear startDate{year month day}}}}`;
  try {
    const res = await fetch(ANILIST_URL, {
      method:"POST",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body: JSON.stringify({ query, variables:{ ids: malIds } }),
    });
    if(res.status === 429) { await sleep(60000); return fetchAniListSeasons(malIds); }
    if(!res.ok) return {};
    const data = await res.json();
    const result = {};
    for(const r of (data?.data?.Page?.media || [])) {
      if(!r.idMal) continue;
      const year  = r.seasonYear || r.startDate?.year;
      const month = r.season ? SEASON_MONTH[r.season] : (r.startDate?.month || 1);
      const season = r.season && year ? `${SEASON_MAP[r.season]} ${year}` : year ? `Hiver ${year}` : null;
      const aired_from = year ? `${year}-${String(month).padStart(2,"0")}-01` : null;
      result[r.idMal] = { anime_season_label: season, aired_from, year };
    }
    return result;
  } catch { return {}; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

async function sbQuery(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if(!r.ok) throw new Error(await r.text());
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function sbUpsert(table, rows) {
  const deduped = [...new Map(rows.map(r=>[r.mal_id,r])).values()];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=mal_id`, {
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
    mal_id:      a.mal_id,
    title:       a.title,
    title_en:    a.title_english,
    title_jp:    a.title_japanese,
    synopsis:    a.synopsis,
    score:       a.score || null,
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
    genres:      a.genres||[],
    themes:      a.themes||[],
    demographics:a.demographics||[],
    studios:     a.studios||[],
    producers:   a.producers||[],
    streaming:   a.streaming||[],
    fetched_at:  new Date().toISOString(),
  };
}

async function getAllExistingIds() {
  const ids = new Set();
  let offset = 0;
  while(true) {
    const rows = await sbQuery(`anime_cache?select=mal_id&limit=1000&offset=${offset}`);
    if(!rows?.length) break;
    rows.forEach(r => ids.add(r.mal_id));
    if(rows.length < 1000) break;
    offset += 1000;
  }
  return ids;
}

// ── PART 1: Add new anime ─────────────────────────────────────────────────────
async function addNewAnime(existingIds) {
  console.log("\n📺 PART 1: Adding new anime...");
  let page = 1, totalInserted = 0, consecutiveKnown = 0, batch = [];

  while(consecutiveKnown < MAX_CONSECUTIVE_KNOWN) {
    const data = await jikanGet(`/anime?page=${page}&limit=25&order_by=start_date&sort=desc&sfw=false`);
    await sleep(DELAY_MS);
    if(!data?.data?.length) break;

    const allKnown = data.data.every(a => existingIds.has(a.mal_id));
    if(allKnown) {
      consecutiveKnown++;
      console.log(`  Page ${page}: all known (${consecutiveKnown}/${MAX_CONSECUTIVE_KNOWN})`);
    } else {
      consecutiveKnown = 0;
      for(const anime of data.data) {
        if(existingIds.has(anime.mal_id)) { process.stdout.write("·"); continue; }
        try {
          const full = await jikanGet(`/anime/${anime.mal_id}/full`);
          await sleep(DELAY_MS);
          if(full?.data) {
            batch.push(parseAnime(full.data));
            existingIds.add(anime.mal_id);
            process.stdout.write("✓");
            totalInserted++;
          }
          if(batch.length >= BATCH_SIZE) {
          await sbUpsert("anime_cache", batch);
          // Fetch seasons from AniList for this batch
          const malIds = batch.map(a => a.mal_id);
          const seasons = await fetchAniListSeasons(malIds);
          for(const [malId, seasonData] of Object.entries(seasons)) {
            if(seasonData.anime_season_label) {
              await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${malId}`, {
                method:"PATCH", headers:{...SB_HEADERS,"Prefer":"return=minimal"},
                body: JSON.stringify(seasonData),
              }).catch(()=>{});
            }
          }
          batch = [];
        }
        } catch(e) { console.error(`\n  Error ${anime.mal_id}: ${e.message}`); }
      }
    }
    if(!data.pagination?.has_next_page) break;
    page++;
  }

  if(batch.length) {
    await sbUpsert("anime_cache", batch);
    const malIds = batch.map(a => a.mal_id);
    const seasons = await fetchAniListSeasons(malIds);
    for(const [malId, seasonData] of Object.entries(seasons)) {
      if(seasonData.anime_season_label) {
        await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${malId}`, {
          method:"PATCH", headers:{...SB_HEADERS,"Prefer":"return=minimal"},
          body: JSON.stringify(seasonData),
        }).catch(()=>{});
      }
    }
  }
  console.log(`\n  ✅ ${totalInserted} new anime added`);
  return totalInserted;
}

// ── PART 2: Refresh scores for all existing anime ────────────────────────────
// Jikan list endpoint returns score — much faster than fetching each full page
async function refreshScores() {
  console.log("\n🔄 PART 2: Refreshing scores...");
  let page = 1, totalUpdated = 0, batch = [];

  while(true) {
    const data = await jikanGet(`/anime?page=${page}&limit=25&order_by=score&sort=desc&sfw=false`);
    await sleep(DELAY_MS);
    if(!data?.data?.length) break;

    for(const a of data.data) {
      if(!a.score) continue; // skip unscored
      batch.push({
        mal_id:    a.mal_id,
        score:     a.score,
        scored_by: a.scored_by,
        rank:      a.rank,
        popularity:a.popularity,
        episodes:  a.episodes,
        status:    a.status,
      });
      totalUpdated++;
      if(batch.length >= 25) {
        await sbUpsert("anime_cache", batch);
        batch = [];
        process.stdout.write(".");
      }
    }

    if(!data.pagination?.has_next_page) break;
    if(page >= 200) break; // top 5000 scored anime — covers all relevant ones
    page++;
  }

  if(batch.length) await sbUpsert("anime_cache", batch);
  console.log(`\n  ✅ ${totalUpdated} scores refreshed`);
  return totalUpdated;
}

// ── PART 3: Re-check seasons for anime without season label ──────────────────
async function refreshMissingSeasons() {
  console.log("\n🌸 PART 3: Refreshing missing seasons via AniList...");
  // Get anime with no season label (includes "Not yet aired" that may have been announced)
  const rows = await sbQuery(
    `anime_cache?select=mal_id&anime_season_label=is.null&limit=500`
  ).catch(()=>[]);
  if(!rows?.length) { console.log("  ✅ All seasons up to date"); return 0; }

  let updated = 0;
  for(let i=0; i<rows.length; i+=50) {
    const chunk = rows.slice(i,i+50).map(r=>r.mal_id);
    const seasons = await fetchAniListSeasons(chunk);
    for(const [malId, seasonData] of Object.entries(seasons)) {
      if(seasonData.anime_season_label) {
        await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${malId}`, {
          method:"PATCH", headers:{...SB_HEADERS,"Prefer":"return=minimal"},
          body: JSON.stringify(seasonData),
        }).catch(()=>{});
        updated++;
      }
    }
    await sleep(1000);
  }
  console.log(`  ✅ ${updated} seasons updated`);
  return updated;
}

async function main() {
  console.log("🌀 AniMood — Weekly Anime Sync");
  console.log("================================");

  const existingIds = await getAllExistingIds();
  console.log(`📦 ${existingIds.size} anime in DB`);

  const added    = await addNewAnime(existingIds);
  const refreshed = await refreshScores();
  const seasons  = await refreshMissingSeasons();

  console.log("\n================================");
  console.log(`✅ Sync complete`);
  console.log(`   New anime added    : ${added}`);
  console.log(`   Scores refreshed  : ${refreshed}`);
  console.log(`   Seasons updated   : ${seasons}`);
}

main().catch(console.error);
