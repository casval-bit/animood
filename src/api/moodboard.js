// ─── MOODBOARD RECOMMENDATION ENGINE ─────────────────────────────────────────
// 1. On ratisse la base par note décroissante (large : plusieurs centaines de titres, on descend jusqu'à 5,5/10).
// 2. Chaque candidat est rattaché à son ŒUVRE (toutes ses saisons) : une seule saison par œuvre, jamais une saison
//    dont la précédente n'a pas été vue (on propose alors la première saison non vue), films/OAV seulement si la série est vue.
// 3. Filtre de durée sur le TOTAL de l'œuvre (toutes saisons) : Court < 15 ép., Moyen 15–50, Long > 50.
// 4. Score = qualité (note) + adéquation aux moods choisis + bonus coups de cœur des amis (note moyenne ≥ 8).
import { sb } from "./supabase.js";
import { jikan, supabaseRowToAnime } from "./jikan.js";
import { getPtsBatch, ptsToPct } from "./moods.js";
import { isAdultAnime } from "../utils/adultContent.js";
import { sameFranchise, franchiseBucketKeys, franchiseIlike, mainChain, releaseKey, isTvShort } from "../utils/franchise.js";

const BATCH_SIZE     = 100;  // lignes par requête
const PARALLEL       = 3;    // requêtes en parallèle par tour (300 titres de plus à chaque tour)
const HARD_MAX_BATCH = 15;   // plafond : 1 500 titres analysés au maximum
const NEED_VALID     = 16;   // on s'arrête quand on a au moins autant d'œuvres valides (9 à afficher + marge)
const RESOLVE_STEP   = 120;  // candidats rattachés à leur œuvre à chaque tour
const MIN_SCORE      = 5.5;  // plancher de note (on descend bas, mais pas jusqu'aux navets)

// ── Formule de score (modifiable ici) ────────────────────────────────────────────────────────────────────
// total = q·qualité + m·adéquation_mood + bonus_rang + bonus_amis
//  qualité (0‥1)        = (note − 5,5) / 3,5
//  adéquation (0‥1)     = (0,65·moyenne + 0,35·minimum) des % de mood choisis / 40 %  → il faut coller à TOUS les moods choisis
//  bonus_amis           = 0,28 + 0,06·(nb d'amis−1, max 3) + 0,08·(moyenne−8)/2, atténué si le titre colle mal à la requête
// Le 1er tirage privilégie la qualité, les « autres suggestions » privilégient de plus en plus le mood (et un peu de hasard).
const WEIGHTS = [
  { q: 0.45, m: 0.55, jitter: 0    },
  { q: 0.35, m: 0.65, jitter: 0.04 },
  { q: 0.25, m: 0.75, jitter: 0.06 },
];
const FIT_TARGET = 40;
// Palier minimum : total (en %) des moods choisis que l'œuvre doit atteindre. Plus on choisit de moods, plus le total exigé est haut.
// Si trop peu d'œuvres atteignent le palier, on le baisse par étapes (×0,85 → ×0,7 → ×0,55) plutôt que d'afficher n'importe quoi.
const MOOD_MIN_TOTAL = { 1: 30, 2: 48, 3: 58 };
const MOOD_TIERS = [1, 0.85, 0.7, 0.55];
const FRIEND_MIN_AVG = 8;

const COLS = "mal_id,title,title_en,score,rank,popularity,year,aired_from,episodes,duration,type,status,source,rating,image_url,large_image,genres,themes,studios,country";

const TYPE_MAP = { TV: ["TV"], Movie: ["Movie"], OVA: ["OVA", "ONA"] };

const toAnime = (row) => ({ ...supabaseRowToAnime(row), aired_from: row.aired_from, country: row.country, title_en: row.title_en });

function allowedTypes(mediaTypes) {
  if(!mediaTypes || mediaTypes.includes("all")) return ["TV", "Movie", "OVA", "ONA"];
  return [...new Set(mediaTypes.flatMap(m => TYPE_MAP[m] || [m]))];
}

