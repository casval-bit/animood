// ─── Accès à AnimeThemes (https://api.animethemes.moe) pour les scripts de synchronisation ───────────────────────
// Limite officielle : 90 requêtes par minute et par adresse IP. Au-delà : erreur 429 avec « Retry-After » (en général 60 s).
// Avant ce fichier, les scripts attendaient 300 ms entre deux requêtes (≈ 200 par minute) : plus de la moitié des requêtes tombaient en 429,
// et le script les prenait pour « aucune musique trouvée ». Ici :
//   • 700 ms entre deux requêtes (≈ 85 par minute ; ANIMETHEMES_GAP_MS pour changer) ;
//   • 429 → on attend le délai demandé puis on recommence ; 5xx / coupure → 3 essais ;
//   • Cloudflare répond 403 à un client sans User-Agent : on s'identifie.

const BASE = (process.env.ANIMETHEMES_BASE || "https://api.animethemes.moe").replace(/\/+$/, "");
const GAP_MS = Number(process.env.ANIMETHEMES_GAP_MS) || 700;
const TIMEOUT_MS = 20_000;
const HEADERS = { "User-Agent": "AniMood-sync/1.0 (+https://github.com/casval-bit/animood)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = { last: 0, calls: 0, throttled: 0 };
export const animeThemesStats = () => ({ ...state });

export class AnimeThemesError extends Error {
  constructor(status, message) { super(message); this.name = "AnimeThemesError"; this.status = status; }
}

/** Délai demandé par « Retry-After » (en secondes), borné ; 60 s si l'en-tête manque ou est illisible. */
function retryAfter(headerValue) {
  const n = Number(headerValue);
  return headerValue === null || headerValue === "" || !Number.isFinite(n) ? 60 : Math.min(65, Math.max(0, n));
}

/**
 * GET sur l'API : renvoie le JSON. Lève AnimeThemesError (status 404, 403…) pour un refus, ou une Error si le service ne répond pas.
 * @param {string} path  ex. "/anime?q=Bleach&page[size]=5"
 */
export async function atGet(path, { tries = 3, log = console.log, backoffMs = 2500 } = {}) {
  let lastErr = "indisponible", in429 = 0;
  for (let attempt = 0; attempt < tries; attempt++) {
    const wait = state.last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    state.last = Date.now(); state.calls++;

    let r;
    try { r = await fetch(`${BASE}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch (e) { lastErr = e.name === "TimeoutError" ? "délai dépassé" : e.message; if (attempt < tries - 1) await sleep(backoffMs * (attempt + 1)); continue; }

    if (r.status === 429) {
      state.throttled++; lastErr = "limite de requêtes (429)";
      if (++in429 > 3) throw new AnimeThemesError(429, "AnimeThemes : limite de requêtes toujours atteinte après 3 pauses");
      const pause = retryAfter(r.headers.get("retry-after"));
      log(`  ⏳ AnimeThemes 429 — pause ${pause} s`);
      await sleep(pause * 1000);
      attempt--;                                      // une pause imposée n'est pas un échec : on refait la même requête (3 pauses au plus)
      continue;
    }
    if (r.status >= 500) { lastErr = `HTTP ${r.status}`; if (attempt < tries - 1) await sleep(backoffMs * (attempt + 1)); continue; }
    if (!r.ok) throw new AnimeThemesError(r.status, `AnimeThemes ${r.status}`);
    try { return await r.json(); }
    catch { lastErr = "réponse illisible"; if (attempt < tries - 1) await sleep(backoffMs * (attempt + 1)); }
  }
  throw new Error(`AnimeThemes : ${lastErr} (${path})`);
}
