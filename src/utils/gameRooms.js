// ─── Salles de jeu (game_rooms) : rejoindre, terminer, ELO — accès réseau partagé par tous les écrans ─────────
// Principe : chaque changement important est une « prise de place » atomique côté base (un PATCH filtré sur l'état
// attendu, qui renvoie la ligne modifiée ou rien). Deux joueurs qui cliquent en même temps ne peuvent donc jamais
// prendre la même place, et une partie ne peut être terminée (donc l'ELO appliqué) qu'une seule fois.

import { sb } from "../api/supabase.js";
import { ELO_START, clampEloStep } from "./gameRules.js";
import { makeSettler } from "./gameSettle.js";
import { makeRoomTx } from "./roomTx.js";
import { awardPoints } from "./awardPoints.js";
import { isDesktopApp } from "./streamingLinks.js";

export const RANKED_FRESH_MS  = 25_000;   // salle classée en attente : l'hôte la « réveille » toutes les 2 s
export const PRIVATE_FRESH_MS = 90_000;   // salle privée en attente : toutes les 5 s
export const HEARTBEAT_RANKED_MS  = 2_000;
export const HEARTBEAT_PRIVATE_MS = 5_000;

export const agoIso = (ms) => new Date(Date.now() - ms).toISOString();
const REP = () => ({ ...sb.headers, Prefer: "return=representation" });
const MIN = () => ({ ...sb.headers, Prefer: "return=minimal" });

// Code de salle : 5 caractères sans 0/O/1/I/L (faciles à confondre à l'oral).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newRoomCode() {
  const buf = new Uint32Array(5);
  (globalThis.crypto || window.crypto).getRandomValues(buf);
  return Array.from(buf, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join("");
}
export const cleanRoomCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export const roomPlayers = (r) => [r?.player1, r?.player2, r?.player3, r?.player4].filter(Boolean);

// ─── Rejoindre ────────────────────────────────────────────────────────────────────────────────────────────
/** Prend la place de joueur 2 d'une salle encore libre. Renvoie la salle mise à jour, ou null si quelqu'un l'a prise avant. */
export async function claimSeat(roomId, patch) {
  const rows = await sb.query(`game_rooms?id=eq.${encodeURIComponent(roomId)}&status=eq.waiting&player2=is.null`, {
    method: "PATCH", headers: REP(),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  }).catch(() => null);
  return rows?.[0] || null;
}

/** Rejoint une salle privée Chain/Timeline avec son code. { ok:true, room } ou { ok:false, reason: invalid | own | taken }. */
export async function joinPrivateRoom({ code, roomId = null, gameType, me }) {
  const c = cleanRoomCode(code);
  if (!c) return { ok: false, reason: "invalid" };
  const byId = roomId ? `&id=eq.${encodeURIComponent(roomId)}` : "";
  const rows = await sb.query(
    `game_rooms?private_code=eq.${c}&status=eq.waiting&game_type=eq.${encodeURIComponent(gameType)}${byId}` +
    `&updated_at=gte.${encodeURIComponent(agoIso(PRIVATE_FRESH_MS))}&limit=1`
  ).catch(() => []);
  const room = rows?.[0];
  if (!room) return { ok: false, reason: "invalid" };
  if (room.player1 === me) return { ok: false, reason: "own" };
  const claimed = await claimSeat(room.id, { player2: me, elo2: ELO_START, status: "active" });
  return claimed ? { ok: true, room: claimed } : { ok: false, reason: "taken" };
}

/** Jeux « salon » (plusieurs joueurs, l'hôte lance la partie) : nombre maximum de places (player1 à player4). */
export const MULTI_MAX = { cluescale: 4, undercover: 4 };
export const isMultiGame = (gameType) => gameType in MULTI_MAX;

/** Rejoint un salon (Cluescale, Imposteur en ligne : 2 à 4 joueurs). Relit la salle à chaque essai : si deux invités arrivent en
 *  même temps, le second prend simplement la place suivante. */
