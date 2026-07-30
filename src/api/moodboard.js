// ─── MOODBOARD RECOMMENDATION ENGINE ─────────────────────────────────────────
import { sb } from "./supabase.js";
import { jikan, supabaseRowToAnime } from "./jikan.js";
import { getPtsForAnime, ptsToPct } from "./moods.js";

const BATCH_SIZE   = 100;
const MAX_ATTEMPTS = 5;   // 5 × 100 = 500 anime ceiling per call
const SCORE_POOL   = 60;

const WEIGHTS = [
  { mal: 3,   mood: 2   }, // 1er affichage
  { mal: 2,   mood: 2.5 }, // 1er reroll
  { mal: 1,   mood: 3   }, // 2e+ reroll
];

// ─── FRANCHISE DEDUP ──────────────────────────────────────────────────────────
// Strips season markers to find the franchise root title.
// "Shingeki no Kyojin Season 3 Part 2" → "shingeki no kyojin"
// "Gintama°" → "gintama"
// "JoJo no Kimyou na Bouken: Diamond wa Kudakenai" → "jojo no kimyou na bouken"
// We keep one representative per franchise (best scored), UNLESS the series is
// clearly anthology-style (different subtitles separated by ":") where each arc
// is largely independent — we allow those through.
const SEASON_PATTERNS = [
  /\s+(season|part|cour|hen|haku|sou|kai|final|movie|film|gekijouban|ova|oad|special|sp)\b.*/i,
  /\s+\d+(st|nd|rd|th)\s*(season|cour|part)?/i,
  /\s+(第\d+期|第\d+シーズン)/,
  /[：:]\s*.+$/,          // subtitle after colon — strip for dedup
  /\s+[IVX]+$/,           // roman numerals at end
  /\s+\d+$/,              // trailing number
  /[°'"！!★☆♪♫♬♩✿◆◇▲△▼▽■□●○\-–—~～.。]+\s*$/,  // trailing symbols incl dots
];

// Titles where each entry is largely independent — don't dedup within franchise
const ANTHOLOGY_ROOTS = new Set([
  "jojo no kimyou na bouken",
  "monogatari",
  "fate",
  "dragon ball",
  "precure",
  "gundam",
  "fullmetal alchemist", // FMA vs FMA Brotherhood are different adaptations
]);

function franchiseRoot(title) {
  let t = (title || "").toLowerCase().trim();
  // Strip common Japanese sequel prefixes
  t = t.replace(/^(zoku|shin |new |gekijouban |the |dai \d+ ki |dai \d+ki )/i, "");
  for(const pat of SEASON_PATTERNS) t = t.replace(pat, "");
  // Remove trailing punctuation/symbols
  t = t.replace(/[°.。!！?？～~\-–—]+$/, "").trim();
  return t.slice(0, 24);
}

// Returns true if two titles are the same franchise that should be deduped
function isSameFranchise(a, b) {
  const ra = franchiseRoot(a), rb = franchiseRoot(b);
  if(!ra || !rb) return false;
  if(ra === rb) {
    // If it's an anthology franchise, allow different subtitles through
    if(ANTHOLOGY_ROOTS.has(ra)) return false;
    return true;
  }
  // One starts with the other (e.g. "one piece" vs "one piece film")
  // but only if the longer one is clearly a continuation (not a different show)
  const shorter = ra.length < rb.length ? ra : rb;
  const longer  = ra.length < rb.length ? rb : ra;
  if(longer.startsWith(shorter) && longer.length - shorter.length <= 8) return true;
  return false;
}

function dedupeByFranchise(list) {
  const kept = [];
  for(const a of list) {
    const conflict = kept.find(k => isSameFranchise(k.title, a.title));
    if(!conflict) { kept.push(a); }
    else if((a.score||0) > (conflict.score||0)) {
      // Replace with better-scored entry of same franchise
      kept.splice(kept.indexOf(conflict), 1, a);
    }
    // else skip — existing entry is better
  }
  return kept;
}

function filterByDuration(list, duration) {
  if(duration === "all") return list;
  const filtered = list.filter(a => {
    const eps = a.episodes || 0;
    if(duration === "short")  return eps > 0 && eps <= 13;
    if(duration === "medium") return eps > 13 && eps <= 50;
    if(duration === "long")   return eps > 50;
    return true;
  });
  return filtered.length >= 3 ? filtered : list;
}

/**
 * cursor: { offset, pool, shownIds } — carried across a session.
 * Pass null for a fresh search. rerollCount drives MAL/mood weights.
 * Returns { results, cursor }.
 */
export async function fetchMoodboardCandidates(
  selectedMoods, duration, mediaTypes, countries, me, cursor, rerollCount = 0
) {
  const countryFilter = countries.includes("all") ? null : countries;
  const countryParam  = countryFilter
    ? (countryFilter.includes("JP") ? "&country=eq.JP" : "&country=eq.other")
    : "";

  // Media type filter
  const typeFilter = (!mediaTypes || mediaTypes.includes("all")) ? "" :
    mediaTypes.length === 1 ? `&type=eq.${mediaTypes[0]}` :
    `&type=in.(${mediaTypes.join(",")})`;

  const baseUrl = "anime_cache?select=mal_id,title,title_en,synopsis,score,rank,year,episodes,type,source,image_url,large_image,genres,studios,producers";

  const EXCLUDED_STATUSES = new Set(["completed","watching","dropped"]);
  const excluded = new Set(me.watched);
  Object.entries(me.statuses||{}).forEach(([id,status]) => {
    if(EXCLUDED_STATUSES.has(status)) excluded.add(parseInt(id));
  });

  // Restore state from cursor — keys are strings in JSON, convert back to int
  let offset   = cursor?.offset ?? 0;
  const poolObj = cursor?.pool || {};
  const pool    = new Map(Object.entries(poolObj).map(([k,v]) => [parseInt(k), v]));
  let shownSet  = new Set((cursor?.shownIds || []).map(Number));

  const buildUsable = (respectShown) => {
    let list = [...pool.values()].filter(a => {
      if(excluded.has(a.mal_id)) return false;
      if(["Special","Music","CM","PV"].includes(a.type)) return false;
      if(respectShown && shownSet.has(a.mal_id)) return false;
      // Also exclude if any franchise member is already shown
      if(respectShown) {
        const franchiseShown = [...shownSet].some(shownId => {
          const shownAnime = pool.get(shownId);
          return shownAnime && isSameFranchise(shownAnime.title, a.title);
        });
        if(franchiseShown) return false;
      }
      return true;
    });
    list = dedupeByFranchise(list);
    list = filterByDuration(list, duration);
    return list;
  };

  // Always fetch at least one new batch so rerolls introduce fresh anime
  let usable   = [];
  let attempts = 0;
  do {
    try {
      const rows = await sb.query(
        `${baseUrl}${countryParam}${typeFilter}&order=score.desc.nullslast&limit=${BATCH_SIZE}&offset=${offset}`
      );
      if(rows?.length) rows.forEach(row => {
        if(!pool.has(row.mal_id)) pool.set(row.mal_id, supabaseRowToAnime(row));
      });
    } catch(e) {
      console.error("Supabase failed, fallback Jikan:", e);
      const jikanPage = Math.floor(offset / 25) + 1;
      for(let p = jikanPage; p < jikanPage + 4; p++) {
        try {
          const data = await jikan.searchAnime({order_by:"score",sort:"desc",limit:25,min_score:6.5,sfw:false,page:p});
          (data.data||[]).forEach(a => { if(!pool.has(a.mal_id)) pool.set(a.mal_id, a); });
        } catch {}
      }
    }
    offset += BATCH_SIZE;
    attempts++;
    usable = buildUsable(true);
  } while(usable.length < 3 && attempts < MAX_ATTEMPTS);

  // Last resort — ignore shownIds exclusion
  if(usable.length < 3) {
    shownSet = new Set();
    usable = buildUsable(false);
  }

  // Score top SCORE_POOL candidates by MAL score then pick best mood match
  const toScore = [...usable].sort((a,b) => (b.score||0)-(a.score||0)).slice(0, SCORE_POOL);
  const withPts = [];
  for(let i = 0; i < toScore.length; i += 3) {
    const batch = toScore.slice(i, i+3);
    const res = await Promise.all(batch.map(async a => ({...a, _pts: await getPtsForAnime(a)})));
    withPts.push(...res);
  }

  const { mal: malWeight, mood: moodWeight } = WEIGHTS[Math.min(rerollCount, WEIGHTS.length - 1)];
  const scored = withPts
    .map(a => {
      const pct       = ptsToPct(a._pts||{});
      const moodScore = selectedMoods.reduce((acc,m) => acc + (pct[m]||0), 0);
      const rankBonus = a.rank && a.rank <= 500 ? 5 : a.rank && a.rank <= 1000 ? 2 : 0;
      return { ...a, _score: (a.score||7)*malWeight + moodScore*moodWeight + rankBonus };
    })
    .sort((a,b) => b._score - a._score)
    .slice(0, 3);

  const results = scored.map(a => {
    const franchise = [...pool.values()]
      .filter(x => isSameFranchise(x.title, a.title) && !excluded.has(x.mal_id))
      .sort((x,y) => (x.year||9999) - (y.year||9999));
    const first = franchise[0];
    if(!first || first.mal_id === a.mal_id) return a;
    return { ...first, _pts: a._pts, _score: a._score };
  });

  // Build shownIds — mark entire franchises as shown
  const newShownIds = new Set([...shownSet]);
  const markShown = (batch) => batch.forEach(a => {
    newShownIds.add(a.mal_id);
    [...pool.values()].filter(x => isSameFranchise(x.title, a.title)).forEach(x => newShownIds.add(x.mal_id));
  });

  // When format = "all": always at least 2 TV, max 1 non-TV (Film/OAV/ONA/Special)
  const isAll = !mediaTypes || mediaTypes.includes("all");
  if(isAll && results.length >= 2) {
    let nonTvCount = 0;
    const filtered = [];

    // Sort: TV first
    const sorted = [...results].sort((a,b) => {
      const isTV = t => (t||"TV") === "TV";
      return (isTV(b.type)?1:0) - (isTV(a.type)?1:0);
    });

    for(const a of sorted) {
      if((a.type||"TV") === "TV") { filtered.push(a); }
      else if(nonTvCount < 1) { filtered.push(a); nonTvCount++; }
    }

    // Fill with extra TV if still not 3
    if(filtered.length < 3) {
      const inBatch = new Set(filtered.map(a => a.mal_id));
      const extras = withPts
        .filter(a => !inBatch.has(a.mal_id) && !shownSet.has(a.mal_id) && (a.type||"TV") === "TV")
        .sort((a,b) => b._score - a._score);
      for(const e of extras) {
        if(filtered.length >= 3) break;
        filtered.push(e);
      }
    }

    const finalResults = filtered.slice(0,3);
    markShown(finalResults);
    return {
      results: finalResults,
      cursor: { offset, pool: Object.fromEntries(pool), shownIds: [...newShownIds] },
    };
  }

  markShown(results.slice(0,3));
  return {
    results: results.slice(0,3),
    cursor: { offset, pool: Object.fromEntries(pool), shownIds: [...newShownIds] },
  };
}

