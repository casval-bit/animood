// ─── AniMood 2026 : règles de calcul (sans écran, sans réseau : tout est testé dans tests/awards2026.test.mjs) ───────────
// L'espace « AniMood 2026 » réunit une tierlist, une grille personnalisable et le vote du top 3 de la communauté.
// Ce fichier contient ce qui doit être exact :
//   1. quels animés comptent comme « 2026 » ;
//   2. comment un top 3 rapporte des points, et comment on classe (points / plus de n°1 / meilleur ratio de n°1, communauté ou amis) ;
//   3. la grille (cases par défaut, renommer, ajouter, retirer, même animé dans plusieurs cases) ;
//   4. le bloc de fin d'année (jusqu'à quand, mémoire de la fermeture).
import { isAdultAnime } from "./adultContent.js";

export const AWARDS_YEAR = 2026;

// ── 1. Éligibilité ──────────────────────────────────────────────────────────────────────────────────────────────────
// Tout format compte (série TV, film, OVA, ONA, spécial, donghua chinois, animation coréenne…) tant que l'année est 2026.
// Seuls les pubs (CM), bandes-annonces (PV) et clips musicaux (Music) sont écartés : ce ne sont pas des animés, et le fil d'actus du forum
// (NEWS_TYPES dans api/jikan.js) les met déjà de côté. Les contenus pour adultes ne sont pas proposés (comme dans la tierlist et le calendrier).
const EXCLUDED_TYPES = new Set(["cm", "pv", "music"]);

/** Année d'un animé : `year` ; à défaut la date de début de diffusion, puis l'étiquette de saison (« Hiver 2026 »). null si inconnue. */
export function animeYear(a) {
  const y = Number(a?.year);
  if(Number.isInteger(y) && y > 1900) return y;
  const from = /^(\d{4})/.exec(String(a?.aired_from || ""));
  if(from) return Number(from[1]);
  const label = /(\d{4})\s*$/.exec(String(a?.anime_season_label || ""));
  return label ? Number(label[1]) : null;
}

export const isTypeEligible = (type) => !EXCLUDED_TYPES.has(String(type || "").trim().toLowerCase());

export function isEligible2026(a, { allowAdult = false } = {}) {
  if(!a) return false;
  if(animeYear(a) !== AWARDS_YEAR) return false;
  if(!isTypeEligible(a.type)) return false;
  return allowAdult || !isAdultAnime(a);
}

// Filtres de format du sélecteur (types MAL regroupés)
export const FORMAT_GROUPS = [
  { id: "all",   types: null },
  { id: "tv",    types: ["TV"] },
  { id: "movie", types: ["Movie"] },
  { id: "ova",   types: ["OVA", "Special", "TV Special"] },
  { id: "ona",   types: ["ONA"] },
];
export const formatGroupOf = (type) => (FORMAT_GROUPS.find(g => g.types?.includes(type)) || { id: "other" }).id;

/** Version légère d'un animé (ce qu'on garde dans la grille, la tierlist et les votes affichés) — accepte une ligne de base ou un objet de l'appli. */
export function lightAnime(a) {
  const id = Number(a?.mal_id);
  if(!Number.isInteger(id) || id <= 0) return null;   // identifiant absent, « abc », 0, négatif ou décimal : pas un animé
  return {
    mal_id: id,
    title: a.title || a.title_english || "",
    title_en: a.title_en || a.title_english || null,
    image_url: a.image_url || a.images?.jpg?.image_url || null,
    large_image: a.large_image || a.images?.jpg?.large_image_url || null,
    score: a.score ?? null,
    year: a.year ?? null,
    type: a.type ?? null,
    popularity: a.popularity ?? null,
  };
}
export const animeName = (a) => a?.title_en || a?.title || "";

