// ─── MOODBOARD RECOMMENDATION ENGINE ─────────────────────────────────────────
import { sb } from "./supabase.js";
import { jikan, supabaseRowToAnime } from "./jikan.js";
import { getPtsForAnime, ptsToPct } from "./moods.js";

const BATCH_SIZE   = 100;
const MAX_ATTEMPTS = 5;   // 5 × 100 = 500 anime ceiling per call
const SCORE_POOL   = 60;  // cap on how many candidates get real mood-pts lookups

// Weight shifts from MAL-score-heavy to mood-heavy the more you reroll — first
// pass leans on popularity/quality, later passes trust the mood match more.
const WEIGHTS = [
  { mal: 3, mood: 2   }, // 1er affichage
  { mal: 2, mood: 2.5 }, // 1er reroll
  { mal: 1, mood: 3   }, // 2e+ reroll
];

function dedupeByFranchise(list) {
  const seenTitles = new Map();
  return list.filter(a => {
    const root = (a.title||"").split(/[:\-–]/)[0].trim().toLowerCase().slice(0,20);
    if(seenTitles.has(root)) { if((a.score||0) > (seenTitles.get(root).score||0)) seenTitles.set(root, a); return false; }
    seenTitles.set(root, a); return true;
  });
}

function filterByDuration(list, duration) {
  if(duration === "all") return list;
  const byDuration = list.filter(a => {
    const eps = a.episodes || 0;
    if(duration === "short")  return eps > 0 && eps <= 13;
    if(duration === "medium") return eps > 13 && eps <= 50;
    if(duration === "long")   return eps > 50;
    return true;
  });
  return byDuration.length >= 3 ? byDuration : list;
}

/**
 * cursor: { offset, pool, shownIds } carried across a moodboard session — pass
 * null to start a fresh search. rerollCount: 0 for the first display, 1 for the
 * first reroll, 2+ for later ones (drives the MAL/mood weight schedule).
 * Returns { results, cursor } — feed the returned cursor into the next call.
 */
export async function fetchMoodboardCandidates(selectedMoods, duration, mediaTypes, countries, me, cursor, rerollCount = 0) {
  const countryFilter = countries.includes("all") ? null : countries;
  const countryParam = countryFilter ? (countryFilter.includes("JP") ? `&country=eq.JP` : `&country=eq.other`) : "";
  const baseUrl = `anime_cache?select=mal_id,title,title_en,synopsis,score,rank,year,episodes,type,source,image_url,large_image,genres,studios,producers`;

  const EXCLUDED_STATUSES = new Set(["completed","watching","dropped"]);
  const excluded = new Set(me.watched);
  Object.entries(me.statuses||{}).forEach(([id,status]) => {
    if(EXCLUDED_STATUSES.has(status)) excluded.add(parseInt(id));
  });

  let offset      = cursor?.offset ?? 0;
  const pool      = new Map(cursor?.pool);         // every anime fetched so far this session
  let shownSet    = new Set(cursor?.shownIds);      // already-served anime — excluded first pass

  const buildUsable = (respectShown) => {
    let list = [...pool.values()].filter(a => {
      if(excluded.has(a.mal_id)) return false;
      if(respectShown && shownSet.has(a.mal_id)) return false;
      if(["Special","Music","CM","PV"].includes(a.type)) return false;
      return true;
    });
    list = dedupeByFranchise(list);
    list = filterByDuration(list, duration);
    return list;
  };

  // Always pull at least one fresh batch — a reroll must introduce genuinely new
  // anime, not just re-shuffle whatever was already sitting in the pool.
  let usable = [];
  let attempts = 0;
  do {
    try {
      const rows = await sb.query(`${baseUrl}${countryParam}&order=score.desc.nullslast&limit=${BATCH_SIZE}&offset=${offset}`);
      if(rows?.length) rows.forEach(row => { if(!pool.has(row.mal_id)) pool.set(row.mal_id, supabaseRowToAnime(row)); });
    } catch(e) {
      console.error("Supabase failed, fallback Jikan:", e);
      const jikanPage = Math.floor(offset/25) + 1;
      for(let p = jikanPage; p < jikanPage+4; p++) {
        try {
          const data = await jikan.searchAnime({order_by:"score",sort:"desc",limit:25,min_score:6.5,sfw:false,page:p});
          (data.data||[]).forEach(a => { if(!pool.has(a.mal_id)) pool.set(a.mal_id, a); });
        } catch { /* Jikan page failed — continue with what we have */ }
      }
    }
    offset += BATCH_SIZE;
    attempts++;
    usable = buildUsable(true);
  } while(usable.length < 3 && attempts < MAX_ATTEMPTS);

  // Extreme shortage even after 500 anime — release the "already shown" exclusion
  // and take the best available rather than return nothing.
  if(usable.length < 3) {
    shownSet = new Set();
    usable = buildUsable(false);
  }

  // Score only the strongest MAL-ranked slice of the usable pool — computing mood
  // pts for everything fetched would be needlessly slow.
  const toScore = [...usable].sort((a,b) => (b.score||0)-(a.score||0)).slice(0, SCORE_POOL);
  const withPts = [];
  for(let i = 0; i < toScore.length; i += 3) {
    const batch = toScore.slice(i, i+3);
    const res = await Promise.all(batch.map(async a => ({...a, _pts: await getPtsForAnime(a)})));
    withPts.push(...res);
  }

  const { mal: malWeight, mood: moodWeight } = WEIGHTS[Math.min(rerollCount, WEIGHTS.length-1)];
  const results = withPts.map(a => {
    const pct = ptsToPct(a._pts||{});
    const moodScore = selectedMoods.reduce((acc,m) => acc+(pct[m]||0), 0);
    return { ...a, _score: (a.score||7)*malWeight + moodScore*moodWeight };
  }).sort((a,b) => b._score - a._score).slice(0, 3);

  return {
    results,
    cursor: { offset, pool, shownIds: [...shownSet, ...results.map(a => a.mal_id)] },
  };
}
