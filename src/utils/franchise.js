// ─── Franchises : reconnaître « la même œuvre » à travers ses saisons ─────────────────────────────────────
// Utilisé par le Moodboard (pas de double saison, pas de saison 7 sans la 6) et par le calendrier (ONA dont on a vu la saison 1).
// Principe : on retire des titres tout ce qui marque une suite (Season 2, 2nd Season, III, Part 2, « Zoku », sous-titre après « : »…)
// puis deux titres sont de la même œuvre quand l'un commence par les mêmes mots que l'autre.

const stripAccents = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Œuvres « anthologie » : chaque saison est un récit différent, on ne les regroupe pas
const ANTHOLOGY = ["jojo no kimyou na bouken", "jojo", "monogatari", "fate", "dragon ball", "precure", "gundam", "fullmetal alchemist", "love live", "idolmaster"];

const SEASON_WORDS = [
  /\b(the\s+)?(final|last)\s+(season|chapter)\b/g,
  /\b(season|saison|cour|part|partie)\s*\d+\b/g,
  /\b\d+(st|nd|rd|th)\s*(season|cour|part)?\b/g,
  /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|final|last)\s+(season|cour|part|stage|series|chapter)\b/g,
  /\bstage\s*\d+\b/g,
  /\b(first|second|third|fourth|fifth|sixth|seventh|final|last|extra|new)\s+(stage|arc|chapter|story)\b/g, // « Initial D Fourth Stage »
  /\bstage\s*\d+\b/g,
  /\bdai\s*\d+\s*ki\b/g,
  /\b(season|saison|cour|part|ova|oad|ona|movie|film|gekijouban|special|specials|sp|tv)\b/g,
  /\b(zoku|shin)\b/g,
];
const ROMAN = /\s(ii|iii|iv|vi|vii|viii|ix)$/;
// Chiffres japonais romanisés en fin de titre (« Natsume Yuujinchou Go », « … Roku »)
const JP_NUM = /\s(ni|san|yon|shi|go|roku|nana|shichi|hachi|kyuu|juu)$/;

const memo = new Map();

const isAnthology = (tokens) => {
  const s = tokens.join(" ");
  return ANTHOLOGY.some(a => s === a || s.startsWith(a + " "));
};

function cleanTokens(t) {
  const before = t;
  for (const re of SEASON_WORDS) t = t.replace(re, " ");
  t = t.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) {
    t = t.replace(/\s\d+$/, "").replace(ROMAN, "");
    if (t.split(" ").length >= 3) t = t.replace(JP_NUM, "");
  }
  return (t.trim() || before).split(" ").filter(Boolean);
}

/** Mots « racine » d'un titre (sans marqueurs de saison). */
export function franchiseTokens(title) {
  const raw = String(title || "");
  if (memo.has(raw)) return memo.get(raw);
  const base = stripAccents(raw);
  const norm = (x) => x.replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, " ").trim();
  const cut = base.replace(/\s*[:：]\s+.+$/, "").replace(/\s+[-–—]\s+.+$/, ""); // sous-titre après « : » ou « - »
  let tokens = cleanTokens(norm(cut));
  // Anthologie (JoJo, Fate…) : le sous-titre fait partie du nom de l'œuvre
  if (isAnthology(tokens)) tokens = cleanTokens(norm(base.replace(/[:：]/g, " ")));
  memo.set(raw, tokens);
  return tokens;
}

function tokensMatch(ta, tb) {
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (isAnthology(short) || isAnthology(long)) return short.length === long.length && short.every((w, i) => w === long[i]);
  let common = 0;
  while (common < short.length && short[common] === long[common]) common++;
  if (common >= 3 && common * 2 >= short.length) return true; // 3 premiers mots identiques : même œuvre
  if (common < short.length) return false;
  if (short.length === 1 && short[0].length < 4) return false; // « a », « to »… trop court pour être une œuvre
  return true;
}

// Mots trop génériques pour prouver que deux titres sont la même œuvre
const GENERIC = new Set(["mahou", "shoujo", "shounen", "isekai", "tensei", "gakuen", "gakkou", "kyoushitsu", "ore", "boku", "watashi", "kono", "sono", "no", "wa", "wo", "ni", "to", "ga", "de", "ha", "the", "of", "a", "an", "my", "our", "your", "in", "on", "is", "it", "love", "high", "school", "girl", "girls", "boy", "boys", "world", "story", "life"]);

const titlesOf = (a) => [a?.title, a?.title_en, a?.title_english].filter(Boolean);

