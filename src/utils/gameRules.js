// ─── Règles des jeux à deux (Chain, Timeline) — fonctions pures, sans réseau ─────────────────────────────
// Tout ce qui se calcule (ELO, fin de manche, placement d'une carte, coup de l'IA) est ici, séparé de l'écran :
// c'est ce qui permet de le tester (tests/gameRules.test.mjs) sans navigateur ni base de données.
//
// Les règles de sécurité Supabase (supabase/security_rls_3_integrity.sql, guard_game_elo) refusent plus de ±40 ELO
// par modification et plus de +20 points sur la ligne d'un adversaire : les valeurs ci-dessous restent dedans.

export const ELO_START = 400;
export const ELO_MAX_STEP = 40;
export const FORFEIT_PENALTY = 40;   // celui qui abandonne
export const FORFEIT_BONUS = 5;      // celui qui reste (ELO et points)
export const WIN_POINTS = 20;
export const LOSS_POINTS = 5;
export const DRAW_POINTS = 10;

export const clampEloStep = (d) => Math.max(-ELO_MAX_STEP, Math.min(ELO_MAX_STEP, Math.round(d) || 0));

/** Une salle est classée seulement si elle vient du matchmaking classé : ni IA, ni salle privée. */
export const isRankedRoom = (room) => !!room && room.ranked !== false && !room._isAI && !room.private_code;

// ─── ELO ──────────────────────────────────────────────────────────────────────────────────────────────────
// Chain — même tranche (100 ELO) : 2-0 → +23/−22, 2-1 → +20/−18 ; tranches différentes : le plus fort gagne +10 / perd −30,
// le plus faible gagne +30 / perd −10.
export function calcChainElo(eloA, eloB, resultA, score) {
  const sameBracket = Math.floor(eloA / 100) === Math.floor(eloB / 100);
  if (resultA === 1) return sameBracket ? (score === "2-0" ? 23 : 20) : (eloA > eloB ? 10 : 30);
  if (resultA === 0) return sameBracket ? (score === "2-0" ? -22 : -18) : (eloA > eloB ? -30 : -10);
  return 0;
}

// Timeline — même tranche : ±20 ; tranches différentes : le plus fort gagne +15 / perd −25, le plus faible +25 / −15.
export function calcTimelineElo(eloA, eloB, resultA) {
  const sameBracket = Math.floor(eloA / 100) === Math.floor(eloB / 100);
  if (resultA === 1) return sameBracket ? 20 : (eloA > eloB ? 15 : 25);
  if (resultA === 0) return sameBracket ? -20 : (eloA > eloB ? -25 : -15);
  return 0;
}

/** Bilan d'une partie de Chain terminée normalement : variation d'ELO et points des deux joueurs. */
export function chainGameOutcome(room, winner, scores) {
  const elo1 = room.elo1 || ELO_START, elo2 = room.elo2 || ELO_START;
  const p1Won = winner === room.player1, p2Won = winner === room.player2;
  const score = Math.min(scores[0], scores[1]) === 0 ? "2-0" : "2-1";
  return {
    delta1: clampEloStep(calcChainElo(elo1, elo2, p1Won ? 1 : p2Won ? 0 : 0.5, score)),
    delta2: clampEloStep(calcChainElo(elo2, elo1, p2Won ? 1 : p1Won ? 0 : 0.5, score)),
    pts1: p1Won ? WIN_POINTS : LOSS_POINTS,
    pts2: p2Won ? WIN_POINTS : LOSS_POINTS,
  };
}

/** Bilan d'une partie de Timeline terminée normalement (winner = null et isDraw = true pour une égalité). */
export function timelineGameOutcome(room, winner, isDraw) {
  const elo1 = room.elo1 || ELO_START, elo2 = room.elo2 || ELO_START;
  const p1Won = !isDraw && winner === room.player1, p2Won = !isDraw && winner === room.player2;
  return {
    delta1: clampEloStep(calcTimelineElo(elo1, elo2, p1Won ? 1 : isDraw ? 0.5 : 0)),
    delta2: clampEloStep(calcTimelineElo(elo2, elo1, p2Won ? 1 : isDraw ? 0.5 : 0)),
    pts1: p1Won ? WIN_POINTS : isDraw ? DRAW_POINTS : LOSS_POINTS,
    pts2: p2Won ? WIN_POINTS : isDraw ? DRAW_POINTS : LOSS_POINTS,
  };
}

// ─── CHAIN ────────────────────────────────────────────────────────────────────────────────────────────────
const names = (list) => (list || []).map((x) => (x && x.name) || x);

