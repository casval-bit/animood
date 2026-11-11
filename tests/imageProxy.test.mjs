// Tests du proxy d'images (server/imageProxy.js), utilisé par l'export PNG de la Tierlist : liste d'hébergeurs autorisés,
// redirections, type et poids des réponses. Aucun accès réseau (faux « fetch »).
import test from "node:test";
import assert from "node:assert/strict";
import { allowedImageUrl, fetchImage, MAX_IMAGE_BYTES } from "../server/imageProxy.js";

const resp = (status, headers = {}, body = Buffer.from("png")) => ({
  status, ok: status >= 200 && status < 300, headers: new Headers(headers), arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
});

test("n'accepte que https et les hébergeurs d'affiches connus", () => {
  assert.ok(allowedImageUrl("https://cdn.myanimelist.net/images/anime/1/2.jpg"));
  assert.ok(allowedImageUrl("https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-abc.png"));
  for (const bad of ["http://cdn.myanimelist.net/a.jpg", "https://evil.com/a.jpg", "https://cdn.myanimelist.net.evil.com/a.jpg",
    "https://user:pw@cdn.myanimelist.net/a.jpg", "https://cdn.myanimelist.net:8443/a.jpg", "file:///etc/passwd", "javascript:alert(1)", "", null, "https://127.0.0.1/a.jpg"]) {
    assert.equal(allowedImageUrl(bad), null, String(bad));
  }
});

test("renvoie l'image avec son type", async () => {
  const out = await fetchImage("https://cdn.myanimelist.net/a.jpg", async () => resp(200, { "content-type": "image/jpeg" }));
  assert.equal(out.status, 200); assert.equal(out.type, "image/jpeg"); assert.equal(out.body.toString(), "png");
});

test("adresse refusée → 400, sans appeler le réseau", async () => {
  let called = false;
  const out = await fetchImage("https://evil.com/a.jpg", async () => { called = true; return resp(200); });
  assert.equal(out.status, 400); assert.equal(called, false);
});

test("une redirection vers un hébergeur autorisé est suivie, vers un autre refusée", async () => {
  const ok = await fetchImage("https://cdn.myanimelist.net/a.jpg", async (u) => String(u).includes("a.jpg")
    ? resp(302, { location: "https://s4.anilist.co/b.jpg" }) : resp(200, { "content-type": "image/png" }));
  assert.equal(ok.status, 200);
  const bad = await fetchImage("https://cdn.myanimelist.net/a.jpg", async () => resp(302, { location: "http://169.254.169.254/latest" }));
  assert.equal(bad.status, 502);
});

test("refuse ce qui n'est pas une image, les SVG et les images trop lourdes", async () => {
  assert.equal((await fetchImage("https://cdn.myanimelist.net/a", async () => resp(200, { "content-type": "text/html" }))).status, 502);
  assert.equal((await fetchImage("https://cdn.myanimelist.net/a", async () => resp(200, { "content-type": "image/svg+xml" }))).status, 502);
  const big = Buffer.alloc(MAX_IMAGE_BYTES + 1);
  assert.equal((await fetchImage("https://cdn.myanimelist.net/a", async () => resp(200, { "content-type": "image/png" }, big))).status, 413);
});

test("erreurs de la source : 404 transmis, panne → 502/504", async () => {
  assert.equal((await fetchImage("https://cdn.myanimelist.net/a", async () => resp(404))).status, 404);
  assert.equal((await fetchImage("https://cdn.myanimelist.net/a", async () => resp(500))).status, 502);
  assert.equal((await fetchImage("https://cdn.myanimelist.net/a", async () => { throw new Error("réseau"); })).status, 504);
});
