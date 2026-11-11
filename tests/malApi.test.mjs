// Tests du client MyAnimeList (scripts/lib/malApi.mjs), Tenrai SEUL, contre un faux serveur local : réponses normales, 404, limite 429,
// panne et « disjoncteur ». (Le secours Jikan est testé dans tests/malFallback.test.mjs.)
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const seen = [];
let mode = "ok";
let hits429 = 0;
const server = http.createServer((req, res) => {
  seen.push({ url: req.url, key: req.headers["x-server-key"] || null });
  if (mode === "down") { res.writeHead(503); return res.end("x"); }
  if (req.url === "/v1/anime/404") { res.writeHead(404); return res.end("{}"); }
  if (req.url === "/v1/anime/429" && hits429++ < 1) { res.writeHead(429, { "retry-after": "0" }); return res.end("{}"); }
  if (req.url === "/v1/anime/403") { res.writeHead(403); return res.end("{}"); }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: { mal_id: 1, title: "Cowboy Bebop", score: 8.75 } }));
});
await new Promise((r) => server.listen(0, r));
process.env.TENRAI_BASE = `http://127.0.0.1:${server.address().port}/v1/`;
process.env.MAL_SOURCES = "tenrai";
process.env.TENRAI_SERVER_KEY = "secret";
process.env.TENRAI_GAP_MS = "1";
const { malGet, malData, malIsDown, malStats, MalApiDown } = await import("../scripts/lib/malApi.mjs");

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

test("403 → erreur claire, pas de panne déclarée", async () => {
  await assert.rejects(() => malGet("/anime/403"), /HTTP 403/);
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
