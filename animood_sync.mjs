// ─── AniMood Master Sync Script v2 ────────────────────────────────────────────
//
// Jobs:
//   --job=new-anime     Weekly: add new anime from Jikan to DB (not already there)
//   --job=broadcast     Weekly: patch missing broadcast days
//   --job=streaming     Weekly: fetch streaming platforms via AniList
//   --job=trailers      Monthly: fetch missing trailers via Jikan
//   --job=new-scores    Weekly: update scores/moods for newly airing anime
//   --job=rescore-2w    Run 2 weeks after first airing: refresh scores/moods
//   --job=rescore-2m    Run 2 months after first airing: final refresh
//
// Safety rules:
//   - new-anime: only inserts, never updates existing rows
//   - broadcast: only patches rows where broadcast IS NULL
//   - new-scores: only touches anime that recently changed to "Currently Airing"
//   - rescore-*: only touches anime flagged in anime_sync_log table
//   - streaming/trailers: update all, safe (additive only)
//
// Setup:
//   node --env-file=.env animood_sync.mjs --job=new-anime

import { createClient } from "@supabase/supabase-js";

const CFG = {
  SUPABASE_URL:         process.env.SUPABASE_URL         || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "",
  OPENROUTER_KEY:       process.env.OPENROUTER_KEY       || "",
  OPENROUTER_MODEL:     process.env.OPENROUTER_MODEL     || "google/gemma-3-27b-it",
};

// mood_pts_v4 columns — must match DB exactly
const MOOD_COLS = ["emotional","happy","twisted","chill","in_love","hype","dark","thrills"];

// AniList mood mapping from genres/tags
const GENRE_MOOD_MAP = {
  "Action":     { hype:35, dark:15, thrills:20 },
  "Adventure":  { hype:25, happy:15, chill:10 },
  "Comedy":     { happy:40, chill:20 },
  "Drama":      { emotional:35, dark:15 },
  "Fantasy":    { hype:20, happy:15, twisted:10 },
  "Horror":     { dark:40, thrills:35, twisted:15 },
  "Mystery":    { thrills:30, twisted:25, dark:10 },
  "Romance":    { in_love:40, emotional:20, happy:15 },
  "Sci-Fi":     { twisted:20, hype:20, thrills:15 },
  "Slice of Life": { chill:40, happy:20, emotional:15 },
  "Sports":     { hype:35, emotional:20, happy:15 },
  "Supernatural": { twisted:30, thrills:20, dark:15 },
  "Psychological": { twisted:40, dark:25, thrills:20 },
  "Ecchi":      { happy:20, in_love:15 },
  "Mecha":      { hype:30, dark:15, thrills:10 },
  "Music":      { happy:20, chill:20, emotional:15 },
  "School":     { happy:20, chill:15, in_love:10 },
  "Shounen":    { hype:30, happy:20, emotional:15 },
  "Shoujo":     { in_love:30, emotional:25, happy:15 },
  "Seinen":     { dark:25, twisted:20, emotional:15 },
  "Josei":      { in_love:25, emotional:20, chill:15 },
  "Isekai":     { hype:25, happy:20, twisted:10 },
};

const supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_SERVICE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (msg, ...a) => console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`, ...a);

// ── MOOD HELPERS ──────────────────────────────────────────────────────────────
// Build mood scores from genres (same scale as existing mood_pts_v4 data)
function moodFromGenres(genres) {
  const scores = {};
  MOOD_COLS.forEach(k => { scores[k] = 0; });
  (genres||[]).forEach(g => {
    const name = g.name || g;
    const mapping = GENRE_MOOD_MAP[name];
    if(mapping) {
      Object.entries(mapping).forEach(([k,v]) => { scores[k] = (scores[k]||0) + v; });
    }
  });
  // Normalize: dominant ~35, others proportional — matching existing data scale
  const max = Math.max(...Object.values(scores), 1);
  if(max === 0) { scores.chill = 20; return scores; }
  const factor = 35 / max;
  MOOD_COLS.forEach(k => { scores[k] = Math.round((scores[k]||0) * factor); });
  return scores;
}

// AI mood assignment via OpenRouter
async function moodFromAI(anime) {
  if(!CFG.OPENROUTER_KEY || CFG.OPENROUTER_KEY.includes("YOUR_")) return null;
  const prompt = `You are an anime mood classifier. Given this anime, assign intensity scores (0-40) for each mood category.

