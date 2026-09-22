// â”€â”€â”€ AniMood Master Sync Script â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Runs multiple jobs depending on the --job flag:
//
//   node --env-file=.env animood_sync.mjs --job=weekly
//     â†’ Sync current season + ongoing anime (run every week via Task Scheduler)
//
//   node --env-file=.env animood_sync.mjs --job=broadcast
//     â†’ Patch missing broadcast days via Jikan (run every week)
//
//   node --env-file=.env animood_sync.mjs --job=moods
//     â†’ Assign moods to new anime via OpenRouter (run after weekly, also at 2w & 2mo)
//
//   node --env-file=.env animood_sync.mjs --job=trailers
//     â†’ Fetch trailers for all anime (run once, then monthly)
//
//   node --env-file=.env animood_sync.mjs --job=streaming
//     â†’ Fetch streaming platforms per anime for FR/US/JP (run monthly)
//
//   node --env-file=.env animood_sync.mjs --job=all
//     â†’ Run all jobs in sequence
//
// Windows Task Scheduler setup:
//   weekly  : every Monday 06:00 â†’ --job=weekly
//   moods   : every Monday 07:00 â†’ --job=moods
//   broadcast: every Monday 06:30 â†’ --job=broadcast
//   streaming: 1st of every month â†’ --job=streaming
//   trailers: 1st of every month â†’ --job=trailers

import { createClient } from "@supabase/supabase-js";

// â”€â”€ CONFIG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CFG = {
  SUPABASE_URL:         process.env.SUPABASE_URL         || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "",
  OPENROUTER_KEY:       process.env.OPENROUTER_KEY       || "",
  OPENROUTER_MODEL:     process.env.OPENROUTER_MODEL     || "google/gemma-3-27b-it",
  MOOD_BATCH_SIZE:      40,
};

const MOODS = ["emotional","happy","twisted","chill","in_love","hype","dark","thrills"];

const KNOWN_DAYS = {
  21:"Sunday", 235:"Saturday", 966:"Friday", 1560:"Sunday", 50250:"Sunday",
};

// Streaming platforms to check (Jikan returns these)
const PLATFORMS_MAP = {
  "Netflix":"netflix", "Crunchyroll":"crunchyroll", "Funimation":"funimation",
  "Amazon Prime Video":"amazon", "HIDIVE":"hidive", "Disney+":"disney",
  "Hulu":"hulu", "ADN":"adn", "Wakanim":"wakanim", "VRV":"vrv",
  "Apple TV+":"apple", "Max":"max",
};

const supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_SERVICE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (msg, ...a) => console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`, ...a);

// â”€â”€ JOB: weekly â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function jobWeekly() {
  log("=== JOB: weekly ===");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth()+1;
  const season = month<=3?"WINTER":month<=6?"SPRING":month<=9?"SUMMER":"FALL";

  // 1. Fetch current season from AniList
  log(`Fetching AniList ${season} ${year}...`);
  const seasonAnime = await fetchAniListSeason(season, year);
  log(`Season: ${seasonAnime.length} anime`);

  // 2. Fetch all currently airing (ongoing)
  log("Fetching AniList airing...");
  const airingAnime = await fetchAniListAiring();
  log(`Airing: ${airingAnime.length} anime`);

  // 3. Merge + dedup
  const all = new Map();
  [...seasonAnime, ...airingAnime].forEach(a => { if(a.idMal && !all.has(a.idMal)) all.set(a.idMal, a); });
  log(`Total unique: ${all.size}`);

  // 4. Upsert
  const rows = [...all.values()].map(anilistToRow);
  await upsertAnime(rows);
  log("=== weekly done ===");
  return rows.map(r=>r.mal_id).filter(Boolean);
}

// â”€â”€ JOB: broadcast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function jobBroadcast() {
  log("=== JOB: broadcast ===");
  const { data: missing } = await supabase.from("anime_cache")
    .select("mal_id, title").eq("type","TV").eq("status","Currently Airing").is("broadcast",null);
  log(`${missing?.length||0} anime without broadcast day`);

  let patched=0, notFound=0;
  for(const anime of (missing||[])) {
    let day = KNOWN_DAYS[anime.mal_id] || null;
    let src = "hardcoded";
    if(!day) { day = await fetchDayJikan(anime.mal_id); src="jikan"; await sleep(400); }
    if(!day) { day = await fetchDayAniList(anime.mal_id); src="anilist"; await sleep(300); }
    if(day) {
      await supabase.from("anime_cache").update({broadcast:{day}}).eq("mal_id",anime.mal_id);
      log(`  âœ… [${src}] ${anime.title} â†’ ${day}`);
      patched++;
    } else { log(`  â¬œ ${anime.title}`); notFound++; }
  }
  log(`=== broadcast done: ${patched} patched, ${notFound} not found ===`);
}

// â”€â”€ JOB: moods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function jobMoods() {
  log("=== JOB: moods ===");
  if(!CFG.OPENROUTER_KEY || CFG.OPENROUTER_KEY.includes("YOUR_")) {
    log("âš ï¸  No OpenRouter key"); return;
  }

  // Get IDs already in mood_pts_v4
  const { data: existing } = await supabase.from("mood_pts_v4").select("mal_id");
  const existingIds = new Set((existing||[]).map(r=>r.mal_id));

  // Get airing TV anime not yet having moods
  const { data: anime } = await supabase.from("anime_cache")
    .select("mal_id,title,synopsis,genres").eq("type","TV")
    .in("status",["Currently Airing","Finished Airing"])
    .not("score","is",null)
    .order("score",{ascending:false}).limit(300);

  const toAssign = (anime||[]).filter(a=>!existingIds.has(a.mal_id)).slice(0, CFG.MOOD_BATCH_SIZE);
  log(`Assigning moods to ${toAssign.length} anime...`);

  let success=0, failed=0;
  for(const a of toAssign) {
    const moods = await assignMoodAI(a);
    if(moods.length) {
      const obj = {}; moods.forEach(m=>{obj[m]=5;});
      const { error } = await supabase.from("mood_pts_v4")
        .upsert({mal_id:a.mal_id,...obj},{onConflict:"mal_id"});
      if(!error) { log(`  âœ… ${a.title}: [${moods.join(", ")}]`); success++; }
      else { log(`  âŒ ${a.title}: DB err`); failed++; }
    } else { log(`  â¬œ ${a.title}: no moods`); failed++; }
    await sleep(350);
  }
  log(`=== moods done: ${success} ok, ${failed} failed ===`);
}

// â”€â”€ JOB: trailers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function jobTrailers() {
  log("=== JOB: trailers ===");

  // Get anime without trailer
  const { data: anime } = await supabase.from("anime_cache")
    .select("mal_id,title").or("trailer.is.null,trailer.eq.{}").limit(500);
  log(`${anime?.length||0} anime without trailer`);

  let fetched=0, notFound=0;
  for(const a of (anime||[])) {
    const trailer = await fetchTrailerJikan(a.mal_id);
    await sleep(400);
    if(trailer) {
      await supabase.from("anime_cache").update({trailer}).eq("mal_id",a.mal_id);
      log(`  âœ… ${a.title}: ${trailer.url}`);
      fetched++;
    } else { notFound++; }
  }
  log(`=== trailers done: ${fetched} fetched, ${notFound} not found ===`);
}

// â”€â”€ JOB: streaming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Stores: { netflix:{fr:true,us:true,jp:false}, crunchyroll:{fr:true,...}, ... }
async function jobStreaming() {
  log("=== JOB: streaming ===");

  // Get all TV anime
  const { data: anime } = await supabase.from("anime_cache")
    .select("mal_id,title").eq("type","TV").order("score",{ascending:false}).limit(1000);
  log(`Fetching streaming for ${anime?.length||0} anime...`);

  let updated=0;
  for(const a of (anime||[])) {
    const platforms = await fetchStreamingJikan(a.mal_id);
    await sleep(500);
    if(Object.keys(platforms).length) {
      await supabase.from("anime_cache").update({streaming_platforms:platforms}).eq("mal_id",a.mal_id);
      const names = Object.keys(platforms).join(", ");
      log(`  âœ… ${a.title}: ${names}`);
      updated++;
    }
  }
  log(`=== streaming done: ${updated} updated ===`);
}

// â”€â”€ HELPERS: AniList â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchAniListSeason(season, year) {
  const query = `query($s:MediaSeason,$y:Int,$p:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage}media(season:$s,seasonYear:$y,type:ANIME,format_in:[TV],sort:[POPULARITY_DESC]){idMal title{romaji english}description(asHtml:false)averageScore popularity status startDate{year month day}episodes genres coverImage{large}studios(isMain:true){nodes{name}}nextAiringEpisode{episode airingAt}}}}`;
  const anime=[]; let page=1, hasNext=true;
  while(hasNext && page<=5) {
    const r = await fetch("https://graphql.anilist.co",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query,variables:{s:season,y:year,p:page}})});
    const d = await r.json();
    anime.push(...(d?.data?.Page?.media||[]).filter(a=>a.idMal));
    hasNext = d?.data?.Page?.pageInfo?.hasNextPage;
    page++; if(hasNext) await sleep(500);
  }
  return anime;
}

async function fetchAniListAiring() {
  const query = `query($p:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage}media(type:ANIME,format:TV,status:RELEASING,sort:[POPULARITY_DESC]){idMal title{romaji english}description(asHtml:false)averageScore popularity status startDate{year}episodes genres coverImage{large}studios(isMain:true){nodes{name}}nextAiringEpisode{episode airingAt}}}}`;
  const anime=[]; let page=1, hasNext=true;
  while(hasNext && page<=3) {
    const r = await fetch("https://graphql.anilist.co",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query,variables:{p:page}})});
    const d = await r.json();
    anime.push(...(d?.data?.Page?.media||[]).filter(a=>a.idMal));
    hasNext = d?.data?.Page?.pageInfo?.hasNextPage;
    page++; if(hasNext) await sleep(500);
  }
  return anime;
}

function anilistToRow(a) {
  const status = a.status==="RELEASING"?"Currently Airing":a.status==="FINISHED"?"Finished Airing":a.status==="NOT_YET_RELEASED"?"Not yet aired":"Unknown";
  let broadcastDay = null;
  if(a.nextAiringEpisode?.airingAt) {
    const d = new Date(a.nextAiringEpisode.airingAt*1000);
    broadcastDay = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  }
  return {
    mal_id: a.idMal, title: a.title?.romaji||"", title_en: a.title?.english||"",
    synopsis: (a.description||"").replace(/<[^>]*>/g,"").trim().slice(0,2000),
    score: a.averageScore?parseFloat((a.averageScore/10).toFixed(2)):null,
    scored_by: a.popularity||null, year: a.startDate?.year||null,
    episodes: a.episodes||null, type:"TV", status,
    image_url: a.coverImage?.large||null, large_image: a.coverImage?.large||null,
    genres: (a.genres||[]).map(g=>({name:g})),
    studios: (a.studios?.nodes||[]).map(s=>({name:s.name})),
    broadcast: broadcastDay?{day:broadcastDay}:null,
    fetched_at: new Date().toISOString(),
  };
}

async function upsertAnime(rows) {
  log(`Upserting ${rows.length} rows...`);
  let ok=0, fail=0;
  for(let i=0;i<rows.length;i+=20) {
    const { error } = await supabase.from("anime_cache").upsert(rows.slice(i,i+20),{onConflict:"mal_id",ignoreDuplicates:false});
    if(error) { console.error("Upsert error:", error.message); fail+=20; } else ok+=20;
    await sleep(100);
  }
  log(`Upsert: ~${ok} ok, ~${fail} failed`);
}

// â”€â”€ HELPERS: Jikan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchDayJikan(malId) {
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime/${malId}`,{headers:{"Accept":"application/json"}});
    if(!r.ok) return null;
    const d = await r.json();
    const day = d?.data?.broadcast?.day;
    return day ? day.replace(/s$/i,"") : null;
  } catch { return null; }
}

