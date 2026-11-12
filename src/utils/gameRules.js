// ─── Règles des jeux à deux (Chain, Timeline) — fonctions pures, sans réseau ─────────────────────────────
// Tout ce qui se calcule (ELO, points, fin de manche, placement d'une carte, coups de l'IA) est ici, séparé de l'écran :
// c'est ce qui permet de le tester (tests/gameRules.test.mjs) sans navigateur ni base de données.
//
// Les règles de sécurité Supabase (supabase/security_rls_3_integrity.sql, guard_game_elo) refusent plus de ±40 ELO
// par modification et plus de +20 points sur la ligne d'un adversaire : les valeurs ci-dessous restent dedans.
//
// Ce que rapporte une partie (duelResult) :
//   • classée (matchmaking)  : ELO selon l'écart de niveau + points (victoire 20, défaite 5, égalité 10) ;
//   • entre amis (salle privée) : pas d'ELO, des points (victoire 10, défaite 3, égalité 5) ;
//   • contre l'IA            : entraînement, rien n'est enregistré ;
//   • abandon / adversaire disparu : celui qui reste gagne comme pour une victoire normale ; celui qui part perd comme pour une
//     défaite normale, plus 10 ELO de pénalité (classé), et ne marque aucun point.

export const ELO_START = 400;
export const ELO_MAX_STEP = 40;
export const ABANDON_EXTRA_PENALTY = 10;   // ELO en plus d'une défaite normale, pour celui qui abandonne (partie classée)
export const WIN_POINTS = 20;
export const LOSS_POINTS = 5;
export const DRAW_POINTS = 10;
export const FRIEND_WIN_POINTS = 10;
export const FRIEND_LOSS_POINTS = 3;
export const FRIEND_DRAW_POINTS = 5;

export const clampEloStep = (d) => Math.max(-ELO_MAX_STEP, Math.min(ELO_MAX_STEP, Math.round(d) || 0));

/** Une salle est classée seulement si elle vient du matchmaking classé : ni IA, ni salle privée. */
export const isRankedRoom = (room) => !!room && room.ranked !== false && !room._isAI && !room.private_code;

/** « ranked » (matchmaking), « friend » (salle privée / invitation), « ai » (entraînement) ou « none ». */
export const roomMode = (room) => (!room ? "none" : room._isAI ? "ai" : isRankedRoom(room) ? "ranked" : "friend");

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

/**
 * Bilan d'une partie à deux, quelle que soit sa fin. Renvoie l'objet publié dans l'état final de la salle (state.result) :
 *   { v, game, kind, mode, field, winner, isDraw, leaver, deltas: { [pseudo]: { elo, pts } }, before: { [pseudo]: elo } }
 *   game   : "chain" | "timeline"
 *   kind   : "normal" (fin de partie) | "forfeit" (abandon volontaire) | "timeout" (adversaire silencieux ou parti)
 *   winner : pseudo du vainqueur (ignoré pour un abandon : l'autre joueur gagne) ; isDraw : égalité (partie normale seulement)
 *   leaver : celui qui abandonne ou disparaît
 *   scores : [manches du joueur 1, manches du joueur 2] pour Chain (un 2-0 rapporte un peu plus qu'un 2-1)
 * Les ELO sont bornés à ±40 (limite du serveur) et les points d'un adversaire restent sous +20.
 */
