// ─── Imposteur en ligne : règles de la partie, fonctions pures (état de la salle → nouvel état) ─────────────────
// Chaque fonction reçoit l'état de la salle et renvoie le nouvel état, ou null si l'action n'a pas de sens (pas son tour, déjà
// fait, mauvaise phase) — elles servent à roomTx(), qui les rejoue tant que deux joueurs écrivent en même temps.
// Phases : reveal (chacun découvre son rôle) → clues (indices à tour de rôle) → vote → guess (l'imposteur démasqué tente le mot)
// → result. Les points : undercoverPoints() (undercoverRules.js).

import { tallyVotes, isGuessCorrect, isClueForbidden, undercoverPoints } from "./undercoverRules.js";

export const UC_ROUNDS = 2;
export const UC_GUESS_MS = 30_000;
export const UC_MIN_ONLINE = 3;

/** État de départ : l'hôte tire le mot et l'imposteur. `entry` = { word, aliases?, hint: {fr,en} }. */
export function ucInit({ users, entry, lang = "fr", rand = Math.random }) {
  const imp = Math.floor(rand() * users.length);
  return {
    v: 0, kind: "undercover", phase: "reveal",
    players: users.map((username, i) => ({
      username, isImpostor: i === imp,
      word: i === imp ? null : entry.word,
      hint: i === imp ? (entry.hint?.[lang] || entry.hint?.fr || "") : null,
    })),
    entry: { word: entry.word, aliases: entry.aliases || [] },
    ready: {}, clues: [], votes: {}, guessDeadline: null, guess: null, result: null,
  };
}

const names = (s) => s.players.map((p) => p.username);
const isIn = (s, u) => s.players.some((p) => p.username === u);

export const ucImpostor = (s) => s.players.find((p) => p.isImpostor);
/** Joueur dont c'est le tour de donner un indice. */
export const ucCurrent = (s) => s.players[s.clues.length % s.players.length];
export const ucTotalClues = (s) => s.players.length * UC_ROUNDS;

/** Chacun confirme avoir retenu son rôle ; le dernier lance les indices. */
export function ucReady(s, user) {
  if (!s || s.phase !== "reveal" || !isIn(s, user) || s.ready?.[user]) return null;
  const ready = { ...(s.ready || {}), [user]: true };
  return { ...s, ready, phase: names(s).every((u) => ready[u]) ? "clues" : "reveal" };
}

/** Indice du joueur dont c'est le tour. Renvoie { state } ou { error: "turn" | "empty" | "forbidden" } (ou null si hors phase). */
export function ucClue(s, user, word) {
  if (!s || s.phase !== "clues") return null;
  if (ucCurrent(s).username !== user) return { error: "turn" };
  const w = String(word || "").trim().slice(0, 30);
  if (!w) return { error: "empty" };
  const me = ucCurrent(s);
  if (!me.isImpostor && isClueForbidden(w, s.entry)) return { error: "forbidden" };   // l'imposteur ne connaît pas le mot : jamais bloqué
  const clues = [...s.clues, { username: user, word: w }];
  return { state: { ...s, clues, phase: clues.length >= ucTotalClues(s) ? "vote" : "clues" } };
}

/** Passe le tour d'un joueur absent (n'importe qui peut le demander quand la partie est restée immobile). */
export function ucSkip(s) {
  if (!s || s.phase !== "clues") return null;
  const clues = [...s.clues, { username: ucCurrent(s).username, word: "—", skipped: true }];
  return { ...s, clues, phase: clues.length >= ucTotalClues(s) ? "vote" : "clues" };
}

function finalize(s, impostorFound, impostorGuessed, extra = {}) {
  return { ...s, phase: "result", guessDeadline: null, result: { impostorFound, impostorGuessed, pts: undercoverPoints(s.players, impostorFound, impostorGuessed), ...extra } };
}

/** Vote d'un joueur (on ne vote pas pour soi) ; le dernier vote ouvre la dernière chance de l'imposteur ou clôt la partie. */
export function ucVote(s, voter, suspect, now = Date.now()) {
  if (!s || s.phase !== "vote" || !isIn(s, voter) || !isIn(s, suspect) || voter === suspect || s.votes?.[voter]) return null;
  const votes = { ...(s.votes || {}), [voter]: suspect };
  if (!names(s).every((u) => votes[u])) return { ...s, votes };
  const found = tallyVotes(votes, ucImpostor(s).username).impostorFound;
  return found ? { ...s, votes, phase: "guess", guessDeadline: now + UC_GUESS_MS } : finalize({ ...s, votes }, false, false);
}

/** Tentative de l'imposteur démasqué. */
export function ucGuess(s, user, text) {
  if (!s || s.phase !== "guess" || ucImpostor(s).username !== user) return null;
  return finalize({ ...s, guess: String(text || "").slice(0, 60) }, true, isGuessCorrect(text, s.entry));
}

/** Temps écoulé pour l'imposteur (n'importe qui peut le constater ; la salle n'accepte qu'une écriture). */
export function ucGuessTimeout(s, now = Date.now()) {
  if (!s || s.phase !== "guess" || !s.guessDeadline || now < s.guessDeadline) return null;
  return finalize(s, true, false);
}

/** Partie interrompue (un joueur est parti) : aucun point. */
export function ucAbort(s) {
  if (!s || s.phase === "result") return null;
  return { ...s, phase: "result", guessDeadline: null, result: { impostorFound: false, impostorGuessed: false, pts: {}, aborted: true } };
}

/** Qui doit agir maintenant (pour les messages « en attente de… ») : liste de pseudos. */
export function ucWaitingFor(s) {
  if (!s) return [];
  if (s.phase === "reveal") return names(s).filter((u) => !s.ready?.[u]);
  if (s.phase === "clues") return [ucCurrent(s).username];
  if (s.phase === "vote") return names(s).filter((u) => !s.votes?.[u]);
  if (s.phase === "guess") return [ucImpostor(s).username];
  return [];
}
