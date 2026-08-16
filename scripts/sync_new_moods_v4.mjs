// ─── Tag moods for new anime — statistically normalized ───────────────────────
// Cible les animés sans moods dans mood_pts_v4
// Uses real distribution stats + Groq LLM normalization

const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const GROQ_KEY      = process.env.GROQ_KEY || "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";
const GROQ_URL      = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL    = "llama-3.3-70b-versatile";
const DELAY_MS      = 400;
const MAX_PER_RUN   = 200;

// Distribution stats from mood_pts_v4 (à ajuster selon les vraies stats)
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
  const synopsis = (anime.synopsis||"").slice(0,400);

  const prompt = `You are an expert anime analyst. For "${anime.title}" (${anime.year||"?"}, ${anime.type||"?"}, MAL score: ${anime.score||"?"}):\nGenres: ${genres}\nSynopsis: ${synopsis}\n\nRate each mood from 0 to 100 independently:\n- emotional: tears, drama, heartbreak\n- happy: comedy, fun, uplifting\n- hype: action, adrenaline, battles\n- dark: grim, violent, disturbing\n- chill: calm, relaxing, slice-of-life\n- twisted: psychological, mind games, plot twists\n- in_love: romance, heartwarming\n- thrills: narrative tension, suspense (NOT action)\n\nReply ONLY with JSON: {"emotional":N,"happy":N,"hype":N,"dark":N,"chill":N,"twisted":N,"in_love":N,"thrills":N}`;

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
      ? Math.round(s.min + (t/0.5)*(s.avg-s.min))
      : Math.round(s.avg + ((t-0.5)/0.5)*(s.max-s.avg));
    raw[k] = Math.max(0, raw[k]);
  });
  const moodsNoThrills = MOOD_KEYS.filter(k=>k!=="thrills");
  const currentTotal   = moodsNoThrills.reduce((sum,k)=>sum+raw[k],0);
  const targetNoThrills = TARGET_TOTAL - raw.thrills;
  if(currentTotal > 0 && targetNoThrills > 0) {
    const scale = targetNoThrills / currentTotal;
    moodsNoThrills.forEach(k => { raw[k] = Math.round(raw[k]*scale); });
  }
  raw.thrills = Math.min(33, raw.thrills);
  return raw;
}

function genreFallback(anime) {
  const n = (anime.genres||[]).map(g=>(g.name||g).toLowerCase());
  const pcts = {}; MOOD_KEYS.forEach(k => { pcts[k] = 50; });
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
  console.log("🌀 Tag moods for new anime → mood_pts_v4");
  console.log(`   Groq model: ${GROQ_MODEL}`);

  // Animés sans moods dans v4 — on cible airing/finished depuis 2025
  const cacheRows = await sbQuery(
    "anime_cache?select=mal_id,title,synopsis,genres,score,year,type&status=in.(Finished%20Airing,Currently%20Airing)&year=gte.2025&order=score.desc.nullslast&limit=2000"
  );
  const moodRows = await sbQuery("mood_pts_v4?select=mal_id&limit=5000");
  const moodSet  = new Set((moodRows||[]).map(r=>r.mal_id));
  const missing  = (cacheRows||[]).filter(a=>!moodSet.has(a.mal_id));

  console.log(`\n📊 ${missing.length} animés sans moods (traitement: max ${MAX_PER_RUN})`);
  if(!missing.length) { console.log("✅ Tout est à jour !"); return; }

  let tagged=0, fallbacks=0;

  for(const anime of missing.slice(0, MAX_PER_RUN)) {
    try {
      let pts;
      try {
        const pcts = await getMoodPcts(anime);
        pts = normalizeMoods(pcts);
        process.stdout.write("✓");
      } catch {
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

  console.log(`\n\n✅ ${tagged} tagués (${fallbacks} fallbacks genre)`);
  if(missing.length > MAX_PER_RUN) console.log(`   ${missing.length-MAX_PER_RUN} restants — relance le script`);
}

main().catch(console.error);
