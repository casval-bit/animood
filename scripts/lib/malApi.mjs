// ─── Accès aux données MyAnimeList pour les scripts de synchronisation ──────────────────────────────────────
// Remplace Jikan (api.jikan.moe) par Tenrai (https://api.tenrai.org/v1), son successeur : mêmes chemins et même format de
// réponse que Jikan v4 (/anime/{id}, /anime/{id}/full, /anime?order_by=…), avec des données corrigées et des limites plus larges.
//
// Réglages (variables d'environnement, toutes facultatives) :
//   TENRAI_SERVER_KEY   clé « Server Key » (en-tête X-Server-Key) : relève les limites de requêtes
//   TENRAI_BASE         autre adresse de l'API (par défaut https://api.tenrai.org/v1)
//   TENRAI_GAP_MS       pause minimale entre deux requêtes (par défaut 250 ms avec clé, 700 ms sans)
//
// Pourquoi ce fichier existe : quand Jikan était en panne, chaque requête réessayait pendant des minutes et le script entier
// dépassait les 2 h autorisées par GitHub (étapes suivantes annulées, rapport en échec). Ici :
//   • chaque requête a un délai maximal (20 s) et au plus 3 essais ;
//   • après BREAKER_AT échecs d'affilée, l'API est déclarée « en panne » pour tout le reste du script : les appels suivants
//     échouent immédiatement (MalApiDown) au lieu d'attendre, et les scripts passent à la suite.

const BASE = (process.env.TENRAI_BASE || "https://api.tenrai.org/v1").replace(/\/+$/, "");
const KEY = process.env.TENRAI_SERVER_KEY || "";
const GAP_MS = Number(process.env.TENRAI_GAP_MS) || (KEY ? 250 : 700);
const TIMEOUT_MS = 20_000;
const BREAKER_AT = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class MalApiDown extends Error {
  constructor(msg = "API MyAnimeList (Tenrai) indisponible") { super(msg); this.name = "MalApiDown"; }
}

const state = { failures: 0, down: false, lastCall: 0, calls: 0, ok: 0, throttled: 0 };

/** L'API a-t-elle été déclarée en panne pour ce script ? (à tester dans les boucles pour s'arrêter proprement) */
export const malIsDown = () => state.down;
export const malStats = () => ({ ...state, base: BASE, withKey: !!KEY });

/**
 * GET sur l'API. Renvoie le JSON, ou null si la ressource n'existe pas (404).
 * Lève MalApiDown si l'API est en panne (trop d'échecs d'affilée) ; lève une Error pour les autres refus (400, 403…).
 */
export async function malGet(path, { tries = 3 } = {}) {
  if (state.down) throw new MalApiDown();
  state.calls++;
  let lastErr = "";
  for (let attempt = 0; attempt < tries; attempt++) {
    const wait = state.lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    state.lastCall = Date.now();
    let r;
    try {
      r = await fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json", ...(KEY ? { "X-Server-Key": KEY } : {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) { lastErr = e.name === "TimeoutError" ? "délai dépassé" : e.message; await sleep(1500 * 2 ** attempt); continue; }

    if (r.ok) { state.failures = 0; state.ok++; return r.json(); }
    if (r.status === 404) { state.failures = 0; return null; }
    if (r.status === 429) {                      // trop de requêtes : on respecte l'attente demandée (10 s max)
      state.throttled++; lastErr = "429";
      await sleep(Math.min(10, Number(r.headers.get("retry-after")) || 3) * 1000);
      continue;
    }
    if (r.status >= 500) { lastErr = `HTTP ${r.status}`; await sleep(1500 * 2 ** attempt); continue; }
    throw new Error(`HTTP ${r.status} ${path}`);  // 400/401/403… : problème de requête, pas de panne
  }
  state.failures++;
  if (state.failures >= BREAKER_AT) {
    state.down = true;
    console.log(`⛔ Tenrai (${BASE}) : ${state.failures} échecs d'affilée (${lastErr}) — API considérée en panne pour la suite de ce script`);
  }
  throw new MalApiDown(`Tenrai : ${lastErr} (${path})`);
}

/** Comme malGet mais renvoie directement le champ « data » (ou null). */
export async function malData(path, opts) {
  const j = await malGet(path, opts);
  return j?.data ?? null;
}
