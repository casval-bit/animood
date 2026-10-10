// ─── CADRES DE PROFIL ANIMÉS — COMMUNS AU SITE WEB ET À L'APPLI DE BUREAU ─────────────────────────────────────
// Tous les cadres (27 d'origine + les cadres « effets ») utilisent les dessins animés de framesDesktopArt.js,
// sur le site web comme sur l'appli de bureau. Le cadre choisi est enregistré dans le profil (active_frame).
// Certains déblocages dépendent de compteurs locaux à l'appli de bureau (installation, jeux perdus, ouverture de nuit) :
// ils sont recopiés dans profiles.frame_flags (supabase/profile_frame_flags.sql) pour que le site les voie aussi.

import { isDesktopApp } from "../utils/streamingLinks.js";
import { sb } from "../api/supabase.js";
import { FRAMES } from "./frames.js";
import { ART } from "./framesDesktopArt.js";

export const DESKTOP_SVG = ART;

const EXTRA_META = [
  { id: "ds_diamond", label: "Losange", labelEn: "Diamond", desc: "Avoir 5 abonnés", descEn: "Have 5 followers", color: "#a5b4fc" },
  { id: "ds_spell", label: "Sortilège", labelEn: "Spell", desc: "Créer 3 listes personnalisées", descEn: "Create 3 custom lists", color: "#c084fc" },
  { id: "ds_lightning", label: "Foudre", labelEn: "Lightning", desc: "Mettre 10 notes de 9/10 ou plus", descEn: "Give 10 ratings of 9/10 or higher", color: "#7dd3fc" },
  { id: "ds_flames", label: "Brasier", labelEn: "Blaze", desc: "10 animés « En cours » en même temps", descEn: "10 anime marked “Watching” at once", color: "#fb923c" },
  { id: "ds_retro", label: "Rétro", labelEn: "Retro", desc: "Perdre 5 fois à un jeu (Wordle ou Poster) — appli de bureau", descEn: "Lose 5 times at a game (Wordle or Poster) — desktop app", color: "#f0abfc" },
  { id: "ds_steampunk", label: "Steampunk", labelEn: "Steampunk", desc: "Créer 5 listes personnalisées", descEn: "Create 5 custom lists", color: "#d6a25a" },
  { id: "ds_prestige", label: "Prestige", labelEn: "Prestige", desc: "Noter 50 animés", descEn: "Rate 50 anime", color: "#fbbf24" },
  { id: "ds_blush", label: "Blushing", labelEn: "Blushing", desc: "Mettre 20 fois un 10/10", descEn: "Give 20 anime a 10/10", color: "#fb7185" },
  { id: "ds_glitch", label: "Glitch", labelEn: "Glitch", desc: "Ouvrir l'appli de bureau entre 2h et 5h du matin", descEn: "Open the desktop app between 2 and 5 AM", color: "#22d3ee" },
  { id: "ds_orbit", label: "Orbite", labelEn: "Orbit", desc: "Suivre 10 comptes", descEn: "Follow 10 accounts", color: "#67e8f9" },
  { id: "ds_void", label: "Néant", labelEn: "Void", desc: "Abandonner 10 animés", descEn: "Drop 10 anime", color: "#a78bfa" },
  { id: "ds_desktop", label: "Bureau", labelEn: "Desktop", desc: "Installer l'appli de bureau AniMood et l'ouvrir une fois", descEn: "Install the AniMood desktop app and open it once", color: "#38bdf8" },
  { id: "ds_sakura", label: "Sakura", labelEn: "Sakura", desc: "Avoir 20 animés dans « À regarder »", descEn: "Have 20 anime in “Plan to Watch”", color: "#f9a8d4" },
  { id: "ds_star", label: "Étoile", labelEn: "Star", desc: "Noter 100 animés", descEn: "Rate 100 anime", color: "#fcd34d" },
  { id: "ds_ice", label: "Givre", labelEn: "Frost", desc: "Mettre 5 animés en pause (On-Hold)", descEn: "Put 5 anime On-Hold", color: "#67e8f9" },
  { id: "ds_moon", label: "Lune", labelEn: "Moon", desc: "Terminer 30 animés (Completed)", descEn: "Complete 30 anime", color: "#fde68a" },
];

const EXTRA_FRAMES = {};
EXTRA_META.forEach((m) => { EXTRA_FRAMES[m.id] = { ...m, category: "fun", animated: true, svg: ART[m.id] }; });

// Enregistrement dans FRAMES (web + bureau) : les écrans qui font FRAMES[id] les retrouvent.
Object.assign(FRAMES, EXTRA_FRAMES);

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

// ── drapeaux partagés (profiles.frame_flags) ─────────────────────────────────
// Bureau : on ajoute « desktop », « night » et « lost » (jeux perdus) depuis les compteurs locaux, puis on les envoie.
// Web : on lit seulement. Sans la colonne SQL, le bureau garde ses drapeaux en local et le web n'a rien.
export async function loadFrameFlags(username) {
  if (!username) return {};
  let remote = {}, hasCol = true;
  try {
    const rows = await sb.query(`profiles?username=eq.${encodeURIComponent(username)}&select=frame_flags&limit=1`);
    const row = rows?.[0];
    if (row && "frame_flags" in row) remote = row.frame_flags && typeof row.frame_flags === "object" ? row.frame_flags : {};
    else if (row) hasCol = false;
  } catch { hasCol = false; }
  if (!isDesktopApp()) return remote;
  const local = readDesktopStats(username);
  const merged = { ...remote, desktop: true };
  if (local.night) merged.night = true;
  const lost = (local.poster_lost || 0) + (local.wordle_lost || 0);
  if (lost > (merged.lost || 0)) merged.lost = lost;
  if (hasCol && JSON.stringify(merged) !== JSON.stringify(remote)) {
    sb.query(`profiles?username=eq.${encodeURIComponent(username)}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ frame_flags: merged }),
    }).catch(() => {});
  }
  return merged;
}

// ── déblocage ────────────────────────────────────────────────────────────────
export function getExtraFrames({ me, followerCount = 0, followingCount = 0, flags = {} }) {
  const scores = Object.values(me?.ratings || {}).map((r) => r?.score || 0);
  const st = Object.values(me?.statuses || {});
  const n = (x) => st.filter((v) => v === x).length;
  const ok = {
    ds_diamond: followerCount >= 5,
    ds_spell: (me?.customLists || []).length >= 3,
    ds_lightning: scores.filter((v) => v >= 9).length >= 10,
    ds_flames: n("watching") >= 10,
    ds_retro: (flags.lost || 0) >= 5,
    ds_steampunk: (me?.customLists || []).length >= 5,
    ds_prestige: scores.filter((v) => v > 0).length >= 50,
    ds_blush: scores.filter((v) => v >= 10).length >= 20,
    ds_glitch: !!flags.night,
    ds_orbit: followingCount >= 10,
    ds_void: n("dropped") >= 10,
    ds_desktop: !!flags.desktop,
    ds_sakura: n("watchlist") >= 20,
    ds_star: scores.filter((v) => v > 0).length >= 100,
    ds_ice: n("onhold") >= 5,
    ds_moon: n("completed") >= 30,
  };
  return EXTRA_META.filter((m) => ok[m.id]).map((m) => EXTRA_FRAMES[m.id]);
}

// ── Point d'entrée : SVG du cadre à afficher (web + bureau) ──────────────────
export function getFrameSvg(frame, size) {
  const d = frame && DESKTOP_SVG[frame.id];
  return d ? d(size) : frame.svg(size);
}
