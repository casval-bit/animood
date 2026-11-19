// Tests du client AniList des scripts (scripts/lib/anilistApi.mjs) contre un faux serveur local :
// réponse normale, 429 (on attend puis on réessaie), erreurs 5xx, réponse illisible, ralentissement automatique après un 429.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const calls = [];
let script = [];                                    // réponses à donner, dans l'ordre (la dernière se répète)
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    calls.push({ method: req.method, type: req.headers["content-type"], body, at: Date.now() });
    const step = script.length > 1 ? script.shift() : script[0];
    res.writeHead(step.status, { "content-type": "application/json", ...(step.headers || {}) });
    res.end(step.raw ?? JSON.stringify(step.json ?? { data: { ok: true } }));
  });
});
await new Promise((r) => server.listen(0, r));
process.env.ANILIST_URL = `http://127.0.0.1:${server.address().port}`;
process.env.ANILIST_GAP_MS = "1";
const { anilistQuery, anilistStats, retryAfterSeconds } = await import("../scripts/lib/anilistApi.mjs");
const quiet = { log: () => {}, backoffMs: 1 };

test.after(() => server.close());

test("réponse normale : requête POST avec la requête GraphQL et ses variables", async () => {
  script = [{ status: 200, json: { data: { Page: { media: [] } } } }];
  calls.length = 0;
  const d = await anilistQuery("query($ids:[Int]){X}", { ids: [1, 2] }, quiet);
  assert.deepEqual(d, { data: { Page: { media: [] } } });
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].type, /application\/json/);
  assert.deepEqual(JSON.parse(calls[0].body), { query: "query($ids:[Int]){X}", variables: { ids: [1, 2] } });
});

test("429 : on attend le délai demandé puis on obtient la réponse", async () => {
  script = [{ status: 429, headers: { "retry-after": "0" } }, { status: 200, json: { data: { ok: 1 } } }];
  const before = anilistStats().throttled;
  const logs = [];
  const d = await anilistQuery("q", {}, { log: (m) => logs.push(m), backoffMs: 1 });
  assert.equal(d.data.ok, 1);
  assert.equal(anilistStats().throttled, before + 1);
  assert.ok(logs.some((l) => /429/.test(l)), "le 429 est signalé dans le journal");
});

test("erreur 500 : nouvel essai ; panne persistante : erreur claire", async () => {
  script = [{ status: 503, raw: "oups" }, { status: 200, json: { data: { ok: 2 } } }];
  assert.equal((await anilistQuery("q", {}, quiet)).data.ok, 2);
  script = [{ status: 502, raw: "oups" }];
  await assert.rejects(() => anilistQuery("q", {}, { ...quiet, tries: 3 }), /AniList indisponible \(HTTP 502\)/);
});

test("réponse illisible (page HTML) : on réessaie", async () => {
  script = [{ status: 200, raw: "<html>maintenance</html>" }, { status: 200, json: { data: { ok: 3 } } }];
  assert.equal((await anilistQuery("q", {}, quiet)).data.ok, 3);
});

test("erreur GraphQL (400) : le JSON est renvoyé tel quel, sans nouvel essai", async () => {
  script = [{ status: 400, json: { errors: [{ message: "Invalid query" }] } }];
  calls.length = 0;
  const d = await anilistQuery("q", {}, quiet);
  assert.equal(d.errors[0].message, "Invalid query");
  assert.equal(calls.length, 1);
});

test("Retry-After : borné, avec valeur par défaut si absent ou illisible", () => {
  assert.equal(retryAfterSeconds(null), 60);
  assert.equal(retryAfterSeconds(""), 60);
  assert.equal(retryAfterSeconds("abc"), 60);
  assert.equal(retryAfterSeconds("0"), 0);
  assert.equal(retryAfterSeconds("7"), 7);
  assert.equal(retryAfterSeconds("9999"), 65);
  assert.equal(retryAfterSeconds("-5"), 0);
});

test("sans rythme imposé : après un 429, les requêtes suivantes sont espacées de plus de 2 s (mode « dégradé » d'AniList)", async () => {
  delete process.env.ANILIST_GAP_MS;
  const fresh = await import("../scripts/lib/anilistApi.mjs?adaptive");   // nouvelle instance : lit l'environnement sans rythme fixe
  process.env.ANILIST_GAP_MS = "1";
  script = [{ status: 429, headers: { "retry-after": "0" } }, { status: 200, json: { data: { n: 1 } } }, { status: 200, json: { data: { n: 2 } } }];
  calls.length = 0;
  await fresh.anilistQuery("q", {}, quiet);        // 429 puis réponse
  await fresh.anilistQuery("q", {}, quiet);        // deuxième requête : doit respecter le nouveau rythme
  assert.equal(calls.length, 3);
  assert.equal(fresh.anilistStats().slowed, true);
  assert.ok(calls[2].at - calls[1].at >= 2000, `écart ${calls[2].at - calls[1].at} ms (≥ 2100 attendu)`);
  assert.ok(calls[1].at - calls[0].at >= 2000, "la requête refaite après le 429 respecte aussi le nouveau rythme");
});
