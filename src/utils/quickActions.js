// ─── Actions rapides sur un animé (carte de survol de l'appli de bureau) ──────────────────────────────────────────────────────
// Transitions d'état PURES du profil : chaque fonction reçoit le profil `me` et renvoie un nouveau profil (l'ancien n'est jamais modifié),
// avec exactement la logique des boutons de la fiche animé et des affiches (QuickActionIcons, components/ui.jsx) :
//   · vu : `watched` ; · marque-page : statut « watchlist » ; · cœur : `highlights` (les 5 premiers remplissent `favorites`) ;
//   · note : `ratings[id] = { score, moods }` et l'animé passe en « vu » (comme « Enregistrer » dans la fiche) ;
//   · statut : comme à l'import MAL, tout statut sauf « à voir » compte comme vu ; « à voir » ne touche pas à `watched` (comme le marque-page).
// Les écritures (profil, table user_votes) sont faites par l'appelant : ici, aucun réseau.
import { isDesktopApp } from "./streamingLinks.js";

export const STATUS_CHOICES = ["watching", "completed", "onhold", "dropped", "watchlist"];

// ── Lecture ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const hasWatched = (me, id) => (me?.watched || []).includes(id);
export const isOnWatchlist = (me, id) => (me?.statuses || {})[id] === "watchlist";
export const isHighlighted = (me, id) => (me?.highlights || []).includes(id);
export const scoreOf = (me, id) => me?.ratings?.[id]?.score ?? null;
/** Statut affiché : celui du profil ; un animé vu sans statut compte comme « complété » (comme le journal du profil). */
export const statusOf = (me, id) => (me?.statuses || {})[id] || (hasWatched(me, id) ? "completed" : null);
export const listsContaining = (me, id) => (me?.customLists || []).filter((l) => (l.animeIds || []).includes(id)).map((l) => l.id);

// ── Transitions ────────────────────────────────────────────────────────────────────────────────────────────────────────
export function withWatchedToggled(me, id) {
  const watched = me.watched || [];
  return { ...me, watched: watched.includes(id) ? watched.filter((x) => x !== id) : [...watched, id] };
}

export function withWatchlistToggled(me, id) {
  const statuses = { ...(me.statuses || {}) };
  if (statuses[id] === "watchlist") delete statuses[id]; else statuses[id] = "watchlist";
  return { ...me, statuses };
}

export function withHighlightToggled(me, id) {
  const highlights = me.highlights || [];
  const next = highlights.includes(id) ? highlights.filter((x) => x !== id) : [...highlights, id];
  const favorites = [null, null, null, null, null];                 // les 5 premiers coups de cœur remplissent la vitrine du profil
  next.slice(0, 5).forEach((x, i) => { favorites[i] = x; });
  return { ...me, highlights: next, favorites };
}

/** Choisir un statut ; choisir à nouveau le statut déjà actif l'enlève (le statut disparaît, l'animé reste « vu » s'il l'était). */
export function withStatus(me, id, status) {
  const statuses = { ...(me.statuses || {}) };
  const watched = me.watched || [];
  if (status == null || statuses[id] === status) { delete statuses[id]; return { ...me, statuses }; }
  statuses[id] = status;
  if (status === "watchlist") return { ...me, statuses };
  return { ...me, statuses, watched: watched.includes(id) ? watched : [...watched, id] };
}

/** Noter (1 à 10) ; `score` vide enlève la note. Les humeurs déjà choisies sont conservées. */
export function withRating(me, id, score, moods) {
  const ratings = { ...(me.ratings || {}) };
  if (!score) { delete ratings[id]; return { ...me, ratings }; }
  ratings[id] = { score, moods: moods ?? ratings[id]?.moods ?? [] };
  const watched = me.watched || [];
  return { ...me, ratings, watched: watched.includes(id) ? watched : [...watched, id] };
}

export function withListToggled(me, listId, id) {
  const customLists = (me.customLists || []).map((l) => {
    if (l.id !== listId) return l;
    const ids = l.animeIds || [];
    return { ...l, animeIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] };
  });
  return { ...me, customLists };
}

// ── Étoiles : 5 étoiles, chacune en deux moitiés = une note /10 ───────────────────────────────────────────────────────────
export const STAR_COUNT = 5;
/** Note /10 d'un clic sur l'étoile n° `star` (1 à 5), moitié gauche (`half`) ou entière. */
export const scoreForStar = (star, half) => star * 2 - (half ? 1 : 0);
/** Remplissage de chaque étoile (0, 0.5 ou 1) pour une note /10. */
export const starFills = (score) => Array.from({ length: STAR_COUNT }, (_, i) => {
  const v = Math.round(score || 0) - i * 2;
  return v >= 2 ? 1 : v === 1 ? 0.5 : 0;
});

// ── Position de la carte ──────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Où poser la carte (taille `size`) par rapport à l'affiche `rect`, dans une fenêtre de taille `view`.
 * À droite de l'affiche si la place le permet, sinon à gauche, sinon par-dessus (au-dessus ou en dessous de l'affiche) ;
 * toujours entièrement visible et sous la barre du haut (`top` : l'en-tête de l'appli fait 84 px et sert à déplacer la fenêtre).
 */
export function placeCard(rect, size, view, { gap = 10, top = 92, margin = 12 } = {}) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fitsRight = rect.right + gap + size.w + margin <= view.w;
  const fitsLeft = rect.left - gap - size.w >= margin;
  if (fitsRight || fitsLeft) {
    const x = fitsRight ? rect.right + gap : rect.left - gap - size.w;
    return { x, y: clamp(rect.top, top, Math.max(top, view.h - size.h - margin)), side: fitsRight ? "right" : "left" };
  }
  const x = clamp(rect.left + rect.width / 2 - size.w / 2, margin, Math.max(margin, view.w - size.w - margin));
  const above = rect.top - gap - size.h;
  const y = above >= top ? above : clamp(rect.bottom + gap, top, Math.max(top, view.h - size.h - margin));
  return { x, y, side: "over" };
}

// ── Branchement sur les affiches ──────────────────────────────────────────────────────────────────────────────────────────
const NONE = {};
/** À étaler sur une affiche : la carte de survol la reconnaît. Vide hors de l'appli de bureau (le DOM du site et de l'APK ne change pas). */
export const quickProps = (malId) => (isDesktopApp() && Number(malId) > 0 ? { "data-quick-anime": String(Number(malId)) } : NONE);
