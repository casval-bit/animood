// Tests du client MyAnimeList (scripts/lib/malApi.mjs) — Tenrai seul — contre un faux serveur local : réponses normales, 404, limite 429,
// réponse illisible, Server Key refusée (on continue sans clé), panne et « disjoncteur ».
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const seen = [];
let mode = "ok";
let hits429 = 0, hitsJson = 0, rejectKey = false;
const server = http.createServer((req, res) => {
  seen.push({ url: req.url, key: req.headers["x-server-key"] || null });
  if (mode === "down") { res.writeHead(503); return res.end("x"); }
  if (rejectKey && req.headers["x-server-key"]) { res.writeHead(401); return res.end("{}"); }   // Server Key refusée (expirée / révoquée)
  if (req.url === "/v1/anime/404") { res.writeHead(404); return res.end("{}"); }
  if (req.url === "/v1/anime/429" && hits429++ < 1) { res.writeHead(429, { "retry-after": "0" }); return res.end("{}"); }
  if (req.url === "/v1/anime/403") { res.writeHead(403); return res.end("{}"); }
  if (req.url === "/v1/anime/badjson" && hitsJson++ < 1) { res.writeHead(200, { "content-type": "application/json" }); return res.end("<html>oups"); }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: { mal_id: 1, title: "Cowboy Bebop", score: 8.75 } }));
});
await new Promise((r) => server.listen(0, r));
process.env.TENRAI_BASE = `http://127.0.0.1:${server.address().port}/v1/`;
process.env.TENRAI_SERVER_KEY = "secret";
process.env.TENRAI_GAP_MS = "1";
const { malGet, malData, malIsDown, malStats, malSummary, MalApiDown } = await import("../scripts/lib/malApi.mjs");

test("réponse normale + clé envoyée dans X-Server-Key (adresse sans double « / »)", async () => {
  const d = await malData("/anime/1");
  assert.equal(d.title, "Cowboy Bebop");
  assert.equal(seen[0].url, "/v1/anime/1");
  assert.equal(seen[0].key, "secret");
});

test("404 → null, pas une panne", async () => {
  assert.equal(await malGet("/anime/404"), null);
  assert.equal(malIsDown(), false);
});

test("429 → on réessaie et on obtient la réponse", async () => {
  const j = await malGet("/anime/429");
  assert.equal(j.data.title, "Cowboy Bebop");
  assert.equal(malStats().throttled, 1);
});

test("réponse illisible (page d'erreur au lieu du JSON) → on réessaie et on obtient la réponse", async () => {
  const j = await malGet("/anime/badjson", { tries: 2 });
  assert.equal(j.data.title, "Cowboy Bebop");
  assert.equal(malIsDown(), false);
});

test("Server Key refusée (401) → la requête est refaite SANS clé et les suivantes aussi, sans panne", async () => {
  rejectKey = true;
  const logs = []; const orig = console.log; console.log = (...a) => logs.push(a.join(" "));
  try {
    const mark = seen.length;
    const j = await malGet("/anime/1");
    assert.equal(j.data.title, "Cowboy Bebop", "la réponse arrive malgré la clé refusée");
    assert.equal(seen[mark].key, "secret", "d'abord essayé avec la clé");
    assert.equal(seen[mark + 1].key, null, "puis refait sans clé");
    await malGet("/anime/1");
    assert.equal(seen[seen.length - 1].key, null, "les requêtes suivantes partent directement sans clé");
    assert.equal(malStats().keyRefused, true);
    assert.equal(malStats().withKey, false);
    assert.equal(malIsDown(), false);
    assert.match(malSummary(), /Server Key refusée/);
    assert.ok(logs.some((l) => /Server Key refusée/.test(l)), "un avertissement est affiché une fois");
    assert.equal(logs.filter((l) => /Server Key refusée/.test(l)).length, 1);
  } finally { console.log = orig; rejectKey = false; }
});

test("403 sans clé → erreur claire (pas de nouvelle tentative inutile), pas de panne déclarée", async () => {
  const mark = seen.length;
  await assert.rejects(() => malGet("/anime/403"), /HTTP 403/);
  assert.equal(seen.length - mark, 1, "une seule requête : rien à réessayer");
  assert.equal(malIsDown(), false);
});

test("panne : après 6 appels échoués d'affilée, les suivants échouent tout de suite", async () => {
  mode = "down";
  for (let i = 0; i < 6; i++) await assert.rejects(() => malGet("/anime/1", { tries: 1 }), MalApiDown);
  assert.equal(malIsDown(), true);
  const before = seen.length;
  await assert.rejects(() => malGet("/anime/1"), MalApiDown);
  assert.equal(seen.length, before, "aucune requête envoyée une fois le disjoncteur ouvert");
});

test.after(() => server.close());
