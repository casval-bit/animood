// ─── Stats en plus de l'onglet « Stats » du profil (appli de bureau) : goût « de niche », santé de la watchlist, calendrier d'activité ────────────
// Tout est calculé ici à partir de lignes déjà lues (anime_cache, user_votes) : pas d'écran, pas de requête, des fonctions pures et testées.
// views/ProfileStatsExtras.jsx les affiche ; api/voteActivity.js lit les dates des notes.
import { totalMinutes } from "./animeFacts.js";

const DAY_MS = 86400000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

// ── 1. L'obscurité du goût : où se situent les animés que tu as vus dans le classement de popularité de MyAnimeList ─────────────────────────────
/** Rangs de popularité (1 = le plus populaire) qui valent 0 et 100 sur l'échelle, logarithmique : passer du 30e au 300e compte autant que du 300e au 3000e. */
export const OBSCURITY_SCALE = { low: 30, high: 15000 };
/** Seuils (sur 100) entre les 5 libellés : grand public · populaire · équilibré · curieux · de niche. */
export const OBSCURITY_LEVELS = [25, 45, 62, 78];
/** Tranches de popularité comptées : top 100 · 101 à 1 000 · 1 001 à 5 000 · au-delà. */
export const OBSCURITY_BANDS = [100, 1000, 5000];
export const OBSCURITY_MIN = 5;          // en dessous de ce nombre d'animés connus, le résultat reste « indicatif »

/** Rang médian → 0 (tout est très connu) … 100 (tout est très confidentiel). */
export function obscurityScore(medianRank) {
  const r = num(medianRank);
  if (!(r > 0)) return null;
  const { low, high } = OBSCURITY_SCALE;
  return Math.round(100 * clamp01((Math.log10(r) - Math.log10(low)) / (Math.log10(high) - Math.log10(low))));
}
/** Score → 0 (grand public) … 4 (de niche). */
export const obscurityLevel = (score) => (score == null ? null : OBSCURITY_LEVELS.filter((t) => score >= t).length);

/**
 * @param {{ id: number, title?: string, img?: string|null, pop: number }[]} rows  les animés vus, avec leur rang de popularité (inconnu ou 0 : ignoré)
 */
export function obscurityOf(rows) {
  const list = (rows || []).filter(Boolean).map((r) => ({ ...r, id: Number(r.id), pop: Math.round(num(r.pop)) })).filter((r) => r.pop > 0);
  const n = list.length;
  if (!n) return { n: 0, median: null, score: null, level: null, reliable: false, bands: [0, 0, 0, 0], mostPopular: [], mostObscure: [] };
  const ranks = list.map((r) => r.pop).sort((a, b) => a - b);
  const median = n % 2 ? ranks[(n - 1) / 2] : Math.round((ranks[n / 2 - 1] + ranks[n / 2]) / 2);
  const bands = [0, 0, 0, 0];
  for (const r of ranks) bands[OBSCURITY_BANDS.filter((edge) => r > edge).length]++;
  const score = obscurityScore(median);
  // les 3 plus connus, puis, parmi les autres, les 3 plus confidentiels : un animé n'apparaît jamais dans les deux listes (même avec 4 animés)
  const byRank = [...list].sort((a, b) => a.pop - b.pop || a.id - b.id);
  return {
    n, median, score, level: obscurityLevel(score), reliable: n >= OBSCURITY_MIN, bands,
    mostPopular: byRank.slice(0, 3),
    mostObscure: byRank.slice(3).sort((a, b) => b.pop - a.pop || a.id - b.id).slice(0, 3),
  };
}

// ── 2. La santé de la watchlist : combien d'heures, quoi regarder en premier, en combien de temps tout voir ───────────────────────────────────
export const QUICK_MAX_MIN = 300;        // « coup rapide » : 5 h au plus (un film, une mini-série de 12 épisodes)
export const MARATHON_MIN = 1500;        // « marathon » : 25 h ou plus (une soixantaine d'épisodes)
export const PACES = [0.5, 1, 2];        // heures regardées par jour proposées pour « tout voir en… »
export const QUICK_LIMIT = 6;
export const MARATHON_LIMIT = 4;

/**
 * @param {object[]} rows  lignes anime_cache des animés « à voir » (mal_id, title, title_en, image_url, type, episodes, duration, score)
 * Les séries dont on ne connaît pas le nombre d'épisodes (en cours de diffusion) sont comptées à part : on ne devine pas leur durée.
 */