// Épisodes de l'entrée (une série en cours sans total connu mais diffusée depuis plus d'un an compte ~40 ép./an)
function epsOf(a) {
  if(a.episodes) return a.episodes;
  if(a.status === "Currently Airing") {
    const years = new Date().getFullYear() - (a.year || new Date().getFullYear());
    return years >= 1 ? 40 * years : null;
  }
  return null;
}

const classOf = (total) => total == null ? null : total < 15 ? "short" : total <= 50 ? "medium" : "long";

// Caches du module : saisons retrouvées pour une œuvre (valables pour la session)
const knownRows  = new Map();   // mal_id → anime
const lookedUp   = new Set();   // motifs déjà interrogés

async function lookupSeasons(cands) {
  const patterns = [...new Set(cands.map(franchiseIlike).filter(Boolean))].filter(p => !lookedUp.has(p));
  for(let i = 0; i < patterns.length; i += 25) {
    const part = patterns.slice(i, i + 25);
    part.forEach(p => lookedUp.add(p));
  }
  const chunks = [];
  for(let i = 0; i < patterns.length; i += 25) chunks.push(patterns.slice(i, i + 25));
  await Promise.all(chunks.map(async part => {
    const orExpr = part.flatMap(p => [`title.ilike.${p}`, `title_en.ilike.${p}`]).join(",");
    try {
      const rows = await sb.query(`anime_cache?select=${COLS}&or=(${orExpr})&limit=1000`);
      (rows || []).forEach(r => { if(!knownRows.has(r.mal_id)) knownRows.set(r.mal_id, toAnime(r)); });
    } catch { part.forEach(p => lookedUp.delete(p)); /* on réessaiera au prochain tirage */ }
  }));
}

function buildIndex(lists) {
  const idx = new Map();
  const seen = new Set();
  for(const list of lists) for(const a of list) {
    if(seen.has(a.mal_id)) continue;
    seen.add(a.mal_id);
    for(const k of franchiseBucketKeys(a)) { if(!idx.has(k)) idx.set(k, []); idx.get(k).push(a); }
  }
  return idx;
}

const membersOf = (idx, a) => {
  const out = new Map();
  for(const k of franchiseBucketKeys(a)) for(const x of idx.get(k) || []) if(!out.has(x.mal_id) && sameFranchise(a, x)) out.set(x.mal_id, x);
  out.set(a.mal_id, out.get(a.mal_id) || a);
  return [...out.values()];
};

