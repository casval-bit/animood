// ─── Update ALL anime seasons from scratch ───────────────────────────────────
// Fetches year + season for every anime in anime_cache via Jikan
// Overwrites existing data. Resumable — skips nothing.
// Run: node scripts/update_all_seasons.mjs

const SUPABASE_URL  = "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";
const JIKAN_BASE    = "https://api.jikan.moe/v4";
const DELAY_MS      = 1100;
const PROGRESS_FILE = "./seasons_progress.json"; // saves last processed mal_id

import { writeFileSync, readFileSync, existsSync } from "fs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

function calcSeason(year, month) {
  if(!year) return null;
  const m = parseInt(month) || 1;
  const s = m<=3 ? "Hiver" : m<=6 ? "Printemps" : m<=9 ? "Été" : "Automne";
  return `${s} ${year}`;
}

async function jikanGet(id, attempt=0) {
  const r = await fetch(`${JIKAN_BASE}/anime/${id}`);
  if(r.status === 429) {
    const wait = 4000 * (attempt+1);
    process.stdout.write(`[429 wait ${wait/1000}s]`);
    await sleep(wait);
    if(attempt < 5) return jikanGet(id, attempt+1);
    return null;
  }
  if(r.status === 404) return null;
  if(!r.ok) return null;
  return r.json();
}

async function sbPatch(mal_id, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${mal_id}`, {
    method: "PATCH",
    headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify(data),
  });
}

async function main() {
  console.log("🌸 Updating ALL anime seasons from Jikan...");
  console.log("   (Ctrl+C to pause — will resume from last position)\n");

  // Load all mal_ids ordered by mal_id
  let allIds = [];
  let offset = 0;
  process.stdout.write("Loading all anime IDs");
  while(true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/anime_cache?select=mal_id&order=mal_id.asc&limit=1000&offset=${offset}`,
      { headers: SB_HEADERS }
    );
    const rows = await r.json();
    if(!rows?.length) break;
    rows.forEach(r => allIds.push(r.mal_id));
    process.stdout.write(".");
    if(rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`\n   ${allIds.length} anime total\n`);

  // Resume from saved progress
  let startIndex = 0;
  if(existsSync(PROGRESS_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(PROGRESS_FILE, "utf8"));
      startIndex = saved.index || 0;
      console.log(`   Resuming from index ${startIndex} (mal_id: ${allIds[startIndex]})`);
    } catch {}
  }

  let updated = 0, noData = 0;

  for(let i = startIndex; i < allIds.length; i++) {
    const mal_id = allIds[i];

    try {
      const data = await jikanGet(mal_id);
      await sleep(DELAY_MS);

      if(!data?.data) {
        process.stdout.write("·");
        noData++;
      } else {
        const a = data.data;
        const year  = a.year || a.aired?.prop?.from?.year || null;
        const month = a.aired?.prop?.from?.month || null;
        const iso   = a.aired?.from ? a.aired.from.split("T")[0] : null;
        const season = calcSeason(year, month);
        const aired_from = iso || (year && month ? `${year}-${String(month).padStart(2,"0")}-01` : year ? `${year}-01-01` : null);

        await sbPatch(mal_id, {
          year:               year    || null,
          aired_from:         aired_from || null,
          anime_season_label: season  || null,
        });

        updated++;
        process.stdout.write(season ? "✓" : "~");
      }

      // Save progress every 100 anime
      if(i % 100 === 0) {
        writeFileSync(PROGRESS_FILE, JSON.stringify({ index: i, mal_id, updated, noData }));
        if(i % 500 === 0) {
          console.log(`\n  [${i}/${allIds.length}] updated:${updated} no_data:${noData}`);
        }
      }
    } catch(e) {
      process.stdout.write("✗");
      noData++;
    }
  }

  // Cleanup progress file
  try { writeFileSync(PROGRESS_FILE, JSON.stringify({ index: allIds.length, done: true })); } catch {}

  console.log(`\n\n✅ Done — ${updated} updated, ${noData} no data on Jikan`);
}

main().catch(console.error);
