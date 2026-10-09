// ─── PLATEFORMES DE STREAMING PERSONNALISÉES — APPLI DE BUREAU UNIQUEMENT ─────
// L'utilisateur ajoute ses propres sites (nom + lien). Un bouton apparaît sur chaque animé et redirige vers
//   • le lien EXACT enregistré pour cet animé sur cette plateforme (cas des sites à identifiants : miruro…), sinon
//   • le modèle de lien avec ses variables remplacées ({slug}, {slug_jp}, {title}, {id}), sinon
//   • le lien de base + "/" + nom-de-l-anime-en-slug.
// Tout est stocké sur l'ordinateur (localStorage) — rien n'est envoyé à un serveur.
import { titleToSlug, isDesktopApp } from "./streamingLinks.js";

const K_PLATFORMS = "animood_custom_platforms";
const K_LINKS = "animood_custom_links";
const EVT = "animood-custom-platforms";

const read = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } window.dispatchEvent(new Event(EVT)); };

export const CUSTOM_PLATFORMS_EVENT = EVT;
export const getCustomPlatforms = () => (isDesktopApp() ? read(K_PLATFORMS, []).filter((p) => p && p.id && p.name && p.url) : []);

/** Normalise un lien saisi : ajoute https:// si absent. Renvoie "" si invalide. */
export function normaliseUrl(raw = "") {
  let u = String(raw).trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  try { const x = new URL(u.replace(/\{[a-z_]+\}/gi, "x")); if (!/^https?:$/.test(x.protocol) || !x.hostname.includes(".")) return ""; } catch { return ""; }
  return u;
}

export function saveCustomPlatform({ id, name, url, mode = "auto" }) {
  const n = String(name || "").trim().slice(0, 24), u = normaliseUrl(url);
  if (!n || !u) return false;
  const list = getCustomPlatforms();
  const pid = id || "cp_" + Date.now().toString(36);
  const next = list.some((p) => p.id === pid) ? list.map((p) => (p.id === pid ? { id: pid, name: n, url: u, mode } : p)) : [...list, { id: pid, name: n, url: u, mode }];
  write(K_PLATFORMS, next.slice(0, 12));
  return true;
}

export function deleteCustomPlatform(id) {
  write(K_PLATFORMS, getCustomPlatforms().filter((p) => p.id !== id));
  const links = read(K_LINKS, {});
  for (const k of Object.keys(links)) if (k.startsWith(id + ":")) delete links[k];
  write(K_LINKS, links);
}

const animeKey = (anime) => String(anime?.mal_id ?? anime?.id ?? titleToSlug(anime?.title || ""));
export const getExactLink = (platformId, anime) => read(K_LINKS, {})[`${platformId}:${animeKey(anime)}`] || "";
export function setExactLink(platformId, anime, url) {
  const links = read(K_LINKS, {});
  const k = `${platformId}:${animeKey(anime)}`;
  const u = normaliseUrl(url);
  if (u) links[k] = u; else delete links[k];
  write(K_LINKS, links);
  return !!u || !url;
}

/**
 * Lien final à ouvrir pour (plateforme, animé) :
 *  1. lien exact enregistré pour cet animé ;
 *  2. modèle avec variables {slug} {slug_jp} {title} {id} ;
 *  3. mode « slug » : lien + "/" + nom-de-l-anime ;
 *  4. mode « auto » (défaut) : recherche ciblée sur le site → ouvre directement le premier résultat de ce site
 *     (DuckDuckGo « !ducky » + site:domaine). Marche pour n'importe quel site, sans rien configurer par animé.
 */
export function buildCustomUrl(platform, anime) {
  const exact = getExactLink(platform.id, anime);
  if (exact) return exact;
  const en = anime?.title_english || anime?.title || "";
  const jp = anime?.title || en;
  const slug = titleToSlug(en) || titleToSlug(jp);
  const vars = { slug, slug_jp: titleToSlug(jp) || slug, title: encodeURIComponent(en), id: String(anime?.mal_id ?? "") };
  if (/\{[a-z_]+\}/i.test(platform.url)) return platform.url.replace(/\{([a-z_]+)\}/gi, (m, k) => (k.toLowerCase() in vars ? vars[k.toLowerCase()] : m));
  if (platform.mode === "slug" || (!platform.mode && /^https?:\/\/[^/]+\/.+/i.test(platform.url))) return platform.url.replace(/\/+$/, "") + "/" + slug;
  const host = hostOf(platform.url);
  return `https://duckduckgo.com/?q=${encodeURIComponent(`!ducky site:${host} "${en}"`)}`;
}

export async function openCustomPlatform(platform, anime) {
  const url = buildCustomUrl(platform, anime);
  if (!url) return;
  try { await window.animood.openStream(platform.id, url); } catch { window.open(url, "_blank", "noopener,noreferrer"); }
}

export const hostOf = (url = "") => { try { return new URL(url.replace(/\{[a-z_]+\}/gi, "x")).hostname.replace(/^www\./, ""); } catch { return ""; } };
export const platformColor = (name = "") => { // couleur stable (hex) dérivée du nom
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const sat = 0.7, l = 0.62, k = (n) => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, "0");
  return `#${f(0)}${f(8)}${f(4)}`;
};