export async function joinMultiRoom({ gameType, me, roomId = null, code = null }) {
  const max = MULTI_MAX[gameType] || 4;
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = await sb.query(
      roomId
        ? `game_rooms?id=eq.${encodeURIComponent(roomId)}&game_type=eq.${encodeURIComponent(gameType)}&limit=1`
        : `game_rooms?private_code=eq.${cleanRoomCode(code)}&game_type=eq.${encodeURIComponent(gameType)}&status=eq.waiting` +
          `&updated_at=gte.${encodeURIComponent(agoIso(PRIVATE_FRESH_MS))}&limit=1`
    ).catch(() => []);
    const r = rows?.[0];
    if (!r) return { ok: false, reason: "invalid" };
    const players = roomPlayers(r);
    if (players.includes(me)) return { ok: true, room: { ...r, players } };            // déjà dedans
    if (r.status !== "waiting") return { ok: false, reason: "started" };
    if (players.length >= max) return { ok: false, reason: "full" };
    const seat = ["player2", "player3", "player4"].find((k) => !r[k]);
    if (!seat) return { ok: false, reason: "full" };
    const newPlayers = [...players, me];
    const updated = await sb.query(
      `game_rooms?id=eq.${encodeURIComponent(r.id)}&status=eq.waiting&${seat}=is.null`, {
        method: "PATCH", headers: REP(),
        body: JSON.stringify({ [seat]: me, state: { ...(r.state || {}), players: newPlayers }, updated_at: new Date().toISOString() }),
      }).catch(() => null);
    if (updated?.[0]) return { ok: true, room: { ...updated[0], players: roomPlayers(updated[0]) } };
    // place prise entre-temps : on relit et on réessaie
  }
  return { ok: false, reason: "busy" };
}
export const joinCluescaleRoom = (args) => joinMultiRoom({ gameType: "cluescale", ...args });

/** Crée un salon privé (en attente) pour un jeu à plusieurs. Renvoie { room, code } ou null si le réseau a échoué. */
export async function createMultiRoom({ gameType, me }) {
  await deleteMyWaitingRooms(me, gameType);                 // anciennes salles restées ouvertes
  const code = newRoomCode();
  const created = await sb.query("game_rooms", {
    method: "POST", headers: REP(),
    body: JSON.stringify({
      game_type: gameType, player1: me, status: "waiting", ranked: false, private_code: code,
      state: { players: [me] }, updated_at: new Date().toISOString(),
    }),
  }).catch(() => null);
  return created?.[0] ? { room: created[0], code } : null;
}

/** Accepte une invitation reçue dans la cloche. Mêmes réponses que les fonctions ci-dessus.
 *  L'Imposteur en ligne n'existe que dans l'application de bureau : sur le site, on ne prend pas de place pour rien. */
export function joinFromInvite({ gameType, roomId, privateCode, me }) {
  if (gameType === "undercover" && !isDesktopApp()) return Promise.resolve({ ok: false, reason: "unsupported" });
  return isMultiGame(gameType)
    ? joinMultiRoom({ gameType, me, roomId })
    : joinPrivateRoom({ code: privateCode, roomId, gameType, me });
}

export const JOIN_ERRORS = {
  fr: {
    invalid: "Cette partie n'existe plus (l'hôte a quitté ou le code est faux).",
    own:     "C'est ta propre salle : partage le code à un ami.",
    taken:   "Quelqu'un d'autre vient de rejoindre cette partie.",
    started: "Cette partie a déjà commencé.",
    full:    "Cette salle est complète (4 joueurs maximum).",
    busy:    "Salle très demandée — réessaie dans un instant.",
    unsupported: "Cette partie se joue dans l'application AniMood pour ordinateur.",
    inGame:  "Tu es déjà dans une partie : termine-la (ou quitte-la) avant d'en rejoindre une autre.",
  },
  en: {
    invalid: "This game no longer exists (the host left or the code is wrong).",
    own:     "That's your own room: share the code with a friend.",
    taken:   "Someone else just joined this game.",
    started: "This game has already started.",
    full:    "This room is full (4 players maximum).",
    busy:    "This room is busy — try again in a moment.",
    unsupported: "This game is played in the AniMood desktop app.",
    inGame:  "You're already in a game: finish or leave it before joining another one.",
  },
};
export const joinErrorText = (reason, lang) => (JOIN_ERRORS[lang] || JOIN_ERRORS.fr)[reason] || JOIN_ERRORS.fr.invalid;

// ─── Salle en attente : garder en vie / supprimer ───────────────────────────────────────────────────────────
export const heartbeatRoom = (roomId) =>
  sb.query(`game_rooms?id=eq.${encodeURIComponent(roomId)}&status=eq.waiting`, {
    method: "PATCH", headers: MIN(), body: JSON.stringify({ updated_at: new Date().toISOString() }),
  }).catch(() => {});

export const deleteWaitingRoom = (roomId) =>
  sb.query(`game_rooms?id=eq.${encodeURIComponent(roomId)}&status=eq.waiting`, { method: "DELETE" }).catch(() => {});

