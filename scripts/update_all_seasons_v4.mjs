// ─── Update ALL anime seasons via AniList GraphQL ─────────────────────────────
// AniList stores season + year natively — much more accurate than Jikan/LLM
// Matches by MAL ID using AniList's idMal field
// Batches of 50 per GraphQL request. ~600 requests for 30k anime.
// Run: node scripts/update_all_seasons_v4.mjs

const SUPABASE_URL  = "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";
const ANILIST_URL   = "https://graphql.anilist.co";
const BATCH         = 50;   // anime per AniList request
const DELAY         = 1000; // 1s between requests (AniList rate limit: 90/min)
const PROGRESS      = "./seasons_v4_progress.json";

import { writeFileSync, readFileSync, existsSync } from "fs";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SB = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

const SEASON_MAP = {
  "WINTER": "Hiver",
  "SPRING": "Printemps",
  "SUMMER": "Été",
  "FALL":   "Automne",
};

const SEASON_MONTH = {
  "WINTER": 1,
  "SPRING": 4,
  "SUMMER": 7,
  "FALL":   10,
};

function toLabel(season, year) {
  if(!season || !year) return null;
  return `${SEASON_MAP[season] || season} ${year}`;
}

async function sbQuery(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPatchBatch(updates) {
  await Promise.all(updates.map(u =>
    fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${u.mal_id}`, {
      method: "PATCH",
      headers: { ...SB, "Prefer": "return=minimal" },
      body: JSON.stringify({
        anime_season_label: u.label,
        aired_from: u.aired_from,
        year: u.year || null,
      }),
    }).catch(() => {})
  ));
}

async function fetchAniList(malIds, attempt=0) {
  const query = `
    query ($ids: [Int]) {
      Page(perPage: ${BATCH}) {
        media(idMal_in: $ids, type: ANIME) {
          idMal
          season
          seasonYear
          startDate { year month day }
        }
      }
    }
  `;

  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query, variables: { ids: malIds } }),
    });

    if(res.status === 429) {
      const wait = 60000; // AniList rate limit — wait 1 min
      console.log(`\n[429] Rate limited — waiting 60s...`);
      await sleep(wait);
      if(attempt < 3) return fetchAniList(malIds, attempt+1);
      return null;
    }
    if(!res.ok) { console.error(`\nAniList ${res.status}`); return null; }

    const data = await res.json();
    return data?.data?.Page?.media || [];
  } catch(e) {
    console.error("\nAniList error:", e.message);
    return null;
  }
}

async function main() {
  console.log("🌸 AniMood — Season Update v4 (AniList GraphQL)");
  console.log("   AniList stores season natively — most accurate source");
  console.log("   Ctrl+C to pause — resumable\n");

  // Load all anime from Supabase
  let all = [];
  let offset = 0;
  process.stdout.write("Loading anime list");
  while(true) {
    const rows = await sbQuery(
      `anime_cache?select=mal_id,title,year&order=mal_id.asc&limit=1000&offset=${offset}`
    );
    if(!rows?.length) break;
    all.push(...rows);
    process.stdout.write(".");
    if(rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`\n   ${all.length} anime total`);

  // Resume
  let startIdx = 0;
  if(existsSync(PROGRESS)) {
    try {
      const s = JSON.parse(readFileSync(PROGRESS, "utf8"));
      if(s.done) { console.log("✅ Already complete!"); return; }
      startIdx = s.index || 0;
      if(startIdx > 0) console.log(`   Resuming from index ${startIdx}`);
    } catch {}
  }

  let found = 0, fallback = 0, missing = 0;
  const notFoundOnAniList = []; // fallback to year-only

  for(let i = startIdx; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    const malIds = batch.map(a => a.mal_id);

    const alResults = await fetchAniList(malIds);
    const updates = [];

    if(alResults && alResults.length > 0) {
      // Build lookup by MAL ID
      const byMalId = {};
      for(const r of alResults) {
        if(r.idMal) byMalId[r.idMal] = r;
      }

      for(const a of batch) {
        const r = byMalId[a.mal_id];
        if(r && r.season && r.seasonYear) {
          // AniList has season data
          const label = toLabel(r.season, r.seasonYear);
          const month = SEASON_MONTH[r.season] || 1;
          const day   = r.startDate?.day || 1;
          const aired_from = `${r.seasonYear}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          updates.push({ mal_id:a.mal_id, label, aired_from, year:r.seasonYear });
          found++;
        } else if(r && r.startDate?.year) {
          // AniList has date but no season — calculate it
          const year  = r.startDate.year;
          const month = r.startDate.month || 1;
          const label = toLabel(
            month<=3?"WINTER":month<=6?"SPRING":month<=9?"SUMMER":"FALL",
            year
          );
          const aired_from = `${year}-${String(month).padStart(2,"0")}-01`;
          updates.push({ mal_id:a.mal_id, label, aired_from, year });
          found++;
        } else if(a.year) {
          // Not on AniList — use year fallback
          updates.push({ mal_id:a.mal_id, label:`Hiver ${a.year}`, aired_from:`${a.year}-01-01`, year:a.year });
          fallback++;
        } else {
          missing++;
        }
      }
      process.stdout.write("✓");
    } else {
      // AniList call failed — year fallback for all
      for(const a of batch) {
        if(a.year) {
          updates.push({ mal_id:a.mal_id, label:`Hiver ${a.year}`, aired_from:`${a.year}-01-01`, year:a.year });
          fallback++;
        } else missing++;
      }
      process.stdout.write("~");
    }

    if(updates.length) await sbPatchBatch(updates);

    // Save progress
    const processed = i + BATCH;
    if(processed % 500 === 0) {
      writeFileSync(PROGRESS, JSON.stringify({ index:processed, found, fallback, missing }));
      console.log(`\n  [${Math.min(processed, all.length)}/${all.length}] ✓${found} ~${fallback} ✗${missing}`);
    }

    await sleep(DELAY);
  }

  writeFileSync(PROGRESS, JSON.stringify({ done:true, timestamp:new Date().toISOString(), found, fallback, missing }));
  console.log(`\n\n✅ Done!`);
  console.log(`   ✓ ${found} precise seasons from AniList`);
  console.log(`   ~ ${fallback} year-only fallback (not on AniList)`);
  console.log(`   ✗ ${missing} no data at all`);
  console.log(`   Cost: $0 (AniList is free)`);
}

main().catch(console.error);
