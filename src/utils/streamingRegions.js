// ─── DISPONIBILITÉ STREAMING PAR PAYS — APPLI DE BUREAU UNIQUEMENT ────────────
// Les plateformes réellement disponibles dépendent du pays. Données JustWatch (via TMDB) rangées dans la table
// Supabase anime_streaming_regions par scripts/sync_streaming_regions.mjs.
// Le pays est CHOISI par l'utilisateur (Paramètres → Streaming). Aucune géolocalisation : par défaut on le déduit
// de la langue du système (navigator.language), sans rien demander.
import { sb } from "../api/supabase.js";
import { isDesktopApp } from "./streamingLinks.js";

export const REGIONS = [
  { code: "FR", flag: "🇫🇷", fr: "France", en: "France" },
  { code: "US", flag: "🇺🇸", fr: "États-Unis", en: "United States" },
  { code: "GB", flag: "🇬🇧", fr: "Royaume-Uni", en: "United Kingdom" },
  { code: "IT", flag: "🇮🇹", fr: "Italie", en: "Italy" },
  { code: "JP", flag: "🇯🇵", fr: "Japon", en: "Japan" },
  { code: "DE", flag: "🇩🇪", fr: "Allemagne", en: "Germany" },
  { code: "ES", flag: "🇪🇸", fr: "Espagne", en: "Spain" },
  { code: "CA", flag: "🇨🇦", fr: "Canada", en: "Canada" },
];
const K = "animood_region", EVT = "animood-region";
export const REGION_EVENT = EVT;

export function getUserRegion() {
  try { const v = localStorage.getItem(K); if (v && REGIONS.some((r) => r.code === v)) return v; } catch { /* ignore */ }
  const lang = (typeof navigator !== "undefined" ? navigator.language : "fr-FR") || "fr-FR";
  const cc = (lang.split("-")[1] || "").toUpperCase();
  if (REGIONS.some((r) => r.code === cc)) return cc;
  return { fr: "FR", en: "US", it: "IT", ja: "JP" }[lang.slice(0, 2).toLowerCase()] || "FR";
}
export function setUserRegion(code) {
  try { localStorage.setItem(K, code); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
}

// Noms de plateformes (JustWatch/TMDB) → identifiants des services connus de l'appli
const ALIASES = [
  [/crunchyroll/i, "crunchyroll"], [/netflix/i, "netflix"], [/amazon|prime video/i, "amazon"],
  [/^adn$|animation digital|anime digital/i, "adn"], [/hidive/i, "hidive"], [/disney/i, "disney"], [/funimation/i, "funimation"], [/hulu/i, "hulu"],
];
export const serviceIdFromProvider = (name = "") => (ALIASES.find(([re]) => re.test(name)) || [])[1] || null;

const cache = new Map();
const ofRows = (rows = []) => {
  const byRegion = {};
  for (const r of rows) {
    const names = (r.providers || []).map((p) => p.name).filter(Boolean);
    byRegion[r.region] = { names, ids: new Set(names.map(serviceIdFromProvider).filter(Boolean)) };
  }
  return byRegion;
};
/** Toutes les lignes (tous les pays) d'un animé — une seule requête, mise en cache. */
async function loadAll(malId) {
  if (cache.has(malId)) return cache.get(malId);
  let byRegion = {};
  try { byRegion = ofRows(await sb.query(`anime_streaming_regions?select=region,providers&mal_id=eq.${malId}&limit=50`)); }
  catch { /* table absente ou hors-ligne : on garde « inconnu » */ }
  cache.set(malId, byRegion);
  return byRegion;
}

/**
 * { known, ids:Set<serviceId>, names:string[], elsewhere:{ [serviceId]: regionCode[] } }
 *  - known=false si le pays n'a pas encore été vérifié pour cet animé.
 *  - elsewhere : pour chaque service connu, les AUTRES pays (déjà synchronisés) où l'animé y est disponible.
 */
export async function getRegionAvailability(malId, region) {
  const none = { known: false, ids: new Set(), names: [], elsewhere: {} };
  if (!isDesktopApp() || !malId) return none;
  const all = await loadAll(malId);
  const elsewhere = {};
  for (const [code, v] of Object.entries(all)) {
    if (code === region) continue;
    for (const id of v.ids) (elsewhere[id] ||= []).push(code);
  }
  const here = all[region];
  return here ? { known: true, ids: here.ids, names: here.names, elsewhere } : { ...none, elsewhere };
}
