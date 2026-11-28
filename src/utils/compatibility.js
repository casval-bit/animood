// ─── Compatibilité entre deux membres ────────────────────────────────────────────────────────────────────────────────────────────────
// Logique PURE (ni réseau, ni React) : reçoit deux profils et, si on les a, les fiches des animés (genres, studios, année…) ; rend un score,
// ses ingrédients, les goûts communs et des listes d'idées (« à voir de sa part », « watchlist en commun »…).
//
// Score 0–100 = moyenne pondérée de quatre ingrédients, chacun entre 0 et 1. Un ingrédient sans assez de données est ignoré et les poids
// des autres sont renormalisés ; avec moins de deux ingrédients, il n'y a pas de score (« pas assez de données »).
// Confiance : avec de petites bibliothèques (moins de 25 animés pour le plus petit des deux), le score est tiré vers 50 — trois animés
// en commun ne font pas des âmes sœurs. Les ingrédients, eux, restent affichés tels quels.
//   · notes        40 % — écart moyen sur les animés notés par les deux, corrigé par l'écart « relatif » (un noteur sévère et un noteur
//                         généreux qui classent pareil restent compatibles) ; tiré vers le milieu quand il y a peu de notes en commun
//   · bibliothèque 20 % — animés vus en commun, coefficient d'Ochiai (|A∩B| / √(|A|·|B|)) : ni favorable aux grandes bibliothèques, ni aux petites
//   · genres       25 % — recouvrement des profils de genres (somme des parts communes) ; un animé bien noté pèse plus qu'un animé abandonné
//   · favoris      15 % — les coups de cœur de l'un, vus et aimés par l'autre (dans les deux sens)
// Tout est symétrique : compatibilité(A, B) = compatibilité(B, A) ; seules les listes d'idées changent de sens.
import { genreNames, studioNames, yearOf, decadeOf } from "./animeFacts.js";

export const WEIGHTS = { ratings: 0.4, library: 0.2, genres: 0.25, favorites: 0.15 };
export const LIMITS = { lovedTogether: 8, gaps: 4, theyLoved: 8, iLoved: 8, watchlist: 8, favorites: 5 };
export const LOVED = 8;            // à partir de cette note (ou d'un coup de cœur), on dit « adoré »
export const BIG_GAP = 3;          // écart de note à partir duquel on parle de désaccord
export const MIN_META = 5;         // fiches d'animés nécessaires, par membre, pour parler de goûts (genres, époques, studios)
export const CONFIDENCE_AT = 25;   // taille de la plus petite bibliothèque à partir de laquelle le score est pris tel quel
const FAVORITE_AS_SCORE = 9;       // un coup de cœur sans note compte comme un 9

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const toId = (x) => { const n = Number(x); return Number.isInteger(n) && n > 0 ? n : null; };

/** Seuils du libellé : 0 = opposés … 4 = âmes sœurs. */
export const levelOf = (score) => (score == null ? null : score < 25 ? 0 : score < 45 ? 1 : score < 65 ? 2 : score < 80 ? 3 : 4);

// ── Les données d'un membre ───────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Profil de l'appli (ou ligne `profiles`) → ce dont la compatibilité a besoin.
 *  · ratings   : { id: note 1-10 } (notes invalides ignorées) ; · seen : animés vus ou notés ; · order : `watched` dans l'ordre d'ajout
 *  · watchlist : statut « à voir » (et pas déjà vu) ; · top : coups de cœur (les 5 premiers `highlights`, puis `favorites`), sans doublon
 */
export function memberData(profile) {
  const ratings = {};
  for (const [k, v] of Object.entries(profile?.ratings || {})) {
    const id = toId(k), score = Number(v?.score);
    if (id && score >= 1 && score <= 10) ratings[id] = score;
  }
  const order = [];
  for (const x of profile?.watched || []) { const id = toId(x); if (id && !order.includes(id)) order.push(id); }
  const seen = new Set([...order, ...Object.keys(ratings).map(Number)]);
  const watchlist = [];
  for (const [k, st] of Object.entries(profile?.statuses || {})) {
    const id = toId(k);
    if (st === "watchlist" && id && !seen.has(id)) watchlist.push(id);
  }
  const top = [];
  for (const x of [...(profile?.highlights || []).slice(0, 5), ...(profile?.favorites || [])]) {
    const id = toId(x);
    if (id && !top.includes(id)) top.push(id);
  }
  return { ratings, seen, order, watchlist, top };
}

/** « Amour » d'un membre pour un animé : sa note, sinon 9 si c'est un de ses coups de cœur, sinon null. */
const love = (m, id) => m.ratings[id] ?? (m.top.includes(id) ? FAVORITE_AS_SCORE : null);

// ── Listes d'idées (n'ont pas besoin des fiches d'animés) ─────────────────────────────────────────────────────────────────────────────
const byScoreThenId = (score) => (x, y) => score(y) - score(x) || x.id - y.id;

