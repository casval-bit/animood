// ─── Update ALL anime seasons — best of Jikan + OpenRouter ───────────────────
// Step 1: Jikan  → gets exact aired date when available (fast, free)
// Step 2: OpenRouter → fills in season for anime Jikan couldn't date (smart)
// Resumable — saves progress every 100 anime
// Run: node scripts/update_all_seasons_v2.mjs

const SUPABASE_URL  = "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";
const OR_KEY        = "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";
const OR_URL        = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODEL      = "qwen/qwen-2.5-7b-instruct";
const JIKAN_BASE    = "https://api.jikan.moe/v4";
const JIKAN_DELAY   = 1100;
const OR_DELAY      = 300;
const OR_BATCH      = 20;
const PROGRESS_FILE = "./seasons_v2_progress.json";

import { writeFileSync, readFileSync, existsSync } from "fs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SB = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

function calcSeason(year, month) {
  if(!year) return null;
  const m = parseInt(month) || 1;
  const s = m<=3?"Hiver":m<=6?"Printemps":m<=9?"Été":"Automne";
  return `${s} ${year}`;
}

async function sbQuery(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPatch(mal_id, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${mal_id}`, {
    method: "PATCH",
    headers: { ...SB, "Prefer": "return=minimal" },
    body: JSON.stringify(data),
  });
}

async function jikanGet(id, attempt=0) {
  const r = await fetch(`${JIKAN_BASE}/anime/${id}`);
  if(r.status === 429) {
    await sleep(4000*(attempt+1));
    if(attempt < 5) return jikanGet(id, attempt+1);
    return null;
  }
  if(!r.ok) return null;
  return r.json();
}

async function orBatch(batch, attempt=0) {
  const items = batch.map((a,i) => `${i+1}. "${a.title}" (${a.year||"unknown year"})`).join("\n");
  const prompt = `For each anime, determine its Japanese broadcast season.
Return ONLY a JSON array: [{"i":1,"season":"Été 2024","month":7},...]
- season format: "Hiver YYYY" | "Printemps YYYY" | "Été YYYY" | "Automne YYYY"
- Hiver=Jan-Mar, Printemps=Apr-Jun, Été=Jul-Sep, Automne=Oct-Dec
- month: best guess start month (1-12)
- If truly unknown, omit that entry

Anime list:
${items}

Reply with ONLY the JSON array.`;

  try {
    const res = await fetch(OR_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${OR_KEY}` },
      body: JSON.stringify({ model:OR_MODEL, messages:[{role:"user",content:prompt}], max_tokens:600, temperature:0.1 }),
    });
    if(res.status === 429) { await sleep(8000*(attempt+1)); if(attempt<3) return orBatch(batch, attempt+1); return null; }
    if(!res.ok) { console.error(`OR ${res.status}`); return null; }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim()||"";
    const clean = text.replace(/```json?/g,"").replace(/```/g,"").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if(!match) return null;
    return JSON.parse(match[0]);
  } catch(e) { console.error("OR error:", e.message); return null; }
}

