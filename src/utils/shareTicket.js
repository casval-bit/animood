// ─── Cartes « ticket » à partager : les données et les petites règles de mise en page (pures, testées) ──────────────────────────────────────
// Deux billets : celui d'un animé (affiche, note perso sur 10, humeurs, petit mot) et celui d'un profil (avatar, chiffres, genres, 5 favoris).
// Ici, aucune image ni aucun écran : on prépare les textes, les nombres et les formes (barres du code-barres, jauge de 10 pastilles),
// components/ShareTicketModal.jsx les dessine, et utils/posterExport.js en fait un PNG.
import { genreNames, studioNames, yearOf, episodeMinutes } from "./animeFacts.js";
import { MOODS } from "../constants/moods.js";

export const NOTE_MAX = 80;            // longueur du petit mot sur le ticket d'un animé
export const MOTTO_MAX = 90;           // longueur de la bio reprise sur le ticket d'un profil
export const BAR_COUNT = 36;           // barres du code-barres décoratif
const MOOD_IDS = MOODS.map((m) => m.id);

/** Empreinte 32 bits d'un texte (FNV-1a) : même texte → même nombre, sur tous les ordinateurs. */
export function hashString(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Numéro de billet à l'allure de vrai billet : « 00007-4821 » (identifiant de l'animé, puis 4 chiffres tirés du pseudo). Stable. */
export function ticketNumber(id, seed = "") {
  const raw = Math.floor(Number(id));
  const n = Number.isFinite(raw) ? Math.max(0, raw) % 100000 : 0;
  return `${String(n).padStart(5, "0")}-${String(hashString(`${id}|${seed}`) % 10000).padStart(4, "0")}`;
}

/** Largeurs (1, 2 ou 3) des barres du code-barres décoratif : fixes pour un même texte, jamais toutes pareilles. */
export function barcodeBars(seed, count = BAR_COUNT) {
  let s = hashString(seed) || 1;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const bars = Array.from({ length: count }, () => { const r = next(); return r < 0.45 ? 1 : r < 0.8 ? 2 : 3; });
  if (bars.length > 1 && new Set(bars).size < 2) bars[0] = bars[0] === 1 ? 3 : 1;
  return bars;
}

/** Taille du titre en pixels : plus il est long, plus il rétrécit (le billet a une place fixe, et html2canvas ne coupe pas les lignes). */
export function titleFontSize(title) {
  const n = String(title ?? "").length;
  return n <= 16 ? 30 : n <= 26 ? 26 : n <= 38 ? 22 : n <= 54 ? 18 : 16;
}

/** Coupe proprement un texte trop long (espaces superflus retirés, « … » à la fin). */
export function clipText(text, max) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Durée d'un film : « 1 h 50 » / « 1h 50m », « 45 min ». */
export function formatRuntime(minutes, lang = "fr") {
  const m = Math.round(Number(minutes) || 0);
  if (m <= 0) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return lang === "en" ? `${h}h${r ? ` ${r}m` : ""}` : `${h} h${r ? ` ${String(r).padStart(2, "0")}` : ""}`;
}

export function formatTicketDate(now = new Date(), lang = "fr") {
  return now.toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const posterSources = (row) => ({
  image_url: row?.images?.jpg?.image_url || row?.image_url || null,
  large_image: row?.images?.jpg?.large_image_url || row?.large_image || null,
});

/**
 * Billet d'un animé. `anime` : objet « Jikan » ou ligne anime_cache ; `score` : ma note (1-10) ; `moods` : mes humeurs ; `statusId` : mon statut.
 * `seed` (mon pseudo) personnalise le numéro et le code-barres.
 */
export function buildAnimeTicket({ anime, score = null, moods = [], statusId = null, note = "", seed = "", lang = "fr", now = new Date() } = {}) {
  const id = Number(anime?.mal_id) || 0;
  const title = String(anime?.title_english || anime?.title_en || anime?.title || (id ? `#${id}` : "—"));
  const type = anime?.type || null;
  const length = type === "Movie" ? formatRuntime(episodeMinutes(anime), lang) : (Number(anime?.episodes) > 0 ? `${anime.episodes} ${lang === "en" ? "eps" : "ép."}` : null);
  const s = Number(score);
  const mine = s >= 1 && s <= 10 ? Math.round(s) : null;
  return {
    id,
    title,
    romaji: anime?.title && anime.title !== title ? String(anime.title) : null,
    titleSize: titleFontSize(title),
    meta: [type, length, yearOf(anime)].filter(Boolean),
    genres: genreNames(anime).slice(0, 3),
    studio: studioNames(anime)[0] || null,
    malScore: Number(anime?.score) > 0 ? Number(anime.score).toFixed(1) : null,
    score: mine,
    pips: Array.from({ length: 10 }, (_, i) => mine != null && i < mine),
    moods: [...new Set(moods || [])].filter((m) => MOOD_IDS.includes(m)).slice(0, 3),
    statusId: statusId || null,
    note: clipText(note, NOTE_MAX),
    number: ticketNumber(id, seed),
    bars: barcodeBars(`${id}|${seed}`),
    date: formatTicketDate(now, lang),
    poster: posterSources(anime),
  };
}

/**
 * Genres les plus présents dans une bibliothèque (les animés bien notés pèsent double), à partir des fiches déjà chargées.
 * @param {{ ids: number[], ratings: Object<number, number> }} library
 * @param {Object<number, object>} meta  { mal_id: fiche }
 */
export function topGenresOf({ ids = [], ratings = {} } = {}, meta = {}, limit = 3) {
  const sums = new Map();
  for (const id of ids) {
    const w = (ratings[id] ?? 0) >= 8 ? 2 : 1;
    for (const g of genreNames(meta[id])) sums.set(g, (sums.get(g) || 0) + w);
  }
  return [...sums.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([name]) => name);
}

/**
 * Billet d'un profil. `favorites` : [{ id, title, row }] (row = fiche de l'animé, pour l'affiche) ; `topGenres` : noms de genres.
 */
export function buildProfileTicket({ name, username, avatar = null, bio = "", badge = null, watched = [], ratings = {}, favorites = [], topGenres = [], lang = "fr", now = new Date() } = {}) {
  const scores = Object.values(ratings || {}).map((r) => Number(r?.score)).filter((x) => x >= 1 && x <= 10);
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const handle = String(username || "").toLowerCase();
  return {
    name: String(name || username || "—"),
    username: handle,
    avatar: avatar || null,
    motto: clipText(bio, MOTTO_MAX),
    badge: badge && badge.label ? { label: String(badge.label), emoji: badge.emoji || null } : null,
    stats: { watched: (watched || []).length, rated: scores.length, avg },
    favorites: (favorites || []).filter((f) => f && f.id).slice(0, 5).map((f) => ({ id: f.id, title: String(f.title || `#${f.id}`), poster: posterSources(f.row) })),
    topGenres: (topGenres || []).slice(0, 3),
    number: ticketNumber(hashString(handle) % 100000, handle),
    bars: barcodeBars(`profile|${handle}`),
    date: formatTicketDate(now, lang),
  };
}
