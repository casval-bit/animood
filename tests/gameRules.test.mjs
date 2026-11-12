// Tests des règles de jeu (node --test tests/)
import test from "node:test";
import assert from "node:assert/strict";
import {
  calcChainElo, calcTimelineElo, duelResult, roomMode, clampEloStep, isRankedRoom,
  isChainLinkValid, chainLinkForTurn, chainAfterRoundLoss, chainAiPick, chainRepliesAfter,
  dealTimeline, timelineMove, timelineAiMove, timelineAiOptions, aiObscurity, timelineSlots,
  TIMELINE_HAND, TIMELINE_DECK, TIMELINE_MAX_MOVES, AI_LEVELS,
} from "../src/utils/gameRules.js";

const room = { player1: "alice", player2: "bob", elo1: 400, elo2: 400 };

// ── ELO ────────────────────────────────────────────────────────────────────
test("Chain : même tranche, 2-0 et 2-1", () => {
  assert.equal(calcChainElo(400, 450, 1, "2-0"), 23);
  assert.equal(calcChainElo(400, 450, 1, "2-1"), 20);
  assert.equal(calcChainElo(400, 450, 0, "2-0"), -22);
  assert.equal(calcChainElo(400, 450, 0, "2-1"), -18);
});
test("Chain : tranches différentes", () => {
  assert.equal(calcChainElo(900, 400, 1, "2-0"), 10);   // le fort gagne peu
  assert.equal(calcChainElo(400, 900, 1, "2-0"), 30);   // le faible gagne beaucoup
  assert.equal(calcChainElo(900, 400, 0, "2-0"), -30);
  assert.equal(calcChainElo(400, 900, 0, "2-0"), -10);
});
test("Timeline : ELO", () => {
  assert.equal(calcTimelineElo(400, 410, 1), 20);
  assert.equal(calcTimelineElo(400, 410, 0), -20);
  assert.equal(calcTimelineElo(900, 400, 1), 15);
  assert.equal(calcTimelineElo(400, 900, 1), 25);
  assert.equal(calcTimelineElo(900, 400, 0), -25);
  assert.equal(calcTimelineElo(400, 900, 0), -15);
  assert.equal(calcTimelineElo(400, 400, 0.5), 0);
});
test("Les variations restent sous la limite serveur (±40) et les points sous +20", () => {
  for (const [a, b] of [[0, 2000], [2000, 0], [400, 400], [399, 400], [1500, 1499]]) {
    for (const score of ["2-0", "2-1"]) for (const r of [0, 1, 0.5]) {
      assert.ok(Math.abs(calcChainElo(a, b, r, score)) <= 40);
    }
    for (const r of [0, 1, 0.5]) assert.ok(Math.abs(calcTimelineElo(a, b, r)) <= 40);
  }
  assert.equal(clampEloStep(99), 40);
  assert.equal(clampEloStep(-99), -40);
});
test("Mode d'une salle : classé, amis, IA", () => {
  assert.equal(roomMode({ ranked: true }), "ranked");
  assert.equal(roomMode({ ranked: false, private_code: "ABCDE" }), "friend");
  assert.equal(roomMode({ ranked: true, private_code: "ABCDE" }), "friend");
  assert.equal(roomMode({ _isAI: true, ranked: false }), "ai");
  assert.equal(roomMode(null), "none");
});
test("Salle classée : ni IA ni privée", () => {
  assert.equal(isRankedRoom({ ranked: true }), true);
  assert.equal(isRankedRoom({ ranked: false }), false);
  assert.equal(isRankedRoom({ ranked: true, _isAI: true }), false);
  assert.equal(isRankedRoom({ ranked: true, private_code: "ABC" }), false);
  assert.equal(isRankedRoom(null), false);
});

// ── Bilan d'une partie (duelResult) ─────────────────────────────────────────
const rankedRoom = { player1: "alice", player2: "bob", elo1: 400, elo2: 400, ranked: true };
const friendRoom = { ...rankedRoom, ranked: false, private_code: "ABCDE" };
const aiRoom = { ...rankedRoom, ranked: false, _isAI: true };
const flat = (r) => Object.fromEntries(Object.entries(r.deltas).map(([k, v]) => [k, [v.elo, v.pts]]));

