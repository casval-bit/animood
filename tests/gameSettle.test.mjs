// Tests de l'enregistrement des points / de l'ELO (src/utils/gameSettle.js) contre une fausse base Supabase qui applique
// les mêmes règles de sécurité que la vraie (tests/helpers/mockDb.mjs). Lancer : npm test
import test from "node:test";
import assert from "node:assert/strict";
import { MockDb, makeJwt } from "./helpers/mockDb.mjs";
import { makeSettler, settlementView, withSettlementFields, CLAIM_TTL_MS } from "../src/utils/gameSettle.js";
import { duelResult } from "../src/utils/gameRules.js";

const fastSleep = () => Promise.resolve();

/** Accès à la base « en tant que » un joueur (même forme que `sb` : query + headers). */
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
const settlerFor = (db, name, extra = {}) => makeSettler({ db: as(db, name), sleep: fastSleep, ...extra });

function finishedRoom(db, { game = "timeline", mode = "ranked", elo1 = 400, elo2 = 400, ...resultArgs } = {}) {
  const room = {
    id: "room-1", game_type: game, player1: "alice", player2: "bob", elo1, elo2,
    ranked: mode === "ranked", private_code: mode === "friend" ? "ABCDE" : null,
  };
  const result = withSettlementFields(duelResult({ game, room, ...resultArgs }));
  db.table("game_rooms").push({
    ...room, status: "finished", winner: result.winner, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    player3: null, player4: null, state: { phase: "gameEnd", result },
  });
  return { room, result };
}
const eloRow = (db, u) => db.table("game_elo").find((r) => r.username === u);
const seedElo = (db, u, extra = {}) => db.table("game_elo").push({ username: u, elo_chain: 400, elo_timeline: 400, points_total: 0, pts_wordle: 0, pts_poster: 0, pts_opquiz: 0, pts_cluescale: 0, pts_undercover: 0, updated_at: new Date().toISOString(), ...extra });
const applied = (db) => db.table("game_rooms")[0].state.result.applied;

test("Celui qui termine la partie enregistre les DEUX joueurs, et chacun voit ce qu'il a gagné", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { winner: "alice" });
  const out = await settlerFor(db, "alice").settle({ roomId: room.id, result, me: "alice", users: ["alice", "bob"] });
  assert.equal(out.alice.ok, true); assert.equal(out.bob.ok, true);
  assert.deepEqual([eloRow(db, "alice").elo_timeline, eloRow(db, "alice").points_total], [420, 20]);
  assert.deepEqual([eloRow(db, "bob").elo_timeline, eloRow(db, "bob").points_total], [380, 5]);
  const fresh = db.table("game_rooms")[0].state.result;
  assert.deepEqual(settlementView(fresh, "alice"), { status: "done", elo: 20, pts: 20, oldElo: 400, newElo: 420 });
  assert.deepEqual(settlementView(fresh, "bob"), { status: "done", elo: -20, pts: 5, oldElo: 400, newElo: 380 });
  assert.equal(db.violations.length, 0);
});

test("Abandon : le joueur qui reste GAGNE de l'ELO et des points (régression « mon ami ne gagnait rien »)", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { kind: "forfeit", leaver: "bob" });
  // bob (celui qui part) clôt la partie : c'est lui qui enregistre, y compris la ligne d'alice
  const out = await settlerFor(db, "bob").settle({ roomId: room.id, result, me: "bob", users: ["bob", "alice"] });
  assert.equal(out.bob.ok && out.alice.ok, true, JSON.stringify(out));
  assert.deepEqual([eloRow(db, "alice").elo_timeline, eloRow(db, "alice").points_total], [420, 20]);
  assert.deepEqual([eloRow(db, "bob").elo_timeline, eloRow(db, "bob").points_total], [370, 0]);
});

