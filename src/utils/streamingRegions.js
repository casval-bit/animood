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
/** { known, ids:Set<serviceId>, names:string[] } — known=false si le pays n'a pas encore été vérifié pour cet animé. */
export async function getRegionAvailability(malId, region) {
  if (!isDesktopApp() || !malId) return { known: false, ids: new Set(), names: [] };
  const key = `${malId}:${region}`;
  if (cache.has(key)) return cache.get(key);
  let out = { known: false, ids: new Set(), names: [] };
  try {
    const rows = await sb.query(`anime_streaming_regions?select=providers&mal_id=eq.${malId}&region=eq.${region}&limit=1`);
    if (rows?.length) {
      const names = (rows[0].providers || []).map((p) => p.name).filter(Boolean);
      out = { known: true, ids: new Set(names.map(serviceIdFromProvider).filter(Boolean)), names };
    }
  } catch { /* table absente ou hors-ligne : on garde « inconnu » */ }
  cache.set(key, out);
  return out;
}
