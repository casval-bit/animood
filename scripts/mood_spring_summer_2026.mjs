// ─── mood_spring_summer_2026.mjs ──────────────────────────────────────────────
// Génère/update les moods dans mood_pts_v4 pour les animés
// Printemps 2026 et Été 2026 uniquement

const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const OR_KEY        = process.env.OPENROUTER_KEY;
const OR_URL        = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODEL      = "meta-llama/llama-4-scout";
const DELAY_MS      = 600;

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
const SEASONS      = ["Printemps 2026", "Été 2026"];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

async function sbQuery(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if(!r.ok) throw new Error(await r.text());
  const t = await r.text();
  return t ? JSON.parse(t) : [];
}

async function upsertMood(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mood_pts_v4?on_conflict=mal_id`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify([row]),
  });
  if(!r.ok) throw new Error(await r.text());
}

async function getMoods(anime, attempt=0) {
  const genres   = (anime.genres||[]).map(g=>g.name||g).join(", ") || "Unknown";
  const synopsis = (anime.synopsis||"").slice(0,300);
  const prompt   = `Rate the anime "${anime.title}" (${anime.type||"?"}, genres: ${genres}). Synopsis: ${synopsis}\nScore each mood 0-100 independently. Reply ONLY with JSON:\n{"emotional":N,"happy":N,"hype":N,"dark":N,"chill":N,"twisted":N,"in_love":N,"thrills":N}`;

  const res = await fetch(OR_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${OR_KEY}` },
    body: JSON.stringify({ model:OR_MODEL, messages:[{role:"user",content:prompt}], max_tokens:200, temperature:0.1 }),
  });

  if(res.status===429) { await sleep(15000*(attempt+1)); if(attempt<3) return getMoods(anime,attempt+1); throw new Error("Rate limit"); }
  if(!res.ok) throw new Error(`OR ${res.status}`);

  const data = await res.json();
  const text = (data.choices?.[0]?.message?.content||"").replace(/```[a-z]*\n?/g,"").trim();
  let jsonStr = text;
  const full = text.match(/\{[\s\S]*?\}/);
  if(full) { jsonStr = full[0]; }
  else { jsonStr = "{" + text.replace(/^[^"]*/, "") + (text.endsWith("}") ? "" : "}"); }

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

function fallback(anime) {
  const n = (anime.genres||[]).map(g=>(g.name||g).toLowerCase());
  const p = {}; MOOD_KEYS.forEach(k=>{p[k]=50;});
  if(n.some(g=>["action","fighting","martial arts"].includes(g))) p.hype=80;
  if(n.some(g=>["thriller","mystery"].includes(g))) { p.twisted=75; p.thrills=65; }
  if(n.some(g=>["psychological"].includes(g))) { p.twisted=80; p.dark=60; }
  if(n.some(g=>["horror"].includes(g))) { p.dark=85; p.thrills=75; }
  if(n.some(g=>["drama"].includes(g))) p.emotional=70;
  if(n.some(g=>["comedy","parody"].includes(g))) p.happy=80;
  if(n.some(g=>["slice of life","iyashikei"].includes(g))) { p.chill=85; p.happy=65; }
  if(n.some(g=>["romance"].includes(g))) p.in_love=80;
  if(n.some(g=>["sports"].includes(g))) { p.happy=70; p.hype=65; }
  return normalize(p);
}

async function main() {
  console.log("🌀 Moods Printemps 2026 + Été 2026 → mood_pts_v4");
  console.log("==================================================");

  // Fetch tous les animés des deux saisons
  const encoded = SEASONS.map(s=>encodeURIComponent(s)).join(",");
  const anime = await sbQuery(
    `anime_cache?select=mal_id,title,synopsis,genres,score,year,type&anime_season_label=in.(${encoded})&order=score.desc.nullslast&limit=1000`
  );

  // Fetch ceux déjà dans v4 avec des vraies valeurs (total > 10)
  const moodSet = new Set();
  for(let i=0; i<anime.length; i+=100) {
    const chunk = anime.slice(i,i+100).map(a=>a.mal_id).join(",");
    const rows = await sbQuery(`mood_pts_v4?mal_id=in.(${chunk})&select=mal_id,emotional,happy,hype,dark,chill,twisted,in_love&limit=100`).catch(()=>[]);
    (rows||[]).forEach(r => {
      const total = (r.emotional||0)+(r.happy||0)+(r.hype||0)+(r.dark||0)+(r.chill||0)+(r.twisted||0)+(r.in_love||0);
      if(total > 10) moodSet.add(r.mal_id);
    });
  }
  const toProcess = anime.filter(a => !moodSet.has(a.mal_id));

  console.log(`📊 ${anime.length} animés trouvés → ${toProcess.length} sans moods, ${moodSet.size} déjà tagués`);
  if(!toProcess.length) { console.log("✅ Tout est à jour !"); return; }

  let done=0, fb=0;

  for(let i=0; i<toProcess.length; i++) {
    const a = toProcess[i];
    process.stdout.write(`[${i+1}/${toProcess.length}] ${a.title?.slice(0,35).padEnd(35)} → `);

    let pts;
    try {
      const pcts = await getMoods(a);
      pts = normalize(pcts);
      process.stdout.write("✓\n");
    } catch(e) {
      pts = fallback(a);
      process.stdout.write(`~ (${e.message?.slice(0,30)})\n`);
      fb++;
    }

    try { await upsertMood({ mal_id: a.mal_id, ...pts }); done++; }
    catch(e) { console.error(`  ✗ DB: ${e.message}`); }

    await sleep(DELAY_MS);
  }

  console.log(`\n==================================================`);
  console.log(`✅ ${done} animés tagués (${fb} fallbacks)`);
}

main().catch(console.error);
