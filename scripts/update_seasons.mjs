// ─── Update anime_season_label for all anime in anime_cache ──────────────────
// Uses OpenRouter (Mistral 7B) to determine season from title + year
// Much faster than Jikan — batch processing with LLM
// Run: node scripts/update_seasons.mjs

const SUPABASE_URL  = "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";
const OR_KEY        = "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";
const OR_URL        = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODEL      = "qwen/qwen-2.5-7b-instruct";  // ~$0.06/M tokens — 1500 batches ≈ $0.05 total
const BATCH_SIZE    = 20;  // anime per LLM call
const DELAY_MS      = 300; // between batches

const sleep = ms => new Promise(r => setTimeout(r, ms));

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

function calcSeason(year, month) {
  if(!year) return null;
  const m = parseInt(month)||1;
  const s = m<=3?"Hiver":m<=6?"Printemps":m<=9?"Été":"Automne";
  return `${s} ${year}`;
}

async function sbQuery(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbUpsertBatch(updates) {
  // updates = [{mal_id, anime_season_label, aired_from}]
  for(const u of updates) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${u.mal_id}`, {
        method: "PATCH",
        headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
        body: JSON.stringify({ 
          anime_season_label: u.season,
          aired_from: u.aired_from || null,
        }),
      });
    } catch {}
  }
}

async function askLLMBatch(batch, attempt=0) {
  // Build a compact prompt asking for season for each anime
  const items = batch.map((a,i) => `${i+1}. "${a.title}" (${a.year||"?"})`).join("\n");
  
  const prompt = `For each anime below, determine its broadcast season.
Return ONLY a JSON array with objects: {"i":1,"season":"Été 2026","month":7}
- season format: "Hiver YYYY" | "Printemps YYYY" | "Été YYYY" | "Automne YYYY"
- month: the starting month (1-12), best guess based on typical broadcast patterns
- Hiver=Jan-Mar, Printemps=Apr-Jun, Été=Jul-Sep, Automne=Oct-Dec
- If year is unknown, use null for both

Anime:
${items}

Reply with ONLY the JSON array, no explanation.`;

  try {
    const res = await fetch(OR_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${OR_KEY}` },
      body: JSON.stringify({
        model: OR_MODEL,
        messages: [{ role:"user", content: prompt }],
        max_tokens: 800,
        temperature: 0.1,
      }),
    });

    if(res.status === 429) {
      await sleep(5000 * (attempt+1));
      if(attempt < 3) return askLLMBatch(batch, attempt+1);
      return null;
    }
    if(!res.ok) throw new Error(`OR ${res.status}`);

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    
    // Parse JSON — strip markdown fences if present
    const clean = text.replace(/```json?/g,"").replace(/```/g,"").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if(!match) return null;
    
    return JSON.parse(match[0]);
  } catch(e) {
    console.error("LLM error:", e.message);
    return null;
  }
}

async function main() {
  console.log("🌸 Updating anime seasons via OpenRouter...");
  
  // Check if column exists, create if not
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
      method: "POST", headers: SB_HEADERS,
      body: JSON.stringify({ sql: "alter table anime_cache add column if not exists anime_season_label text; alter table anime_cache add column if not exists aired_from date;" }),
    });
  } catch {}

  // Get all anime missing season label
  let allAnime = [];
  let offset = 0;
  process.stdout.write("Loading anime list...");
  while(true) {
    const rows = await sbQuery(`anime_cache?select=mal_id,title,year&anime_season_label=is.null&order=score.desc.nullslast&limit=1000&offset=${offset}`);
    if(!rows?.length) break;
    allAnime.push(...rows);
    if(rows.length < 1000) break;
    offset += 1000;
    process.stdout.write(`.`);
  }
  console.log(`\n   ${allAnime.length} anime need seasons`);

  if(!allAnime.length) { console.log("✅ All done!"); return; }

  let processed = 0, failed = 0;

  for(let i = 0; i < allAnime.length; i += BATCH_SIZE) {
    const batch = allAnime.slice(i, i + BATCH_SIZE);
    
    try {
      const results = await askLLMBatch(batch);
      
      if(results) {
        const updates = results
          .filter(r => r.season)
          .map(r => {
            const anime = batch[r.i - 1];
            if(!anime) return null;
            const year = anime.year;
            const month = r.month || 1;
            return {
              mal_id: anime.mal_id,
              season: r.season,
              aired_from: year && month ? `${year}-${String(month).padStart(2,"0")}-01` : null,
            };
          })
          .filter(Boolean);
        
        await sbUpsertBatch(updates);
        processed += updates.length;
        
        // Fallback for ones the LLM missed
        const covered = new Set(results.map(r => r.i - 1));
        for(let j = 0; j < batch.length; j++) {
          if(!covered.has(j) && batch[j].year) {
            await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${batch[j].mal_id}`, {
              method: "PATCH", headers: { ...SB_HEADERS, "Prefer":"return=minimal" },
              body: JSON.stringify({ anime_season_label: `Hiver ${batch[j].year}`, aired_from: `${batch[j].year}-01-01` }),
            });
            processed++;
          }
        }
        process.stdout.write(`✓`);
      } else {
        // LLM failed — use year fallback for whole batch
        for(const a of batch) {
          if(a.year) {
            await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${a.mal_id}`, {
              method: "PATCH", headers: { ...SB_HEADERS, "Prefer":"return=minimal" },
              body: JSON.stringify({ anime_season_label: `Hiver ${a.year}`, aired_from: `${a.year}-01-01` }),
            });
            processed++;
          } else failed++;
        }
        process.stdout.write(`~`);
      }
    } catch(e) {
      console.error(`\nBatch error:`, e.message);
      failed += batch.length;
      process.stdout.write(`✗`);
    }

    if((i + BATCH_SIZE) % 200 === 0) {
      console.log(`\n  [${i+BATCH_SIZE}/${allAnime.length}] processed:${processed} failed:${failed}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n\n✅ Done — ${processed} updated, ${failed} failed`);
}

main().catch(console.error);