export function duelResult({ game, room, kind = "normal", winner = null, isDraw = false, leaver = null, scores = null }) {
  const p1 = room.player1, p2 = room.player2;
  const mode = roomMode(room);
  const forfeit = kind !== "normal";
  const draw = !forfeit && !!isDraw;
  const win = draw ? null : forfeit ? (leaver === p1 ? p2 : leaver === p2 ? p1 : winner) : winner;
  const loser = win ? (win === p1 ? p2 : p1) : null;
  const elo1 = room.elo1 || ELO_START, elo2 = room.elo2 || ELO_START;
  const out = {
    v: 1, game, kind, mode, field: game === "chain" ? "elo_chain" : "elo_timeline",
    winner: win, isDraw: draw, leaver: forfeit ? (leaver || loser) : null,
    deltas: { [p1]: { elo: 0, pts: 0 }, [p2]: { elo: 0, pts: 0 } },
    before: { [p1]: elo1, [p2]: elo2 },
  };
  if (mode !== "ranked" && mode !== "friend") return out;       // entraînement : rien n'est enregistré

  if (mode === "friend") {                                       // entre amis : des points, jamais d'ELO
    for (const p of [p1, p2]) {
      out.deltas[p].pts = draw ? FRIEND_DRAW_POINTS : p === win ? FRIEND_WIN_POINTS : forfeit ? 0 : FRIEND_LOSS_POINTS;
    }
    return out;
  }

  // classée
  const chainScore = forfeit || (scores && Math.min(scores[0], scores[1]) === 0) ? "2-0" : "2-1";
  const calc = game === "chain"
    ? (a, b, r) => calcChainElo(a, b, r, chainScore)
    : (a, b, r) => calcTimelineElo(a, b, r);
  const r1 = draw ? 0.5 : win === p1 ? 1 : 0;
  out.deltas[p1].elo = clampEloStep(calc(elo1, elo2, r1));
  out.deltas[p2].elo = clampEloStep(calc(elo2, elo1, draw ? 0.5 : 1 - r1));
  for (const p of [p1, p2]) {
    out.deltas[p].pts = draw ? DRAW_POINTS : p === win ? WIN_POINTS : forfeit ? 0 : LOSS_POINTS;
  }
  if (forfeit && out.leaver) out.deltas[out.leaver].elo = clampEloStep(out.deltas[out.leaver].elo - ABANDON_EXTRA_PENALTY);
  return out;
}

// ─── Aides communes à l'IA ────────────────────────────────────────────────────────────────────────────────
export const AI_LEVELS = ["easy", "medium", "hard"];

