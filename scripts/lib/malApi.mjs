// ─── Accès aux données MyAnimeList pour les scripts de synchronisation ──────────────────────────────────────
// Deux sources au même format (Jikan v4 : /anime/{id}, /anime/{id}/full, /anime/{id}/streaming, /anime?order_by=…), essayées dans l'ordre :
//   1. Tenrai (https://api.tenrai.org/v1) — successeur de Jikan : données corrigées, limites plus larges ;
//   2. Jikan  (https://api.jikan.moe/v4)  — l'ancienne source, gardée EN SECOURS : si Tenrai ne répond pas (panne, clé refusée,
//      anime pas encore connu de Tenrai), la requête est refaite sur Jikan au lieu d'échouer.
// Chaque source a son propre rythme, ses propres nouveaux essais et son propre « disjoncteur ».
//
// Réglages (variables d'environnement, toutes facultatives) :
//   MAL_SOURCES         ordre des sources, séparées par des virgules (par défaut « tenrai,jikan » ; « tenrai » seul = sans secours,
//                       « jikan,tenrai » = comme avant la v.14.01, Tenrai en secours)
//   TENRAI_SERVER_KEY   clé « Server Key » (en-tête X-Server-Key) : relève les limites de requêtes de Tenrai
//   TENRAI_BASE         autre adresse pour Tenrai (par défaut https://api.tenrai.org/v1)
//   TENRAI_GAP_MS       pause minimale entre deux requêtes Tenrai (par défaut 250 ms avec clé, 700 ms sans)
//   JIKAN_BASE          autre adresse pour Jikan (par défaut https://api.jikan.moe/v4)
//   JIKAN_GAP_MS        pause minimale entre deux requêtes Jikan (par défaut 1100 ms : Jikan limite à 3/s et 60/min)
//
// Pourquoi tant de précautions : quand une API était en panne, chaque requête réessayait pendant des minutes et le script entier
// dépassait les 2 h autorisées par GitHub (étapes suivantes annulées, rapport en échec). Ici, pour chaque source :
//   • chaque requête a un délai maximal (20 s) et au plus 3 essais ;
//   • après BREAKER_AT échecs d'affilée, la source est déclarée « en panne » pour tout le reste du script : on ne l'essaie plus.
// Quand TOUTES les sources sont en panne, les appels échouent immédiatement (MalApiDown) et les scripts passent à la suite.

const KEY = process.env.TENRAI_SERVER_KEY || "";
const TIMEOUT_MS = 20_000;
const BREAKER_AT = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class MalApiDown extends Error {
  constructor(msg = "API MyAnimeList (Tenrai / Jikan) indisponible") { super(msg); this.name = "MalApiDown"; }
}

const makeSource = (id, label, base, headers, gap) => ({
  id, label, base: String(base).replace(/\/+$/, ""), headers, gap,
  failures: 0, down: false, lastCall: 0, calls: 0, ok: 0, throttled: 0, served: 0,
});

const ALL = {
  tenrai: makeSource("tenrai", "Tenrai", process.env.TENRAI_BASE || "https://api.tenrai.org/v1",
    KEY ? { "X-Server-Key": KEY } : {}, Number(process.env.TENRAI_GAP_MS) || (KEY ? 250 : 700)),
  jikan: makeSource("jikan", "Jikan", process.env.JIKAN_BASE || "https://api.jikan.moe/v4",
    {}, Number(process.env.JIKAN_GAP_MS) || 1100),
};

const wanted = String(process.env.MAL_SOURCES || "tenrai,jikan").toLowerCase().split(/[\s,;]+/)
  .filter((id, i, a) => ALL[id] && a.indexOf(id) === i);
const CHAIN = (wanted.length ? wanted : ["tenrai", "jikan"]).map((id) => ALL[id]);

let lastServedBy = null;          // source qui a répondu en dernier (pour les messages des scripts)
const announced = new Set();      // messages « X prend le relais » : une seule fois par source

/** Toutes les sources ont-elles été déclarées en panne pour ce script ? (à tester dans les boucles pour s'arrêter proprement) */
export const malIsDown = () => CHAIN.every((s) => s.down);
/** Nom de la source qui a répondu à la dernière requête réussie (« Tenrai » ou « Jikan »). */
export const malSource = () => lastServedBy?.label || CHAIN[0].label;
export const malStats = () => {
  const sum = (k) => CHAIN.reduce((n, s) => n + s[k], 0);
  return {
    calls: sum("calls"), ok: sum("ok"), throttled: sum("throttled"), down: malIsDown(),
    base: CHAIN[0].base, withKey: !!KEY, order: CHAIN.map((s) => s.label),
    sources: CHAIN.map(({ id, label, calls, ok, throttled, served, down }) => ({ id, label, calls, ok, throttled, served, down })),
  };
};