test("Bilan classé : victoire / défaite / égalité", () => {
  const c = duelResult({ game: "chain", room: rankedRoom, winner: "alice", scores: [2, 0] });
  assert.deepEqual(flat(c), { alice: [23, 20], bob: [-22, 5] });
  assert.deepEqual([c.mode, c.field, c.winner, c.isDraw, c.leaver], ["ranked", "elo_chain", "alice", false, null]);
  const c21 = duelResult({ game: "chain", room: rankedRoom, winner: "bob", scores: [1, 2] });
  assert.deepEqual(flat(c21), { alice: [-18, 5], bob: [20, 20] });
  const t = duelResult({ game: "timeline", room: rankedRoom, winner: "bob" });
  assert.deepEqual(flat(t), { alice: [-20, 5], bob: [20, 20] });
  assert.equal(t.field, "elo_timeline");
  const d = duelResult({ game: "timeline", room: rankedRoom, winner: null, isDraw: true });
  assert.deepEqual(flat(d), { alice: [0, 10], bob: [0, 10] });
  assert.deepEqual(d.before, { alice: 400, bob: 400 });
});
test("Bilan classé : l'abandon fait gagner l'autre comme une vraie victoire, et coûte 10 ELO de plus à celui qui part", () => {
  const f = duelResult({ game: "timeline", room: rankedRoom, kind: "forfeit", leaver: "bob" });
  assert.deepEqual(flat(f), { alice: [20, 20], bob: [-30, 0] });
  assert.deepEqual([f.winner, f.leaver, f.kind, f.isDraw], ["alice", "bob", "forfeit", false]);
  const to = duelResult({ game: "chain", room: rankedRoom, kind: "timeout", leaver: "alice" });
  assert.deepEqual(flat(to), { alice: [-32, 0], bob: [23, 20] });
  assert.equal(to.winner, "bob");
  // le gagnant d'un abandon gagne des points : régression « mon ami ne gagnait rien quand j'abandonnais »
  assert.ok(f.deltas.alice.pts > 0 && f.deltas.alice.elo > 0);
});
test("Bilan entre amis : jamais d'ELO, des points pour tous les cas", () => {
  assert.deepEqual(flat(duelResult({ game: "timeline", room: friendRoom, winner: "alice" })), { alice: [0, 10], bob: [0, 3] });
  assert.deepEqual(flat(duelResult({ game: "chain", room: friendRoom, winner: "bob", scores: [0, 2] })), { alice: [0, 3], bob: [0, 10] });
  assert.deepEqual(flat(duelResult({ game: "timeline", room: friendRoom, isDraw: true })), { alice: [0, 5], bob: [0, 5] });
  const f = duelResult({ game: "timeline", room: friendRoom, kind: "forfeit", leaver: "alice" });
  assert.deepEqual(flat(f), { alice: [0, 0], bob: [0, 10] });
  assert.equal(f.mode, "friend");
});
test("Bilan contre l'IA : entraînement, rien n'est enregistré", () => {
  const r = duelResult({ game: "chain", room: aiRoom, winner: "alice", scores: [2, 0] });
  assert.deepEqual(flat(r), { alice: [0, 0], bob: [0, 0] });
  assert.equal(r.mode, "ai");
});
test("Bilan : jamais plus de ±40 ELO ni +20 points, quel que soit l'écart de niveau", () => {
  for (const [e1, e2] of [[0, 2000], [2000, 0], [400, 400], [399, 400], [1500, 1499], [900, 400]]) {
    const room = { ...rankedRoom, elo1: e1, elo2: e2 };
    for (const game of ["chain", "timeline"]) {
      const cases = [
        { winner: "alice", scores: [2, 0] }, { winner: "bob", scores: [1, 2] }, { isDraw: true },
        { kind: "forfeit", leaver: "alice" }, { kind: "forfeit", leaver: "bob" }, { kind: "timeout", leaver: "alice" },
      ];
      for (const c of cases) {
        const r = duelResult({ game, room, ...c });
        for (const d of Object.values(r.deltas)) assert.ok(Math.abs(d.elo) <= 40 && d.pts >= 0 && d.pts <= 20, JSON.stringify([e1, e2, game, c, d]));
        if (r.winner) assert.ok(r.deltas[r.winner].elo >= 0 && r.deltas[r.winner].pts > 0, "le vainqueur doit toujours gagner");
        const loser = r.winner && (r.winner === "alice" ? "bob" : "alice");
        if (loser) assert.ok(r.deltas[loser].elo <= 0);
      }
    }
  }
});

