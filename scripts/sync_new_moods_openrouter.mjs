const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const OR_KEY        = process.env.OPENROUTER_KEY;
const OR_URL        = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODEL      = "meta-llama/llama-4-scout";
const DELAY_MS      = 600;
const MAX_PER_RUN   = 500;

const STATS = {
  emotional: { avg: 8,  min: 0, max: 56 },
  happy:     { avg: 12, min: 0, max: 42 },
  hype:      { avg: 14, min: 0, max: 62 },
  dark:      { avg: 9,  min: 0, max: 54 },
  chill:     { avg: 16, min: 0, max: 71 },
  twisted:   { avg: 5,  min: 0, max: 35 },
  in_love:   { avg: 8,  min: 0, max: 54 },
  thrills:   { avg: 5,  min: 0, max: 33 },
};
const TARGET_TOTAL = 78;
const MOOD_KEYS    = Object.keys(STATS);
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

async function sbUpsert(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mood_pts_v4?on_conflict=mal_id`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
  if(!r.ok) throw new Error(await r.text());
}

async function getMoodPcts(anime, attempt=0) {
  const genres   = (anime.genres||[]).map(g=>g.name||g).join(", ") || "Unknown";
  const synopsis = (anime.synopsis||"").slice(0,300);
  const prompt   = `Rate the anime "${anime.title}" (${anime.year||"?"}, genres: ${genres}) on these 8 moods from 0-100 each. Synopsis: ${synopsis}\nReply ONLY with this JSON, no explanation:\n{"emotional":N,"happy":N,"hype":N,"dark":N,"chill":N,"twisted":N,"in_love":N,"thrills":N}`;

  const res = await fetch(OR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OR_KEY}`,
    },
    body: JSON.stringify({
      model: OR_MODEL,
      messages: [{ role:"user", content: prompt }],
      max_tokens: 200,
      temperature: 0.1,
    }),
  });

  if(res.status === 429) { await sleep(15000*(attempt+1)); if(attempt<3) return getMoodPcts(anime,attempt+1); throw new Error("Rate limit"); }
  if(!res.ok) throw new Error(`OR ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content || "").replace(/```[a-z]*\n?/g,"").trim();
  // Try full match first, then reconstruct if truncated
  let jsonStr = text;
  const fullMatch = text.match(/\{[\s\S]*?\}/);
  if(fullMatch) {
    jsonStr = fullMatch[0];
  } else {
    // Model truncated the opening — reconstruct
    const partial = text.replace(/^[^"]*/, ""); // strip any garbage before first "
    jsonStr = "{" + partial;
    if(!jsonStr.endsWith("}")) jsonStr += "}";
  }
  if(!jsonStr.includes("{")) throw new Error(`No JSON in: ${text.slice(0,100)}`);
  const raw = JSON.parse(jsonStr);
  const pcts = {};
  MOOD_KEYS.forEach(k => { pcts[k] = Math.max(0, Math.min(100, parseInt(raw[k])||0)); });
  return pcts;
}

function normalizeMoods(pcts) {
  const raw = {};
  MOOD_KEYS.forEach(k => {
    const s = STATS[k], t = pcts[k]/100;
    raw[k] = t<=0.5 ? Math.round(s.min+(t/0.5)*(s.avg-s.min)) : Math.round(s.avg+((t-0.5)/0.5)*(s.max-s.avg));
    raw[k] = Math.max(0, raw[k]);
  });
  const noThrills = MOOD_KEYS.filter(k=>k!=="thrills");
  const cur = noThrills.reduce((s,k)=>s+raw[k],0);
  const tgt = TARGET_TOTAL - raw.thrills;
  if(cur>0 && tgt>0) { const sc=tgt/cur; noThrills.forEach(k=>{raw[k]=Math.round(raw[k]*sc);}); }
  raw.thrills = Math.min(33, raw.thrills);
  return raw;
}

function genreFallback(anime) {
  const n = (anime.genres||[]).map(g=>(g.name||g).toLowerCase());
  const pcts = {}; MOOD_KEYS.forEach(k=>{pcts[k]=50;});
  if(n.some(g=>["action","fighting","martial arts"].includes(g))) pcts.hype=80;
  if(n.some(g=>["thriller","mystery"].includes(g))) { pcts.twisted=75; pcts.thrills=65; }
  if(n.some(g=>["psychological"].includes(g))) { pcts.twisted=80; pcts.dark=60; }
  if(n.some(g=>["horror"].includes(g))) { pcts.dark=85; pcts.thrills=75; }
  if(n.some(g=>["drama"].includes(g))) pcts.emotional=70;
  if(n.some(g=>["comedy","parody"].includes(g))) pcts.happy=80;
  if(n.some(g=>["slice of life","iyashikei"].includes(g))) { pcts.chill=85; pcts.happy=65; }
  if(n.some(g=>["romance"].includes(g))) pcts.in_love=80;
  if(n.some(g=>["sports"].includes(g))) { pcts.happy=70; pcts.hype=65; }
  return normalizeMoods(pcts);
}

async function main() {
  console.log(`🌀 Tag moods via OpenRouter (${OR_MODEL}) → mood_pts_v4`);
  const cacheRows = await sbQuery("anime_cache?select=mal_id,title,synopsis,genres,score,year,type&status=in.(Finished%20Airing,Currently%20Airing)&year=gte.2025&order=score.desc.nullslast&limit=2000");
  const moodRows  = await sbQuery("mood_pts_v4?select=mal_id&limit=5000");
  const moodSet   = new Set((moodRows||[]).map(r=>r.mal_id));
  const missing   = (cacheRows||[]).filter(a=>!moodSet.has(a.mal_id));
  console.log(`📊 ${missing.length} animés sans moods (max ${MAX_PER_RUN})`);
  if(!missing.length) { console.log("✅ Tout est à jour !"); return; }

  let tagged=0, fallbacks=0;
  for(const anime of missing.slice(0, MAX_PER_RUN)) {
    let pts;
    try {
      const pcts = await getMoodPcts(anime);
      pts = normalizeMoods(pcts);
      process.stdout.write("✓");
    } catch(e) {
      console.error(`\n~ ${anime.title?.slice(0,30)}: ${e.message}`);
      fallbacks++;
      pts = genreFallback(anime);
    }
    try { await sbUpsert({ mal_id: anime.mal_id, ...pts }); tagged++; } catch(e) { console.error(`\n✗ DB: ${e.message}`); }
    await sleep(DELAY_MS);
  }
  console.log(`\n✅ ${tagged} tagués (${fallbacks} fallbacks)`);
  if(missing.length > MAX_PER_RUN) console.log(`${missing.length-MAX_PER_RUN} restants — relance`);
}

main().catch(console.error);