async function fetchTrailerJikan(malId) {
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime/${malId}`,{headers:{"Accept":"application/json"}});
    if(!r.ok) return null;
    const d = await r.json();
    const t = d?.data?.trailer;
    if(!t?.url && !t?.youtube_id) return null;
    return { url: t.url||`https://www.youtube.com/watch?v=${t.youtube_id}`, youtube_id: t.youtube_id||null };
  } catch { return null; }
}

async function fetchStreamingJikan(malId) {
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime/${malId}/streaming`,{headers:{"Accept":"application/json"}});
    if(!r.ok) return {};
    const d = await r.json();
    const platforms = {};
    // Jikan returns global streaming â€” we map to known platforms
    (d?.data||[]).forEach(s => {
      const key = PLATFORMS_MAP[s.name];
      if(key) {
        // Jikan doesn't give per-country info â€” mark as available globally
        platforms[key] = { name: s.name, url: s.url, fr: true, us: true, jp: false };
      }
    });
    return platforms;
  } catch { return {}; }
}

// â”€â”€ HELPERS: AniList broadcast fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchDayAniList(malId) {
  const query = `query($id:Int){Media(idMal:$id,type:ANIME){nextAiringEpisode{airingAt}airingSchedule(notYetAired:false,perPage:3){nodes{airingAt}}}}`;
  try {
    const r = await fetch("https://graphql.anilist.co",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query,variables:{id:malId}})});
    const d = await r.json();
    const m = d?.data?.Media;
    const ts = m?.nextAiringEpisode?.airingAt || m?.airingSchedule?.nodes?.slice(-1)[0]?.airingAt;
    if(!ts) return null;
    return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(ts*1000).getDay()];
  } catch { return null; }
}

// â”€â”€ HELPERS: OpenRouter mood â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function assignMoodAI(anime) {
  const prompt = `You are an anime mood classifier. Assign 1-3 moods from: ${MOODS.join(", ")}

Definitions: emotional=sad/bittersweet/touching, happy=feel-good/uplifting/fun, twisted=psychological/mind-bending/dark-complex, chill=slice-of-life/cozy/relaxing, in_love=romance/love story, hype=action/adrenaline/exciting, dark=grim/horror/violence/mature, thrills=suspense/thriller/mystery/horror

Anime: "${anime.title}"
Genres: ${(anime.genres||[]).map(g=>g.name||g).join(", ")}
Synopsis: ${(anime.synopsis||"").slice(0,300)}

Reply ONLY with JSON array like ["epic","hype"] â€” no other text.`;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${CFG.OPENROUTER_KEY}`,"HTTP-Referer":"https://animood.app"},
      body:JSON.stringify({model:CFG.OPENROUTER_MODEL,messages:[{role:"user",content:prompt}],temperature:0.1,max_tokens:50}),
    });
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content?.trim()||"";
    const m = text.match(/\[.*?\]/s);
    if(!m) return [];
    return JSON.parse(m[0]).filter(x=>MOODS.includes(x)).slice(0,3);
  } catch { return []; }
}

// â”€â”€ MAIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const job = (process.argv.find(a=>a.startsWith("--job="))||"--job=all").split("=")[1];
log(`Starting job: ${job}`);

// Verify connection
const { error: pingErr } = await supabase.from("anime_cache").select("mal_id").limit(1);
if(pingErr) { console.error("âŒ Supabase connection failed:", pingErr.message); process.exit(1); }
log("âœ… Supabase connected");


switch(job) {
  case "weekly":    await jobWeekly();    break;
  case "broadcast": await jobBroadcast(); break;
  case "moods":     await jobMoods();     break;
  case "trailers":  await jobTrailers();  break;
  case "streaming": await jobStreaming(); break;
  case "all":
    await jobWeekly();
    await sleep(2000);
    await jobBroadcast();
    await sleep(2000);
    await jobMoods();
    break;
  default: console.error(`Unknown job: ${job}`); process.exit(1);
}

log("=== All done ===");