// ── Chain ─────────────────────────────────────────────────────────────────
const A = { mal_id: 1, studios: [{ name: "MAPPA" }], genres: [{ name: "Action" }, { name: "Drame" }] };
const B = { mal_id: 2, studios: [{ name: "MAPPA" }], genres: [{ name: "Comédie" }] };
const C = { mal_id: 3, studios: [{ name: "Bones" }], genres: [{ name: "Action" }] };
const D = { mal_id: 4, studios: [{ name: "MAPPA" }], genres: [{ name: "Drame" }, { name: "Action" }] }; // mêmes genres que A
test("Chain : validité des liens", () => {
  assert.equal(isChainLinkValid(A, B, "studio"), true);   // même studio, genres différents
  assert.equal(isChainLinkValid(A, D, "studio"), false);  // mêmes genres → refusé
  assert.equal(isChainLinkValid(A, C, "studio"), false);  // studio différent
  assert.equal(isChainLinkValid(A, C, "genre"), true);    // genre commun, studio différent
  assert.equal(isChainLinkValid(A, B, "genre"), false);   // aucun genre commun
  assert.equal(isChainLinkValid(A, D, "genre"), false);   // même studio
  assert.equal(isChainLinkValid(null, B, "genre"), false);
});
test("Chain : le lien joué dépend de qui joue (ABBA)", () => {
  const s = { linkType: "studio", chooser: "alice", turn: "alice" };
  assert.equal(chainLinkForTurn(s), "studio");
  assert.equal(chainLinkForTurn({ ...s, turn: "bob" }), "genre");
  assert.equal(chainLinkForTurn({ ...s, linkType: null }), null);
});
test("Chain : enchaînement des manches", () => {
  const s0 = { scores: [0, 0], round: 1 };
  let r = chainAfterRoundLoss(s0, "alice", room);            // bob gagne la manche 1
  assert.deepEqual([r.over, r.scores, r.round, r.chooser], [false, [0, 1], 2, "bob"]);
  r = chainAfterRoundLoss({ scores: [0, 1], round: 2 }, "bob", room); // 1-1, manche 3 : égalité d'ELO → joueur 1
  assert.deepEqual([r.over, r.scores, r.round, r.chooser], [false, [1, 1], 3, "alice"]);
  r = chainAfterRoundLoss({ scores: [0, 1], round: 2 }, "bob", { ...room, elo2: 500 }); // bob mieux classé
  assert.equal(r.chooser, "bob");
  r = chainAfterRoundLoss({ scores: [0, 1], round: 2 }, "alice", room);      // bob a 2 manches
  assert.deepEqual([r.over, r.winner, r.scores], [true, "bob", [0, 2]]);
  r = chainAfterRoundLoss({ scores: [1, 1], round: 3 }, "bob", room);        // alice gagne 2-1
  assert.deepEqual([r.over, r.winner, r.scores], [true, "alice", [2, 1]]);
});
test("Chain : l'IA joue un coup valide et jamais un animé déjà utilisé", () => {
  const state = { linkType: "studio", chooser: "alice", turn: "alice", currentAnime: A, chain: [A] };
  const pick = chainAiPick(state, [A, B, C, D], () => 0);
  assert.equal(pick.mal_id, 2);
  const used = { ...state, chain: [A, B] };
  assert.equal(chainAiPick(used, [A, B, C, D], () => 0), null);
});