// ── 2. Top 3 : points et classements ──────────────────────────────────────────────────────────────────────────────────
// Chaque membre vote pour 3 animés, dans l'ordre. 1er = 3 points, 2e = 2 points, 3e = 1 point.
export const VOTE_WEIGHTS = Object.freeze([3, 2, 1]);
export const RANK_MODES = ["points", "firsts", "ratio"];

/** 3 identifiants entiers positifs et tous différents, sinon null. */
export function normalizePicks(picks) {
  if(!Array.isArray(picks) || picks.length !== 3) return null;
  const ids = picks.map(Number);
  if(ids.some(n => !Number.isInteger(n) || n <= 0)) return null;
  return new Set(ids).size === 3 ? ids : null;
}

/** Ligne de la table awards_2026 → { username, picks } (null si le vote est incomplet ou incohérent). */
export function ballotFromRow(row) {
  const picks = normalizePicks([row?.pick1, row?.pick2, row?.pick3]);
  return picks && row?.username ? { username: String(row.username), picks } : null;
}

/**
 * Décompte : par animé, points, nombre de 1res / 2es / 3es places, nombre de votes reçus ("mentions") et part de n°1 (ratio = n°1 ÷ votes reçus).
 * Un membre = un seul vote (le dernier si le même pseudo apparaît deux fois) ; les votes invalides sont ignorés.
 */
export function tally(ballots) {
  const byUser = new Map();
  (ballots || []).forEach((b, i) => {
    const picks = normalizePicks(b?.picks);
    if(!picks) return;
    byUser.set(b?.username ? String(b.username) : `#anon${i}`, picks);
  });
  const map = new Map();
  for(const picks of byUser.values()) {
    picks.forEach((id, rank) => {
      const t = map.get(id) || { id, points: 0, firsts: 0, seconds: 0, thirds: 0, mentions: 0 };
      t.points += VOTE_WEIGHTS[rank];
      t.mentions += 1;
      if(rank === 0) t.firsts += 1; else if(rank === 1) t.seconds += 1; else t.thirds += 1;
      map.set(id, t);
    });
  }
  const rows = [...map.values()].map(t => ({ ...t, ratio: t.mentions ? t.firsts / t.mentions : 0 }));
  return { voters: byUser.size, rows };
}

/**
 * Nombre minimum de votes reçus pour entrer dans le classement « meilleur ratio de n°1 » : sans ça, un animé cité une seule fois (en 1er)
 * aurait 100 % et passerait devant tout le monde. 10 % des votants, entre 2 et 5.
 */
export const defaultMinMentions = (voters) => Math.min(5, Math.max(2, Math.round((voters || 0) * 0.1)));

// Clés de tri, de la plus importante à la moins importante (toutes décroissantes) ; ensuite : animé le plus populaire (rang MAL le plus petit), puis identifiant.
const SORT_KEYS = {
  points: (r) => [r.points, r.firsts, r.mentions],
  firsts: (r) => [r.firsts, r.points, r.mentions],
  ratio:  (r) => [r.ratio, r.firsts, r.mentions, r.points],
};

/** Classe les lignes de tally(). `popularity(id)` (facultatif) départage les égalités ; le mode « ratio » ignore les animés sous `minMentions`. */
export function rankBy(rows, mode = "points", { minMentions = 1, popularity } = {}) {
  const keys = SORT_KEYS[mode] || SORT_KEYS.points;
  const pop = (id) => { const p = popularity ? Number(popularity(id)) : NaN; return Number.isFinite(p) && p > 0 ? p : Infinity; };
  const list = mode === "ratio" ? rows.filter(r => r.mentions >= minMentions) : [...rows];
  return list.sort((a, b) => {
    const ka = keys(a), kb = keys(b);
    for(let i = 0; i < ka.length; i++) if(ka[i] !== kb[i]) return kb[i] - ka[i];
    const pa = pop(a.id), pb = pop(b.id);
    if(pa !== pb) return pa < pb ? -1 : 1;
    return a.id - b.id;
  });
}