/** Le lien demandé unit-il ces deux animés ? « studio » : même studio mais pas le même ensemble de genres ;
 *  « genre » : au moins un genre commun mais pas le même ensemble de studios. */
export function isChainLinkValid(current, guess, linkType) {
  if (!current || !guess || !linkType) return false;
  const cs = names(current.studios), cg = names(current.genres);
  const gs = names(guess.studios),   gg = names(guess.genres);
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  if (linkType === "studio") return cs.some((s) => gs.includes(s)) && !sameSet(cg, gg);
  return cg.some((g) => gg.includes(g)) && !sameSet(cs, gs);
}

/** Type de lien que doit jouer le joueur dont c'est le tour : celui qui a choisi joue son choix, l'autre l'inverse. */
export function chainLinkForTurn(state) {
  if (!state.linkType) return null;
  return state.turn === state.chooser ? state.linkType : (state.linkType === "studio" ? "genre" : "studio");
}

/** Manche perdue par `loser` (temps écoulé, plus de coup possible…). Renvoie la suite : fin de partie ou manche suivante. */
export function chainAfterRoundLoss(state, loser, room) {
  const p1 = room.player1, p2 = room.player2;
  const winnerOfRound = loser === p1 ? p2 : p1;
  const scores = [...state.scores];
  scores[winnerOfRound === p1 ? 0 : 1] += 1;
  const round = state.round + 1;
  const over = scores[0] >= 2 || scores[1] >= 2 || round > 3;
  if (over) {
    return { over: true, scores, winner: scores[0] > scores[1] ? p1 : scores[1] > scores[0] ? p2 : null };
  }
  // Manche 2 : le joueur 2 choisit le type de lien ; manche 3 : le mieux classé (à égalité, le joueur 1).
  const e1 = room.elo1 || ELO_START, e2 = room.elo2 || ELO_START;
  const chooser = round === 2 ? p2 : e1 !== e2 ? (e1 > e2 ? p1 : p2) : p1;
  return { over: false, scores, round, chooser };
}

/** Coup de l'IA : un animé valide non encore utilisé, parmi les 20 premiers candidats ; null s'il n'y en a pas. */
export function chainAiPick(state, pool, rand = Math.random) {
  const linkType = chainLinkForTurn(state);
  const used = new Set((state.chain || []).map((a) => a.mal_id));
  const candidates = pool.filter((a) => !used.has(a.mal_id) && isChainLinkValid(state.currentAnime, a, linkType));
  if (!candidates.length) return null;
  return candidates[Math.floor(rand() * Math.min(candidates.length, 20))];
}

// ─── TIMELINE ─────────────────────────────────────────────────────────────────────────────────────────────
export const TIMELINE_HAND = 5;

const yearOf = (a) => (a && Number.isFinite(+a.year) && +a.year > 0 ? +a.year : null);
export const isTimelineOrdered = (list) => list.every((a, i) => i === 0 || (yearOf(a) ?? 0) >= (yearOf(list[i - 1]) ?? 0));

/** Distribution : 1 carte posée, puis 5 cartes pour chaque joueur. `rows` = animés avec une année connue. */
export function dealTimeline(rows, p1, rand = Math.random) {
  const pool = rows.filter((a) => yearOf(a) !== null);
  if (pool.length < 1 + TIMELINE_HAND * 2) return null;
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } // Fisher-Yates
  const picks = a.slice(0, 1 + TIMELINE_HAND * 2);
  return {
    timeline: [picks[0]],
    hand1: picks.slice(1, 1 + TIMELINE_HAND),
    hand2: picks.slice(1 + TIMELINE_HAND),
    placed1: 0, placed2: 0,
    currentTurn: p1, phase: "play", winner: null, isDraw: false, skipped: null, lastChance: false,
  };
}

/** Positions (0..n) où la carte garde la frise triée par année. */
export function timelineSlots(timeline, card) {
  const ok = [], bad = [];
  for (let i = 0; i <= timeline.length; i++) {
    const t = [...timeline]; t.splice(i, 0, card);
    (isTimelineOrdered(t) ? ok : bad).push(i);
  }
  return { ok, bad };
}

/**
 * Un joueur pose une carte de sa main à la position `pos`.
 *  • bonne position : la carte quitte sa main (et compte pour 1) ; mauvaise : elle reste en main et le tour passe.
 *  • le premier à poser ses 5 cartes gagne. Le joueur 1 jouant en premier, si c'est lui qui finit, le joueur 2 a un
 *    dernier tour pour égaliser (seulement s'il lui reste une seule carte) ; s'il réussit : égalité, sinon le joueur 1 gagne.
 *    Si le joueur 2 finit le premier (le joueur 1 ayant eu autant de tours), il gagne.
 * Renvoie { state, ignored, valid, ended }.
 */
