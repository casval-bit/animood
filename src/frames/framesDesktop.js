// ─── CADRES DE PROFIL — VERSION APPLI DE BUREAU UNIQUEMENT ────────────────────
// Les 27 cadres d'origine (frames.js) restent inchangés. On ajoute ici 11 cadres animés aux formes et effets variés
// (losange, sortilège, foudre, brasier, rétro, steampunk, prestige, blush, glitch, orbite, néant), dessinés dans
// framesDesktopArt.js. Le site web continue d'utiliser frames.js tel quel (ces cadres n'y existent pas).

import { isDesktopApp } from "../utils/streamingLinks.js";
import { FRAMES } from "./frames.js";

import { ART } from "./framesDesktopArt.js";

// Dessins (objets animés façon décorations Discord) : voir framesDesktopArt.js
export const DESKTOP_SVG = ART;


// ═════════════════════════════════════════════════════════════════════════════
// CADRES BONUS (appli de bureau uniquement) — conditions décalées et un peu drôles.
// Ils s'ajoutent à la liste des cadres uniquement quand isDesktopApp() est vrai.
// Compteurs locaux (perdre à un jeu, ouvrir l'appli de nuit) : stockés sur l'ordinateur.
// ═════════════════════════════════════════════════════════════════════════════
const EXTRA_SVG = ART;

const EXTRA_META = [
  { id: "ds_diamond", label: "Losange", labelEn: "Diamond", desc: "Avoir 5 abonnés", descEn: "Have 5 followers", color: "#a5b4fc" },
  { id: "ds_spell", label: "Sortilège", labelEn: "Spell", desc: "Créer 3 listes personnalisées", descEn: "Create 3 custom lists", color: "#c084fc" },
  { id: "ds_lightning", label: "Foudre", labelEn: "Lightning", desc: "Mettre 10 notes de 9/10 ou plus", descEn: "Give 10 ratings of 9/10 or higher", color: "#7dd3fc" },
  { id: "ds_flames", label: "Brasier", labelEn: "Blaze", desc: "10 animés « En cours » en même temps", descEn: "10 anime marked “Watching” at once", color: "#fb923c" },
  { id: "ds_retro", label: "Rétro", labelEn: "Retro", desc: "Perdre 5 fois à un jeu (Wordle ou Poster)", descEn: "Lose 5 times at a game (Wordle or Poster)", color: "#f0abfc" },
  { id: "ds_steampunk", label: "Steampunk", labelEn: "Steampunk", desc: "Créer 5 listes personnalisées", descEn: "Create 5 custom lists", color: "#d6a25a" },
  { id: "ds_prestige", label: "Prestige", labelEn: "Prestige", desc: "Noter 50 animés", descEn: "Rate 50 anime", color: "#fbbf24" },
  { id: "ds_blush", label: "Blushing", labelEn: "Blushing", desc: "Mettre 20 fois un 10/10", descEn: "Give 20 anime a 10/10", color: "#fb7185" },
  { id: "ds_glitch", label: "Glitch", labelEn: "Glitch", desc: "Ouvrir l'appli entre 2h et 5h du matin", descEn: "Open the app between 2 and 5 AM", color: "#22d3ee" },
  { id: "ds_orbit", label: "Orbite", labelEn: "Orbit", desc: "Suivre 10 comptes", descEn: "Follow 10 accounts", color: "#67e8f9" },
  { id: "ds_void", label: "Néant", labelEn: "Void", desc: "Abandonner 10 animés", descEn: "Drop 10 anime", color: "#a78bfa" },
];

const EXTRA_FRAMES = {};
EXTRA_META.forEach((m) => { EXTRA_FRAMES[m.id] = { ...m, category: "fun", animated: true, svg: EXTRA_SVG[m.id] }; });

// Enregistrement dans FRAMES (uniquement appli de bureau) : les écrans qui font FRAMES[id] les retrouvent.
if (isDesktopApp()) Object.assign(FRAMES, EXTRA_FRAMES);

// ── compteurs locaux ─────────────────────────────────────────────────────────
const statKey = (u) => `animood_dstats_${u || "me"}`;
export function readDesktopStats(username) {
  try { return JSON.parse(localStorage.getItem(statKey(username)) || "{}") || {}; } catch { return {}; }
}
export function bumpDesktopStat(username, key, by = 1) {
  if (!isDesktopApp()) return;
  try { const st = readDesktopStats(username); st[key] = (st[key] || 0) + by; localStorage.setItem(statKey(username), JSON.stringify(st)); } catch { /* stockage indisponible */ }
}
export function noteNightOwl(username) {
  if (!isDesktopApp()) return;
  const h = new Date().getHours();
  if (h >= 2 && h < 5) { try { const st = readDesktopStats(username); if (!st.night) { st.night = 1; localStorage.setItem(statKey(username), JSON.stringify(st)); } } catch { /* ignore */ } }
}

// ── déblocage ────────────────────────────────────────────────────────────────
export function getDesktopExtraFrames({ me, followerCount = 0, followingCount = 0, username }) {
  if (!isDesktopApp()) return [];
  const scores = Object.values(me?.ratings || {}).map((r) => r?.score || 0);
  const st = Object.values(me?.statuses || {});
  const n = (x) => st.filter((v) => v === x).length;
  const local = readDesktopStats(username);
  const ok = {
    ds_diamond: followerCount >= 5,
    ds_spell: (me?.customLists || []).length >= 3,
    ds_lightning: scores.filter((v) => v >= 9).length >= 10,
    ds_flames: n("watching") >= 10,
    ds_retro: (local.poster_lost || 0) + (local.wordle_lost || 0) >= 5,
    ds_steampunk: (me?.customLists || []).length >= 5,
    ds_prestige: scores.filter((v) => v > 0).length >= 50,
    ds_blush: scores.filter((v) => v >= 10).length >= 20,
    ds_glitch: !!local.night,
    ds_orbit: followingCount >= 10,
    ds_void: n("dropped") >= 10,
  };

  return EXTRA_META.filter((m) => ok[m.id]).map((m) => EXTRA_FRAMES[m.id]);
}

// ── Point d'entrée : SVG du cadre à afficher ─────────────────────────────────
// Appli de bureau → nouveau design si on en a un ; sinon / site web → SVG d'origine (frames.js).
export function getFrameSvg(frame, size) {
  if (frame && isDesktopApp()) {
    const d = DESKTOP_SVG[frame.id];
    if (d) return d(size);
  }
  return frame.svg(size);
}