/** Votes pris en compte : toute la communauté, ou seulement ceux des amis (= les membres que je suis ; mon propre vote n'en fait pas partie). */
export function scopeBallots(ballots, scope, { friends } = {}) {
  if(scope !== "friends") return ballots || [];
  const set = friends instanceof Set ? friends : new Set(friends || []);
  return (ballots || []).filter(b => set.has(b?.username));
}

/** Classement prêt à afficher : { voters, minMentions, list } (list = lignes de tally() triées, limitées à `limit`). */
export function buildRanking(ballots, { mode = "points", scope = "community", friends, popularity, limit = 10 } = {}) {
  const { voters, rows } = tally(scopeBallots(ballots, scope, { friends }));
  const minMentions = defaultMinMentions(voters);
  return { voters, minMentions, list: rankBy(rows, mode, { minMentions, popularity }).slice(0, limit) };
}

export const SCOPES = ["community", "friends"];

/** Tous les classements d'un coup : { community: { points, firsts, ratio }, friends: { … } } — chacun { voters, minMentions, list }. */
export function buildAllRankings(ballots, { friends, popularity, limit = 15 } = {}) {
  const out = {};
  for(const scope of SCOPES) {
    out[scope] = {};
    for(const mode of RANK_MODES) out[scope][mode] = buildRanking(ballots, { mode, scope, friends, popularity, limit });
  }
  return out;
}

/** Identifiants à retrouver dans le catalogue pour afficher ces classements. */
export function rankingIds(all) {
  const ids = new Set();
  for(const scope of SCOPES) for(const mode of RANK_MODES) (all?.[scope]?.[mode]?.list || []).forEach(r => ids.add(r.id));
  return [...ids];
}

/** Ne garde que les animés retrouvés dans le catalogue de 2026 (`known` : Set ou Map d'identifiants) puis limite la liste. */
export function visibleRanking(ranking, known, limit = 10) {
  return { ...ranking, list: (ranking?.list || []).filter(r => known.has(r.id)).slice(0, limit) };
}

// ── Mon top 3 : les 3 places (index 0 = 1er, 1 = 2e, 2 = 3e) ──────────────────────────────────────────────────────────────────────
const slotsOf = (slots) => [0, 1, 2].map(i => slots?.[i] || null);

/** Met un animé à une place. S'il occupait déjà une autre place, les deux places s'échangent : jamais de doublon dans le top 3. */
export function placePick(slots, index, anime) {
  const a = lightAnime(anime);
  const next = slotsOf(slots);
  if(!a || !Number.isInteger(index) || index < 0 || index > 2) return next;
  const from = next.findIndex(s => s && s.mal_id === a.mal_id);
  const previous = next[index];
  next[index] = a;
  if(from >= 0 && from !== index) next[from] = previous;
  return next;
}
export function clearPick(slots, index) {
  const next = slotsOf(slots);
  if(index >= 0 && index <= 2) next[index] = null;
  return next;
}
/** Les 3 identifiants si le top 3 est complet (3 animés différents), sinon null. */
export const slotsToPicks = (slots) => normalizePicks(slotsOf(slots).map(s => s?.mal_id));
/** Le top 3 affiché est-il identique à celui enregistré ? (même animés, même ordre) */
export const sameTop3 = (slots, savedIds) => {
  const a = slotsToPicks(slots), b = normalizePicks(savedIds);
  return !!a && !!b && a.every((id, i) => id === b[i]);
};

// ── 3. Grille personnalisable ────────────────────────────────────────────────────────────────────────────────────────
// Cases par défaut (rangées 3 par 3 ; « anime de l'année » au centre). Une case = { id, key, label, anime } :
//   key   : catégorie d'origine (texte traduit selon la langue de l'appli) — null pour une case ajoutée par la personne ;
//   label : nom choisi par la personne (null = garder le nom d'origine) ;
//   anime : animé de 2026 choisi (version légère) ou null. Le même animé peut remplir plusieurs cases.
export const DEFAULT_GRID_KEYS = ["animation", "ost", "story", "mc_m", "best", "mc_f", "villain", "surprise", "letdown"];
export const FEATURED_KEY = "best";
export const MAX_GRID_CELLS = 12;
export const MAX_LABEL_LENGTH = 40;

