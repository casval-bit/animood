// ─── Tag moods for anime missing from mood_pts_v2 ────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const GROQ_KEY      = process.env.GROQ_API_KEY;
const GROQ_URL      = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL    = "meta-llama/llama-4-scout-17b-16e-instruct";
const DELAY_MS      = 400;
const MOOD_KEYS     = ["emotional","happy","twisted","chill","in_love","hype","dark","thrills"];

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

async function sbUpsert(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mood_pts_v2?on_conflict=mal_id`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
  if(!r.ok) throw new Error(await r.text());
}

async function callGroq(prompt, attempt=0) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model:GROQ_MODEL, messages:[{role:"user",content:prompt}], max_tokens:10, temperature:0.2 }),
  });
  if(res.status===429) {
    const wait = 10000*(attempt+1);
    await sleep(wait);
    if(attempt<4) return callGroq(prompt,attempt+1);
    throw new Error("Rate limit");
  }
  if(!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  // ... (same logic as populate_moods.mjs)
  return data.choices?.[0]?.message?.content?.trim();
}

async function main() {
  console.log("🎭 Tag moods for new anime");

  // Find anime in anime_cache that don't have moods yet
  // Compare mal_ids between anime_cache and mood_pts_v2
  const [cacheIds, moodIds] = await Promise.all([
    sbQuery("anime_cache?select=mal_id&order=mal_id.desc&limit=500").then(r=>(r||[]).map(x=>x.mal_id)),
    sbQuery("mood_pts_v2?select=mal_id&order=mal_id.desc&limit=500").then(r=>new Set((r||[]).map(x=>x.mal_id))),
  ]);

  const missing = cacheIds.filter(id => !moodIds.has(id));
  console.log(`   ${missing.length} anime need moods`);

  if(missing.length === 0) { console.log("✅ All up to date"); return; }

  // Fetch their data and tag
  for(const mal_id of missing.slice(0, 100)) { // Max 100 per run
    try {
      const rows = await sbQuery(`anime_cache?mal_id=eq.${mal_id}&select=mal_id,title,synopsis,genres,score,year,type&limit=1`);
      const anime = rows?.[0];
      if(!anime) continue;

      const genres = (anime.genres||[]).map(g=>g.name||g).join(", ");
      const prompt = `Rate mood of "${anime.title}" (${anime.year}, ${anime.type}, score:${anime.score}).
Genres: ${genres}. Give ONLY an integer 0-33 for "thrills" (narrative tension, not action):`;

      const thrills = Math.max(0, Math.min(33, parseInt(await callGroq(prompt)||"5")));

      await sbUpsert({ mal_id, emotional:10,happy:10,twisted:10,chill:10,in_love:10,hype:10,dark:10,thrills });
      process.stdout.write("✓");
      await sleep(DELAY_MS);
    } catch(e) { process.stdout.write("~"); }
  }

  console.log("\n✅ Done");
}

main().catch(console.error);