test("Abandon (adversaire parti) : le gagnant applique aussi la pénalité du joueur disparu", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { kind: "timeout", leaver: "bob" });
  const out = await settlerFor(db, "alice").settle({ roomId: room.id, result, me: "alice", users: ["alice", "bob"] });
  assert.equal(out.alice.ok && out.bob.ok, true, JSON.stringify(out));
  assert.equal(eloRow(db, "bob").elo_timeline, 370);
  assert.equal(eloRow(db, "alice").elo_timeline, 420);
});

test("Filet de sécurité : l'autre joueur n'enregistre pas une seconde fois ce qui est déjà fait", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { winner: "alice" });
  await settlerFor(db, "alice").settle({ roomId: room.id, result, me: "alice", users: ["alice", "bob"] });
  const out = await settlerFor(db, "bob").settle({ roomId: room.id, result, me: "bob", users: ["bob"], graceMs: 4000 });
  assert.equal(out.bob.already, true);
  assert.deepEqual([eloRow(db, "bob").elo_timeline, eloRow(db, "bob").points_total], [380, 5]);
});

test("Filet de sécurité : si le terminateur a disparu, le joueur concerné enregistre sa propre ligne", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { winner: "alice" });
  const out = await settlerFor(db, "bob").settle({ roomId: room.id, result, me: "bob", users: ["bob"], graceMs: 4000 });
  assert.equal(out.bob.ok, true);
  assert.deepEqual([eloRow(db, "bob").elo_timeline, eloRow(db, "bob").points_total], [380, 5]);
  assert.equal(eloRow(db, "alice").elo_timeline, 400);               // sa ligne à elle n'a pas été touchée
});

test("Deux appareils en même temps sur la même ligne : appliquée une seule fois", async () => {
  for (let i = 0; i < 20; i++) {
    const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
    const { room, result } = finishedRoom(db, { winner: "alice" });
    const sa = settlerFor(db, "alice"), sb = settlerFor(db, "bob");
    await Promise.all([
      sa.settle({ roomId: room.id, result, me: "alice", users: ["alice", "bob"] }),
      sb.settle({ roomId: room.id, result, me: "bob", users: ["bob", "alice"] }),
    ]);
    assert.equal(eloRow(db, "alice").elo_timeline, 420, `alice appliquée deux fois ? (essai ${i})`);
    assert.equal(eloRow(db, "bob").elo_timeline, 380, `bob appliquée deux fois ? (essai ${i})`);
    assert.equal(eloRow(db, "alice").points_total, 20); assert.equal(eloRow(db, "bob").points_total, 5);
    assert.ok(applied(db).alice.done && applied(db).bob.done);
  }
});

test("Une erreur n'est jamais avalée : elle est enregistrée dans la salle, visible à l'écran, et « Réessayer » fonctionne", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { winner: "alice" });
  db.failures.push({ match: ({ method, table }) => method === "PATCH" && table === "game_elo", status: 500, body: { message: "boom" } });
  const s = settlerFor(db, "alice");
  const out = await s.settle({ roomId: room.id, result, me: "alice", users: ["alice"] });
  assert.equal(out.alice.ok, false);
  assert.match(out.alice.error, /boom|rejeté|erreur/i);
  assert.equal(eloRow(db, "alice").elo_timeline, 400);
  assert.equal(settlementView(db.table("game_rooms")[0].state.result, "alice").status, "failed");
  db.failures.length = 0;                                             // la connexion revient : on réessaie
  const again = await s.settle({ roomId: room.id, result: db.table("game_rooms")[0].state.result, me: "alice", users: ["alice"] });
  assert.equal(again.alice.ok, true);
  assert.equal(eloRow(db, "alice").elo_timeline, 420);
  assert.equal(settlementView(db.table("game_rooms")[0].state.result, "alice").status, "done");
});

