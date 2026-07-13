// ─── Tag moods for new anime — statistically normalized ──────────────────────
// Uses real distribution stats from mood_pts_v2 to normalize LLM output
// so new anime fit naturally within the existing mood space

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const GROQ_KEY      = process.env.GROQ_API_KEY;
const GROQ_URL      = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL    = "meta-llama/llama-4-scout-17b-16e-instruct";
const DELAY_MS      = 400;
const MAX_PER_RUN   = 200; // max anime to tag per workflow run

// ─── Real distribution stats from mood_pts_v2 ────────────────────────────────
// Source: SELECT avg/min/max per mood WHERE emotional>0 OR happy>0
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
const TARGET_TOTAL = 78; // avg total pts per anime in DB
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
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mood_pts_v2?on_conflict=mal_id`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
  if(!r.ok) throw new Error(await r.text());
}

// Ask LLM for relative mood percentages (0-100 each, independent)
async function getMoodPcts(anime, attempt=0) {
  const genres = (anime.genres||[]).map(g=>g.name||g).join(", ") || "Unknown";
  const synopsis = (anime.synopsis||"").slice(0,400);

  const prompt = `You are an expert anime analyst. For "${anime.title}" (${anime.year||"?"}, ${anime.type||"?"}, MAL score: ${anime.score||"?"}):
Genres: ${genres}
Synopsis: ${synopsis}

Rate each mood from 0 to 100 independently (not a distribution, each mood stands alone):
- 0 = completely absent
- 50 = moderately present  
- 100 = extremely dominant

Moods:
- emotional: tears, drama, heartbreak
- happy: comedy, fun, uplifting
- hype: action, adrenaline, battles
- dark: grim, violent, disturbing
- chill: calm, relaxing, slice-of-life
- twisted: psychological, mind games, plot twists
- in_love: romance, heartwarming
- thrills: narrative tension, suspense, edge-of-seat (NOT action — that's hype)

Reply ONLY with JSON: {"emotional":N,"happy":N,"hype":N,"dark":N,"chill":N,"twisted":N,"in_love":N,"thrills":N}`;

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model:GROQ_MODEL, messages:[{role:"user",content:prompt}], max_tokens:120, temperature:0.2 }),
  });

  if(res.status===429) {
    await sleep(10000*(attempt+1));
    if(attempt<4) return getMoodPcts(anime, attempt+1);
    throw new Error("Rate limit exceeded");
  }
  if(!res.ok) throw new Error(`Groq ${res.status}`);

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim()||"";
  const match = text.match(/\{[^{}]*\}/);
  if(!match) throw new Error("No JSON");

  const raw = JSON.parse(match[0]);
  const pcts = {};
  MOOD_KEYS.forEach(k => { pcts[k] = Math.max(0, Math.min(100, parseInt(raw[k]||0))); });
  return pcts;
}

// Convert relative LLM percentages → actual pts using real DB distribution
// Formula: pts = avg + (pct/100 - 0.5) * (max - avg) * 2
// This maps 0%→min, 50%→avg, 100%→max
// Then normalize total to TARGET_TOTAL
function normalizeMoods(pcts) {
  const raw = {};
  MOOD_KEYS.forEach(k => {
    const s = STATS[k];
    const t = pcts[k] / 100; // 0.0 to 1.0
    if(t <= 0.5) {
      // Map 0→min, 0.5→avg
      raw[k] = s.min + (t / 0.5) * (s.avg - s.min);
    } else {
      // Map 0.5→avg, 1.0→max
      raw[k] = s.avg + ((t - 0.5) / 0.5) * (s.max - s.avg);
    }
    raw[k] = Math.round(Math.max(0, raw[k]));
  });

  // Normalize total to TARGET_TOTAL (excluding thrills which has its own scale)
  const moodsExcludingThrills = MOOD_KEYS.filter(k=>k!=="thrills");
  const currentTotal = moodsExcludingThrills.reduce((sum,k)=>sum+raw[k], 0);
  const targetNoThrills = TARGET_TOTAL - raw.thrills;

  if(currentTotal > 0 && targetNoThrills > 0) {
    const scale = targetNoThrills / currentTotal;
    moodsExcludingThrills.forEach(k => { raw[k] = Math.round(raw[k] * scale); });
  }

  // Thrills stays on its own 0-33 scale
  raw.thrills = Math.min(33, raw.thrills);

  return raw;
}

// Genre-based fallback if Groq fails
function genreFallback(anime) {
  const n = (anime.genres||[]).map(g=>(g.name||g).toLowerCase());
  // Start from averages
  const pcts = {};
  MOOD_KEYS.forEach(k => { pcts[k] = 50; }); // start at avg

  if(n.some(g=>["action","fighting","martial arts"].includes(g)))  pcts.hype=80;
  if(n.some(g=>["thriller","mystery"].includes(g)))                { pcts.twisted=75; pcts.thrills=65; }
  if(n.some(g=>["psychological"].includes(g)))                     { pcts.twisted=80; pcts.dark=60; }
  if(n.some(g=>["horror"].includes(g)))                            { pcts.dark=85; pcts.thrills=75; }
  if(n.some(g=>["drama"].includes(g)))                             pcts.emotional=70;
  if(n.some(g=>["comedy","parody"].includes(g)))                   pcts.happy=80;
  if(n.some(g=>["slice of life","iyashikei"].includes(g)))         { pcts.chill=85; pcts.happy=65; }
  if(n.some(g=>["romance"].includes(g)))                           pcts.in_love=80;
  if(n.some(g=>["sports"].includes(g)))                            { pcts.happy=70; pcts.hype=65; }

  return normalizeMoods(pcts);
}

async function main() {
  console.log("🎭 Tag moods for new anime (statistically normalized)");
  console.log(`   Target total pts: ${TARGET_TOTAL} | Distribution-based normalization`);

  // Find anime in anime_cache missing from mood_pts_v2
  console.log("\n📊 Finding anime without moods...");

  // Get all mal_ids from both tables
  const cacheRows = await sbQuery("anime_cache?select=mal_id,title,synopsis,genres,score,year,type&order=score.desc.nullslast&limit=5000");
  const moodRows  = await sbQuery("mood_pts_v2?select=mal_id&limit=5000");
  const moodSet   = new Set((moodRows||[]).map(r=>r.mal_id));
  const missing   = (cacheRows||[]).filter(a=>!moodSet.has(a.mal_id));

  console.log(`   ${missing.length} anime need moods (processing up to ${MAX_PER_RUN})`);

  if(missing.length === 0) { console.log("✅ All up to date"); return; }

  let tagged=0, fallbacks=0;

  for(const anime of missing.slice(0, MAX_PER_RUN)) {
    try {
      let pts;
      try {
        const pcts = await getMoodPcts(anime);
        pts = normalizeMoods(pcts);
        process.stdout.write("✓");
      } catch(e) {
        pts = genreFallback(anime);
        process.stdout.write("~");
        fallbacks++;
      }

      await sbUpsert({ mal_id: anime.mal_id, ...pts });
      tagged++;
      await sleep(DELAY_MS);

    } catch(e) {
      console.error(`\n  ✗ ${anime.mal_id} (${anime.title?.slice(0,30)}): ${e.message}`);
    }
  }

  console.log(`\n\n✅ Done — ${tagged} tagged (${fallbacks} fallbacks)`);
  if(missing.length > MAX_PER_RUN) {
    console.log(`   ${missing.length - MAX_PER_RUN} remaining — will process next run`);
  }
}

main().catch(console.error);