Mood categories:
- emotional: sad, touching, bittersweet, makes you cry
- happy: feel-good, uplifting, fun, wholesome
- hype: action-packed, exciting, adrenaline, battles
- dark: grim, violent, horror, mature themes
- chill: relaxing, slice-of-life, cozy, calm
- twisted: psychological, mind-bending, complex
- in_love: romance, love story, relationship focus
- thrills: suspense, thriller, mystery, tense

Anime: "${anime.title}"
Genres: ${(anime.genres||[]).map(g=>g.name||g).join(", ")}
Synopsis: ${(anime.synopsis||"").slice(0,300)}

Reply ONLY with a JSON object like: {"emotional":25,"happy":5,"hype":35,"dark":20,"chill":0,"twisted":10,"in_love":0,"thrills":15}
Values should sum roughly to 80-120. Dominant mood 30-40, secondary 15-25, others 0-15.`;

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${CFG.OPENROUTER_KEY}`,"HTTP-Referer":"https://animood.app"},
      body:JSON.stringify({model:CFG.OPENROUTER_MODEL,messages:[{role:"user",content:prompt}],temperature:0.1,max_tokens:80}),
    });
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content?.trim()||"";
    const m = text.match(/\{[^}]+\}/s);
    if(!m) return null;
    const parsed = JSON.parse(m[0]);
    // Validate all keys present
    const result = {};
    MOOD_COLS.forEach(k => { result[k] = Math.max(0, Math.round(Number(parsed[k])||0)); });
    return result;
  } catch { return null; }
}

// ── ANILIST HELPERS ───────────────────────────────────────────────────────────
async function anilistQuery(query, variables) {
  const r = await fetch("https://graphql.anilist.co", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({query, variables}),
  });
  return r.json();
}

function anilistToRow(a) {
  const status = a.status==="RELEASING"?"Currently Airing":a.status==="FINISHED"?"Finished Airing":a.status==="NOT_YET_RELEASED"?"Not yet aired":"Unknown";
  let broadcastDay = null;
  if(a.nextAiringEpisode?.airingAt) {
    broadcastDay = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(a.nextAiringEpisode.airingAt*1000).getDay()];
  }
  return {
    mal_id: a.idMal,
    title: a.title?.romaji||"",
    title_en: a.title?.english||"",
    synopsis: (a.description||"").replace(/<[^>]*>/g,"").trim().slice(0,2000),
    score: a.averageScore ? parseFloat((a.averageScore/10).toFixed(2)) : null,
    scored_by: a.popularity||null,
    year: a.startDate?.year||null,
    episodes: a.episodes||null,
    type: a.format==="TV"?"TV":a.format==="MOVIE"?"Movie":a.format==="OVA"?"OVA":a.format==="ONA"?"ONA":a.format||"TV",
    status,
    image_url: a.coverImage?.large||null,
    large_image: a.coverImage?.large||null,
    genres: (a.genres||[]).map(g=>({name:g})),
    studios: (a.studios?.nodes||[]).map(s=>({name:s.name})),
    broadcast: broadcastDay?{day:broadcastDay}:null,
    trailer: a.trailer?.site==="youtube"?{url:`https://www.youtube.com/watch?v=${a.trailer.id}`,youtube_id:a.trailer.id}:null,
    fetched_at: new Date().toISOString(),
  };
}