/** Même œuvre ? (compare titre romaji et titre anglais) */
export function sameFranchise(a, b) {
  if (!a || !b) return false;
  if (a.mal_id != null && a.mal_id === b.mal_id) return true;
  const ta = titlesOf(a).map(franchiseTokens), tb = titlesOf(b).map(franchiseTokens);
  for (const x of ta) for (const y of tb) if (tokensMatch(x, y)) return true;
  return false;
}

/** Clé de regroupement : premier mot racine du titre (sert d'index pour éviter de tout comparer à tout). */
export function franchiseBucketKeys(a) {
  return [...new Set(titlesOf(a).map(t => franchiseTokens(t)[0]).filter(Boolean))];
}

/** Motif ilike PostgREST (`*mot*mot*`) pour retrouver les saisons d'une œuvre dans anime_cache. */
export function franchiseIlike(a) {
  const tokens = franchiseTokens(a?.title || a?.title_en).slice(0, 2); // 2 mots : « Violet Evergarden Gaiden » doit retrouver « Violet Evergarden »
  if (!tokens.length) return null;
  const clean = tokens.map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  if (!clean.length) return null;
  return clean.length === 1 ? `${clean[0]}*` : `*${clean.join("*")}*`;
}

/** Durée d'un épisode en minutes (« 24 min per ep », « 1 hr 30 min »), null si inconnue. */
export function episodeMinutes(duration) {
  if (duration == null) return null;
  if (typeof duration === "number") return duration;
  const s = String(duration).toLowerCase();
  const hr = /(\d+)\s*hr/.exec(s), mn = /(\d+)\s*min/.exec(s), sec = /(\d+)\s*sec/.exec(s);
  if (!hr && !mn && !sec) return null;
  return (hr ? +hr[1] * 60 : 0) + (mn ? +mn[1] : 0) + (!hr && !mn && sec ? Math.max(1, Math.round(+sec[1] / 60)) : 0);
}

/** « TV Short » : série de format court (épisodes de moins de 15 min). Le type reste « TV » dans la base. */
export function isTvShort(a) {
  if (!a || (a.type !== "TV" && a.type !== "ONA")) return false;
  const m = episodeMinutes(a.duration);
  return m != null && m < 15;
}

/** Ordre de sortie : date de début si on l'a, sinon l'année, puis l'identifiant. */
export const releaseKey = (a) => `${String(a?.aired_from || (a?.year ? `${a.year}-06-15` : "9999")).slice(0, 10)}#${String(a?.mal_id || 0).padStart(8, "0")}`;
export const byRelease = (x, y) => (releaseKey(x) < releaseKey(y) ? -1 : releaseKey(x) > releaseKey(y) ? 1 : 0);

/** Saisons « principales » d'une œuvre : séries TV/ONA de plus de 15 min, dans l'ordre de sortie. */
export function mainChain(members) {
  return members.filter(m => (m.type === "TV" || m.type === "ONA") && !isTvShort(m)).sort(byRelease);
}

// Parenté plus large que sameFranchise (sert au calendrier) : « JoJo no Kimyou na Bouken: Stardust Crusaders » et « …: Steel Ball Run »
// sont deux récits différents mais une même série pour qui a vu l'un d'eux.
const PARTICLES = new Set(["no", "wa", "ga", "ni", "to", "wo", "de", "the", "a", "of"]);
export function sameFamily(a, b) {
  if (sameFranchise(a, b)) return true;
  const raw = (t) => stripAccents(String(t || "").replace(/\s*[:：]\s+.+$/, "")).replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, " ").trim().split(" ").filter(Boolean);
  for (const x of titlesOf(a).map(raw)) for (const y of titlesOf(b).map(raw)) {
    let c = 0;
    while (c < x.length && c < y.length && x[c] === y[c]) c++;
    if (c >= 3) return true;
    if (c === 2 && !PARTICLES.has(x[1]) && x[0].length + x[1].length >= 9) return true;
  }
  return false;
}

/**
 * Version plus large, réservée au dédoublonnage d'une liste de résultats (jamais pour les suites/prérequis) :
 * deux titres qui commencent par les mêmes mots caractéristiques (« Initial D … », « Natsume Yuujinchou … ») sont la même œuvre
 * même si le sous-titre n'est pas reconnu comme un marqueur de saison.
 */
export function looseSameFranchise(a, b) {
  if (sameFranchise(a, b)) return true;
  const ta = titlesOf(a).map(franchiseTokens), tb = titlesOf(b).map(franchiseTokens);
  for (const x of ta) for (const y of tb) {
    if (isAnthology(x) || isAnthology(y)) continue;
    let n = 0, weight = 0;
    while (n < x.length && n < y.length && x[n] === y[n]) { if (!GENERIC.has(x[n])) weight += x[n].length; n++; }
    if (n >= 2 && weight >= 8) return true;
  }
  return false;
}