// ── IA de Chain ──────────────────────────────────────────────────────────
const mkA = (id, studios, genres) => ({ mal_id: id, title: "A" + id, studios: studios.map((name) => ({ name })), genres: genres.map((name) => ({ name })) });
const seeded = (seed) => { let k = seed; return () => { k = (k * 16807) % 2147483647; return k / 2147483647; }; };
function bigPool(n, rand) {
  const S = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12"];
  const G = ["Action", "Aventure", "Comédie", "Drame", "Fantasy", "Horreur", "Mystère", "Romance", "Sci-Fi", "Sport", "Slice of Life", "Thriller"];
  return Array.from({ length: n }, (_, i) => {
    const g = new Set(); const ng = 1 + Math.floor(rand() * 3); while (g.size < ng) g.add(G[Math.floor(rand() * G.length)]);
    return mkA(i + 1, [S[Math.floor(rand() * S.length)]], [...g]);
  });
}
test("Chain : l'IA ne joue que des coups valides, à chaque niveau", () => {
  const rand = seeded(3), pool = bigPool(400, rand);
  for (const level of AI_LEVELS) for (const linkType of ["studio", "genre"]) {
    for (let i = 0; i < 40; i++) {
      const cur = pool[Math.floor(rand() * pool.length)];
      const state = { linkType, chooser: "ia", turn: "ia", currentAnime: cur, chain: [cur] };
      const pick = chainAiPick(state, pool, { level, rand });
      if (pick) assert.ok(isChainLinkValid(cur, pick, linkType) && pick.mal_id !== cur.mal_id, `coup invalide (${level}, ${linkType})`);
    }
  }
});
test("Chain : l'IA sèche quand rien ne lui revient, et joue le piège quand elle le voit", () => {
  const cur = mkA(1, ["S1"], ["G1", "G2"]);
  const b0 = mkA(10, ["S1"], ["G5"]);                      // aucune suite possible : personne d'autre n'a le genre G5
  const b1 = mkA(11, ["S1"], ["G3"]);
  const b2 = mkA(12, ["S1"], ["G4"]);
  const others = [
    ...Array.from({ length: 10 }, (_, i) => mkA(100 + i, ["S9"], ["G3"])),     // 10 suites pour b1
    ...Array.from({ length: 2 }, (_, i) => mkA(200 + i, ["S9"], ["G4"])),      //  2 suites pour b2
  ];
  const pool = [cur, b1, b2, b0, ...others];
  const state = { linkType: "studio", chooser: "ia", turn: "ia", currentAnime: cur, chain: [cur] };
  assert.equal(chainRepliesAfter(state, b0, pool), 0);
  assert.equal(chainRepliesAfter(state, b2, pool), 2);
  assert.equal(chainRepliesAfter(state, b1, pool), 10);
  assert.equal(chainAiPick(state, pool, { level: "hard", rand: () => 0 }).mal_id, 10);       // le coup piège : l'adversaire n'a aucune réponse
  assert.equal(chainAiPick(state, pool, { level: "hard", rand: () => 0.999 }), null);        // rien ne lui revient : elle sèche
  assert.equal(chainAiPick({ ...state, chain: [cur, b0, b1, b2] }, pool, { level: "hard", rand: () => 0 }), null); // plus aucun coup
});
test("Chain : plus le niveau monte, plus l'IA laisse peu de réponses à l'adversaire", () => {
  const rand = seeded(11), pool = bigPool(800, rand);
  const avg = {};
  for (const level of AI_LEVELS) {
    let sum = 0, n = 0;
    for (let i = 0; i < 60; i++) {
      const cur = pool[Math.floor(rand() * pool.length)];
      const state = { linkType: "genre", chooser: "ia", turn: "ia", currentAnime: cur, chain: [cur] };
      const pick = chainAiPick(state, pool, { level, rand });
      if (pick) { sum += chainRepliesAfter(state, pick, pool, 400); n++; }
    }
    avg[level] = sum / n;
  }
  assert.ok(avg.hard < avg.medium && avg.medium < avg.easy, JSON.stringify(avg));
});