// ── JOB: new-anime ────────────────────────────────────────────────────────────
// Fetches recently added anime from Jikan and inserts new ones only
async function jobNewAnime() {
  log("=== JOB: new-anime ===");

  // Get existing mal_ids from DB
  log("Loading existing mal_ids...");
  const existing = new Set();
  let offset = 0;
  while(true) {
    const { data } = await supabase.from("anime_cache").select("mal_id").range(offset, offset+999);
    if(!data?.length) break;
    data.forEach(r => existing.add(r.mal_id));
    if(data.length < 1000) break;
    offset += 1000;
  }
  log(`DB has ${existing.size} anime`);

  // Fetch recent anime from Jikan (last 3 pages of recently added)
  log("Fetching recent anime from Jikan...");
  const newAnime = [];
  for(let page=1; page<=3; page++) {
    try {
      const r = await fetch(`https://api.jikan.moe/v4/anime?order_by=mal_id&sort=desc&page=${page}&limit=25`);
      const d = await r.json();
      const items = d?.data||[];
      items.forEach(a => {
        if(a.mal_id && !existing.has(a.mal_id) && a.type==="TV") {
          newAnime.push(a);
        }
      });
      await sleep(500);
    } catch(e) { log(`Jikan page ${page} error: ${e.message}`); }
  }
  log(`${newAnime.length} new TV anime to add`);

  if(!newAnime.length) { log("Nothing to add"); return; }

  // Convert Jikan format to our DB format
  const rows = newAnime.map(a => ({
    mal_id: a.mal_id,
    title: a.title||"",
    title_en: a.title_english||"",
    synopsis: (a.synopsis||"").slice(0,2000),
    score: a.score||null,
    scored_by: a.scored_by||null,
    year: a.year||a.aired?.prop?.from?.year||null,
    episodes: a.episodes||null,
    type: a.type||"TV",
    status: a.status==="Currently Airing"?"Currently Airing":a.status==="Finished Airing"?"Finished Airing":"Not yet aired",
    image_url: a.images?.jpg?.large_image_url||a.images?.jpg?.image_url||null,
    large_image: a.images?.jpg?.large_image_url||null,
    genres: (a.genres||[]).map(g=>({name:g.name})),
    studios: (a.studios||[]).map(s=>({name:s.name})),
    broadcast: a.broadcast?.day?{day:a.broadcast.day.replace(/s$/i,"")}:null,
    trailer: a.trailer?.url?{url:a.trailer.url,youtube_id:a.trailer.youtube_id||null}:null,
    fetched_at: new Date().toISOString(),
  }));

  // Insert only (never update existing)
  let added=0, failed=0;
  for(let i=0; i<rows.length; i+=10) {
    const batch = rows.slice(i,i+10);
    const { error } = await supabase.from("anime_cache")
      .insert(batch, {onConflict:"mal_id", ignoreDuplicates:true});
    if(error) { log(`Insert error: ${error.message}`); failed+=batch.length; }
    else added+=batch.length;
    await sleep(100);
  }
  log(`Added ${added} new anime, ${failed} failed`);

  // Assign moods to new anime
  log("Assigning moods to new anime...");
  for(const row of rows.slice(0, added)) {
    // Try AI first, fallback to genre-based
    let moods = await moodFromAI({title:row.title, genres:row.genres, synopsis:row.synopsis});
    if(!moods) moods = moodFromGenres(row.genres);
    const { error } = await supabase.from("mood_pts_v4")
      .insert({mal_id:row.mal_id, ...moods}, {onConflict:"mal_id", ignoreDuplicates:true});
    if(!error) log(`  ✅ ${row.title}: moods assigned`);
    await sleep(400);
  }
  log("=== new-anime done ===");
}

