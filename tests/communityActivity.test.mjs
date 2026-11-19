// Tests du classement « animés les plus actifs cette semaine » (src/utils/communityActivity.js) : pondération, fenêtre de 7 jours,
// plafond par membre, notes en rafale (import AniList), membres bloqués, égalités, et récupération des évènements (sources, animé d'un commentaire).
import test from "node:test";
import assert from "node:assert/strict";
import { rankActivity, collectEvents, WEIGHTS, MEMBER_CAP, VOTE_BURST, WEEK_MS } from "../src/utils/communityActivity.js";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();
const ev = (kind, mal_id, username, hoursAgo = 5) => ({ kind, mal_id, username, at: ago(hoursAgo) });
const rank = (events, opts = {}) => rankActivity(events, { now: NOW, ...opts });

test("pondération : poster ou lancer un sujet (3) > commenter ou répondre (2) > noter (1)", () => {
  assert.deepEqual(WEIGHTS, { post: 3, thread: 3, comment: 2, reply: 2, vote: 1 });
  const r = rank([ev("post", 1, "a"), ev("comment", 1, "b"), ev("vote", 2, "a"), ev("vote", 2, "b"), ev("vote", 2, "c"), ev("vote", 3, "a")]);
  assert.deepEqual(r.map((x) => [x.mal_id, x.score]), [[1, 5], [2, 3], [3, 1]]);
  assert.deepEqual([r[0].members, r[0].actions], [2, 2]);
});

test("période : au-delà de 7 jours, dates du futur, dates illisibles ou lignes incomplètes sont ignorées", () => {
  const r = rank([
    ev("post", 1, "a", 24 * 7 - 1),                       // dans la fenêtre (6 j 23 h)
    ev("post", 2, "a", 24 * 7 + 1),                       // trop ancien
    { kind: "post", mal_id: 3, username: "a", at: new Date(NOW + 5 * 3600_000).toISOString() },   // dans le futur
    { kind: "post", mal_id: 4, username: "a", at: "n'importe quoi" },
    { kind: "post", mal_id: 5, username: "", at: ago(1) },
    { kind: "post", mal_id: 0, username: "a", at: ago(1) },
    { kind: "post", mal_id: "abc", username: "a", at: ago(1) },
    { kind: "like", mal_id: 6, username: "a", at: ago(1) },
    null, undefined,
  ]);
  assert.deepEqual(r.map((x) => x.mal_id), [1]);
  assert.equal(WEEK_MS, 7 * 24 * 3600 * 1000);
});

test("une horloge en avance d'une heure au plus est tolérée", () => {
  const r = rank([{ kind: "post", mal_id: 1, username: "a", at: new Date(NOW + 30 * 60_000).toISOString() }]);
  assert.equal(r.length, 1);
});

test("plafond par membre : un seul bavard ne fait pas monter un animé à lui seul", () => {
  const spam = Array.from({ length: 12 }, () => ev("reply", 1, "bavard"));                 // 12 × 2 = 24 points, plafonnés à 6
  const trois = [ev("post", 2, "a"), ev("post", 2, "b"), ev("post", 2, "c")];             // 3 membres : 9 points
  const r = rank([...spam, ...trois]);
  assert.deepEqual(r.map((x) => [x.mal_id, x.score]), [[2, 9], [1, MEMBER_CAP]]);
  assert.equal(r[1].actions, 12, "le nombre d'interactions affiché reste le vrai");
});

test("notes en rafale (import AniList) : au-delà de 10 notes par membre, ses notes ne comptent pas", () => {
  const importeur = Array.from({ length: VOTE_BURST + 1 }, (_, i) => ev("vote", 100 + i, "importeur"));
  const limite = Array.from({ length: VOTE_BURST }, (_, i) => ev("vote", 200 + i, "limite"));
  const r = rank([...importeur, ...limite, ev("post", 100, "importeur")]);
  assert.ok(!r.some((x) => x.mal_id === 101), "ses notes sont écartées");
  assert.deepEqual(r.find((x) => x.mal_id === 100), { mal_id: 100, members: 1, actions: 1, lastAt: NOW - 5 * 3600_000, score: 3 }, "mais son post compte");
  assert.equal(r.filter((x) => x.mal_id >= 200).length, VOTE_BURST, "10 notes pile : elles comptent");
});

test("membres bloqués : leur activité est ignorée", () => {
  const r = rank([ev("post", 1, "ami"), ev("post", 1, "bloque"), ev("post", 2, "bloque")], { exclude: new Set(["bloque"]) });
  assert.deepEqual(r.map((x) => [x.mal_id, x.members]), [[1, 1]]);
});

