// Tests du secours Jikan (scripts/lib/malApi.mjs) : Tenrai répond d'abord ; s'il est en panne, refuse la clé ou ne connaît pas l'anime,
// c'est Jikan qui répond. Deux faux serveurs locaux, un par source.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const hits = { tenrai: [], jikan: [] };
const modes = { tenrai: "ok", jikan: "ok" };
const answer = (name) => (req, res) => {
  hits[name].push(req.url);
  const mode = modes[name];
  if (mode === "down") { res.writeHead(503); return res.end("x"); }
  if (mode === "forbidden") { res.writeHead(403); return res.end("{}"); }
  if (mode === "empty" || req.url.endsWith("/unknown")) { res.writeHead(404); return res.end("{}"); }
  if (mode === "badjson") { res.writeHead(200); return res.end("<html>oops</html>"); }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ data: { mal_id: 1, title: `Cowboy Bebop (${name})` } }));
};
const servers = { tenrai: http.createServer(answer("tenrai")), jikan: http.createServer(answer("jikan")) };
await Promise.all(Object.values(servers).map((s) => new Promise((r) => s.listen(0, r))));
process.env.TENRAI_BASE = `http://127.0.0.1:${servers.tenrai.address().port}/v1`;
process.env.JIKAN_BASE = `http://127.0.0.1:${servers.jikan.address().port}/v4`;
process.env.TENRAI_GAP_MS = "1";
process.env.JIKAN_GAP_MS = "1";
const { malGet, malData, malIsDown, malStats, malSource, malSummary, MalApiDown } = await import("../scripts/lib/malApi.mjs");

test("Tenrai répond : Jikan n'est pas sollicité", async () => {
  const d = await malData("/anime/1");
  assert.equal(d.title, "Cowboy Bebop (tenrai)");
  assert.equal(hits.jikan.length, 0);
  assert.equal(malSource(), "Tenrai");
});

test("anime inconnu de Tenrai (404) : Jikan est interrogé avant de conclure", async () => {
  modes.tenrai = "empty";
  const d = await malData("/anime/1");
  assert.equal(d.title, "Cowboy Bebop (jikan)");
  assert.equal(malSource(), "Jikan");
  modes.tenrai = "ok";
});

test("inconnu partout : null, pas une erreur", async () => {
  assert.equal(await malGet("/anime/unknown"), null);
  assert.equal(malIsDown(), false);
});

test("Tenrai refuse la clé (403) : Jikan répond à la place", async () => {
  modes.tenrai = "forbidden";
  const d = await malData("/anime/1");
  assert.equal(d.title, "Cowboy Bebop (jikan)");
  modes.tenrai = "ok";
});

test("réponse illisible de Tenrai : Jikan répond à la place", async () => {
  modes.tenrai = "badjson";
  const d = await malData("/anime/1", { tries: 1 });
  assert.equal(d.title, "Cowboy Bebop (jikan)");
  modes.tenrai = "ok";
});

test("option source : une seule source interrogée, sans secours", async () => {
  const before = hits.jikan.length;
  const d = await malData("/anime/1", { source: "tenrai" });
  assert.equal(d.title, "Cowboy Bebop (tenrai)");
  assert.equal(hits.jikan.length, before);
  const j = await malData("/anime/1", { source: "jikan" });
  assert.equal(j.title, "Cowboy Bebop (jikan)");
});

test("Tenrai en panne : disjoncteur sur Tenrai seul, Jikan continue de répondre", async () => {
  modes.tenrai = "down";
  for (let i = 0; i < 6; i++) assert.equal((await malData("/anime/1", { tries: 1 })).title, "Cowboy Bebop (jikan)");
  assert.equal(malStats().sources[0].down, true, "Tenrai déclaré en panne");
  assert.equal(malIsDown(), false, "mais le script continue grâce à Jikan");
  const before = hits.tenrai.length;
  assert.equal((await malData("/anime/1")).title, "Cowboy Bebop (jikan)");
  assert.equal(hits.tenrai.length, before, "plus aucune requête vers Tenrai une fois le disjoncteur ouvert");
});

test("les deux sources en panne : MalApiDown, puis échec immédiat", async () => {
  modes.jikan = "down";
  for (let i = 0; i < 6; i++) await assert.rejects(() => malGet("/anime/1", { tries: 1 }), MalApiDown);
  assert.equal(malIsDown(), true);
  const before = hits.jikan.length;
  await assert.rejects(() => malGet("/anime/1"), MalApiDown);
  assert.equal(hits.jikan.length, before);
});

test("résumé de fin de rapport", () => {
  const sum = malSummary();
  assert.match(sum, /Tenrai \d+\/\d+/);
  assert.match(sum, /Jikan \d+\/\d+.*\(secours\)/);
});

test.after(() => Object.values(servers).forEach((s) => s.close()));
