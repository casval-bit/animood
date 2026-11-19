// ─── Accès à AniList (GraphQL) pour les scripts de synchronisation ──────────────────────────────────────────────
// Limites officielles (https://docs.anilist.co/guide/rate-limiting) : 90 requêtes par minute, mais la doc annonce un mode « dégradé » à
// 30 par minute (les en-têtes X-RateLimit-* ne le montrent pas). Dépasser la limite = erreur 429 et PAUSE D'UNE MINUTE imposée par AniList.
//
// Ce fichier évite ces pauses :
//   • les requêtes sont espacées (ANILIST_GAP_MS, 1,2 s par défaut ≈ 50 par minute) ;
//   • au premier 429, le rythme passe à 1 requête toutes les 2,1 s (≈ 28 par minute) pour le reste du script : une seule pause au lieu
//     d'une toute les 30 requêtes ;
//   • chaque requête a un délai maximal (30 s) ; 429 / erreurs 5xx : nouveaux essais (4 au plus) puis une erreur claire.
//
// Réglages (variables d'environnement, facultatives) : ANILIST_GAP_MS (rythme fixe, sans ralentissement automatique), ANILIST_URL (tests).

const URL_DEFAULT = "https://graphql.anilist.co";
const GAP_FIXED = Number(process.env.ANILIST_GAP_MS) || 0;
const GAP_START = 1200;
const GAP_SLOW = 2100;
const TIMEOUT_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = { gap: GAP_FIXED || GAP_START, last: 0, calls: 0, throttled: 0, slowed: false };
export const anilistStats = () => ({ ...state });

/** Délai demandé par « Retry-After » (en secondes), borné ; `fallback` si l'en-tête manque ou est illisible. */
export function retryAfterSeconds(headerValue, fallback = 60, max = 65) {
  if (headerValue === null || headerValue === undefined || headerValue === "") return fallback;
  const n = Number(headerValue);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : fallback;
}

/**
 * Requête GraphQL. Renvoie le JSON de la réponse (y compris `errors`, comme AniList le renvoie avec un statut 200 ou 4xx).
 * Lève une Error si AniList ne répond pas après les nouveaux essais.
 * @param {{tries?: number, log?: (msg: string) => void, backoffMs?: number}} [opts]
 */
export async function anilistQuery(query, variables, { tries = 4, log = console.log, backoffMs = 2500 } = {}) {
  let lastErr = "";
  for (let attempt = 0; attempt < tries; attempt++) {
    const wait = state.last + state.gap - Date.now();
    if (wait > 0) await sleep(wait);
    state.last = Date.now();
    state.calls++;

    let r;
    try {
      r = await fetch(process.env.ANILIST_URL || URL_DEFAULT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      lastErr = e.name === "TimeoutError" ? "délai dépassé" : e.message;
      if (attempt < tries - 1) await sleep(backoffMs * (attempt + 1));
      continue;
    }

    if (r.status === 429) {
      state.throttled++; lastErr = "limite de requêtes (429)";
      if (!GAP_FIXED && !state.slowed) {
        state.slowed = true; state.gap = GAP_SLOW;
        log(`  ⏳ AniList : limite atteinte — rythme ralenti à 1 requête toutes les ${GAP_SLOW / 1000} s pour la suite`);
      }
      const pause = retryAfterSeconds(r.headers.get("retry-after"));
      log(`  ⏳ AniList 429 — pause ${pause} s (essai ${attempt + 1}/${tries})`);
      await sleep(pause * 1000);
      continue;
    }
    if (r.status >= 500) {
      lastErr = `HTTP ${r.status}`;
      log(`  ⏳ AniList ${r.status} — nouvel essai (${attempt + 1}/${tries})`);
      if (attempt < tries - 1) await sleep(backoffMs * (attempt + 1));
      continue;
    }
    try { return await r.json(); }
    catch { lastErr = "réponse illisible"; if (attempt < tries - 1) await sleep(backoffMs * (attempt + 1)); }
  }
  throw new Error(`AniList indisponible (${lastErr || "limite de requêtes ou panne"})`);
}