/** Nombre aléatoire suivant une loi normale centrée réduite (Box-Muller). */
function gauss(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
function erf(x) {                                                // approximation d'Abramowitz-Stegun (précision 1e-7)
  const s = x < 0 ? -1 : 1, ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return s * y;
}
const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

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

// ── IA de Chain ──────────────────────────────────────────────────────────────────────────────────────────
// L'IA n'est plus un tirage au sort : elle « se souvient » des animés comme un fan (les plus connus lui reviennent plus
// facilement), puis elle joue :
//   • Kōhai (facile)  : se souvient de peu d'animés et joue au hasard parmi ceux-là ;
//   • Sempai (moyen)  : se souvient de plus d'animés et, une fois sur deux, choisit celui qui laisse le moins de réponses à l'adversaire ;
//   • Sensei (difficile) : connaît presque tout et cherche toujours le coup « piège » — le plus dur à enchaîner. Si une
//     seule réponse existe, ou aucune, l'adversaire est coincé.
// Si aucun animé valide ne lui revient, l'IA sèche et perd la manche — comme un humain.
export const CHAIN_AI = {
  easy:   { recall: 0.10, sample: 0,  trap: 0 },
  medium: { recall: 0.30, sample: 16, trap: 0.55 },
  hard:   { recall: 0.65, sample: 48, trap: 1 },
};

const profiles = new WeakMap();
function chainProfile(a) {
  let p = profiles.get(a);
  if (!p) {
    const s = [...new Set(names(a.studios))].sort(), g = [...new Set(names(a.genres))].sort();
    p = { s, g, sSet: new Set(s), gSet: new Set(g), sKey: s.join("|"), gKey: g.join("|") };
    profiles.set(a, p);
  }
  return p;
}
/** Version rapide (et équivalente pour des listes sans doublons) de isChainLinkValid, pour compter les réponses possibles. */
function fastLinkOk(cur, next, type) {
  if (type === "studio") return cur.s.some((x) => next.sSet.has(x)) && cur.gKey !== next.gKey;
  return cur.g.some((x) => next.gSet.has(x)) && cur.sKey !== next.sKey;
}

/**
 * Coup de l'IA : un animé valide (le bon type de lien) et pas encore utilisé, ou null si rien ne lui revient.
 * `pool` est trié du plus au moins connu. opts : { level: "easy"|"medium"|"hard", rand, recall }.
 * Ancien appel chainAiPick(state, pool, rand) : tirage au hasard parmi les 20 premiers candidats.
 */
export function chainAiPick(state, pool, opts = {}) {
  const o = typeof opts === "function" ? { rand: opts, legacy: true } : opts || {};
  const rand = o.rand || Math.random;
  const linkType = chainLinkForTurn(state);
  const used = new Set((state.chain || []).map((a) => a.mal_id));
  const candidates = [];
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (!used.has(a.mal_id) && isChainLinkValid(state.currentAnime, a, linkType)) candidates.push({ a, rank: i });
  }
  if (!candidates.length) return null;
  if (o.legacy) return candidates[Math.floor(rand() * Math.min(candidates.length, 20))].a;

  const cfg = CHAIN_AI[o.level] || CHAIN_AI.medium;
  const recall = o.recall ?? cfg.recall;
  const n = pool.length || 1;
  // Les plus connus (début de liste) reviennent le plus facilement ; les plus obscurs, trois fois moins.
  const recalled = candidates.filter(({ rank }) => rand() < recall * (1 - 0.65 * (rank / n)));
  if (!recalled.length) return null;
  if (!cfg.sample || rand() >= cfg.trap) return recalled[Math.floor(rand() * recalled.length)].a;

  // Coup « piège » : parmi quelques animés retrouvés, celui qui laisse le moins de suites à l'adversaire.
  const theirs = linkType === "studio" ? "genre" : "studio";
  const pick = [...recalled].sort(() => rand() - 0.5).slice(0, cfg.sample);
  let best = null, bestScore = Infinity;
  for (const c of pick) {
    const cp = chainProfile(c.a);
    let replies = 0;
    for (let i = 0; i < pool.length && replies < 40; i++) {
      const y = pool[i];
      if (y === c.a || used.has(y.mal_id) || y.mal_id === c.a.mal_id) continue;
      if (fastLinkOk(cp, chainProfile(y), theirs)) replies++;
    }
    const score = replies + rand() * 0.5;                      // à nombre égal, un peu de hasard
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best.a;
}

/** Nombre de réponses qu'aurait l'adversaire après `anime` (plafonné à `cap`) — utile aux tests et à l'affichage « coup piège ». */
export function chainRepliesAfter(state, anime, pool, cap = 40) {
  const theirs = chainLinkForTurn(state) === "studio" ? "genre" : "studio";
  const used = new Set([...(state.chain || []).map((a) => a.mal_id), anime.mal_id]);
  let n = 0;
  for (const y of pool) {
    if (!used.has(y.mal_id) && isChainLinkValid(anime, y, theirs) && ++n >= cap) break;
  }
  return n;
}

// ─── TIMELINE ─────────────────────────────────────────────────────────────────────────────────────────────
// Règles (v2) : chaque joueur a 5 cartes en main. À son tour, il pose UNE carte sur la frise.
//   • bonne position → la carte reste sur la frise (visible avec son année) et compte pour 1 ;
//   • mauvaise position → la carte est défaussée (son année est révélée à tous) et remplacée par une carte de la pioche ;
//     le tour passe. La main reste donc toujours à 5 cartes.
//   • le premier à avoir posé 5 cartes gagne. Le joueur 1 jouant en premier, s'il finit le premier, le joueur 2 a un dernier tour
//     pour égaliser (uniquement s'il a déjà posé 4 cartes) ; s'il réussit : égalité, sinon le joueur 1 gagne.
//   • si la pioche et les mains s'épuisent (ou après TIMELINE_MAX_MOVES coups), celui qui a posé le plus de cartes gagne.
// Les parties commencées avec l'ancienne règle (pas de champ « rules ») gardent leur règle : la carte ratée reste en main.
export const TIMELINE_HAND = 5;
export const TIMELINE_DECK = 16;
export const TIMELINE_MAX_MOVES = 80;

const yearOf = (a) => (a && Number.isFinite(+a.year) && +a.year > 0 ? +a.year : null);
export const isTimelineOrdered = (list) => list.every((a, i) => i === 0 || (yearOf(a) ?? 0) >= (yearOf(list[i - 1]) ?? 0));

const slimCard = (a) => ({
  mal_id: a.mal_id, title: a.title, year: +a.year, image_url: a.image_url,
  ...(a.scored_by ? { scored_by: a.scored_by } : {}),            // popularité : l'IA estime moins bien les titres obscurs
});

/** Distribution : 1 carte posée, 5 cartes pour chaque joueur, une pioche de rechange. `rows` = animés avec une année connue. */
export function dealTimeline(rows, p1, rand = Math.random) {
  const pool = rows.filter((a) => yearOf(a) !== null);
  if (pool.length < 1 + TIMELINE_HAND * 2) return null;
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } // Fisher-Yates
  const picks = a.slice(0, 1 + TIMELINE_HAND * 2 + TIMELINE_DECK).map(slimCard);
  return {
    rules: 2,
    timeline: [picks[0]],
    hand1: picks.slice(1, 1 + TIMELINE_HAND),
    hand2: picks.slice(1 + TIMELINE_HAND, 1 + TIMELINE_HAND * 2),
    deck: picks.slice(1 + TIMELINE_HAND * 2),
    placed1: 0, placed2: 0, misses1: 0, misses2: 0, moves: 0, last: null,
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

function endByCount(next, p1, p2) {
  next.phase = "gameEnd"; next.currentTurn = null; next.lastChance = false; next.endReason = "count";
  next.isDraw = next.placed1 === next.placed2;
  next.winner = next.isDraw ? null : next.placed1 > next.placed2 ? p1 : p2;
}

/**
 * Un joueur pose une carte de sa main à la position `pos` (règles ci-dessus).
 * Renvoie { state, ignored } si le coup n'est pas valide (pas son tour, carte inconnue, partie finie), sinon
 * { state, valid, ended, card } — `card` est la carte jouée avec son année, pour l'affichage du dernier coup.
 */
export function timelineMove(state, { by, cardId, pos, p1, p2 }) {
  if (!state || state.phase !== "play" || state.currentTurn !== by || (by !== p1 && by !== p2)) return { state, ignored: true };
  const isP1 = by === p1;
  const handKey = isP1 ? "hand1" : "hand2";
  const hand = state[handKey] || [];
  const card = hand.find((c) => c.mal_id === cardId);
  if (!card) return { state, ignored: true };

  const at = Math.max(0, Math.min(Number.isFinite(pos) ? pos : 0, state.timeline.length));
  const tl = [...state.timeline];
  tl.splice(at, 0, card);
  const valid = isTimelineOrdered(tl);
  const moves = (state.moves || 0) + 1;

  const next = {
    ...state, currentTurn: isP1 ? p2 : p1, skipped: valid ? null : by, moves,
    last: { by, cardId: card.mal_id, title: card.title, year: yearOf(card), pos: at, ok: valid, seq: moves },
  };
  if (valid) {
    next.timeline = tl;
    next[handKey] = hand.filter((c) => c.mal_id !== cardId);
    if (isP1) next.placed1 = (state.placed1 || 0) + 1; else next.placed2 = (state.placed2 || 0) + 1;
  } else {
    if (isP1) next.misses1 = (state.misses1 || 0) + 1; else next.misses2 = (state.misses2 || 0) + 1;
    if (state.rules === 2) {                                     // règle actuelle : carte défaussée, remplacée par la pioche
      const deck = [...(state.deck || [])];
      const fresh = deck.shift();
      next.deck = deck;
      next[handKey] = [...hand.filter((c) => c.mal_id !== cardId), ...(fresh ? [fresh] : [])];
    }                                                            // ancienne règle : la carte reste en main
  }

  const done1 = (next.placed1 || 0) >= TIMELINE_HAND, done2 = (next.placed2 || 0) >= TIMELINE_HAND;
  let ended = false, winner = null, isDraw = false;
  if (isP1) {
    if (valid && done1) {
      if ((next.placed2 || 0) >= TIMELINE_HAND - 1) next.lastChance = true;   // le joueur 2 peut encore égaliser
      else { ended = true; winner = p1; }
    }
  } else if (valid && done2) {
    ended = true;
    if (done1) isDraw = true; else winner = p2;
  } else if (done1) {                                                          // dernier tour du joueur 2 manqué
    ended = true; winner = p1;
  }
  if (ended) { next.phase = "gameEnd"; next.winner = winner; next.isDraw = isDraw; next.currentTurn = null; next.lastChance = false; next.endReason = "race"; }
  else {
    const upNext = next.currentTurn === p1 ? next.hand1 : next.hand2;
    if (!upNext?.length || moves >= TIMELINE_MAX_MOVES) { endByCount(next, p1, p2); ended = true; }
  }
  return { state: next, valid, ended, card };
}

// ── IA de Timeline ───────────────────────────────────────────────────────────────────────────────────────
// Comme un joueur : elle ne connaît pas l'année exacte de ses cartes, seulement une estimation (juste + du bruit).
// Le bruit est plus fort pour un titre obscur (peu de notes sur MyAnimeList). Elle place la carte là où son estimation la
// met, et choisit de jouer en premier la carte dont elle est la plus sûre. Elle se trompe donc comme un humain : quand deux
// années sont proches, ou sur un titre peu connu.
export const TIMELINE_AI = {
  easy:   { sigma: 7, smart: 0 },
  medium: { sigma: 4, smart: 0.5 },
  hard:   { sigma: 2, smart: 1 },
};

/** Facteur d'incertitude d'un titre : 0,6 pour un classique ultra-connu, jusqu'à 1,7 pour un titre quasi inconnu. */
export function aiObscurity(card) {
  const s = Number(card?.scored_by);
  if (!s || s <= 0) return 1;
  return Math.max(0.6, Math.min(1.7, 1.7 - 0.4 * (Math.log10(s) - 3.3)));
}

/** Ce que l'IA ferait avec chacune de ses cartes : { card, pos, conf } (conf = chance estimée que ce soit juste). */
export function timelineAiOptions(state, { ai, p1, level = "medium", rand = Math.random }) {
  const cfg = TIMELINE_AI[level] || TIMELINE_AI.medium;
  const hand = (ai === p1 ? state.hand1 : state.hand2) || [];
  const years = state.timeline.map((c) => yearOf(c) ?? 0);
  return hand.filter((c) => yearOf(c) !== null).map((card) => {
    const sigma = cfg.sigma * aiObscurity(card);
    const est = yearOf(card) + gauss(rand) * sigma;
    let pos = years.findIndex((y) => y > est);
    if (pos < 0) pos = years.length;
    const lo = pos > 0 ? years[pos - 1] : -Infinity, hi = pos < years.length ? years[pos] : Infinity;
    const conf = normalCdf((hi - est) / sigma) - normalCdf((lo - est) / sigma);
    return { card, pos, conf };
  });
}

/** Coup de l'IA. Renvoie comme timelineMove, avec en plus `conf` (sa confiance) pour l'affichage. */
export function timelineAiMove(state, { ai, p1, p2, level = "medium", rand = Math.random }) {
  const cfg = TIMELINE_AI[level] || TIMELINE_AI.medium;
  const opts = timelineAiOptions(state, { ai, p1, level, rand });
  if (!opts.length) return { state, ignored: true };
  const choice = rand() < cfg.smart
    ? opts.reduce((best, o) => (o.conf > best.conf ? o : best), opts[0])
    : opts[Math.floor(rand() * opts.length)];
  const res = timelineMove(state, { by: ai, cardId: choice.card.mal_id, pos: choice.pos, p1, p2 });
  return { ...res, conf: choice.conf };
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

/** Points « classement » gagnés par le vainqueur d'un Cluescale : 3 par point d'avance sur le second.
 *  Égalité en tête : pas de vainqueur (winner = null) et aucun point — l'écran de fin affiche « Égalité ». */
export function cluescaleWinnerPoints(scores) {
  const sorted = Object.entries(scores || {}).sort((a, b) => b[1] - a[1]);
  if (sorted.length < 2) return { winner: null, earned: 0 };
  const [[winner, w], [, second]] = sorted;
  if (w === second) return { winner: null, earned: 0 };
  return { winner, earned: (w - second) * 3 };
}
