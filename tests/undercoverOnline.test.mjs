// Imposteur en ligne : règles (src/utils/undercoverOnline.js) + écritures simultanées (src/utils/roomTx.js) contre une fausse base.
import test from "node:test";
import assert from "node:assert/strict";
import { MockDb, makeJwt } from "./helpers/mockDb.mjs";
import { makeRoomTx } from "../src/utils/roomTx.js";
import {
  ucInit, ucReady, ucClue, ucSkip, ucVote, ucGuess, ucGuessTimeout, ucAbort, ucWaitingFor, ucCurrent, UC_ROUNDS, UC_GUESS_MS,
} from "../src/utils/undercoverOnline.js";

const ENTRY = { word: "Naruto", aliases: ["Naruto Uzumaki"], hint: { fr: "Un ninja blond", en: "A blond ninja" } };
const fixedRand = (v) => () => v;
const USERS = ["ana", "ben", "cleo", "dan"];

function as(db, name) {
  const headers = { "Content-Type": "application/json", authorization: `Bearer ${makeJwt(`${name}@animood.me`)}`, apikey: "anon" };
  return {
    headers,
    async query(path, opts = {}) {
      const res = db.handle({ method: opts.method || "GET", url: `https://x.supabase.co/rest/v1/${path}`, headers: { ...headers, ...(opts.headers || {}) }, body: opts.body });
      if (res.status >= 400) throw new Error(res.body);
      return res.body ? JSON.parse(res.body) : null;
    },
  };
}
const txFor = (db, name) => makeRoomTx({ db: as(db, name), sleep: () => Promise.resolve() }).roomTx;

function seedRoom(db, state) {
  db.table("game_rooms").push({
    id: "uc-1", game_type: "undercover", player1: "ana", player2: "ben", player3: "cleo", player4: "dan", status: "active", ranked: false,
    private_code: "ABCDE", winner: null, elo1: 400, elo2: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), state,
  });
}

test("ucInit : un seul imposteur sans le mot, les autres ont le mot", () => {
  const s = ucInit({ users: USERS, entry: ENTRY, lang: "fr", rand: fixedRand(0.6) });
  assert.equal(s.players.filter((p) => p.isImpostor).length, 1);
  const imp = s.players.find((p) => p.isImpostor);
  assert.equal(imp.word, null); assert.equal(imp.hint, "Un ninja blond");
  assert.ok(s.players.filter((p) => !p.isImpostor).every((p) => p.word === "Naruto" && p.hint === null));
  assert.equal(s.phase, "reveal");
});

test("Déroulé complet : prêts → indices → votes → imposteur démasqué qui rate → résultat et points", () => {
  let s = ucInit({ users: USERS.slice(0, 3), entry: ENTRY, rand: fixedRand(0) });   // ana est l'imposteur
  assert.equal(ucReady(s, "intrus"), null);
  for (const u of ["ana", "ben"]) s = ucReady(s, u);
  assert.equal(s.phase, "reveal"); assert.equal(ucReady(s, "ana"), null, "déjà prêt = rien");
  s = ucReady(s, "cleo");
  assert.equal(s.phase, "clues");
  // pas son tour
  assert.deepEqual(ucClue(s, "ben", "ninja"), { error: "turn" });
  for (let i = 0; i < 3 * UC_ROUNDS; i++) {
    const who = ucCurrent(s).username;
    const r = ucClue(s, who, `mot${i}`);
    s = r.state;
  }
  assert.equal(s.phase, "vote");
  s = ucVote(s, "ana", "ben"); s = ucVote(s, "ben", "ana"); assert.equal(s.phase, "vote");
  assert.equal(ucVote(s, "ben", "cleo"), null, "un seul vote par joueur");
  assert.equal(ucVote(s, "cleo", "cleo"), null, "on ne vote pas pour soi");
  s = ucVote(s, "cleo", "ana", 1000);
  assert.equal(s.phase, "guess"); assert.equal(s.guessDeadline, 1000 + UC_GUESS_MS);
  assert.equal(ucGuess(s, "ben", "naruto"), null, "seul l'imposteur devine");
  assert.equal(ucGuessTimeout(s, 1000 + UC_GUESS_MS - 1), null);
  const timeout = ucGuessTimeout(s, 1000 + UC_GUESS_MS);
  assert.equal(timeout.phase, "result"); assert.deepEqual(timeout.result.pts, { ben: 3, cleo: 3 });
  const guessed = ucGuess(s, "ana", "naruto uzumaki");
  assert.equal(guessed.result.impostorGuessed, true); assert.deepEqual(guessed.result.pts, { ana: 2, ben: 1, cleo: 1 });
});

