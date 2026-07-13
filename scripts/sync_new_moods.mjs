// ─── Tag moods ONLY for anime that have aired ────────────────────────────────
// Rules:
// - ONLY tag anime where status = 'Finished Airing' OR 'Currently Airing'
// - NEVER tag 'Not yet aired' — wait until it actually airs
// - Skip anime already in mood_pts_v2
// - Statistically normalized to match real DB distribution

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const GROQ_KEY      = process.env.GROQ_API_KEY;
const GROQ_URL      = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL    = "meta-llama/llama-4-scout-17b-16e-instruct";
const DELAY_MS      = 400;
const MAX_PER_RUN   = 200;

// Statuses that qualify for mood tagging
const AIRED_STATUSES = new Set([
  "Finished Airing",
  "Currently Airing",
]);

// Real distribution stats from mood_pts_v2
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
const MOOD_KEYS = Object.keys(STATS);

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

async function getMoodPcts(anime, attempt=0) {
  const genres   = (anime.genres||[]).map(g=>g.name||g).join(", ") || "Unknown";
  const synopsis = (anime.synopsis||"").slice(0,400);

  const prompt = `You are an expert anime analyst. For "${anime.title}" (${anime.year||"?"}, ${anime.type||"?"}, MAL score: ${anime.score||"?"}):
Genres: ${genres}
Synopsis: ${synopsis}

Rate each mood from 0 to 100 independently:
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
- thrills: narrative tension, suspense (NOT action)

Reply ONLY with JSON: {"emotional":N,"happy":N,"hype":N,"dark":N,"chill":N,"twisted":N,"in_love":N,"thrills":N}`;

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model:GROQ_MODEL, messages:[{role:"user",content:prompt}], max_tokens:120, temperature:0.2 }),
  });

  if(res.status===429) { await sleep(10000*(attempt+1)); if(attempt<4) return getMoodPcts(anime,attempt+1); throw new Error("Rate limit"); }
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

function normalizeMoods(pcts) {
  const raw = {};
  MOOD_KEYS.forEach(k => {
    const s = STATS[k];
    const t = pcts[k] / 100;
    raw[k] = t <= 0.5
      ? Math.round(s.min + (t / 0.5) * (s.avg - s.min))
      : Math.round(s.avg + ((t - 0.5) / 0.5) * (s.max - s.avg));
    raw[k] = Math.max(0, raw[k]);
  });

  // Normalize total (excluding thrills)
  const excl = MOOD_KEYS.filter(k=>k!=="thrills");
  const cur = excl.reduce((s,k)=>s+raw[k],0);
  const target = TARGET_TOTAL - raw.thrills;
  if(cur > 0 && target > 0) {
    const scale = target / cur;
    excl.forEach(k => { raw[k] = Math.round(raw[k]*scale); });
  }
  raw.thrills = Math.min(33, raw.thrills);
  return raw;
}

function genreFallback(anime) {
  const n = (anime.genres||[]).map(g=>(g.name||g).toLowerCase());
  const pcts = {};
  MOOD_KEYS.forEach(k => { pcts[k] = 50; });
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
  console.log("🎭 AniMood — Mood Sync (aired anime only)");
  console.log("==========================================");

  // Get all mal_ids already mooded
  console.log("📊 Loading existing mood IDs...");
  const moodSet = new Set();
  let offset = 0;
  while(true) {
    const rows = await sbQuery(`mood_pts_v2?select=mal_id&limit=1000&offset=${offset}`);
    if(!rows?.length) break;
    rows.forEach(r => moodSet.add(r.mal_id));
    if(rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`  ${moodSet.size} anime already mooded`);

  // Find anime that:
  // 1. Are in anime_cache
  // 2. Have AIRED (status = Finished Airing or Currently Airing)
  // 3. Are NOT yet in mood_pts_v2
  console.log("\n🔍 Finding aired anime without moods...");
  const candidates = [];
  offset = 0;
  while(true) {
    const rows = await sbQuery(
      `anime_cache?select=mal_id,title,synopsis,genres,score,year,type,status` +
      `&status=in.(Finished Airing,Currently Airing)` +
      `&limit=1000&offset=${offset}`
    );
    if(!rows?.length) break;
    rows.filter(a => !moodSet.has(a.mal_id)).forEach(a => candidates.push(a));
    if(rows.length < 1000) break;
    offset += 1000;
  }

  // Sort by score desc — tag best anime first
  candidates.sort((a,b) => (b.score||0) - (a.score||0));

  console.log(`  ${candidates.length} aired anime need moods`);
  console.log(`  Processing up to ${MAX_PER_RUN} this run (best scored first)`);

  if(candidates.length === 0) { console.log("\n✅ All aired anime are mooded!"); return; }

  let tagged = 0, fallbacks = 0, skippedNotAired = 0;

  for(const anime of candidates.slice(0, MAX_PER_RUN)) {
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

  const remaining = Math.max(0, candidates.length - MAX_PER_RUN);
  console.log(`\n\n==========================================`);
  console.log(`✅ Moods tagged: ${tagged} (${fallbacks} fallbacks)`);
  if(remaining > 0) console.log(`   ${remaining} remaining — will process next weekly run`);
  console.log(`   Not yet aired anime: skipped (will be tagged once they air)`);
}

main().catch(console.error);