async function loadAllIds() {
  let ids = [];
  let offset = 0;
  process.stdout.write("Loading anime list");
  while(true) {
    const rows = await sbQuery(`anime_cache?select=mal_id,title,year&order=mal_id.asc&limit=1000&offset=${offset}`);
    if(!rows?.length) break;
    ids.push(...rows);
    process.stdout.write(".");
    if(rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`\n   ${ids.length} anime total`);
  return ids;
}

// ── PHASE 1: Jikan ────────────────────────────────────────────────────────────
async function phase1(allAnime, startIndex) {
  console.log(`\n📡 PHASE 1: Jikan (exact dates)`);
  let jikanDone = 0, jikanSkipped = 0;
  const needsOR = []; // anime Jikan couldn't date

  for(let i = startIndex; i < allAnime.length; i++) {
    const a = allAnime[i];
    try {
      const data = await jikanGet(a.mal_id);
      await sleep(JIKAN_DELAY);

      if(data?.data) {
        const d = data.data;
        const year  = d.year || d.aired?.prop?.from?.year;
        const month = d.aired?.prop?.from?.month;
        const iso   = d.aired?.from?.split?.("T")?.[0];

        if(year && month) {
          const season = calcSeason(year, month);
          const aired_from = iso || `${year}-${String(month).padStart(2,"0")}-01`;
          await sbPatch(a.mal_id, { year, aired_from, anime_season_label: season });
          process.stdout.write("✓");
          jikanDone++;
        } else if(year) {
          // Has year but no month — save for OR to determine season
          a.year = year;
          needsOR.push(a);
          process.stdout.write("~");
        } else {
          needsOR.push(a);
          process.stdout.write("·");
          jikanSkipped++;
        }
      } else {
        needsOR.push(a);
        process.stdout.write("·");
        jikanSkipped++;
      }

      if((jikanDone+jikanSkipped) % 100 === 0) {
        writeFileSync(PROGRESS_FILE, JSON.stringify({ phase:1, index:i+1, jikanDone, jikanSkipped, needsOR_count:needsOR.length }));
      }
      if((jikanDone+jikanSkipped) % 500 === 0) {
        console.log(`\n  [${i+1}/${allAnime.length}] jikan:${jikanDone} for_OR:${needsOR.length} no_data:${jikanSkipped}`);
      }
    } catch(e) {
      needsOR.push(a);
      process.stdout.write("✗");
      jikanSkipped++;
    }
  }

  console.log(`\n   Jikan done: ${jikanDone} ✓  |  Needs OpenRouter: ${needsOR.length}`);
  return needsOR;
}

// ── PHASE 2: OpenRouter ───────────────────────────────────────────────────────
async function phase2(needsOR) {
  console.log(`\n🤖 PHASE 2: OpenRouter (season estimation for ${needsOR.length} anime)`);
  let orDone = 0, orFailed = 0;

  for(let i = 0; i < needsOR.length; i += OR_BATCH) {
    const batch = needsOR.slice(i, i+OR_BATCH);
    try {
      const results = await orBatch(batch);
      if(results) {
        for(const r of results) {
          const anime = batch[r.i-1];
          if(!anime || !r.season) continue;
          const year  = anime.year || parseInt(r.season.split(" ")[1]);
          const month = r.month || 1;
          const aired_from = year ? `${year}-${String(month).padStart(2,"0")}-01` : null;
          await sbPatch(anime.mal_id, {
            anime_season_label: r.season,
            aired_from,
            ...(year && !anime.year ? { year } : {}),
          });
          orDone++;
        }
        // Fallback for items OR didn't return
        const covered = new Set((results||[]).map(r=>r.i-1));
        for(let j=0; j<batch.length; j++) {
          if(!covered.has(j) && batch[j].year) {
            await sbPatch(batch[j].mal_id, {
              anime_season_label: `Hiver ${batch[j].year}`,
              aired_from: `${batch[j].year}-01-01`,
            });
            orDone++;
          }
        }
        process.stdout.write("✓");
      } else {
        // OR failed — use year fallback
        for(const a of batch) {
          if(a.year) {
            await sbPatch(a.mal_id, { anime_season_label:`Hiver ${a.year}`, aired_from:`${a.year}-01-01` });
            orDone++;
          } else orFailed++;
        }
        process.stdout.write("~");
      }
    } catch(e) {
      console.error("\nOR batch error:", e.message);
      orFailed += batch.length;
      process.stdout.write("✗");
    }

    if((i+OR_BATCH) % 200 === 0) {
      console.log(`\n  [${i+OR_BATCH}/${needsOR.length}] done:${orDone} failed:${orFailed}`);
    }
    await sleep(OR_DELAY);
  }

  console.log(`\n   OpenRouter done: ${orDone} ✓  |  No data: ${orFailed}`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌸 AniMood — Update All Seasons (Jikan + OpenRouter)");
  console.log("   Ctrl+C to pause — progress saved every 100 anime\n");

  const allAnime = await loadAllIds();

  // Check resume
  let startIndex = 0;
  if(existsSync(PROGRESS_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(PROGRESS_FILE, "utf8"));
      if(!saved.done) {
        startIndex = saved.index || 0;
        console.log(`   Resuming from index ${startIndex}`);
      }
    } catch {}
  }

  const needsOR = await phase1(allAnime, startIndex);
  await phase2(needsOR);

  writeFileSync(PROGRESS_FILE, JSON.stringify({ done:true, timestamp: new Date().toISOString() }));
  console.log("\n\n✅ ALL DONE — seasons updated via Jikan + OpenRouter");
}

main().catch(console.error);