// ── JOB: broadcast ────────────────────────────────────────────────────────────
async function jobBroadcast() {
  log("=== JOB: broadcast ===");
  const KNOWN = {21:"Sunday",235:"Saturday",966:"Friday",1560:"Sunday",50250:"Sunday"};

  const { data: missing } = await supabase.from("anime_cache")
    .select("mal_id,title").eq("type","TV").eq("status","Currently Airing").is("broadcast",null);
  log(`${missing?.length||0} anime without broadcast day`);

  let patched=0, notFound=0;
  for(const anime of (missing||[])) {
    let day = KNOWN[anime.mal_id]||null, src="hardcoded";
    if(!day) {
      try {
        const r = await fetch(`https://api.jikan.moe/v4/anime/${anime.mal_id}`,{headers:{"Accept":"application/json"}});
        if(r.ok) { const d=await r.json(); const b=d?.data?.broadcast?.day; if(b) { day=b.replace(/s$/i,""); src="jikan"; } }
      } catch {}
      await sleep(400);
    }
    if(!day) {
      try {
        const d = await anilistQuery(`query($id:Int){Media(idMal:$id,type:ANIME){nextAiringEpisode{airingAt}airingSchedule(notYetAired:false,perPage:3){nodes{airingAt}}}}`,{id:anime.mal_id});
        const m = d?.data?.Media;
        const ts = m?.nextAiringEpisode?.airingAt || m?.airingSchedule?.nodes?.slice(-1)[0]?.airingAt;
        if(ts) { day=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(ts*1000).getDay()]; src="anilist"; }
      } catch {}
      await sleep(300);
    }
    if(day) {
      await supabase.from("anime_cache").update({broadcast:{day}}).eq("mal_id",anime.mal_id);
      log(`  ✅ [${src}] ${anime.title} → ${day}`); patched++;
    } else { log(`  ⬜ ${anime.title}`); notFound++; }
  }
  log(`=== broadcast done: ${patched} patched, ${notFound} not found ===`);
}

// ── JOB: streaming ────────────────────────────────────────────────────────────
// Uses AniList externalLinks which includes streaming services with their URLs
// Regions: US (most coverage), FR (partial), JP (partial)
async function jobStreaming() {
  log("=== JOB: streaming ===");

  const STREAMING_SERVICES = {
    "Crunchyroll":     "crunchyroll",
    "Netflix":         "netflix",
    "Amazon Prime Video": "amazon",
    "Funimation":      "funimation",
    "HIDIVE":          "hidive",
    "Disney Plus":     "disney",
    "Disney+":         "disney",
    "Hulu":            "hulu",
    "ADN":             "adn",
    "Wakanim":         "wakanim",
    "VRV":             "vrv",
    "Apple TV":        "apple",
    "Max":             "max",
    "Anime Digital Network": "adn",
  };

  // FR-specific platforms
  const FR_PLATFORMS = new Set(["crunchyroll","netflix","adn","wakanim","amazon","disney","apple","max"]);
  // JP-specific
  const JP_PLATFORMS = new Set(["crunchyroll","netflix","amazon","disney","apple","max","hidive"]);

  // Get all anime from DB in batches
  let offset = 0, total = 0, updated = 0;
  while(true) {
    const { data: batch } = await supabase.from("anime_cache")
      .select("mal_id,title").not("mal_id","is",null)
      .order("score",{ascending:false}).range(offset, offset+99);
    if(!batch?.length) break;
    total += batch.length;

    for(const a of batch) {
      try {
        // Query AniList by MAL ID for streaming links
        const d = await anilistQuery(
          `query($id:Int){Media(idMal:$id,type:ANIME){externalLinks{site url type}}}`,
          {id:a.mal_id}
        );
        const links = d?.data?.Media?.externalLinks||[];
        const streaming = links.filter(l => l.type==="STREAMING" || STREAMING_SERVICES[l.site]);

        if(streaming.length) {
          const platforms = {};
          streaming.forEach(l => {
            const key = STREAMING_SERVICES[l.site];
            if(key) {
              platforms[key] = {
                name: l.site,
                url: l.url,
                fr: FR_PLATFORMS.has(key),
                us: true, // AniList links are generally US-available
                jp: JP_PLATFORMS.has(key),
              };
            }
          });
          if(Object.keys(platforms).length) {
            await supabase.from("anime_cache").update({streaming_platforms:platforms}).eq("mal_id",a.mal_id);
            updated++;
            if(updated%50===0) log(`  ${updated} updated so far...`);
          }
        }
        await sleep(700); // AniList rate limit
      } catch(e) { /* skip */ }
    }
    offset += 100;
    log(`Processed ${total} anime...`);
    if(batch.length < 100) break;
    await sleep(1000);
  }
  log(`=== streaming done: ${updated} updated ===`);
}