export function timelineMove(state, { by, cardId, pos, p1, p2 }) {
  if (!state || state.phase !== "play" || state.currentTurn !== by || (by !== p1 && by !== p2)) return { state, ignored: true };
  const isP1 = by === p1;
  const hand = isP1 ? state.hand1 : state.hand2;
  const card = hand.find((c) => c.mal_id === cardId);
  if (!card) return { state, ignored: true };

  const tl = [...state.timeline];
  tl.splice(Math.max(0, Math.min(pos, tl.length)), 0, card);
  const valid = isTimelineOrdered(tl);

  const next = { ...state, currentTurn: isP1 ? p2 : p1, skipped: valid ? null : by };
  if (valid) {
    next.timeline = tl;
    if (isP1) { next.hand1 = hand.filter((c) => c.mal_id !== cardId); next.placed1 = state.placed1 + 1; }
    else      { next.hand2 = hand.filter((c) => c.mal_id !== cardId); next.placed2 = state.placed2 + 1; }
  }

  const done1 = next.placed1 >= TIMELINE_HAND, done2 = next.placed2 >= TIMELINE_HAND;
  let ended = false, winner = null, isDraw = false;
  if (isP1) {
    if (valid && done1) {
      if (next.placed2 >= TIMELINE_HAND - 1) next.lastChance = true;  // le joueur 2 peut encore égaliser
      else { ended = true; winner = p1; }
    }
  } else if (valid && done2) {
    ended = true;
    if (done1) isDraw = true; else winner = p2;
  } else if (done1) {                                                   // dernier tour du joueur 2 manqué
    ended = true; winner = p1;
  }
  if (ended) { next.phase = "gameEnd"; next.winner = winner; next.isDraw = isDraw; next.currentTurn = null; }
  return { state: next, valid, ended };
}

/** Coup de l'IA (toujours sa 1re carte). `failRate` : probabilité de se tromper volontairement quand c'est possible. */
export function timelineAiMove(state, { ai, p1, p2, failRate = 0.15, rand = Math.random }) {
  const hand = ai === p1 ? state.hand1 : state.hand2;
  const card = hand[0];
  if (!card) return { state, ignored: true };
  const { ok, bad } = timelineSlots(state.timeline, card);
  const fail = bad.length > 0 && rand() < failRate;
  const choices = fail ? bad : ok;
  const pos = choices[Math.floor(rand() * choices.length)];
  return timelineMove(state, { by: ai, cardId: card.mal_id, pos, p1, p2 });
}

// ─── CLUESCALE ────────────────────────────────────────────────────────────────────────────────────────────
export const CLUESCALE_EXACT_PTS = 3, CLUESCALE_CLOSE_PTS = 1, CLUESCALE_JUDGE_PTS = 2;

/** Points d'une manche : jury exact +3, à 1 près +1 ; le juge gagne +2 si au moins un juré a trouvé (exact ou à 1 près).
 *  Les jurés qui n'ont pas voté (absents) ne rapportent rien. Renvoie de nouveaux scores (l'entrée n'est pas modifiée). */
export function cluescaleScoreRound({ players, judge, answer, guesses, scores }) {
  const next = { ...scores };
  let judgeScores = false;
  for (const p of players) {
    if (p === judge) continue;
    const g = guesses?.[p];
    if (g === undefined || g === null) continue;
    const diff = Math.abs(Number(g) - answer);
    if (diff === 0) { next[p] = (next[p] || 0) + CLUESCALE_EXACT_PTS; judgeScores = true; }
    else if (diff === 1) { next[p] = (next[p] || 0) + CLUESCALE_CLOSE_PTS; judgeScores = true; }
  }
  if (judgeScores) next[judge] = (next[judge] || 0) + CLUESCALE_JUDGE_PTS;
  return next;
}

/** Points « classement » gagnés par le vainqueur d'un Cluescale : 3 par point d'avance sur le second (0 en cas d'égalité). */
export function cluescaleWinnerPoints(scores) {
  const sorted = Object.entries(scores || {}).sort((a, b) => b[1] - a[1]);
  if (sorted.length < 2) return { winner: null, earned: 0 };
  const [[winner, w], [, second]] = sorted;
  return { winner, earned: Math.max(0, (w - second) * 3) };
}