export function watchlistHealth(rows, { paces = PACES } = {}) {
  const items = (rows || []).filter(Boolean).map((r) => ({
    id: Number(r.mal_id),
    title: r.title || r.title_en || `#${r.mal_id}`,                 // le nom qu'on voit partout ailleurs (cartes, carte de survol, fiche)
    img: r.image_url || null,
    type: r.type || null,
    episodes: num(r.episodes) || null,
    minutes: totalMinutes(r),
    score: num(r.score) || null,
  }));
  const known = items.filter((x) => x.minutes > 0);
  const minutes = known.reduce((a, x) => a + x.minutes, 0);
  const quick = known.filter((x) => x.minutes <= QUICK_MAX_MIN).sort((a, b) => (b.score || 0) - (a.score || 0) || a.minutes - b.minutes || a.id - b.id);
  const marathons = known.filter((x) => x.minutes >= MARATHON_MIN).sort((a, b) => b.minutes - a.minutes || a.id - b.id);
  return {
    count: items.length, knownCount: known.length, unknownCount: items.length - known.length, minutes,
    quick: quick.slice(0, QUICK_LIMIT), quickCount: quick.length,
    marathons: marathons.slice(0, MARATHON_LIMIT), marathonCount: marathons.length,
    clear: paces.map((perDay) => ({ perDay, days: minutes > 0 ? Math.ceil(minutes / 60 / perDay) : 0 })),
  };
}

/** Durée en jours, en texte court : « 45 j », « 6 mois », « 2 ans 3 mois » (anglais : « 45 d », « 6 mo », « 2 y 3 mo »). */
export function formatSpan(days, lang = "fr") {
  const d = Math.max(0, Math.round(num(days)));
  const en = lang === "en";
  if (d < 60) return `${d} ${en ? "d" : "j"}`;
  const months = Math.round(d / 30.44);
  if (months < 24) return `${months} ${en ? "mo" : "mois"}`;
  const y = Math.floor(months / 12), m = months % 12;
  return en ? `${y} y${m ? ` ${m} mo` : ""}` : `${y} ans${m ? ` ${m} mois` : ""}`;
}

// ── 3. Le calendrier d'activité : une case par jour, les séries de jours d'affilée, les jours de la semaine préférés ──────────────────────────────
export const ACTIVITY_WEEKS = 53;
/** Teinte d'une case : 0 aucune note · 1 une · 2 deux à trois · 3 quatre à six · 4 sept ou plus. */
export const levelOfCount = (c) => (c <= 0 ? 0 : c < 2 ? 1 : c < 4 ? 2 : c < 7 ? 3 : 4);
/** 0 = lundi … 6 = dimanche, pour un numéro de jour (jours écoulés depuis le 1er janvier 1970, qui était un jeudi). */
export const weekdayOf = (day) => (((day + 3) % 7) + 7) % 7;

const toMs = (t) => (t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t));

/** Date d'un numéro de jour, en texte (« 28 nov. 2026 »). */
export const dayLabel = (day, lang = "fr") => new Date(day * DAY_MS).toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * @param {(string|number|Date)[]} times  les dates des notes (user_votes.voted_at)
 * @param {{ today?: Date, weeks?: number, offsetMin?: number }} [opts]  offsetMin : décalage du fuseau horaire en minutes à l'est de UTC (par défaut : celui de l'ordinateur)
 * Les jours sont ceux de l'ordinateur de la personne (une note à 23 h 30 compte pour ce jour-là, pas pour le suivant).
 */
export function activityStats(times, { today = new Date(), weeks = ACTIVITY_WEEKS, offsetMin } = {}) {
  const off = (offsetMin ?? -today.getTimezoneOffset()) * 60000;
  const dayOf = (ms) => Math.floor((ms + off) / DAY_MS);
  const counts = new Map();
  let total = 0;
  for (const t of times || []) {
    const ms = toMs(t);
    if (!Number.isFinite(ms)) continue;
    const d = dayOf(ms);
    counts.set(d, (counts.get(d) || 0) + 1);
    total++;
  }
  const todayN = dayOf(today.getTime());
  const days = [...counts.keys()].sort((a, b) => a - b);

  let longest = 0, run = 0, prev = null;
  for (const d of days) { run = prev !== null && d === prev + 1 ? run + 1 : 1; if (run > longest) longest = run; prev = d; }
  // série en cours : elle se termine aujourd'hui, ou hier (la journée n'est pas finie : elle n'est pas encore perdue)
  let current = 0;
  for (let d = counts.has(todayN) ? todayN : todayN - 1; counts.has(d); d--) current++;

  const weekdays = Array(7).fill(0);
  let best = null;
  for (const [d, c] of counts) {
    weekdays[weekdayOf(d)] += c;
    if (!best || c > best.count || (c === best.count && d > best.day)) best = { day: d, count: c };
  }

  const firstStart = todayN - weekdayOf(todayN) - 7 * (Math.max(1, weeks) - 1);
  const cols = [], months = [];
  let inGrid = 0;
  for (let w = 0; w < Math.max(1, weeks); w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const day = firstStart + 7 * w + i, count = counts.get(day) || 0, future = day > todayN;
      if (!future) inGrid += count;
      if (!future && new Date(day * DAY_MS).getUTCDate() === 1) months.push({ col: w, month: new Date(day * DAY_MS).getUTCMonth() });
      col.push({ day, count, level: levelOfCount(count), future });
    }
    cols.push(col);
  }
  return { total, inGrid, activeDays: days.length, current, longest, best, weekdays, cols, months, today: todayN, firstDay: firstStart };
}