let idCounter = 0;
export const makeCellId = () => `c${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export const MAX_TITLE_LENGTH = 60;
const cleanText = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function defaultGrid(idGen = makeCellId) {
  return { v: 1, title: "", cells: DEFAULT_GRID_KEYS.map(key => ({ id: idGen(), key, label: null, anime: null })) };
}

/** Titre de la grille (affiché sur l'image partagée) ; vide = titre par défaut de l'appli. */
export const setGridTitle = (grid, title) => ({ ...grid, title: cleanText(title, MAX_TITLE_LENGTH) });

/** Nom affiché d'une case : celui choisi par la personne, sinon celui de la catégorie (`labels` = textes traduits). */
export function cellLabel(cell, labels = {}) {
  const own = typeof cell?.label === "string" ? cell.label.trim() : "";
  return own || (cell?.key && labels[cell.key]) || "";
}

const mapCell = (grid, cellId, fn) => ({ ...grid, cells: grid.cells.map(c => (c.id === cellId ? fn(c) : c)) });

export const setCellAnime = (grid, cellId, anime) => mapCell(grid, cellId, c => ({ ...c, anime: lightAnime(anime) }));
export const clearCell = (grid, cellId) => mapCell(grid, cellId, c => ({ ...c, anime: null }));
/** Renommer ; un nom vide rend à la case son nom d'origine. */
export const renameCell = (grid, cellId, label) => mapCell(grid, cellId, c => {
  const clean = cleanText(label, MAX_LABEL_LENGTH);
  return { ...c, label: clean || null };
});

export function addCell(grid, label = "", idGen = makeCellId) {
  if(grid.cells.length >= MAX_GRID_CELLS) return grid;
  const clean = cleanText(label, MAX_LABEL_LENGTH);
  return { ...grid, cells: [...grid.cells, { id: idGen(), key: null, label: clean || null, anime: null }] };
}

/** Retirer une case (il en reste toujours au moins une). */
export function removeCell(grid, cellId) {
  if(grid.cells.length <= 1) return grid;
  return { ...grid, cells: grid.cells.filter(c => c.id !== cellId) };
}

/** Décaler une case d'un cran (dir = -1 vers le début, +1 vers la fin). */
export function moveCell(grid, cellId, dir) {
  const i = grid.cells.findIndex(c => c.id === cellId), j = i + (dir < 0 ? -1 : 1);
  if(i < 0 || j < 0 || j >= grid.cells.length) return grid;
  const cells = [...grid.cells];
  [cells[i], cells[j]] = [cells[j], cells[i]];
  return { ...grid, cells };
}

export const gridFilledCount = (grid) => grid.cells.filter(c => c.anime).length;

/** Grille relue du stockage (texte JSON ou objet) : tout ce qui est abîmé est écarté ; rien d'exploitable → grille par défaut. */
export function sanitizeGrid(raw, idGen = makeCellId) {
  let data = raw;
  if(typeof raw === "string") { try { data = JSON.parse(raw); } catch { data = null; } }
  const list = Array.isArray(data?.cells) ? data.cells : null;
  if(!list || !list.length) return defaultGrid(idGen);
  const seen = new Set();
  const cells = list.slice(0, MAX_GRID_CELLS).map(c => {
    if(!c || typeof c !== "object") return null;
    const key = DEFAULT_GRID_KEYS.includes(c.key) ? c.key : null;
    const label = typeof c.label === "string" ? cleanText(c.label, MAX_LABEL_LENGTH) || null : null;
    let id = typeof c.id === "string" && c.id && !seen.has(c.id) ? c.id : idGen();
    seen.add(id);
    return { id, key, label, anime: lightAnime(c.anime) };
  }).filter(Boolean);
  return cells.length ? { v: 1, title: cleanText(data?.title, MAX_TITLE_LENGTH), cells } : defaultGrid(idGen);
}

// ── Sauvegarde sur l'appareil (par pseudo) : la grille et le brouillon du top 3 ────────────────────────────────────────────────────
export const gridKey = (username) => `animood_awards2026_grid:${username || "anon"}`;
export const top3Key = (username) => `animood_awards2026_top3:${username || "anon"}`;

export function readGrid(storage, username, idGen) {
  try { return sanitizeGrid(storage?.getItem?.(gridKey(username)), idGen); } catch { return defaultGrid(idGen); }
}
export function writeGrid(storage, username, grid) {
  try { storage?.setItem?.(gridKey(username), JSON.stringify(grid)); } catch { /* stockage plein ou bloqué */ }
}

/** Brouillon du top 3 : { slots: [animé|null ×3], savedIds: [3 identifiants] | null } — savedIds = ce que le serveur a déjà reçu. */
export function readTop3Draft(storage, username) {
  const empty = { slots: [null, null, null], savedIds: null };
  try {
    const raw = JSON.parse(storage?.getItem?.(top3Key(username)) || "null");
    if(!raw || typeof raw !== "object") return empty;
    let slots = [null, null, null];
    (Array.isArray(raw.slots) ? raw.slots.slice(0, 3) : []).forEach((a, i) => { slots = placePick(slots, i, a); });
    return { slots, savedIds: normalizePicks(raw.savedIds) };
  } catch { return empty; }
}
export function writeTop3Draft(storage, username, { slots, savedIds }) {
  try { storage?.setItem?.(top3Key(username), JSON.stringify({ slots: slotsOf(slots), savedIds: savedIds || null })); } catch { /* stockage plein ou bloqué */ }
}

// ── 4. Bloc de fin d'année ───────────────────────────────────────────────────────────────────────────────────────────
// Affiché jusqu'au 15 janvier 2027 inclus (heure locale) : passé ce jour, « bonnes fêtes » n'a plus de sens. L'espace AniMood 2026, lui, reste
// accessible depuis les Jeux. Pour prolonger / raccourcir : changer BANNER_LAST_DAY.
export const BANNER_LAST_DAY = Object.freeze({ year: 2027, month: 1, day: 15 });

export function isBannerSeason(now = new Date()) {
  const { year, month, day } = BANNER_LAST_DAY;
  return now.getTime() < new Date(year, month - 1, day + 1).getTime();
}

// Fermeture : mémorisée dans sessionStorage (propre à l'onglet / à la fenêtre) → le bloc ne revient pas quand on recharge la page, mais il revient
// à chaque nouvelle connexion : la déconnexion efface ces marques (AppProvider), et fermer puis rouvrir l'appli ouvre un nouvel onglet / une nouvelle session.
const BANNER_PREFIX = "animood_yearend2026_closed:";
export const bannerKey = (username) => `${BANNER_PREFIX}${username || "anon"}`;

export function isBannerDismissed(storage, username) {
  try { return storage?.getItem?.(bannerKey(username)) === "1"; } catch { return false; }
}
export function dismissBanner(storage, username) {
  try { storage?.setItem?.(bannerKey(username), "1"); } catch { /* stockage bloqué : le bloc se fermera quand même à l'écran */ }
}
/** Efface toutes les marques de fermeture (déconnexion) : le bloc réapparaît à la prochaine connexion. */
export function resetBannerDismissals(storage) {
  try {
    const keys = [];
    for(let i = 0; i < (storage?.length || 0); i++) { const k = storage.key(i); if(k && k.startsWith(BANNER_PREFIX)) keys.push(k); }
    keys.forEach(k => storage.removeItem(k));
  } catch { /* rien à faire */ }
}
