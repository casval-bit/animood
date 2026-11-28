// ─── Faits sur un animé (ligne de la table anime_cache ou objet de type Jikan) : durée, genres, studios, époque, popularité ─────────────
// Petites fonctions pures partagées par la carte de survol, les stats du profil et la compatibilité entre membres.
// Elles acceptent les deux formes de données de l'appli : ligne brute (title, genres: [{ name }], studios: [{ name }]…) et objet « Jikan »
// (aired.prop.from.year, images.jpg…). Rien ne lance d'erreur : une donnée absente donne null, 0 ou une liste vide.

/** Minutes d'un épisode (« 24 min per ep », « 1 hr 50 min »), ou null si la durée est absente ou absurde. */
export function episodeMinutes(row) {
  const m = String(row?.duration || "").toLowerCase();
  const h = /(\d+)\s*hr/.exec(m), mn = /(\d+)\s*min/.exec(m);
  const v = (h ? parseInt(h[1], 10) * 60 : 0) + (mn ? parseInt(mn[1], 10) : 0);
  return v > 0 && v < 400 ? v : null;
}

/** Durée totale estimée en minutes : épisodes × durée d'un épisode (film = 1 épisode ; durée inconnue : 24 min, ou 100 min pour un film).
 *  0 quand le nombre d'épisodes est inconnu (série en cours de diffusion) : on ne devine pas. Même règle que l'onglet Stats du profil. */
export function totalMinutes(row) {
  const eps = row?.type === "Movie" ? 1 : (row?.episodes || 0);
  if (!(eps > 0)) return 0;
  return eps * (episodeMinutes(row) || (row?.type === "Movie" ? 100 : 24));
}

const names = (list) => (Array.isArray(list) ? list : []).map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean);
export const genreNames = (row) => names(row?.genres);
export const studioNames = (row) => names(row?.studios);

/** Année de sortie : colonne `year`, à défaut début de diffusion. */
export function yearOf(row) {
  const y = Number(row?.year || row?.aired?.prop?.from?.year || (typeof row?.aired_from === "string" ? row.aired_from.slice(0, 4) : 0));
  return y > 1900 && y < 2100 ? y : null;
}

/** Décennie : 2023 → 2020 (null si l'année est inconnue). */
export const decadeOf = (year) => (year ? Math.floor(year / 10) * 10 : null);

/** Rang de popularité MyAnimeList (1 = le plus populaire), ou null. */
export function popularityRank(row) {
  const p = Number(row?.popularity);
  return p > 0 ? p : null;
}

/** Image d'affiche d'une ligne ou d'un objet Jikan. */
export function posterOf(row) {
  return row?.images?.jpg?.large_image_url || row?.images?.jpg?.image_url || row?.large_image || row?.image_url || null;
}

/** Heures pour tout voir, en texte court : « 311 h », « 13 j 7 h ». */
export function formatHours(minutes, lang = "fr") {
  if (!(minutes > 0)) return "—";
  const h = Math.round(minutes / 60);
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24), r = h % 24;
  return lang === "en" ? `${d}d ${r}h` : `${d} j ${r} h`;
}