test("Refus des règles de sécurité : signalé clairement, et rien n'est appliqué à moitié", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { winner: "alice" });
  db.failures.push({ match: ({ method, table }) => method === "PATCH" && table === "game_elo", status: 403, body: { code: "42501", message: "ELO Timeline : aucune partie récente" } });
  const out = await settlerFor(db, "alice").settle({ roomId: room.id, result, me: "alice", users: ["alice"] });
  assert.equal(out.alice.ok, false);
  assert.equal(out.alice.error, "refusé par le serveur");
  assert.equal(eloRow(db, "alice").elo_timeline, 400);
  assert.equal(settlementView(db.table("game_rooms")[0].state.result, "alice").status, "failed");
});

test("Entre amis : des points, jamais d'ELO ; contre l'IA : rien", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { mode: "friend", winner: "alice" });
  await settlerFor(db, "alice").settle({ roomId: room.id, result, me: "alice", users: ["alice", "bob"] });
  assert.deepEqual([eloRow(db, "alice").elo_timeline, eloRow(db, "alice").points_total], [400, 10]);
  assert.deepEqual([eloRow(db, "bob").elo_timeline, eloRow(db, "bob").points_total], [400, 3]);
  const ai = duelResult({ game: "timeline", room: { player1: "alice", player2: "IA", _isAI: true }, winner: "alice" });
  assert.deepEqual(await settlerFor(db, "alice").settle({ roomId: "ai-1", result: ai, me: "alice", users: ["alice"] }), {});
  assert.equal(settlementView(ai, "alice").status, "none");
});

test("Une première partie crée la ligne du classement ; l'ELO ne descend jamais sous 0", async () => {
  const db = new MockDb(); seedElo(db, "bob", { elo_timeline: 10 });
  const { room, result } = finishedRoom(db, { winner: "alice", elo1: 10, elo2: 10 });
  const out = await settlerFor(db, "alice").settle({ roomId: room.id, result, me: "alice", users: ["alice", "bob"] });
  assert.equal(out.alice.ok && out.bob.ok, true, JSON.stringify(out));
  assert.equal(eloRow(db, "alice").elo_timeline, 420);
  assert.equal(eloRow(db, "bob").elo_timeline, 0);
  assert.equal(out.bob.eloDelta, -10);
  assert.equal(settlementView(db.table("game_rooms")[0].state.result, "bob").elo, -10);
});

test("Réservation en cours par un autre appareil : on attend ; périmée : on reprend la main", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { winner: "alice" });
  const r = db.table("game_rooms")[0];
  r.state.result.applied = { bob: { by: "alice", at: Date.now(), done: false } };
  let out = await settlerFor(db, "bob").settle({ roomId: room.id, result, me: "bob", users: ["bob"] });
  assert.deepEqual([out.bob.ok, out.bob.pending], [false, true]);
  assert.equal(eloRow(db, "bob").elo_timeline, 400);
  r.state.result.applied.bob.at = Date.now() - CLAIM_TTL_MS - 1000;       // le premier appareil a dû planter
  out = await settlerFor(db, "bob").settle({ roomId: room.id, result, me: "bob", users: ["bob"] });
  assert.equal(out.bob.ok, true);
  assert.equal(eloRow(db, "bob").elo_timeline, 380);
});

test("Pas d'ELO appliqué deux fois par le même appareil, même si le marquage « fait » échoue", async () => {
  const db = new MockDb(); seedElo(db, "alice"); seedElo(db, "bob");
  const { room, result } = finishedRoom(db, { winner: "alice" });
  let failMarks = 3;                                                // les 3 premiers marquages « fait » échouent
  db.failures.push({ match: ({ method, table, body }) => method === "PATCH" && table === "game_rooms" && /"done":true/.test(body || "") && failMarks-- > 0, status: 500 });
  const s = settlerFor(db, "alice");
  await s.settle({ roomId: room.id, result, me: "alice", users: ["alice"] });
  db.failures.length = 0;
  await s.settle({ roomId: room.id, result, me: "alice", users: ["alice"] });   // nouvelle tentative (bouton « Réessayer »)
  assert.equal(eloRow(db, "alice").elo_timeline, 420);
  assert.equal(eloRow(db, "alice").points_total, 20);
  assert.equal(applied(db).alice.done, true);
});