export async function fetchMoodboardCandidates(selectedMoods, duration, mediaTypes, countries, me, cursor, rerollCount = 0, opts = {}) {
  const { friendStats = {}, friendBoost = false } = opts;
  const types = allowedTypes(mediaTypes);
  const hasTv = types.includes("TV");
  const countryList   = (countries || ["all"]);
  const countryFilter = countryList.includes("all") || (countryList.includes("JP") && countryList.includes("other")) ? null : countryList[0];
  const countryParam  = countryFilter ? (countryFilter === "JP" ? "&country=eq.JP" : "&country=eq.other") : "";
  const allowForeignOna = countryList.length === 1 && countryList[0] === "other"; // sinon : pas d'ONA chinois en 3D & co
  const typeParam = `&type=in.(${types.join(",")})`;

  // Vu = regardé ou terminé. Exclu = vu, en cours ou abandonné (on ne le recommande pas).
  const seenIds = new Set((me.watched || []).map(Number));
  const excluded = new Set(seenIds);
  Object.entries(me.statuses || {}).forEach(([id, status]) => {
    if(status === "completed") seenIds.add(parseInt(id));
    if(["completed", "watching", "dropped"].includes(status)) excluded.add(parseInt(id));
  });

  let offset    = cursor?.offset ?? 0;
  let exhausted = !!cursor?.exhausted;
  const pool    = new Map(Object.entries(cursor?.pool || {}).map(([k, v]) => [parseInt(k), v]));
  const shownPicks = [...(cursor?.shownPicks || [])];
  let shownMovies = cursor?.shownMovies ?? 0;
  let shownOVA    = cursor?.shownOVA    ?? 0;
  let friendsLoaded = !!cursor?.friendsLoaded;
  let fetchedBatches = 0;

  const typeOk = (a) => types.includes(a.type);
  const basicOk = (a) => {
    if(!a || excluded.has(a.mal_id) || !typeOk(a)) return false;
    if(a.status === "Not yet aired") return false;
    if(a.score != null && a.score < MIN_SCORE) return false;
    if(isAdultAnime(a) || isTvShort(a)) return false;
    if(a.type === "ONA" && !allowForeignOna && a.country && a.country !== "JP") return false;
    if(countryFilter === "JP" && a.country && a.country !== "JP") return false;
    if(countryFilter === "other" && a.country === "JP") return false;
    return true;
  };

  // ── Récupération des lots ──
  const fetchBatch = async (off) => {
    try {
      return await sb.query(`anime_cache?select=${COLS}&score=gte.${MIN_SCORE}${countryParam}${typeParam}&order=score.desc.nullslast&limit=${BATCH_SIZE}&offset=${off}`) || [];
    } catch(e) {
      console.error("Supabase failed, fallback Jikan:", e);
      const out = [];
      const jikanPage = Math.floor(off / 25) + 1;
      for(let p = jikanPage; p < jikanPage + 4; p++) {
        try {
          const data = await jikan.searchAnime({ order_by: "score", sort: "desc", limit: 25, min_score: MIN_SCORE, sfw: true, page: p });
          (data.data || []).forEach(a => out.push({ ...a, _jikan: true }));
        } catch { /* page suivante */ }
      }
      return out;
    }
  };
  const fetchMore = async () => {
    const offs = Array.from({ length: PARALLEL }, (_, i) => offset + i * BATCH_SIZE);
    const results = await Promise.all(offs.map(fetchBatch));
    results.forEach(rows => rows.forEach(row => {
      if(pool.has(row.mal_id)) return;
      pool.set(row.mal_id, row._jikan ? { ...row, country: null } : toAnime(row));
    }));
    offset += PARALLEL * BATCH_SIZE;
    fetchedBatches += PARALLEL;
    if(results.some(r => r.length < BATCH_SIZE)) exhausted = true;
  };

  // ── Coups de cœur des amis (note moyenne ≥ 8, pas encore vus) : on les ajoute au lot même s'ils sont hors du top ──
  if(friendBoost && !friendsLoaded) {
    const ids = Object.entries(friendStats).filter(([id, s]) => s.avg >= FRIEND_MIN_AVG && !excluded.has(+id) && !pool.has(+id)).map(([id]) => +id);
    for(let i = 0; i < ids.length; i += 100) {
      try {
        const rows = await sb.query(`anime_cache?mal_id=in.(${ids.slice(i, i + 100).join(",")})&select=${COLS}`);
        (rows || []).forEach(r => pool.set(r.mal_id, toAnime(r)));
      } catch { /* pas de bonus amis pour ce lot */ }
    }
    friendsLoaded = true;
  }

  // ── Rattachement des candidats à leur œuvre ──
  const resolved = new Map(); // mal_id (candidat) → { rep | null }
  const durationPrefilter = (a) => {
    const e = a.episodes || 0;
    if(duration === "short")  return a.type === "Movie" || a.type === "OVA" || a.type === "ONA" || (a.type === "TV" && e < 15);
    if(duration === "medium") return a.type !== "Movie" && e <= 50;
    if(duration === "long")   return a.type === "TV" || a.type === "ONA";
    return true;
  };
  const shownAlready = (a) => shownPicks.some(p => sameFranchise(p, a));

  async function resolveMore() {
    const todo = [...pool.values()]
      .filter(a => !resolved.has(a.mal_id) && basicOk(a) && durationPrefilter(a) && !shownAlready(a))
      .sort((x, y) => (y.score || 0) - (x.score || 0))
      .slice(0, RESOLVE_STEP);
    // les coups de cœur d'amis passent en priorité
    if(friendBoost) todo.sort((x, y) => (friendStats[y.mal_id]?.avg >= FRIEND_MIN_AVG ? 1 : 0) - (friendStats[x.mal_id]?.avg >= FRIEND_MIN_AVG ? 1 : 0));
    if(!todo.length) return;
    await lookupSeasons(todo);
    const idx = buildIndex([pool.values(), knownRows.values()]);
    for(const cand of todo) {
      const members = membersOf(idx, cand);
      const chain = mainChain(members);
      let rep = cand;
      if(cand.type === "TV" || cand.type === "ONA") {
        // première saison non vue de l'œuvre : c'est elle qu'on propose (jamais la saison 7 sans la 6)
        const next = chain.find(x => !seenIds.has(x.mal_id) && x.status !== "Not yet aired");
        if(next && next.mal_id !== cand.mal_id) {
          if(releaseKey(next) > releaseKey(cand)) { /* ne devrait pas arriver : on garde le candidat */ }
          else rep = pool.get(next.mal_id) || knownRows.get(next.mal_id) || next;
        }
        if(!basicOk(rep) || !typeOk(rep)) { resolved.set(cand.mal_id, null); continue; }
        // une suite dont la saison précédente est « abandonnée / en cours » n'est pas recommandable
        if(rep.mal_id === cand.mal_id) {
          const i = chain.findIndex(x => x.mal_id === cand.mal_id);
          const prev = i > 0 ? chain[i - 1] : null;
          if(prev && !seenIds.has(prev.mal_id)) { resolved.set(cand.mal_id, null); continue; }
        }
      } else if(chain.length) {
        // film / OAV d'une série : seulement si la série a été vue (au moins sa première saison)
        const first = chain.find(x => releaseKey(x) < releaseKey(cand)) || null;
        if(first && !seenIds.has(first.mal_id)) { resolved.set(cand.mal_id, null); continue; }
      }
      // durée de l'ŒUVRE : total des épisodes de toutes ses saisons
      let total;
      if(rep.type === "Movie") total = 1;
      else if(rep.type === "OVA" || (rep.type === "ONA" && !chain.length)) total = epsOf(rep);
      else {
        const parts = (chain.length ? chain : [rep]).filter(x => x.status !== "Not yet aired").map(epsOf);
        total = parts.some(p => p == null) ? null : parts.reduce((s, p) => s + p, 0);
        if(total == null && parts.some(p => p != null)) total = parts.reduce((s, p) => s + (p || 0), 0); // total partiel : au moins ça
      }
      resolved.set(cand.mal_id, { rep: { ...rep, _total: total, _cls: rep.type === "Movie" ? "short" : classOf(total), _from: cand.mal_id } });
    }
  }

  const gather = () => {
    const reps = [...resolved.values()].filter(Boolean).map(r => r.rep);
    reps.sort((x, y) => (y.score || 0) - (x.score || 0));
    const kept = [];
    for(const r of reps) {
      if(shownAlready(r)) continue;
      if(duration !== "all" && r._cls !== duration) continue;
      if(kept.some(k => k.mal_id === r.mal_id || sameFranchise(k, r))) continue;
      kept.push(r);
    }
    return kept;
  };

  const nMoods = Math.min(3, Math.max(1, selectedMoods.length));
  const minTotal = MOOD_MIN_TOTAL[nMoods];
  const moodSum = (pts) => { const pct = ptsToPct(pts || {}); return selectedMoods.reduce((s, m) => s + (pct[m] || 0), 0); };

  if(pool.size === 0) await fetchMore();
  let valid;
  for(;;) {
    await resolveMore();
    valid = gather();
    const strictPts = await getPtsBatch(valid);
    const strictCount = valid.filter(a => moodSum(strictPts[a.mal_id]) >= minTotal).length;
    const unresolvedLeft = [...pool.values()].some(a => !resolved.has(a.mal_id) && basicOk(a) && durationPrefilter(a) && !shownAlready(a));
    if(strictCount >= NEED_VALID) break;
    if(unresolvedLeft) continue;
    if(exhausted || fetchedBatches >= HARD_MAX_BATCH) break;
    await fetchMore();
  }

  // Dernier recours (pour ne jamais afficher « aucun animé ») : on complète avec des titres déjà montrés, puis on élargit la durée
  const info = {};
  if(valid.length < 3 && shownPicks.length) {
    const memoryPicks = shownPicks.splice(0, shownPicks.length); // on oublie ce qui a déjà été montré
    await resolveMore(); // résout aussi les titres qui avaient été écartés parce que déjà montrés
    const recycled = gather().filter(r => !valid.some(v => v.mal_id === r.mal_id || sameFranchise(v, r))).map(r => ({ ...r, _recycled: true }));
    valid = [...valid, ...recycled].slice(0, Math.max(valid.length, 9));
    shownPicks.push(...memoryPicks);
  }
  if(valid.length < 3 && duration !== "all") {
    const allReps = [...resolved.values()].filter(Boolean).map(r => r.rep).sort((x, y) => (y.score || 0) - (x.score || 0));
    const extra = [];
    for(const r of allReps) {
      if(valid.some(k => k.mal_id === r.mal_id || sameFranchise(k, r))) continue;
      if(extra.some(k => sameFranchise(k, r))) continue;
      extra.push(r);
      if(valid.length + extra.length >= 9) break;
    }
    if(extra.length) { valid = [...valid, ...extra]; info.durationRelaxed = true; }
  }

  // ── Score ──
  const ptsById = await getPtsBatch(valid);
  // palier de mood : le plus exigeant qui laisse assez d'œuvres (au moins 4), sinon on descend
  let tier = MOOD_TIERS[MOOD_TIERS.length - 1];
  for(const f of MOOD_TIERS) {
    if(valid.filter(a => moodSum(ptsById[a.mal_id]) >= minTotal * f).length >= 4) { tier = f; break; }
  }
  const threshold = minTotal * tier;
  const eligible = valid.filter(a => moodSum(ptsById[a.mal_id]) >= threshold);
  if(eligible.length >= 3) valid = eligible;
  const W = WEIGHTS[Math.min(rerollCount, WEIGHTS.length - 1)];
  const scored = valid.map(a => {
    const pct = ptsToPct(ptsById[a.mal_id] || {});
    const vals = selectedMoods.map(m => pct[m] || 0);
    const mean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
    const fit = Math.min(1, (0.65 * mean + 0.35 * Math.min(...(vals.length ? vals : [0]))) / FIT_TARGET);
    const quality = a.score == null ? 0.35 : Math.max(0, Math.min(1, (a.score - MIN_SCORE) / 3.5));
    const rankBonus = a.rank && a.rank <= 500 ? 0.05 : a.rank && a.rank <= 1500 ? 0.02 : 0;
    const fs = friendBoost ? (friendStats[a.mal_id] || friendStats[a._from]) : null;
    let friend = 0;
    if(fs && fs.avg >= FRIEND_MIN_AVG) {
      friend = (0.28 + 0.06 * (Math.min(fs.count, 4) - 1) + 0.08 * Math.min(1, (fs.avg - FRIEND_MIN_AVG) / 2)) * Math.min(1, fit / 0.35);
    }
    const jitter = W.jitter ? (Math.random() - 0.5) * 2 * W.jitter : 0;
    return { ...a, _pts: ptsById[a.mal_id], _fit: fit, _friend: fs && fs.avg >= FRIEND_MIN_AVG ? fs : null, _score: W.q * quality + W.m * fit + rankBonus + friend + jitter - (a._recycled ? 1 : 0) };
  }).sort((x, y) => y._score - x._score);

  // ── Sélection : 3 titres, max 1 film et 1 OAV/ONA sur l'ensemble des 9 résultats d'une requête ──
  const limitNonTv = hasTv;
  const picks = [];
  const take = (a, force) => {
    const t = a.type;
    if(limitNonTv && !force) {
      if(t === "Movie" && shownMovies >= 1) return false;
      if((t === "OVA" || t === "ONA") && shownOVA >= 1) return false;
    }
    if(picks.some(p => sameFranchise(p, a))) return false;
    picks.push(a);
    if(t === "Movie") shownMovies++;
    if(t === "OVA" || t === "ONA") shownOVA++;
    return true;
  };
  for(const a of scored) { if(picks.length >= 3) break; take(a, false); }
  if(picks.length < 3) for(const a of scored) { if(picks.length >= 3) break; if(!picks.includes(a)) take(a, true); }

  picks.forEach(p => shownPicks.push({ mal_id: p.mal_id, title: p.title, title_en: p.title_en }));

  return {
    results: picks,
    info,
    cursor: { offset, exhausted, pool: Object.fromEntries(pool), shownPicks, shownMovies, shownOVA, friendsLoaded },
  };
}