// ── JOB: trailers ─────────────────────────────────────────────────────────────
async function jobTrailers() {
  log("=== JOB: trailers ===");

  // Priority: upcoming anime (Not yet aired) first, then rest
  const { data: upcoming } = await supabase.from("anime_cache")
    .select("mal_id,title,trailer").eq("status","Not yet aired")
    .or("trailer.is.null,trailer.eq.{}");
  const { data: rest } = await supabase.from("anime_cache")
    .select("mal_id,title,trailer").neq("status","Not yet aired")
    .or("trailer.is.null,trailer.eq.{}").limit(500);

  const toFetch = [...(upcoming||[]), ...(rest||[])];
  log(`${(upcoming||[]).length} upcoming + ${(rest||[]).length} others = ${toFetch.length} without trailer`);

  let fetched=0, notFound=0;
  for(const a of toFetch) {
    try {
      const r = await fetch(`https://api.jikan.moe/v4/anime/${a.mal_id}`,{headers:{"Accept":"application/json"}});
      if(r.ok) {
        const d = await r.json();
        const t = d?.data?.trailer;
        if(t?.url || t?.youtube_id) {
          const trailer = {url:t.url||`https://www.youtube.com/watch?v=${t.youtube_id}`,youtube_id:t.youtube_id||null};
          await supabase.from("anime_cache").update({trailer}).eq("mal_id",a.mal_id);
          log(`  ✅ ${a.title}`);
          fetched++;
        } else notFound++;
      }
    } catch {}
    await sleep(450);
  }
  log(`=== trailers done: ${fetched} found, ${notFound} not found ===`);
}

// ── JOB: new-scores ───────────────────────────────────────────────────────────
// Only touches anime that recently changed from "Not yet aired" to "Currently Airing"
// Tracks first_fetch_at in a separate log table
async function jobNewScores() {
  log("=== JOB: new-scores ===");

  // Find anime that are Currently Airing but not yet in sync log
  const { data: airing } = await supabase.from("anime_cache")
    .select("mal_id,title,score,genres,synopsis")
    .eq("status","Currently Airing").eq("type","TV")
    .not("score","is",null);

  // Get already-logged anime
  const { data: logged } = await supabase.from("anime_sync_log").select("mal_id");
  const loggedIds = new Set((logged||[]).map(r=>r.mal_id));

  const toScore = (airing||[]).filter(a => !loggedIds.has(a.mal_id));
  log(`${toScore.length} newly airing anime to score`);

  for(const a of toScore) {
    // Fetch fresh score from Jikan
    try {
      const r = await fetch(`https://api.jikan.moe/v4/anime/${a.mal_id}`,{headers:{"Accept":"application/json"}});
      if(r.ok) {
        const d = await r.json();
        const score = d?.data?.score||null;
        const broadcastDay = d?.data?.broadcast?.day?.replace(/s$/i,"")||null;
        const updates = {};
        if(score) updates.score = score;
        if(broadcastDay && !a.broadcast?.day) updates.broadcast = {day:broadcastDay};
        if(Object.keys(updates).length) {
          await supabase.from("anime_cache").update(updates).eq("mal_id",a.mal_id);
        }
      }
      await sleep(450);
    } catch {}

    // Assign moods (only if not already in mood_pts_v4)
    const { data: existingMood } = await supabase.from("mood_pts_v4").select("mal_id").eq("mal_id",a.mal_id).limit(1);
    if(!existingMood?.length) {
      let moods = await moodFromAI(a);
      if(!moods) moods = moodFromGenres(a.genres);
      await supabase.from("mood_pts_v4").insert({mal_id:a.mal_id,...moods},{onConflict:"mal_id",ignoreDuplicates:true});
      await sleep(400);
    }

    // Log first fetch
    await supabase.from("anime_sync_log").insert({
      mal_id: a.mal_id,
      first_fetch_at: new Date().toISOString(),
      rescored_2w: false,
      rescored_2m: false,
    },{onConflict:"mal_id",ignoreDuplicates:true});
    log(`  ✅ ${a.title}`);
  }
  log("=== new-scores done ===");
}