test("Imposteur non démasqué (égalité des votes) : 5 points pour lui, pas de dernière chance", () => {
  let s = ucInit({ users: USERS, entry: ENTRY, rand: fixedRand(0) });           // ana imposteur
  for (const u of USERS) s = ucReady(s, u);
  for (let i = 0; i < 4 * UC_ROUNDS; i++) s = ucClue(s, ucCurrent(s).username, `x${i}`).state;
  s = ucVote(s, "ana", "ben"); s = ucVote(s, "ben", "ana"); s = ucVote(s, "cleo", "dan"); s = ucVote(s, "dan", "cleo");
  assert.equal(s.phase, "result"); assert.deepEqual(s.result.pts, { ana: 5 }); assert.equal(s.result.impostorFound, false);
});

test("Un équipier ne peut pas dire le mot secret ; l'imposteur n'est jamais bloqué ; indice vide refusé", () => {
  let s = ucInit({ users: USERS.slice(0, 3), entry: ENTRY, rand: fixedRand(0.5) });   // ben imposteur (index 1)
  for (const u of USERS.slice(0, 3)) s = ucReady(s, u);
  assert.deepEqual(ucClue(s, "ana", "naruto"), { error: "forbidden" });
  assert.deepEqual(ucClue(s, "ana", "  "), { error: "empty" });
  s = ucClue(s, "ana", "ninja").state;
  assert.ok(ucClue(s, "ben", "Naruto").state, "l'imposteur peut écrire n'importe quoi");
});

test("Joueur absent : passer son tour, ou interrompre la partie sans point", () => {
  let s = ucInit({ users: USERS.slice(0, 3), entry: ENTRY, rand: fixedRand(0) });
  for (const u of USERS.slice(0, 3)) s = ucReady(s, u);
  assert.deepEqual(ucWaitingFor(s), ["ana"]);
  s = ucSkip(s); assert.equal(s.clues[0].skipped, true); assert.deepEqual(ucWaitingFor(s), ["ben"]);
  const aborted = ucAbort(s); assert.equal(aborted.phase, "result"); assert.deepEqual(aborted.result.pts, {}); assert.equal(aborted.result.aborted, true);
  assert.equal(ucAbort(aborted), null);
});

test("roomTx : quatre joueurs « prêts » en même temps, aucune écriture perdue", async () => {
  const db = new MockDb();
  seedRoom(db, ucInit({ users: USERS, entry: ENTRY, rand: fixedRand(0) }));
  const results = await Promise.all(USERS.map((u) => txFor(db, u)("uc-1", (s) => ucReady(s, u))));
  assert.ok(results.every((r) => r.ok), JSON.stringify(results));
  const st = db.table("game_rooms")[0].state;
  assert.equal(st.phase, "clues"); assert.deepEqual(Object.keys(st.ready).sort(), [...USERS].sort());
  assert.equal(st.v, 4, "une version par écriture");
  assert.equal(db.violations.length, 0);
});

test("roomTx : votes simultanés des quatre joueurs → tous comptés, une seule fin de vote", async () => {
  const db = new MockDb();
  let s = ucInit({ users: USERS, entry: ENTRY, rand: fixedRand(0) });
  s = { ...s, phase: "vote", clues: [], v: 7 };
  seedRoom(db, s);
  const picks = { ana: "ben", ben: "ana", cleo: "ana", dan: "ana" };
  await Promise.all(USERS.map((u) => txFor(db, u)("uc-1", (st) => ucVote(st, u, picks[u], 5000))));
  const st = db.table("game_rooms")[0].state;
  assert.equal(Object.keys(st.votes).length, 4);
  assert.equal(st.phase, "guess"); assert.equal(st.v, 11);
});

