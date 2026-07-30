// ─── Update aired_from for all anime in anime_cache ──────────────────────────
// Run once manually: node scripts/update_aired_from.mjs
// Can be interrupted and restarted — skips anime that already have aired_from

const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";
const JIKAN_BASE    = "https://api.jikan.moe/v4";
const DELAY_MS      = 1100;
const BATCH_SIZE    = 20; // update DB in batches of 20

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

async function sbUpdate(mal_id, aired_from) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${mal_id}`, {
    method: "PATCH",
    headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ aired_from }),
  });
  if(!r.ok) throw new Error(await r.text());
}

async function jikanGet(path, attempt=0) {
  const r = await fetch(`${JIKAN_BASE}${path}`);
  if(r.status === 429) { await sleep(3000 * Math.pow(2, attempt)); if(attempt<4) return jikanGet(path, attempt+1); return null; }
  if(r.status === 404) return null;
  if(!r.ok) return null;
  return r.json();
}

async function main() {
  console.log("🗓  Fetching aired_from for all anime...");

  // Get all mal_ids missing aired_from — sorted by mal_id for resumability
  let allIds = [];
  let offset = 0;
  while(true) {
    const rows = await sbQuery(`anime_cache?select=mal_id&aired_from=is.null&order=mal_id.asc&limit=1000&offset=${offset}`);
    if(!rows?.length) break;
    rows.forEach(r => allIds.push(r.mal_id));
    if(rows.length < 1000) break;
    offset += 1000;
  }

  console.log(`   ${allIds.length} anime need aired_from`);
  if(!allIds.length) { console.log("✅ All done!"); return; }

  let updated = 0, skipped = 0;
  const pending = [];

  for(let i = 0; i < allIds.length; i++) {
    const mal_id = allIds[i];
    try {
      const data = await jikanGet(`/anime/${mal_id}`);
      await sleep(DELAY_MS);

      const iso = data?.data?.aired?.from;
      if(iso) {
        // Extract date part only (YYYY-MM-DD)
        const dated = iso.split("T")[0];
        await sbUpdate(mal_id, dated);
        updated++;
        process.stdout.write("✓");
      } else {
        // Set to null explicitly so we don't retry — use year-01-01 as fallback
        const year = data?.data?.year || data?.data?.aired?.prop?.from?.year;
        if(year) {
          await sbUpdate(mal_id, `${year}-01-01`);
          updated++;
          process.stdout.write("~");
        } else {
          skipped++;
          process.stdout.write("·");
        }
      }

      if((updated + skipped) % 50 === 0) {
        console.log(`\n  [${i+1}/${allIds.length}] updated:${updated} skipped:${skipped}`);
      }
    } catch(e) {
      process.stdout.write("✗");
      skipped++;
    }
  }

  console.log(`\n\n✅ Done — ${updated} updated, ${skipped} skipped`);
}

main().catch(console.error);