/** a = moi, b = l'autre membre. Chaque liste est triée et limitée (LIMITS). */
export function buildLists(a, b) {
  const sharedTop = a.top.filter((id) => b.top.includes(id));
  const both = [...a.seen].filter((id) => b.seen.has(id)).sort((x, y) => x - y);

  const lovedTogether = both
    .filter((id) => !sharedTop.includes(id) && (love(a, id) ?? 0) >= LOVED && (love(b, id) ?? 0) >= LOVED)
    .map((id) => ({ id, mine: love(a, id), theirs: love(b, id) }))
    .sort(byScoreThenId((x) => x.mine + x.theirs));

  const gaps = Object.keys(a.ratings).map(Number).filter((id) => id in b.ratings)
    .map((id) => ({ id, mine: a.ratings[id], theirs: b.ratings[id] }))
    .filter((x) => Math.abs(x.mine - x.theirs) >= BIG_GAP)
    .sort(byScoreThenId((x) => Math.abs(x.mine - x.theirs)));

  // « Il l'a adoré et pas moi (je ne l'ai pas vu) » : ceux déjà dans ma watchlist passent devant.
  const theyLoved = [...b.seen].filter((id) => !a.seen.has(id) && (love(b, id) ?? 0) >= LOVED)
    .map((id) => ({ id, theirs: love(b, id), onMyWatchlist: a.watchlist.includes(id) }))
    .sort((x, y) => y.theirs - x.theirs || Number(y.onMyWatchlist) - Number(x.onMyWatchlist) || x.id - y.id);
  const iLoved = [...a.seen].filter((id) => !b.seen.has(id) && (love(a, id) ?? 0) >= LOVED)
    .map((id) => ({ id, mine: love(a, id), onTheirWatchlist: b.watchlist.includes(id) }))
    .sort((x, y) => y.mine - x.mine || Number(y.onTheirWatchlist) - Number(x.onTheirWatchlist) || x.id - y.id);

  const watchlist = a.watchlist.filter((id) => b.watchlist.includes(id)).sort((x, y) => y - x);   // les ids les plus récents d'abord

  return {
    lovedTogether: lovedTogether.slice(0, LIMITS.lovedTogether),
    gaps: gaps.slice(0, LIMITS.gaps),
    theyLoved: theyLoved.slice(0, LIMITS.theyLoved),
    iLoved: iLoved.slice(0, LIMITS.iLoved),
    watchlist: watchlist.slice(0, LIMITS.watchlist).map((id) => ({ id })),
    favorites: sharedTop.slice(0, LIMITS.favorites).map((id) => ({ id })),
  };
}

/**
 * Quelles fiches d'animés charger : celles qu'on va afficher, puis un échantillon par membre pour le profil de goûts
 * (les animés notés d'abord, du mieux noté au moins bien, puis les plus récemment ajoutés). `perUser` borne la charge réseau.
 */
export function idsToLoad(a, b, { perUser = 220 } = {}) {
  const shown = Object.values(buildLists(a, b)).flat().map((x) => x.id);
  return [...new Set([...shown, ...sampleLibrary(a, perUser), ...sampleLibrary(b, perUser)])];
}

/**
 * Les animés d'un membre dont on lit la fiche en priorité (genres, studios…) : ses 150 mieux notés, puis ses ajouts les plus récents,
 * `perUser` au plus. Sert aussi au ticket de profil (genres préférés), qui n'a pas besoin de toute la bibliothèque.
 */
export function sampleLibrary(m, perUser = 220) {
  const rated = Object.keys(m.ratings).map(Number).sort((x, y) => m.ratings[y] - m.ratings[x] || x - y).slice(0, 150);
  const recent = [...m.order].reverse().filter((id) => !(id in m.ratings));
  return [...rated, ...recent].slice(0, perUser);
}

// ── Les ingrédients ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function ratingPart(a, b) {
  const ids = Object.keys(a.ratings).map(Number).filter((id) => id in b.ratings);
  const n = ids.length;
  if (n < 2) return { value: null, n, avgGap: null, close: null };
  const diffs = ids.map((id) => Math.abs(a.ratings[id] - b.ratings[id]));
  const avgGap = mean(diffs);
  let value = clamp01(1 - avgGap / 5);
  if (n >= 4) {
    const ma = mean(ids.map((id) => a.ratings[id])), mb = mean(ids.map((id) => b.ratings[id]));
    const relative = mean(ids.map((id) => Math.abs((a.ratings[id] - ma) - (b.ratings[id] - mb))));
    value = 0.65 * value + 0.35 * clamp01(1 - relative / 4);
  }
  value = (value * n + 0.5 * 2) / (n + 2);                                  // peu de notes en commun : on tire vers le milieu
  return { value, n, avgGap, close: diffs.filter((d) => d <= 1).length / n };
}

function libraryPart(a, b) {
  const common = [...a.seen].filter((id) => b.seen.has(id));
  if (a.seen.size < 3 || b.seen.size < 3) return { value: null, common: common.length };
  return { value: clamp01(common.length / Math.sqrt(a.seen.size * b.seen.size) / 0.6), common: common.length };
}