// ── JOB: rescore-2w ────────────────────────────────────────────────────────────
async function jobRescore2w() {
  log("=== JOB: rescore-2w ===");
  const twoWeeksAgo = new Date(Date.now() - 14*24*60*60*1000).toISOString();
  const oneMonthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();

  const { data: toRescore } = await supabase.from("anime_sync_log")
    .select("mal_id")
    .eq("rescored_2w",false)
    .lt("first_fetch_at", twoWeeksAgo)
    .gt("first_fetch_at", oneMonthAgo);

  log(`${toRescore?.length||0} anime to rescore at 2w`);
  for(const row of (toRescore||[])) {
    await rescoreAnime(row.mal_id);
    await supabase.from("anime_sync_log").update({rescored_2w:true}).eq("mal_id",row.mal_id);
    await sleep(500);
  }
  log("=== rescore-2w done ===");
}

// ── JOB: rescore-2m ────────────────────────────────────────────────────────────
async function jobRescore2m() {
  log("=== JOB: rescore-2m ===");
  const twoMonthsAgo = new Date(Date.now() - 60*24*60*60*1000).toISOString();

  const { data: toRescore } = await supabase.from("anime_sync_log")
    .select("mal_id")
    .eq("rescored_2m",false)
    .lt("first_fetch_at", twoMonthsAgo);

  log(`${toRescore?.length||0} anime to rescore at 2m`);
  for(const row of (toRescore||[])) {
    await rescoreAnime(row.mal_id);
    await supabase.from("anime_sync_log").update({rescored_2m:true}).eq("mal_id",row.mal_id);
    await sleep(500);
  }
  log("=== rescore-2m done ===");
}

async function rescoreAnime(malId) {
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime/${malId}`,{headers:{"Accept":"application/json"}});
    if(!r.ok) return;
    const d = await r.json();
    const score = d?.data?.score||null;
    const status = d?.data?.status;
    const updates = {};
    if(score) updates.score = score;
    if(status) updates.status = status==="Currently Airing"?"Currently Airing":status==="Finished Airing"?"Finished Airing":status;
    if(Object.keys(updates).length) {
      await supabase.from("anime_cache").update(updates).eq("mal_id",malId);
      log(`  ✅ rescored mal_id=${malId}: score=${score}`);
    }
  } catch(e) { log(`  ❌ mal_id=${malId}: ${e.message}`); }
}

// ── SQL to run ONCE in Supabase before using rescore jobs ─────────────────────
// create table if not exists anime_sync_log (
//   mal_id bigint primary key,
//   first_fetch_at timestamptz not null default now(),
//   rescored_2w boolean not null default false,
//   rescored_2m boolean not null default false
// );
// alter table anime_cache add column if not exists streaming_platforms jsonb;
// alter table anime_cache add column if not exists trailer jsonb;

// ── MAIN ──────────────────────────────────────────────────────────────────────
const job = (process.argv.find(a=>a.startsWith("--job="))||"--job=help").split("=")[1];
log(`Job: ${job}`);

const { error: pingErr } = await supabase.from("anime_cache").select("mal_id").limit(1);
if(pingErr) { console.error("❌ Supabase connection failed:", pingErr.message); process.exit(1); }
log("✅ Supabase connected");

switch(job) {
  case "new-anime":    await jobNewAnime();    break;
  case "broadcast":    await jobBroadcast();   break;
  case "streaming":    await jobStreaming();    break;
  case "trailers":     await jobTrailers();    break;
  case "new-scores":   await jobNewScores();   break;
  case "rescore-2w":   await jobRescore2w();   break;
  case "rescore-2m":   await jobRescore2m();   break;
  default:
    console.log(`
Usage: node --env-file=.env animood_sync.mjs --job=<job>

Jobs:
  new-anime    Weekly  — add new anime from Jikan (INSERT only, never updates)
  broadcast    Weekly  — patch missing broadcast days (Jikan + AniList)
  streaming    Weekly  — fetch streaming platforms per anime (AniList)
  trailers     Monthly — fetch missing trailers (Jikan, upcoming first)
  new-scores   Weekly  — score/mood newly airing anime (tracked in sync log)
  rescore-2w   Weekly  — refresh score/status 2 weeks after first airing
  rescore-2m   Weekly  — refresh score/status 2 months after first airing
`);
}
log("=== Done ===");
