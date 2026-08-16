// ─── fix_specific_moods.mjs ───────────────────────────────────────────────────
// Regenère les moods pour des animés spécifiques via OpenRouter

const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const OR_KEY        = process.env.OPENROUTER_KEY;
const OR_URL        = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODEL      = "meta-llama/llama-4-scout";

// ── Animés à refaire ──────────────────────────────────────────────────────────
const TARGET_IDS = [9253, 31240]; // Steins;Gate, Steins;Gate 0
// Ajoute d'autres mal_id ici si besoin

const STATS = {
  emotional: { avg: 8,  min: 0, max: 56 },
  happy:     { avg: 12, min: 0, max: 42 },
  hype:      { avg: 14, min: 0, max: 62 },
  dark:      { avg: 9,  min: 0, max: 54 },
  chill:     { avg: 16, min: 0, max: 71 },
  twisted:   { avg: 5,  min: 0, max: 35 },
  in_love:   { avg: 8,  min: 0, max: 54 },
  thrills:   { avg: 6,  min: 0, max: 40 },
};
const TARGET_TOTAL = 78;
const MOOD_KEYS    = Object.keys(STATS);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

async function getMoods(anime) {
  const genres   = (anime.genres||[]).map(g=>g.name||g).join(", ") || "Unknown";
  const synopsis = (anime.synopsis||"").slice(0,400);
  const prompt   = `Rate the anime "${anime.title}" (${anime.type||"?"}, genres: ${genres}). Synopsis: ${synopsis}\nScore each mood 0-100 independently. Reply ONLY with JSON:\n{"emotional":N,"happy":N,"hype":N,"dark":N,"chill":N,"twisted":N,"in_love":N,"thrills":N}`;

  const res = await fetch(OR_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${OR_KEY}` },
    body: JSON.stringify({ model:OR_MODEL, messages:[{role:"user",content:prompt}], max_tokens:200, temperature:0.1 }),
  });
  if(!res.ok) throw new Error(`OR ${res.status}`);
  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content||"").replace(/```[a-z]*\n?/g,"").trim();
  const full = text.match(/\{[\s\S]*?\}/);
  const jsonStr = full ? full[0] : "{" + text.replace(/^[^"]*/, "") + "}";
  const raw = JSON.parse(jsonStr);
  const pcts = {};
  MOOD_KEYS.forEach(k => { pcts[k] = Math.max(0, Math.min(100, parseInt(raw[k])||0)); });
  return pcts;
}

function normalize(pcts) {
  const raw = {};
  MOOD_KEYS.forEach(k => {
    const s = STATS[k], t = pcts[k]/100;
    raw[k] = t<=0.5 ? Math.round(s.min+(t/0.5)*(s.avg-s.min)) : Math.round(s.avg+((t-0.5)/0.5)*(s.max-s.avg));
    raw[k] = Math.max(0, raw[k]);
  });
  const noThrills = MOOD_KEYS.filter(k=>k!=="thrills");
  const cur = noThrills.reduce((s,k)=>s+raw[k],0);
  const tgt = TARGET_TOTAL - raw.thrills;
  if(cur>0&&tgt>0) { const sc=tgt/cur; noThrills.forEach(k=>{raw[k]=Math.round(raw[k]*sc);}); }
  raw.thrills = Math.min(40, raw.thrills);
  return raw;
}

async function main() {
  console.log("🔧 Fix moods pour animés spécifiques → mood_pts_v4");

  // Fetch les données depuis anime_cache
  const ids = TARGET_IDS.join(",");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=in.(${ids})&select=mal_id,title,synopsis,genres,type`, { headers: SB_HEADERS });
  const anime = await r.json();

  for(const a of anime) {
    process.stdout.write(`${a.title?.slice(0,40).padEnd(40)} → `);
    try {
      const pcts = await getMoods(a);
      const pts  = normalize(pcts);
      console.log(MOOD_KEYS.map(k=>`${k}:${pts[k]}`).join(" "));

      await fetch(`${SUPABASE_URL}/rest/v1/mood_pts_v4?on_conflict=mal_id`, {
        method: "POST",
        headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify([{ mal_id: a.mal_id, ...pts }]),
      });
      console.log("  ✅ sauvegardé");
    } catch(e) {
      console.log(`  ❌ ${e.message}`);
    }
    await sleep(800);
  }
  console.log("\n✅ Done");
}

main().catch(console.error);
