// ─── AniMood — Sync Script ────────────────────────────────────────────────────
// node sync_anime.mjs

import { createClient } from "@supabase/supabase-js";

const CONFIG = {
  SUPABASE_URL:         "https://pjkvhhxwjzpmxmhdhwcp.supabase.co",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "",
  OPENROUTER_KEY:       process.env.OPENROUTER_KEY || "",
  OPENROUTER_MODEL:     "google/gemini-flash-1.5",
  MOOD_BATCH_SIZE:      40,
  SKIP_EXISTING_MOODS:  true,
};

const MOOD_IDS = ["feel-good","dark","epic","romantic","chill","hype","emotional","funny"];

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (msg, ...a) => console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`, ...a);

async function fetchAniListSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const m = now.getMonth() + 1;
  const season = m<=3?"WINTER":m<=6?"SPRING":m<=9?"SUMMER":"FALL";
  log(`Fetching AniList: ${season} ${year}`);
  const query = `query ($season: MediaSeason, $year: Int, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      media(season: $season, seasonYear: $year, type: ANIME, format_in: [TV], sort: [POPULARITY_DESC]) {
        idMal title { romaji english } description(asHtml: false)
        averageScore popularity status startDate { year month day }
        episodes genres coverImage { large }
        studios(isMain: true) { nodes { name } }
        nextAiringEpisode { airingAt }
      }
    }
  }`;
  const anime = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch("https://graphql.anilist.co", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ query, variables: { season, year, page } }),
    });
    const data = await res.json();
    const p = data?.data?.Page;
    if (!p) break;
    anime.push(...(p.media||[]).filter(a=>a.idMal));
    if (!p.pageInfo?.hasNextPage) break;
    await sleep(600);
  }
  log(`Season: ${anime.length} anime`);
  return anime;
}

async function fetchAniListAiring() {
  log("Fetching AniList airing (ongoing)...");
  const query = `query ($page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      media(type: ANIME, format: TV, status: RELEASING, sort: [POPULARITY_DESC]) {
        idMal title { romaji english } description(asHtml: false)
        averageScore popularity status startDate { year }
        episodes genres coverImage { large }
        studios(isMain: true) { nodes { name } }
        nextAiringEpisode { airingAt }
      }
    }
  }`;
  const anime = [];
  for (let page = 1; page <= 4; page++) {
    const res = await fetch("https://graphql.anilist.co", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ query, variables: { page } }),
    });
    const data = await res.json();
    const p = data?.data?.Page;
    if (!p) break;
    anime.push(...(p.media||[]).filter(a=>a.idMal));
    if (!p.pageInfo?.hasNextPage) break;
    await sleep(600);
  }
  log(`Airing: ${anime.length} anime`);
  return anime;
}

function toRow(a) {
  const status = a.status==="RELEASING"?"Currently Airing"
               : a.status==="FINISHED"?"Finished Airing"
               : a.status==="NOT_YET_RELEASED"?"Not yet aired":"Unknown";
  let broadcastDay = null;
  if (a.nextAiringEpisode?.airingAt) {
    broadcastDay = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][
      new Date(a.nextAiringEpisode.airingAt * 1000).getDay()
    ];
  }
  return {
    mal_id:      a.idMal,
    title:       a.title?.romaji || "",
    title_en:    a.title?.english || "",
    synopsis:    (a.description||"").replace(/<[^>]*>/g,"").trim().slice(0,2000),
    score:       a.averageScore ? parseFloat((a.averageScore/10).toFixed(2)) : null,
    scored_by:   a.popularity || null,
    year:        a.startDate?.year || null,
    episodes:    a.episodes || null,
    type:        "TV",
    status,
    image_url:   a.coverImage?.large || null,
    large_image: a.coverImage?.large || null,
    genres:      (a.genres||[]).map(g=>({name:g})),
    studios:     (a.studios?.nodes||[]).map(s=>({name:s.name})),
    broadcast:   broadcastDay ? { day: broadcastDay } : null,
    fetched_at:  new Date().toISOString(),
  };
}

async function upsertAnime(rows) {
  log(`Upserting ${rows.length} rows...`);
  let ok=0, fail=0;
  for (let i=0; i<rows.length; i+=20) {
    const batch = rows.slice(i, i+20);
    const { error } = await supabase.from("anime_cache")
      .upsert(batch, { onConflict:"mal_id" });
    if (error) { console.error("  ERR:", error.message); fail+=batch.length; }
    else ok+=batch.length;
    await sleep(100);
  }
  log(`Upsert: ${ok} ok, ${fail} failed`);
}

async function assignMoods(animeRows) {
  if (!CONFIG.OPENROUTER_KEY) { log("No OpenRouter key — skip moods"); return; }
  log(`Assigning moods to ${animeRows.length} anime...`);
  let ok=0, fail=0;
  for (const a of animeRows) {
    try {
      const prompt = `Classify this anime into 1-3 moods from: feel-good, dark, epic, romantic, chill, hype, emotional, funny.