// ── Timeline ──────────────────────────────────────────────────────────────
const mk = (id, year) => ({ mal_id: id, year, title: "T" + id });
const rows = Array.from({ length: 40 }, (_, i) => mk(i + 1, 1990 + (i % 30)));
test("Timeline : distribution", () => {
  const d = dealTimeline(rows, "alice", () => 0.42);
  assert.equal(d.timeline.length, 1);
  assert.equal(d.hand1.length, TIMELINE_HAND);
  assert.equal(d.hand2.length, TIMELINE_HAND);
  const ids = new Set([...d.timeline, ...d.hand1, ...d.hand2].map((a) => a.mal_id));
  assert.equal(ids.size, 11);                               // aucune carte en double
  assert.equal(d.rules, 2);
  assert.equal(d.deck.length, TIMELINE_DECK);               // pioche de rechange
  assert.equal(new Set([...d.timeline, ...d.hand1, ...d.hand2, ...d.deck].map((a) => a.mal_id)).size, 11 + TIMELINE_DECK);
  assert.equal(dealTimeline([mk(1, 2000)], "alice"), null); // pas assez d'animés
  assert.equal(dealTimeline(rows.map((r) => ({ ...r, year: null })), "alice"), null); // pas d'année → pas de partie
});
function playout(startState, p1, p2, moves) {
  let s = startState;
  for (const m of moves) { const r = timelineMove(s, { ...m, p1, p2 }); assert.ok(!r.ignored, "coup ignoré : " + JSON.stringify(m)); s = r.state; }
  return s;
}
test("Timeline : une main va jusqu'au bout (5 cartes) — régression du blocage à 3 cartes", () => {
  let s = dealTimeline(rows, "alice", () => 0.1);
  let safety = 0;
  while (s.phase === "play" && safety++ < 200) {
    const by = s.currentTurn, hand = by === "alice" ? s.hand1 : s.hand2;
    assert.ok(hand.length > 0, "main vide alors que la partie continue");
    const { ok } = timelineSlots(s.timeline, hand[0]);
    s = timelineMove(s, { by, cardId: hand[0].mal_id, pos: ok[0], p1: "alice", p2: "bob" }).state;
  }
  assert.equal(s.phase, "gameEnd");
  // alice finit la première, bob égalise à son dernier tour → égalité
  assert.equal(s.isDraw, true);
  assert.equal(s.placed1, 5); assert.equal(s.placed2, 5);
  assert.equal(s.hand1.length, 0); assert.equal(s.hand2.length, 0);
});
test("Timeline : une mauvaise position défausse la carte (année révélée), la remplace et passe le tour", () => {
  const spare = mk(9, 2005);
  const s0 = { rules: 2, timeline: [mk(100, 2000)], hand1: [mk(1, 1990), mk(3, 2002)], hand2: [mk(2, 2010)], deck: [spare, mk(10, 1999)],
    placed1: 0, placed2: 0, currentTurn: "alice", phase: "play" };
  const r = timelineMove(s0, { by: "alice", cardId: 1, pos: 1, p1: "alice", p2: "bob" }); // 1990 après 2000 : faux
  assert.equal(r.valid, false);
  assert.deepEqual(r.state.hand1.map((c) => c.mal_id), [3, 9]);   // la carte ratée est partie, la pioche l'a remplacée
  assert.equal(r.state.deck.length, 1);
  assert.equal(r.state.placed1, 0);
  assert.equal(r.state.misses1, 1);
  assert.equal(r.state.currentTurn, "bob");
  assert.equal(r.state.skipped, "alice");
  assert.equal(r.state.timeline.length, 1);                       // la frise ne change pas
  assert.deepEqual([r.state.last.by, r.state.last.year, r.state.last.ok, r.state.last.title], ["alice", 1990, false, "T1"]);
  assert.equal(r.state.moves, 1);
  assert.equal(s0.hand1.length, 2);                               // l'état d'entrée n'est pas modifié
});
test("Timeline : une bonne position garde la carte sur la frise, la main ne reçoit rien", () => {
  const s0 = { rules: 2, timeline: [mk(100, 2000)], hand1: [mk(1, 2005), mk(3, 2002)], hand2: [mk(2, 2010)], deck: [mk(9, 1990)],
    placed1: 0, placed2: 0, currentTurn: "alice", phase: "play" };
  const r = timelineMove(s0, { by: "alice", cardId: 1, pos: 1, p1: "alice", p2: "bob" });
  assert.equal(r.valid, true);
  assert.deepEqual(r.state.hand1.map((c) => c.mal_id), [3]);
  assert.deepEqual(r.state.timeline.map((c) => c.mal_id), [100, 1]);
  assert.equal(r.state.deck.length, 1);
  assert.equal(r.state.placed1, 1);
  assert.deepEqual([r.state.last.ok, r.state.last.pos, r.state.skipped], [true, 1, null]);
});
test("Timeline : ancienne règle (sans « rules ») — la carte ratée reste en main", () => {
  const s0 = { timeline: [mk(100, 2000)], hand1: [mk(1, 1990)], hand2: [mk(2, 2010)], placed1: 0, placed2: 0, currentTurn: "alice", phase: "play" };
  const r = timelineMove(s0, { by: "alice", cardId: 1, pos: 1, p1: "alice", p2: "bob" });
  assert.equal(r.valid, false);
  assert.equal(r.state.hand1.length, 1);
  assert.equal(r.state.placed1, 0);
  assert.equal(r.state.currentTurn, "bob");
});
test("Timeline : à chaque coup, aucune carte ne disparaît ni ne se duplique (frise + mains + pioche + défausse)", () => {
  for (let seed = 1; seed <= 25; seed++) {
    let k = seed; const rand = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    let s = dealTimeline(rows, "alice", rand), discarded = 0, safety = 0;
    const total = 1 + TIMELINE_HAND * 2 + TIMELINE_DECK;
    while (s.phase === "play" && safety++ < 300) {
      const by = s.currentTurn, hand = by === "alice" ? s.hand1 : s.hand2;
      const card = hand[Math.floor(rand() * hand.length)];
      const { ok, bad } = timelineSlots(s.timeline, card);
      const choices = rand() < 0.4 && bad.length ? bad : ok;
      const r = timelineMove(s, { by, cardId: card.mal_id, pos: choices[Math.floor(rand() * choices.length)], p1: "alice", p2: "bob" });
      assert.ok(!r.ignored);
      if (!r.valid) discarded++;
      s = r.state;
      const ids = [...s.timeline, ...s.hand1, ...s.hand2, ...s.deck].map((c) => c.mal_id);
      assert.equal(new Set(ids).size, ids.length, "carte en double");
      assert.equal(ids.length + discarded, total, `carte disparue (seed ${seed}, coup ${s.moves})`);
      assert.equal(s.timeline.length - 1, s.placed1 + s.placed2, "frise ≠ cartes posées");
      assert.ok(s.hand1.length <= TIMELINE_HAND && s.hand2.length <= TIMELINE_HAND);
    }
    assert.equal(s.phase, "gameEnd", `partie sans fin (seed ${seed})`);
  }
});
test("Timeline : pioche épuisée ou main vide → le plus de cartes posées gagne (égalité possible)", () => {
  const base = { rules: 2, timeline: [mk(100, 2000)], deck: [], currentTurn: "alice", phase: "play", moves: 10 };
  const s0 = { ...base, hand1: [mk(1, 1990)], hand2: [mk(2, 2001), mk(3, 2002)], placed1: 1, placed2: 2 };
  let r = timelineMove(s0, { by: "alice", cardId: 1, pos: 1, p1: "alice", p2: "bob" });   // raté, aucune carte de remplacement
  assert.equal(r.state.hand1.length, 0);
  assert.equal(r.ended, false);                                  // c'est à bob de jouer : il a des cartes
  r = timelineMove(r.state, { by: "bob", cardId: 2, pos: 1, p1: "alice", p2: "bob" });
  assert.equal(r.ended, true);                                   // alice n'a plus de carte à jouer
  assert.equal(r.state.endReason, "count");
  assert.equal(r.state.winner, "bob"); assert.equal(r.state.isDraw, false);
  let tie = timelineMove({ ...base, hand1: [mk(1, 1990)], hand2: [mk(2, 1980)], placed1: 2, placed2: 2 }, { by: "alice", cardId: 1, pos: 1, p1: "alice", p2: "bob" });
  assert.equal(tie.ended, false);                                // les deux ratent leur dernière carte : 2 partout
  tie = timelineMove(tie.state, { by: "bob", cardId: 2, pos: 1, p1: "alice", p2: "bob" });
  assert.equal(tie.state.endReason, "count"); assert.equal(tie.state.isDraw, true); assert.equal(tie.state.winner, null);
});
test("Timeline : limite de coups", () => {
  const s0 = { rules: 2, timeline: [mk(100, 2000)], hand1: [mk(1, 2001)], hand2: [mk(2, 2002)], deck: [], currentTurn: "alice", phase: "play",
    placed1: 1, placed2: 0, moves: TIMELINE_MAX_MOVES - 1 };
  const r = timelineMove(s0, { by: "alice", cardId: 1, pos: 1, p1: "alice", p2: "bob" });
  assert.equal(r.ended, true); assert.equal(r.state.winner, "alice");
});
test("Timeline : coup hors tour ou carte inconnue ignorés", () => {
  const s0 = dealTimeline(rows, "alice", () => 0.3);
  assert.ok(timelineMove(s0, { by: "bob", cardId: s0.hand2[0].mal_id, pos: 0, p1: "alice", p2: "bob" }).ignored);
  assert.ok(timelineMove(s0, { by: "alice", cardId: -5, pos: 0, p1: "alice", p2: "bob" }).ignored);
  assert.ok(timelineMove({ ...s0, phase: "gameEnd" }, { by: "alice", cardId: s0.hand1[0].mal_id, pos: 0, p1: "alice", p2: "bob" }).ignored);
});
test("Timeline : le joueur 1 finit, le joueur 2 rate son dernier tour → le joueur 1 gagne", () => {
  const s0 = { timeline: [mk(100, 2000)], hand1: [mk(1, 2000)], hand2: [mk(2, 1980)], placed1: 4, placed2: 4, currentTurn: "alice", phase: "play" };
  let r = timelineMove(s0, { by: "alice", cardId: 1, pos: 1, p1: "alice", p2: "bob" });
  assert.equal(r.ended, false); assert.equal(r.state.lastChance, true); assert.equal(r.state.currentTurn, "bob");
  r = timelineMove(r.state, { by: "bob", cardId: 2, pos: 2, p1: "alice", p2: "bob" }); // 1980 après 2000 : faux
  assert.equal(r.ended, true); assert.equal(r.state.winner, "alice"); assert.equal(r.state.isDraw, false);
});
test("Timeline : le joueur 1 finit sans que le joueur 2 puisse égaliser → victoire immédiate", () => {
  const s0 = { timeline: [mk(100, 2000)], hand1: [mk(1, 2000)], hand2: [mk(2, 1980), mk(3, 1981)], placed1: 4, placed2: 3, currentTurn: "alice", phase: "play" };
  const r = timelineMove(s0, { by: "alice", cardId: 1, pos: 1, p1: "alice", p2: "bob" });
  assert.equal(r.ended, true); assert.equal(r.state.winner, "alice");
});
test("Timeline : le joueur 2 finit en premier → il gagne", () => {
  const s0 = { timeline: [mk(100, 2000)], hand1: [mk(1, 2000), mk(5, 2001)], hand2: [mk(2, 2000)], placed1: 3, placed2: 4, currentTurn: "bob", phase: "play" };
  const r = timelineMove(s0, { by: "bob", cardId: 2, pos: 1, p1: "alice", p2: "bob" });
  assert.equal(r.ended, true); assert.equal(r.state.winner, "bob"); assert.equal(r.state.isDraw, false);
});
test("Timeline : l'IA termine toujours la partie, à chaque niveau, contre un joueur qui joue bien", () => {
  for (const level of AI_LEVELS) {
    for (let seed = 1; seed <= 20; seed++) {
      let k = seed; const rand = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
      let s = dealTimeline(rows, "me", rand), safety = 0;
      while (s.phase === "play" && safety++ < 400) {
        if (s.currentTurn === "me") {
          const c = s.hand1[0], { ok } = timelineSlots(s.timeline, c);
          s = timelineMove(s, { by: "me", cardId: c.mal_id, pos: ok[0], p1: "me", p2: "ia" }).state;
        } else {
          const r = timelineAiMove(s, { ai: "ia", p1: "me", p2: "ia", level, rand });
          assert.ok(!r.ignored, "l'IA n'a pas pu jouer");
          s = r.state;
        }
      }
      assert.equal(s.phase, "gameEnd", `partie non terminée (seed ${seed}, niveau ${level})`);
      assert.ok(s.winner === "me" || s.winner === "ia" || s.isDraw);
    }
  }
});
test("Timeline : l'IA n'est ni omnisciente ni aveugle — sa précision monte avec le niveau", () => {
  const acc = {};
  for (const level of AI_LEVELS) {
    let ok = 0, n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      let k = seed * 7919; const rand = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
      const d = dealTimeline(rows, "me", rand);
      const sorted = [...d.hand1].sort((a, b) => a.year - b.year);          // frise de 5 cartes triées : l'IA doit placer une carte
      const s = { ...d, timeline: sorted, currentTurn: "ia", hand2: [d.hand2[0]] };
      const r = timelineAiMove(s, { ai: "ia", p1: "me", p2: "ia", level, rand });
      n++; if (r.valid) ok++;
    }
    acc[level] = ok / n;
  }
  assert.ok(acc.easy < acc.medium && acc.medium < acc.hard, JSON.stringify(acc));
  assert.ok(acc.easy > 0.15, "l'IA facile doit réussir parfois : " + acc.easy);
  assert.ok(acc.hard < 0.99, "l'IA difficile doit se tromper parfois : " + acc.hard);
});
test("Timeline : l'IA estime moins bien un titre obscur, et joue d'abord la carte dont elle est la plus sûre", () => {
  assert.ok(aiObscurity({ scored_by: 3_000_000 }) < aiObscurity({ scored_by: 4_000 }));
  assert.equal(aiObscurity({}), 1);
  // deux cartes : une pile entre deux années très éloignées (facile) et une collée à une année voisine (risquée)
  const s = { rules: 2, timeline: [mk(100, 1990), mk(101, 2020)], hand1: [], hand2: [mk(1, 2005), mk(2, 1991)], deck: [], currentTurn: "ia", phase: "play", placed1: 0, placed2: 0 };
  let sureFirst = 0;
  for (let seed = 1; seed <= 100; seed++) {
    let k = seed * 31; const rand = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    const r = timelineAiMove(s, { ai: "ia", p1: "me", p2: "ia", level: "hard", rand });
    if (r.card.mal_id === 1) sureFirst++;
  }
  assert.ok(sureFirst >= 90, `la carte sûre doit passer d'abord (${sureFirst}/100)`);
  const o = timelineAiOptions(s, { ai: "ia", p1: "me", level: "hard", rand: () => 0.5 });
  assert.equal(o.length, 2);
  assert.ok(o.every((x) => x.conf >= 0 && x.conf <= 1));
});

