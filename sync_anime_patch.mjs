// ─── AniMood — Patch broadcast days for anime missing them ───────────────────
// Tries Jikan first (has the most accurate broadcast data from MAL),
// falls back to AniList if Jikan fails.
//
// Usage: node --env-file=.env sync_anime_patch.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL         = process.env.SUPABASE_URL         || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }

// Hardcoded for long-running series where APIs often have no next episode
const KNOWN_DAYS = {
  21:    "Sunday",   // One Piece
  235:   "Saturday", // Detective Conan
  966:   "Friday",   // Crayon Shin-chan
  1560:  "Sunday",   // Doraemon
  50250: "Sunday",   // Chiikawa
};

// ── Jikan: /anime/:id returns broadcast.day directly ─────────────────────────
async function fetchDayFromJikan(malId) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
      headers: { "Accept": "application/json" },
    });
    if(!res.ok) return null;
    const data = await res.json();
    const day = data?.data?.broadcast?.day; // e.g. "Wednesdays"
    if(!day) return null;
    // Jikan returns "Wednesdays" — strip the trailing 's'
    return day.replace(/s$/i, "");
  } catch {
    return null;
  }
}

// ── AniList fallback: query by MAL ID ────────────────────────────────────────
async function fetchDayFromAniList(malId) {
  const query = `
    query ($malId: Int) {
      Media(idMal: $malId, type: ANIME) {
        nextAiringEpisode { airingAt }
        airingSchedule(notYetAired: false, perPage: 3) {
          nodes { airingAt }
        }
      }
    }
  `;
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { malId } }),
    });
    const data = await res.json();
    const media = data?.data?.Media;
    if(!media) return null;

    const ts = media.nextAiringEpisode?.airingAt
      || media.airingSchedule?.nodes?.slice(-1)[0]?.airingAt;
    if(!ts) return null;

    const d = new Date(ts * 1000);
    return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log("=== Broadcast Day Patch ===");

  const { data: missing, error } = await supabase
    .from("anime_cache")
    .select("mal_id, title")
    .eq("type", "TV")
    .eq("status", "Currently Airing")
    .is("broadcast", null);

  if(error) { console.error("DB error:", error.message); process.exit(1); }
  log(`${missing.length} anime without broadcast day`);

  let patched = 0, notFound = 0;

  for(const anime of missing) {
    let day = KNOWN_DAYS[anime.mal_id] || null;
    let source = "hardcoded";

    if(!day) {
      day = await fetchDayFromJikan(anime.mal_id);
      source = "jikan";
      await sleep(400); // Jikan rate limit: ~3 req/s
    }

    if(!day) {
      day = await fetchDayFromAniList(anime.mal_id);
      source = "anilist";
      await sleep(300);
    }

    if(day) {
      const { error: upErr } = await supabase
        .from("anime_cache")
        .update({ broadcast: { day } })
        .eq("mal_id", anime.mal_id);

      if(upErr) {
        log(`  ❌ ${anime.title}: ${upErr.message}`);
      } else {
        log(`  ✅ [${source}] ${anime.title} → ${day}`);
        patched++;
      }
    } else {
      log(`  ⬜ ${anime.title} → introuvable`);
      notFound++;
    }
  }

  log(`=== Done: ${patched} patched, ${notFound} introuvables ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