Moods:
- feel-good: heartwarming, fun, uplifting
- dark: grim, psychological, horror, mature
- epic: battles, grand scale, power progression
- romantic: love story, relationship focus
- chill: slice-of-life, relaxing, cozy
- hype: fast-paced, action, adrenaline
- emotional: touching, sad, bittersweet
- funny: comedy, gags

Anime: "${a.title}"
Genres: ${(a.genres||[]).map(g=>g.name||g).join(", ")}
Synopsis: ${(a.synopsis||"").slice(0,250)}

Reply with ONLY a JSON array. Example: ["epic","hype"]`;

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${CONFIG.OPENROUTER_KEY}`,
          "HTTP-Referer":"https://animood.app",
          "X-Title":"AniMood",
        },
        body: JSON.stringify({
          model: CONFIG.OPENROUTER_MODEL,
          messages:[{role:"user",content:prompt}],
          temperature:0.1,
          max_tokens:30,
        }),
      });

      const data = await res.json();
      if (data.error) { log(`  ⚠️  API error: ${data.error.message}`); fail++; continue; }
      const text = data?.choices?.[0]?.message?.content?.trim()||"";
      const match = text.match(/\[.*?\]/s);
      if (!match) { log(`  ⚠️  ${a.title}: bad response: ${text.slice(0,50)}`); fail++; continue; }
      const moods = JSON.parse(match[0]).filter(m=>MOOD_IDS.includes(m)).slice(0,3);
      if (!moods.length) { fail++; continue; }

      const patch = {};
      moods.forEach(m => { patch[m] = 5; });
      const { error } = await supabase.from("mood_pts_v2")
        .upsert({ mal_id:a.mal_id, ...patch }, { onConflict:"mal_id" });

      if (error) { log(`  ❌ ${a.title}: ${error.message}`); fail++; }
      else { log(`  ✅ ${a.title}: [${moods.join(", ")}]`); ok++; }
      await sleep(400);
    } catch(e) { log(`  ❌ ${a.title}: ${e.message}`); fail++; }
  }
  log(`Moods: ${ok} ok, ${fail} failed`);
}

async function main() {
  log("=== AniMood Sync ===");

  // Test connection
  const { error: pingErr } = await supabase.from("anime_cache").select("mal_id").limit(1);
  if (pingErr) { console.error("❌ Supabase error:", pingErr.message); process.exit(1); }
  log("✅ Supabase connected");

  const [seasonAnime, airingAnime] = await Promise.all([
    fetchAniListSeason(),
    fetchAniListAiring(),
  ]);

  // Deduplicate
  const map = new Map();
  [...seasonAnime, ...airingAnime].forEach(a => {
    if (a.idMal && !map.has(a.idMal)) map.set(a.idMal, a);
  });
  log(`Total unique: ${map.size}`);

  const rows = [...map.values()].map(toRow);
  await upsertAnime(rows);

  // Find which ones need moods
  const allIds = rows.map(r=>r.mal_id).filter(Boolean);
  let toAssign = [];
  if (CONFIG.SKIP_EXISTING_MOODS) {
    const { data: existing } = await supabase.from("mood_pts_v2").select("mal_id").in("mal_id", allIds);
    const existingSet = new Set((existing||[]).map(r=>r.mal_id));
    const missing = allIds.filter(id=>!existingSet.has(id)).slice(0, CONFIG.MOOD_BATCH_SIZE);
    log(`${missing.length} need moods (${existingSet.size} already assigned)`);
    if (missing.length) {
      const { data } = await supabase.from("anime_cache")
        .select("mal_id,title,synopsis,genres").in("mal_id", missing);
      toAssign = data||[];
    }
  }

  await assignMoods(toAssign);

  log("=== Done ===");
  log(`Synced: ${rows.length} | Moods assigned: ${toAssign.length}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
