// ─── MOODBOARD RECOMMENDATION ENGINE ─────────────────────────────────────────
import { sb } from "./supabase.js";
import { jikan, supabaseRowToAnime } from "./jikan.js";
import { getPtsForAnime, ptsToPct } from "./moods.js";

const BATCH_SIZE   = 100;
const MAX_ATTEMPTS = 5;
const SCORE_POOL   = 60;

const WEIGHTS = [
  { mal: 3, mood: 2   },
  { mal: 2, mood: 2.5 },
  { mal: 1, mood: 3   },
];

const SEASON_PATTERNS = [
  /\s+(season|part|cour|hen|haku|sou|kai|final|movie|film|gekijouban|ova|oad|special|sp)\b.*/i,
  /\s+\d+(st|nd|rd|th)\s*(season|cour|part)?/i,
  /\s+(第\d+期|第\d+シーズン)/,
  /[：:]\s*.+$/,
  /\s+[IVX]+$/,
  /\s+\d+$/,
  /[°'"！!★☆♪♫♬♩✿◆◇▲△▼▽■□●○\-–—~～.。]+\s*$/,
];

const ANTHOLOGY_ROOTS = new Set([
  "jojo no kimyou na bouken",
  "monogatari",
  "fate",
  "dragon ball",
  "precure",
  "gundam",
  "fullmetal alchemist",
]);

function franchiseRoot(title) {
  let t = (title || "").toLowerCase().trim();
  t = t.replace(/^(zoku|shin |new |gekijouban |the |dai \d+ ki |dai \d+ki )/i, "");
  for(const pat of SEASON_PATTERNS) t = t.replace(pat, "");
  t = t.replace(/[°.。!！?？～~\-–—]+$/, "").trim();
  return t.slice(0, 24);
}

function isSameFranchise(a, b) {
  const ra = franchiseRoot(a), rb = franchiseRoot(b);
  if(!ra || !rb) return false;
  if(ra === rb) {
    if(ANTHOLOGY_ROOTS.has(ra)) return false;
    return true;
  }
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
      kept.splice(kept.indexOf(conflict), 1, a);
    }
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

export async function fetchMoodboardCandidates(selectedMoods, duration, mediaTypes, countries, me, cursor, rerollCount = 0) {
  const countryFilter = countries.includes("all") ? null : countries;
  const countryParam  = countryFilter ? (countryFilter.includes("JP") ? `&country=eq.JP` : `&country=eq.other`) : "";
  const baseUrl = `anime_cache?select=mal_id,title,title_en,synopsis,score,rank,year,episodes,type,source,image_url,large_image,genres,studios,producers`;

  // Type filter
  const typeFilter = (!mediaTypes || mediaTypes.includes("all")) ? "" :
    mediaTypes.length === 1 ? `&type=eq.${mediaTypes[0]}` :
    `&type=in.(${mediaTypes.join(",")})`;

  const EXCLUDED_STATUSES = new Set(["completed","watching","dropped"]);
  const excluded = new Set(me.watched);
  Object.entries(me.statuses||{}).forEach(([id,status]) => {
    if(EXCLUDED_STATUSES.has(status)) excluded.add(parseInt(id));
  });

  let offset   = cursor?.offset ?? 0;
  // ── FIX: properly rebuild Map from JSON object (keys are strings) ──
  const poolObj = cursor?.pool || {};
  const pool    = new Map(Object.entries(poolObj).map(([k,v]) => [parseInt(k), v]));
  let shownSet  = new Set((cursor?.shownIds || []).map(Number));
  // Track non-TV shown globally across all 3 rerolls — max 1 Film, max 1 OAV total
  let shownMovies = cursor?.shownMovies ?? 0;
  let shownOVA    = cursor?.shownOVA    ?? 0;

  const buildUsable = (respectShown) => {
    let list = [...pool.values()].filter(a => {
      if(excluded.has(a.mal_id)) return false;
      if(["Special","Music","CM","PV"].includes(a.type)) return false;
      if(respectShown && shownSet.has(a.mal_id)) return false;
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

  let usable   = [];
  let attempts = 0;
  do {
    try {
      const rows = await sb.query(`${baseUrl}${countryParam}${typeFilter}&order=score.desc.nullslast&limit=${BATCH_SIZE}&offset=${offset}`);
      if(rows?.length) rows.forEach(row => { if(!pool.has(row.mal_id)) pool.set(row.mal_id, supabaseRowToAnime(row)); });
    } catch(e) {
      console.error("Supabase failed, fallback Jikan:", e);
      const jikanPage = Math.floor(offset/25) + 1;
      for(let p = jikanPage; p < jikanPage+4; p++) {
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

  if(usable.length < 3) {
    shownSet = new Set();
    usable = buildUsable(false);
  }

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

  // Redirect to first unwatched season
  const results = scored.map(a => {
    const franchise = [...pool.values()]
      .filter(x => isSameFranchise(x.title, a.title) && !excluded.has(x.mal_id))
      .sort((x,y) => (x.year||9999) - (y.year||9999));
    const first = franchise[0];
    if(!first || first.mal_id === a.mal_id) return a;
    return { ...first, _pts: a._pts, _score: a._score };
  });

  // Mark entire franchises as shown
  const newShownIds = new Set([...shownSet]);
  const markShown = (batch) => batch.forEach(a => {
    newShownIds.add(a.mal_id);
    [...pool.values()].filter(x => isSameFranchise(x.title, a.title)).forEach(x => newShownIds.add(x.mal_id));
  });

  // When format = "all": max 1 Film + 1 OAV total across all 9 results (3 rerolls)
  const isAll = !mediaTypes || mediaTypes.includes("all");
  if(isAll && results.length >= 2) {
    const filtered = [];
    const sorted = [...results].sort((a,b) => ((b.type||"TV")==="TV"?1:0) - ((a.type||"TV")==="TV"?1:0));
    for(const a of sorted) {
      const t = a.type || "TV";
      if(t === "TV") {
        filtered.push(a);
      } else if(t === "Movie" && shownMovies < 1) {
        filtered.push(a); shownMovies++;
      } else if(["OVA","OAD","Special"].includes(t) && shownOVA < 1) {
        filtered.push(a); shownOVA++;
      }
      // else skip — already showed a movie or OVA this session
    }
    // Fill to 3 with TV if needed
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
      cursor: { offset, pool: Object.fromEntries(pool), shownIds: [...newShownIds], shownMovies, shownOVA },
    };
  }

  markShown(results.slice(0,3));
  return {
    results: results.slice(0,3),
    cursor: { offset, pool: Object.fromEntries(pool), shownIds: [...newShownIds], shownMovies, shownOVA },
  };
}
