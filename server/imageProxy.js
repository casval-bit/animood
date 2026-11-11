// ─── Proxy d'images (affiches d'animés) ──────────────────────────────────────────────────────────────────────
// Pourquoi : les serveurs d'images (MyAnimeList, AniList) n'envoient pas toujours l'en-tête CORS. Le navigateur peut les AFFICHER
// mais pas les LIRE : l'export PNG de la Tierlist (html2canvas) obtenait alors des affiches toutes noires. Ce proxy les relit côté
// serveur et les renvoie depuis notre propre adresse (même origine) avec l'en-tête CORS.
// Partagé par la fonction Vercel (api/img.js) et le serveur de développement (vite.config.js).
// Sécurité : seulement https, seulement les hébergeurs d'affiches ci-dessous, une seule redirection (vers un hébergeur autorisé),
// 3 Mo au maximum, uniquement des réponses « image/… ».

const ALLOWED_HOSTS = [/(^|\.)myanimelist\.net$/i, /(^|\.)anilist\.co$/i, /(^|\.)anili\.st$/i, /(^|\.)kitsu\.(io|app)$/i];
export const MAX_IMAGE_BYTES = 3_000_000;

/** Renvoie l'URL (objet URL) si on accepte de la relayer, sinon null. */
export function allowedImageUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  return ALLOWED_HOSTS.some((re) => re.test(u.hostname)) ? u : null;
}

/** Télécharge l'image. { status, type, body } ou { status, error }. `fetchImpl` : pour les tests. */
export async function fetchImage(raw, fetchImpl = fetch) {
  let u = allowedImageUrl(raw);
  if (!u) return { status: 400, error: "adresse non autorisée" };
  try {
    let r;
    for (let hop = 0; hop < 2; hop++) {
      r = await fetchImpl(u, {
        redirect: "manual", signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "AniMood-ImageProxy/1.0", Accept: "image/avif,image/webp,image/*;q=0.8" },
      });
      if (r.status >= 300 && r.status < 400) {
        const next = allowedImageUrl(new URL(r.headers.get("location") || "", u).href);
        if (!next) return { status: 502, error: "redirection refusée" };
        u = next; continue;
      }
      break;
    }
    if (!r.ok) return { status: r.status === 404 ? 404 : 502, error: `source HTTP ${r.status}` };
    const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/") || type.includes("svg")) return { status: 502, error: "pas une image" };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return { status: 413, error: "image trop lourde" };
    return { status: 200, type, body: buf };
  } catch (e) {
    return { status: 504, error: e.name === "TimeoutError" ? "délai dépassé" : "source injoignable" };
  }
}

/** Écrit la réponse HTTP (Node) pour un résultat de fetchImage. */
export function sendImage(res, out) {
  res.statusCode = out.status;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (out.status === 200) {
    res.setHeader("Content-Type", out.type);
    res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=2592000, immutable");
    res.end(out.body);
  } else {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(out.error || "erreur");
  }
}