const ratingWeight = (score) => (score == null ? 1 : score >= 8 ? 2 : score >= 6 ? 1.2 : score >= 5 ? 0.8 : 0.3);

/** Parts (somme = 1) de chaque clé (genre, studio, décennie) dans la bibliothèque d'un membre, pondérées par ses notes. n = animés pris en compte. */
function shares(m, meta, pick) {
  const sums = new Map();
  let total = 0, n = 0;
  for (const id of m.seen) {
    const row = meta[id];
    const keys = row ? pick(row) : [];
    if (!keys.length) continue;
    n++;
    const w = ratingWeight(m.ratings[id]);
    for (const k of keys) { sums.set(k, (sums.get(k) || 0) + w); total += w; }
  }
  const out = new Map();
  if (total > 0) for (const [k, v] of sums) out.set(k, v / total);
  return { shares: out, n };
}

// Somme dans l'ordre alphabétique des clés : le total est identique dans les deux sens (l'addition de flottants dépend de l'ordre).
const overlap = (sa, sb) => { let s = 0; for (const k of [...sa.keys()].sort()) s += Math.min(sa.get(k), sb.get(k) || 0); return s; };
const commonKeys = (sa, sb, limit, minTogether) => [...sa.keys()].filter((k) => sb.has(k))
  .map((k) => ({ key: k, mine: sa.get(k), theirs: sb.get(k), together: Math.min(sa.get(k), sb.get(k)) }))
  .filter((x) => x.together >= minTogether)
  .sort((x, y) => y.together - x.together || String(x.key).localeCompare(String(y.key)))
  .slice(0, limit);

const decadeKey = (row) => { const d = decadeOf(yearOf(row)); return d ? [d] : []; };

function tastePart(a, b, meta) {
  const ga = shares(a, meta, genreNames), gb = shares(b, meta, genreNames);
  const enough = ga.n >= MIN_META && gb.n >= MIN_META;
  const da = shares(a, meta, decadeKey), db = shares(b, meta, decadeKey);
  const sa = shares(a, meta, studioNames), sb = shares(b, meta, studioNames);
  return {
    value: enough ? clamp01((overlap(ga.shares, gb.shares) - 0.45) / 0.5) : null,
    mineN: ga.n, theirsN: gb.n,
    genres: enough ? commonKeys(ga.shares, gb.shares, 5, 0.03).map((x) => ({ name: x.key, mine: x.mine, theirs: x.theirs })) : [],
    decades: da.n >= MIN_META && db.n >= MIN_META ? commonKeys(da.shares, db.shares, 2, 0.1).map((x) => ({ decade: x.key, mine: x.mine, theirs: x.theirs })) : [],
    studios: sa.n >= MIN_META && sb.n >= MIN_META ? commonKeys(sa.shares, sb.shares, 3, 0.03).map((x) => ({ name: x.key, mine: x.mine, theirs: x.theirs })) : [],
  };
}

/** Un coup de cœur de `from`, vu par `to` : 1 = aimé aussi (coup de cœur ou note ≥ 8), 0,3 = vu sans note, 0 = pas vu ou détesté. */
const appreciation = (to, id) => {
  if (to.top.includes(id)) return 1;
  const s = to.ratings[id];
  if (s != null) return s >= 8 ? 1 : s >= 7 ? 0.6 : s >= 5 ? 0.25 : 0;
  return to.seen.has(id) ? 0.3 : 0;
};
function favoritesPart(a, b) {
  const dirs = [];
  if (a.top.length) dirs.push(mean(a.top.map((id) => appreciation(b, id))));
  if (b.top.length) dirs.push(mean(b.top.map((id) => appreciation(a, id))));
  return { value: dirs.length ? mean(dirs) : null };
}

// ── Le résultat ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * @param a    memberData(moi)       @param b    memberData(l'autre)
 * @param meta { [mal_id]: fiche }  (facultatif : sans fiches, l'ingrédient « genres » est simplement ignoré)
 */
export function computeCompatibility(a, b, meta = {}) {
  const ratings = ratingPart(a, b);
  const library = libraryPart(a, b);
  const taste = tastePart(a, b, meta);
  const favorites = favoritesPart(a, b);
  const values = { ratings: ratings.value, library: library.value, genres: taste.value, favorites: favorites.value };

  let num = 0, den = 0, available = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (values[k] == null) continue;
    num += w * values[k]; den += w; available++;
  }
  const confidence = clamp01(Math.min(a.seen.size, b.seen.size) / CONFIDENCE_AT);
  const raw = available >= 2 && den > 0 ? (100 * num) / den : null;
  const score = raw == null ? null : Math.round(50 + (raw - 50) * confidence);

  return {
    score,
    level: levelOf(score),
    confidence,
    parts: values,
    basis: {
      commonRated: ratings.n, commonSeen: library.common, mineSeen: a.seen.size, theirsSeen: b.seen.size,
      avgGap: ratings.avgGap, close: ratings.close,
      reliable: confidence >= 0.5,
    },
    genres: taste.genres, decades: taste.decades, studios: taste.studios,
    lists: buildLists(a, b),
  };
}