test("égalités : plus de membres, puis activité la plus récente, puis identifiant", () => {
  const r = rank([
    ev("post", 10, "a", 3), ev("post", 10, "b", 3),                       // 6 points, 2 membres
    ev("post", 20, "a", 2), ev("post", 20, "a", 2),                       // 6 points, 1 membre
    ev("vote", 30, "a", 1), ev("vote", 30, "b", 9),                       // 2 points, 2 membres, dernière activité il y a 1 h
    ev("vote", 31, "a", 6), ev("vote", 31, "b", 7),                       // 2 points, 2 membres, dernière activité il y a 6 h
    ev("vote", 40, "a", 5), ev("vote", 40, "b", 5),                       // identique à 41 (même instant) : l'identifiant le plus bas d'abord
    ev("vote", 41, "a", 5), ev("vote", 41, "b", 5),
  ]);
  assert.deepEqual(r.map((x) => x.mal_id), [10, 20, 30, 40, 41, 31]);
});

test("limite : seuls les premiers sont renvoyés", () => {
  const events = Array.from({ length: 30 }, (_, i) => ev("post", i + 1, "a", 1 + i / 100));
  assert.equal(rank(events, { limit: 5 }).length, 5);
  assert.equal(rank(events).length, 24);
});

test("entrée vide ou absente : liste vide", () => {
  assert.deepEqual(rank([]), []);
  assert.deepEqual(rank(null), []);
});

// ── Récupération des évènements ──────────────────────────────────────────────────────────────────────────────────
function fakeDb(tables) {
  const calls = [];
  const query = async (path) => {
    calls.push(path);
    const name = path.split("?")[0];
    const t = tables[name];
    if (t instanceof Error) throw t;
    if (!t) return [];
    const inList = /[?&]id=in\.\(([^)]*)\)/.exec(path);
    if (inList) return t.filter((r) => inList[1].split(",").includes(String(r.id)));
    const since = /[?&](?:created_at|voted_at)=gte\.([^&]+)/.exec(path);                    // filtre de période, comme PostgREST
    return since ? t.filter((r) => Date.parse(r.created_at ?? r.voted_at) >= Date.parse(decodeURIComponent(since[1]))) : t;
  };
  return { query, calls };
}

test("collectEvents : chaque source devient un évènement ; un commentaire prend l'animé de son post, même plus ancien que la période", async () => {
  const db = fakeDb({
    user_votes: [{ mal_id: 1, username: "a", voted_at: ago(2) }],
    posts: [{ id: 10, anime_id: 1, username: "b", created_at: ago(3) }, { id: 11, anime_id: 2, username: "c", created_at: ago(4) }, { id: 5, anime_id: 9, username: "z", created_at: ago(24 * 20) }],
    comments: [{ post_id: 10, username: "d", created_at: ago(1) }, { post_id: 5, username: "e", created_at: ago(1) }, { post_id: 999, username: "f", created_at: ago(1) }],
    forum_threads: [{ id: 7, anime_id: 3, username: "g", created_at: ago(6) }, { id: 8, anime_id: 4, username: "h", created_at: ago(24 * 15) }],
    forum_replies: [{ thread_id: 7, username: "i", created_at: ago(2) }, { thread_id: 8, username: "j", created_at: ago(2) }],
  });
  const events = await collectEvents(db.query, { now: NOW });
  const by = (kind) => events.filter((e) => e.kind === kind);
  assert.equal(by("vote").length, 1);
  assert.equal(by("post").length, 2, "le post de il y a 20 jours est hors période");
  assert.deepEqual(by("comment").map((e) => [e.username, e.mal_id]), [["d", 1], ["e", 9], ["f", undefined]], "le post 5 (ancien) est retrouvé par la 2e requête ; le post 999 n'existe pas");
  assert.deepEqual(by("thread").map((e) => e.mal_id), [3], "le sujet de il y a 15 jours est hors période");
  assert.deepEqual(by("reply").map((e) => [e.username, e.mal_id]), [["i", 3], ["j", 4]]);
  const ranked = rank(events);
  assert.ok(!ranked.some((x) => x.mal_id === undefined || Number.isNaN(x.mal_id)), "un commentaire sans animé connu n'est pas classé");
  assert.ok(db.calls.some((c) => /^posts\?id=in\.\(5,999\)/.test(c)), "2e requête pour les posts plus anciens");
  assert.ok(db.calls.some((c) => /^forum_threads\?id=in\.\(8\)/.test(c)), "2e requête pour les sujets plus anciens");
  for (const c of db.calls.filter((c) => /voted_at|created_at/.test(c))) assert.match(c, new RegExp(`gte\\.${encodeURIComponent(new Date(NOW - WEEK_MS).toISOString())}`), "période de 7 jours");
});

test("collectEvents : une table qui échoue (droits, réseau) n'empêche pas les autres", async () => {
  const db = fakeDb({
    user_votes: new Error("permission denied"),
    posts: [{ id: 1, anime_id: 5, username: "a", created_at: ago(1) }],
    comments: new Error("boom"),
  });
  const events = await collectEvents(db.query, { now: NOW });
  assert.deepEqual(events.map((e) => e.kind), ["post"]);
});

test("collectEvents : aucune donnée → liste vide, et au plus 5 requêtes quand rien n'est à retrouver", async () => {
  const db = fakeDb({});
  assert.deepEqual(await collectEvents(db.query, { now: NOW }), []);
  assert.equal(db.calls.length, 5);
});