/** Résumé en une ligne pour la fin des rapports : « MyAnimeList : Tenrai 120/121 · Jikan 3/3 (secours) ». */
export function malSummary() {
  const st = malStats();
  const parts = st.sources.filter((s) => s.calls).map((s, i) =>
    `${s.label} ${s.ok}/${s.calls}${s.throttled ? ` (${s.throttled}× « trop de requêtes »)` : ""}${s.down ? " ⚠️ en panne" : ""}${i > 0 || s.id !== CHAIN[0].id ? " (secours)" : ""}`);
  return parts.length ? `MyAnimeList : ${parts.join(" · ")}${KEY ? " · Server Key Tenrai" : ""}` : "";
}

// Erreur interne : cette source ne peut pas répondre maintenant (réseau, 5xx, 429 persistant, clé refusée).
class Unavailable extends Error {
  constructor(msg, status = null) { super(msg); this.status = status; }
}

/** Une requête sur UNE source, avec nouveaux essais. { json } | { missing:true } ; lève Unavailable ou Error (requête invalide). */
async function request(s, path, tries) {
  s.calls++;
  let lastErr = "", status = null;
  const backoff = (attempt) => attempt < tries - 1 ? sleep(1500 * 2 ** attempt) : null;   // pas d'attente après le dernier essai
  for (let attempt = 0; attempt < tries; attempt++) {
    const wait = s.lastCall + s.gap - Date.now();
    if (wait > 0) await sleep(wait);
    s.lastCall = Date.now();
    let r;
    try {
      r = await fetch(`${s.base}${path}`, {
        headers: { Accept: "application/json", ...s.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) { lastErr = e.name === "TimeoutError" ? "délai dépassé" : e.message; await backoff(attempt); continue; }

    if (r.ok) {
      try { const json = await r.json(); s.failures = 0; s.ok++; return { json }; }
      catch { lastErr = "réponse illisible"; await backoff(attempt); continue; }
    }
    if (r.status === 404) { s.failures = 0; return { missing: true }; }
    if (r.status === 429) {                      // trop de requêtes : on respecte l'attente demandée (10 s max)
      s.throttled++; lastErr = "429";
      await sleep(Math.min(10, Number(r.headers.get("retry-after")) || 3) * 1000);
      continue;
    }
    if (r.status >= 500) { lastErr = `HTTP ${r.status}`; await backoff(attempt); continue; }
    if (r.status === 401 || r.status === 403) { lastErr = `HTTP ${r.status}`; status = r.status; break; }   // clé / accès refusé : inutile de réessayer
    throw new Error(`HTTP ${r.status} ${path}`);  // 400, 422… : problème de requête, le même sur toutes les sources
  }
  s.failures++;
  if (s.failures >= BREAKER_AT) {
    s.down = true;
    console.log(`⛔ ${s.label} (${s.base}) : ${s.failures} échecs d'affilée (${lastErr}) — source considérée en panne pour la suite de ce script`);
  }
  throw new Unavailable(`${s.label} : ${lastErr} (${path})`, status);
}

/**
 * GET sur MyAnimeList. Renvoie le JSON, ou null si l'anime n'existe sur aucune source (404 partout).
 * Essaie les sources dans l'ordre ; une source qui échoue (ou qui ne connaît pas l'anime) laisse la main à la suivante.
 * Lève MalApiDown si toutes les sources sont en panne ; lève une Error pour un refus clair (400, accès refusé sans secours…).
 * Option { source: "jikan" } : n'interroger que cette source (pas de secours) — utilisé par check_tenrai.mjs.
 */
export async function malGet(path, { tries = 3, source = null } = {}) {
  const chain = source ? CHAIN.filter((s) => s.id === source) : CHAIN;
  const usable = chain.filter((s) => !s.down);
  if (!usable.length) throw new MalApiDown();

  let missing = false, lastFail = null;
  for (const s of usable) {
    try {
      const res = await request(s, path, tries);
      if (res.missing) { missing = true; continue; }      // inconnu de cette source : on demande à la suivante avant de conclure
      if (lastFail && !announced.has(s.id) && s !== CHAIN[0]) {
        announced.add(s.id);
        console.log(`↪️ ${lastFail.message.split(" (")[0]} — ${s.label} prend le relais`);
      }
      s.served++; lastServedBy = s;
      return res.json;
    } catch (e) {
      if (!(e instanceof Unavailable)) throw e;
      lastFail = e;
    }
  }
  if (missing) return null;
  if (lastFail?.status) throw new Error(`HTTP ${lastFail.status} ${path}`);   // ex. clé refusée et pas de secours : message précis
  throw new MalApiDown(lastFail?.message);
}

/** Comme malGet mais renvoie directement le champ « data » (ou null). */
export async function malData(path, opts) {
  const j = await malGet(path, opts);
  return j?.data ?? null;
}
