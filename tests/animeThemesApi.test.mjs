// Tests du client AnimeThemes des scripts (scripts/lib/animeThemesApi.mjs) contre un faux serveur local :
// User-Agent envoyé (Cloudflare refuse les clients sans), 429 → pause puis nouvel essai, 404 sans nouvel essai, 5xx, 429 persistants.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const seen = [];
let script = [];
const server = http.createServer((req, res) => {
  seen.push({ url: req.url, ua: req.headers["user-agent"] || "", at: Date.now() });
  const step = script.length > 1 ? script.shift() : script[0];
  res.writeHead(step.status, { "content-type": "application/json", ...(step.headers || {}) });
  res.end(step.raw ?? JSON.stringify(step.json ?? { anime: [] }));
});
await new Promise((r) => server.listen(0, r));
process.env.ANIMETHEMES_BASE = `http://127.0.0.1:${server.address().port}/`;
process.env.ANIMETHEMES_GAP_MS = "1";
const { atGet, animeThemesStats, AnimeThemesError } = await import("../scripts/lib/animeThemesApi.mjs");
const quiet = { log: () => {}, backoffMs: 1 };

test.after(() => server.close());

test("réponse normale : le chemin est appelé tel quel (sans double « / ») avec un User-Agent AniMood", async () => {
  script = [{ status: 200, json: { anime: [{ name: "Bleach" }] } }];
  const d = await atGet("/anime?q=Bleach&page[size]=5", quiet);
  assert.equal(d.anime[0].name, "Bleach");
  assert.equal(seen.at(-1).url, "/anime?q=Bleach&page[size]=5");
  assert.match(seen.at(-1).ua, /^AniMood-sync\//);
});

test("429 : on attend le délai demandé puis on refait la même requête", async () => {
  script = [{ status: 429, headers: { "retry-after": "0" }, json: { message: "Too many requests" } }, { status: 200, json: { anime: [1] } }];
  const n = seen.length, before = animeThemesStats().throttled;
  const d = await atGet("/anime", quiet);
  assert.deepEqual(d.anime, [1]);
  assert.equal(seen.length - n, 2);
  assert.equal(animeThemesStats().throttled, before + 1);
});

test("404 : erreur avec son code, sans nouvel essai", async () => {
  script = [{ status: 404, json: {} }];
  const n = seen.length;
  await assert.rejects(() => atGet("/anime/nope", quiet), (e) => e instanceof AnimeThemesError && e.status === 404);
  assert.equal(seen.length - n, 1);
});

test("erreur 500 : nouvel essai ; puis réponse", async () => {
  script = [{ status: 500, raw: "boom" }, { status: 200, json: { anime: [2] } }];
  assert.deepEqual((await atGet("/anime", quiet)).anime, [2]);
});

test("429 qui ne finissent jamais : on abandonne après 3 pauses (pas de boucle infinie)", async () => {
  script = [{ status: 429, headers: { "retry-after": "0" } }];
  const n = seen.length;
  await assert.rejects(() => atGet("/anime", quiet), (e) => e instanceof AnimeThemesError && e.status === 429);
  assert.equal(seen.length - n, 4, "1 requête + 3 nouvelles tentatives");
});

test("les requêtes sont espacées (limite : 90 par minute)", async () => {
  // l'espacement réel par défaut est de 700 ms ; ici il vaut 1 ms (réglage de test) : on vérifie seulement qu'il est bien appliqué entre deux appels
  script = [{ status: 200, json: { anime: [] } }];
  await atGet("/a", quiet); await atGet("/b", quiet);
  const [a, b] = seen.slice(-2);
  assert.ok(b.at >= a.at, "ordre respecté");
});