// ─── Cluescale ───────────────────────────────────────────────
import { cluescaleScoreRound, cluescaleWinnerPoints } from "../src/utils/gameRules.js";

test("Cluescale : exact +3, à 1 près +1, juge +2 si quelqu'un a trouvé", () => {
  const s = cluescaleScoreRound({ players: ["a", "b", "c"], judge: "a", answer: 10, guesses: { b: 10, c: 11 }, scores: { a: 0, b: 1, c: 0 } });
  assert.deepEqual(s, { a: 2, b: 4, c: 1 });
});
test("Cluescale : personne ne trouve → le juge ne marque pas ; un absent ne rapporte rien", () => {
  const s = cluescaleScoreRound({ players: ["a", "b", "c"], judge: "a", answer: 10, guesses: { b: 3 }, scores: {} });
  assert.deepEqual(s, {});
});
test("Cluescale : les scores d'entrée ne sont pas modifiés", () => {
  const before = { a: 1, b: 1 };
  cluescaleScoreRound({ players: ["a", "b"], judge: "a", answer: 5, guesses: { b: 5 }, scores: before });
  assert.deepEqual(before, { a: 1, b: 1 });
});
test("Cluescale : points du vainqueur = 3 × avance, 0 si égalité", () => {
  assert.deepEqual(cluescaleWinnerPoints({ a: 10, b: 6, c: 2 }), { winner: "a", earned: 12 });
  assert.deepEqual(cluescaleWinnerPoints({ a: 5, b: 5 }), { winner: null, earned: 0 });       // égalité : personne ne gagne
  assert.deepEqual(cluescaleWinnerPoints({ a: 7, b: 7, c: 1 }), { winner: null, earned: 0 });  // égalité en tête à trois
  assert.deepEqual(cluescaleWinnerPoints({ a: 5 }), { winner: null, earned: 0 });
});