/** Supprime mes anciennes salles restées « en attente » (onglet fermé, plantage…). */
export const deleteMyWaitingRooms = (me, gameType = null) =>
  sb.query(`game_rooms?player1=eq.${encodeURIComponent(me)}&status=eq.waiting${gameType ? `&game_type=eq.${encodeURIComponent(gameType)}` : ""}`, { method: "DELETE" }).catch(() => {});

// ─── Terminer une partie : une seule fois ─────────────────────────────────────────────────────────────────────
/** Passe la salle de « active » à « finished ». Renvoie la salle si CE client a terminé la partie, null si c'était déjà fait.
 *  Seul celui qui reçoit la salle applique l'ELO : impossible de le faire deux fois, même si les deux joueurs détectent la fin. */
export async function claimFinish(roomId, body = {}) {
  const rows = await sb.query(`game_rooms?id=eq.${encodeURIComponent(roomId)}&status=eq.active`, {
    method: "PATCH", headers: REP(),
    body: JSON.stringify({ ...body, status: "finished", updated_at: new Date().toISOString() }),
  }).catch(() => null);
  return rows?.[0] || null;
}

/** Comme claimFinish, mais distingue « perdu la course » de « réseau coupé » et réessaie en cas de coupure.
 *  { ok:true, row } = CE client a terminé la partie ; { ok:false, lost:true } = quelqu'un l'avait déjà terminée ; { ok:false, error }. */
export async function finishRoom(roomId, body = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const rows = await sb.query(`game_rooms?id=eq.${encodeURIComponent(roomId)}&status=eq.active`, {
        method: "PATCH", headers: REP(),
        body: JSON.stringify({ ...body, status: "finished", updated_at: new Date().toISOString() }),
      });
      return rows?.[0] ? { ok: true, row: rows[0] } : { ok: false, lost: true };
    } catch (e) {
      lastErr = e;
      if (/"code"\s*:\s*"42501"/.test(String(e?.message))) break;       // refus de sécurité : inutile de réessayer
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return { ok: false, error: String(lastErr?.message || lastErr || "réseau").slice(0, 160) };
}

/** Une salle (état, statut, vainqueur) ou null. */
export const readRoom = (roomId) =>
  sb.query(`game_rooms?id=eq.${encodeURIComponent(roomId)}&select=state,status,winner&limit=1`).then((r) => r?.[0] || null);

// ─── Écriture simultanée de plusieurs joueurs dans l'état d'une salle (voir roomTx.js) ─────────────────────────────
const tx = makeRoomTx({ db: sb });
/** roomTx(roomId, mutate, { patch }) → { ok:true, state } | { ok:false, reason: gone | closed | refused | contended | network } */
export const roomTx = tx.roomTx;

/** Ajoute `amount` points à MA ligne (colonne pts_cluescale / pts_undercover + total). → { ok, added } | { ok:false, error } */
export const addGamePoints = (user, column, amount) => awardPoints({ db: sb, user, column, amount });

// ─── Enregistrement des points / de l'ELO (voir gameSettle.js) ───────────────────────────────────────────────────
const settler = makeSettler({ db: sb });
/** Enregistre `users` ({ pseudo: ligne }) pour une partie terminée ; renvoie { [pseudo]: { ok, … } } (jamais d'exception). */
export const settleDuel = (args) => settler.settle(args);

// ─── ELO / points ───────────────────────────────────────────────────────────────────────────────────────────
export async function getOrCreateElo(username) {
  const rows = await sb.query(`game_elo?username=eq.${encodeURIComponent(username)}&limit=1`).catch(() => []);
  if (rows?.[0]) return rows[0];
  await sb.query("game_elo", {
    method: "POST",
    headers: { ...sb.headers, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ username, elo_chain: ELO_START, elo_timeline: ELO_START, points_total: 0 }),
  }).catch(() => {});
  return { username, elo_chain: ELO_START, elo_timeline: ELO_START, points_total: 0 };
}

/** Ajoute `delta` (borné à ±40, limite du serveur) à l'ELO du jeu et `pointsDelta` (≥ 0) aux points. */
export async function updateElo(username, field, delta, pointsDelta = 0) {
  const row = await getOrCreateElo(username);
  const newElo = Math.max(0, (row[field] || ELO_START) + clampEloStep(delta));
  await sb.query(`game_elo?username=eq.${encodeURIComponent(username)}`, {
    method: "PATCH", headers: MIN(),
    body: JSON.stringify({
      [field]: newElo,
      points_total: Math.max(0, (row.points_total || 0) + Math.max(0, pointsDelta)),
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => {});
  return newElo;
}