test("roomTx : fin de partie → la salle passe à « finished » avec le résultat ; ensuite plus aucune écriture", async () => {
  const db = new MockDb();
  let s = ucInit({ users: USERS.slice(0, 3), entry: ENTRY, rand: fixedRand(0) });
  s = { ...s, phase: "guess", guessDeadline: 1 };
  seedRoom(db, s);
  const patch = (next) => (next.phase === "result" ? { status: "finished" } : null);
  const r = await txFor(db, "ana")("uc-1", (st) => ucGuess(st, "ana", "bleach"), { patch });
  assert.equal(r.ok, true);
  assert.equal(db.table("game_rooms")[0].status, "finished");
  const again = await txFor(db, "ben")("uc-1", (st) => ucAbort(st), { patch });
  assert.deepEqual([again.ok, again.reason], [false, "closed"]);
});

test("roomTx : action sans effet = aucune écriture ; salle disparue signalée", async () => {
  const db = new MockDb();
  seedRoom(db, ucInit({ users: USERS, entry: ENTRY, rand: fixedRand(0) }));
  const r = await txFor(db, "ana")("uc-1", () => null);
  assert.deepEqual([r.ok, r.noop], [true, true]);
  assert.equal(db.table("game_rooms")[0].state.v, 0);
  const gone = await txFor(db, "ana")("nope", () => ({}));
  assert.deepEqual([gone.ok, gone.reason], [false, "gone"]);
});

test("roomTx : refus de sécurité (42501) → arrêt immédiat, erreur réseau → on réessaie", async () => {
  const db = new MockDb();
  seedRoom(db, ucInit({ users: USERS, entry: ENTRY, rand: fixedRand(0) }));
  db.failures.push({ match: (req) => req.method === "PATCH", status: 403, body: { code: "42501", message: "nope" }, once: true });
  const refused = await txFor(db, "ana")("uc-1", (st) => ucReady(st, "ana"));
  assert.deepEqual([refused.ok, refused.reason], [false, "refused"]);
  db.failures.push({ match: (req) => req.method === "PATCH", status: 503, body: "down", once: true });
  const retried = await txFor(db, "ana")("uc-1", (st) => ucReady(st, "ana"));
  assert.equal(retried.ok, true);
});

// ── Points des jeux à plusieurs ──────────────────────────────────────────────────────────────────────────────────────
import { awardPoints } from "../src/utils/awardPoints.js";
const seedElo = (db, u, extra = {}) => db.table("game_elo").push({ username: u, elo_chain: 400, elo_timeline: 400, points_total: 10, pts_wordle: 0, pts_poster: 0, pts_opquiz: 0, pts_cluescale: 4, pts_undercover: 0, updated_at: new Date().toISOString(), ...extra });

test("awardPoints : ajoute sur la colonne du jeu ET le total, ligne créée si besoin", async () => {
  const db = new MockDb(); seedElo(db, "ana");
  const r = await awardPoints({ db: as(db, "ana"), user: "ana", column: "pts_cluescale", amount: 6, sleep: () => Promise.resolve() });
  assert.deepEqual([r.ok, r.added], [true, 6]);
  const row = db.table("game_elo").find((x) => x.username === "ana");
  assert.deepEqual([row.pts_cluescale, row.points_total], [10, 16]);
  const fresh = await awardPoints({ db: as(db, "ben"), user: "ben", column: "pts_undercover", amount: 5, sleep: () => Promise.resolve() });
  assert.equal(fresh.ok, true);
  assert.deepEqual(db.table("game_elo").find((x) => x.username === "ben").pts_undercover, 5);
});

test("awardPoints : deux appareils en même temps → les deux ajouts comptent ; refus serveur et réseau remontés", async () => {
  const db = new MockDb(); seedElo(db, "ana");
  const sleep = () => Promise.resolve();
  const [a, b] = await Promise.all([1, 2].map((n) => awardPoints({ db: as(db, "ana"), user: "ana", column: "pts_undercover", amount: n * 3, sleep })));
  assert.equal(a.ok && b.ok, true);
  assert.equal(db.table("game_elo").find((x) => x.username === "ana").pts_undercover, 9);
  db.failures.push({ match: ({ method }) => method === "PATCH", status: 403, body: { code: "42501", message: "non" }, once: true });
  const refused = await awardPoints({ db: as(db, "ana"), user: "ana", column: "pts_undercover", amount: 3, sleep });
  assert.deepEqual([refused.ok, refused.error], [false, "refusé par le serveur"]);
  assert.deepEqual(await awardPoints({ db: as(db, "ana"), user: "ana", column: "pts_undercover", amount: 0, sleep }), { ok: true, added: 0 });
});
