// Tests des règles de jeu (node --test tests/)
import test from "node:test";
import assert from "node:assert/strict";
import {
  calcChainElo, calcTimelineElo, chainGameOutcome, timelineGameOutcome, clampEloStep, isRankedRoom,
  isChainLinkValid, chainLinkForTurn, chainAfterRoundLoss, chainAiPick,
  dealTimeline, timelineMove, timelineAiMove, timelineSlots, TIMELINE_HAND,
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
  const o = chainGameOutcome(room, "alice", [2, 0]);
  assert.deepEqual([o.delta1, o.delta2, o.pts1, o.pts2], [23, -22, 20, 5]);
  assert.ok(o.pts1 <= 20 && o.pts2 <= 20);
  const t = timelineGameOutcome(room, null, true);
  assert.deepEqual([t.delta1, t.delta2, t.pts1, t.pts2], [0, 0, 10, 10]);
  assert.equal(clampEloStep(99), 40);
  assert.equal(clampEloStep(-99), -40);
});
test("Salle classée : ni IA ni privée", () => {
  assert.equal(isRankedRoom({ ranked: true }), true);
  assert.equal(isRankedRoom({ ranked: false }), false);
  assert.equal(isRankedRoom({ ranked: true, _isAI: true }), false);
  assert.equal(isRankedRoom({ ranked: true, private_code: "ABC" }), false);
  assert.equal(isRankedRoom(null), false);
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
test("Timeline : une mauvaise position garde la carte en main et passe le tour", () => {
  const s0 = { timeline: [mk(100, 2000)], hand1: [mk(1, 1990)], hand2: [mk(2, 2010)], placed1: 0, placed2: 0, currentTurn: "alice", phase: "play" };
  const r = timelineMove(s0, { by: "alice", cardId: 1, pos: 1, p1: "alice", p2: "bob" }); // 1990 après 2000 : faux
  assert.equal(r.valid, false);
  assert.equal(r.state.hand1.length, 1);
  assert.equal(r.state.placed1, 0);
  assert.equal(r.state.currentTurn, "bob");
  assert.equal(r.state.skipped, "alice");
  assert.equal(r.state.timeline.length, 1);
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
test("Timeline : l'IA termine toujours la partie, contre un joueur qui joue bien", () => {
  for (const failRate of [0, 0.3]) {
    for (let seed = 1; seed <= 20; seed++) {
      let k = seed; const rand = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
      let s = dealTimeline(rows, "me", rand), safety = 0;
      while (s.phase === "play" && safety++ < 400) {
        if (s.currentTurn === "me") {
          const c = s.hand1[0], { ok } = timelineSlots(s.timeline, c);
          s = timelineMove(s, { by: "me", cardId: c.mal_id, pos: ok[0], p1: "me", p2: "ia" }).state;
        } else {
          const r = timelineAiMove(s, { ai: "ia", p1: "me", p2: "ia", failRate, rand });
          assert.ok(!r.ignored, "l'IA n'a pas pu jouer");
          s = r.state;
        }
      }
      assert.equal(s.phase, "gameEnd", `partie non terminée (seed ${seed}, échec ${failRate})`);
      assert.ok(s.winner === "me" || s.winner === "ia" || s.isDraw);
    }
  }
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
  assert.equal(cluescaleWinnerPoints({ a: 5, b: 5 }).earned, 0);
  assert.equal(cluescaleWinnerPoints({ a: 5 }).earned, 0);
});
