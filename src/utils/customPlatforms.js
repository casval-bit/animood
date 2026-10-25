// ─── PLATEFORMES DE STREAMING PERSONNALISÉES — APPLI DE BUREAU UNIQUEMENT ─────
// L'utilisateur ajoute ses propres sites (nom + lien). Un bouton apparaît sur chaque animé et redirige vers
//   • le lien EXACT enregistré pour cet animé sur cette plateforme (cas des sites à identifiants : miruro…), sinon
//   • le modèle de lien avec ses variables remplacées ({slug}, {slug_jp}, {title}, {id}), sinon
//   • le lien de base + "/" + nom-de-l-anime-en-slug.
// Tout est stocké sur l'ordinateur (localStorage) — rien n'est envoyé à un serveur.
import { titleToSlug, cleanTitle, isDesktopApp, isStoreApp } from "./streamingLinks.js";

const K_PLATFORMS = "animood_custom_platforms";
const K_LINKS = "animood_custom_links";
const EVT = "animood-custom-platforms";

const read = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } window.dispatchEvent(new Event(EVT)); };

export const CUSTOM_PLATFORMS_EVENT = EVT;
export const getCustomPlatforms = () => (isDesktopApp() && !isStoreApp() ? read(K_PLATFORMS, []).filter((p) => p && p.id && p.name && p.url) : []);

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
  const pid = id || "cp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const next = list.some((p) => p.id === pid) ? list.map((p) => (p.id === pid ? { id: pid, name: n, url: u, mode } : p)) : [...list, { id: pid, name: n, url: u, mode }];
  write(K_PLATFORMS, next.slice(0, 12));
  return true;
}

export function deleteCustomPlatform(id) {
  write(K_PLATFORMS, getCustomPlatforms().filter((p) => p.id !== id));
  const links = read(K_LINKS, {});
  for (const k of Object.keys(links)) if (k.startsWith(id + ":")) delete links[k];
  write(K_LINKS, links);
  const auto = read(K_AUTO, {});
  for (const k of Object.keys(auto)) if (k.startsWith(id + ":")) delete auto[k];
  try { localStorage.setItem(K_AUTO, JSON.stringify(auto)); } catch { /* ok */ }
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
 *  4. mode « auto » (défaut) : résolu par resolveCustomUrl (lecture du site côté Electron : recherche du site → fiche
 *     qui ressemble le plus au titre). Ce lien-ci n'est que le REPLI si le site est illisible (DuckDuckGo « !ducky » + site:domaine).
 */
export function buildCustomUrl(platform, anime, extra = {}) {
  const exact = getExactLink(platform.id, anime);
  if (exact) return exact;
  const en = anime?.title_english || anime?.title || "";
  const jp = anime?.title || en;
  const slug = titleToSlug(en) || titleToSlug(jp);
  const vars = { slug, slug_jp: titleToSlug(jp) || slug, title: encodeURIComponent(en), id: String(anime?.mal_id ?? ""), mal: String(anime?.mal_id ?? ""), anilist: String(extra.anilist ?? anime?.anilist_id ?? getCachedAnilistId(anime) ?? "") };
  if (/\{[a-z_]+\}/i.test(platform.url)) return platform.url.replace(/\{([a-z_]+)\}/gi, (m, k) => (k.toLowerCase() in vars ? vars[k.toLowerCase()] : m));
  if (platform.mode === "slug" || (!platform.mode && /^https?:\/\/[^/]+\/.+/i.test(platform.url))) return platform.url.replace(/\/+$/, "") + "/" + slug;
  const host = hostOf(platform.url);
  const variants = (extra.titles && extra.titles.length ? extra.titles : [en]).slice(0, 4).map(cleanTitle).filter(Boolean);
  return `https://duckduckgo.com/?q=${encodeURIComponent(`!ducky site:${host} ${variants.join(" OR ")}`)}`;
}

/** « Anime-sama » à partir de « www.anime-sama.fr » (nom affiché quand l'utilisateur n'en donne pas). */
export const nameFromHost = (host = "") => { const b = host.replace(/^www\./, "").split(".")[0] || host; return (b.charAt(0).toUpperCase() + b.slice(1)).slice(0, 24); };

/**
 * Ajout express : l'utilisateur ne tape que « nomdusite.com » (ou un lien complet).
 * Nom déduit du domaine, mode automatique (retrouve chaque animé tout seul). Renvoie { ok, name } ou { ok:false, error }.
 */
export function addPlatformFromInput(raw) {
  const url = normaliseUrl(raw);
  if (!url) return { ok: false, error: "invalid" };
  const host = hostOf(url), list = getCustomPlatforms();
  if (list.some((p) => hostOf(p.url) === host)) return { ok: false, error: "exists" };
  if (list.length >= 12) return { ok: false, error: "max" };
  const name = nameFromHost(host);
  return saveCustomPlatform({ name, url, mode: "auto" }) ? { ok: true, name } : { ok: false, error: "invalid" };
}

// ── Identifiant et titres AniList (nombreux sites de streaming utilisent l'identifiant et le titre d'AniList) ──
const K_AL = "animood_anilist_ids", K_ALT = "animood_anilist_titles";
export const getCachedAnilistId = (anime) => (anime?.mal_id ? read(K_AL, {})[anime.mal_id] ?? null : null);
async function fetchAnilist(anime) {
  const mal = anime?.mal_id; if(!mal) return null;
  try {
    const r = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: "query($m:Int){Media(idMal:$m,type:ANIME){id title{romaji english} synonyms}}", variables: { m: Number(mal) } }), signal: AbortSignal.timeout(8000) });
    const m = (await r.json())?.data?.Media;
    if(!m?.id) return null;
    const ids = read(K_AL, {}); ids[mal] = m.id; try { localStorage.setItem(K_AL, JSON.stringify(ids)); } catch { /* ok */ }
    const titles = [m.title?.english, m.title?.romaji, ...(m.synonyms || [])].filter(Boolean);
    const all = read(K_ALT, {}); all[mal] = titles; try { localStorage.setItem(K_ALT, JSON.stringify(all)); } catch { /* ok */ }
    return { id: m.id, titles };
  } catch { return null; } // hors-ligne : on se contente des titres déjà connus
}
export async function getAnilistId(anime) {
  if(anime?.anilist_id) return anime.anilist_id;
  return getCachedAnilistId(anime) ?? (await fetchAnilist(anime))?.id ?? null;
}

// Titres alternatifs stockés en base (colonne anime_cache.alt_titles, remplie par scripts/sync_alt_titles.mjs).
// La fiche d'animé n'a pas toujours cette colonne : on la lit à la demande, une seule fois par animé et par session.
const altFromDb = new Map();
async function fetchAltTitles(anime) {
  const id = Number(anime?.mal_id); if(!id) return [];
  if(altFromDb.has(id)) return altFromDb.get(id);
  let list = [];
  try {
    const { sb } = await import("../api/supabase.js");
    const rows = await sb.query(`anime_cache?mal_id=eq.${id}&select=alt_titles&limit=1`);
    if(Array.isArray(rows?.[0]?.alt_titles)) list = rows[0].alt_titles;
  } catch { /* colonne absente, hors-ligne… : on se rabat sur AniList */ }
  altFromDb.set(id, list);
  return list;
}

/**
 * Toutes les variantes de titre connues, dans l'ordre d'essai : titre anglais, titre de la base, titres alternatifs
 * stockés en base (AniList + MAL), puis — seulement si la base n'en a pas — variantes lues sur AniList (mises en cache).
 * Seuls les titres en alphabet latin servent à chercher.
 */
export async function collectTitles(anime, { online = true } = {}) {
  const stored = [anime?.title_english, anime?.title_en, anime?.title, ...(Array.isArray(anime?.title_synonyms) ? anime.title_synonyms : []), ...(Array.isArray(anime?.titles) ? anime.titles.map((t) => t?.title) : [])];
  let dbAlt = Array.isArray(anime?.alt_titles) ? anime.alt_titles : null;
  if(!dbAlt && online) dbAlt = await fetchAltTitles(anime);
  let extra = (anime?.mal_id && read(K_ALT, {})[anime.mal_id]) || [];
  if(online && !extra.length && !(dbAlt && dbAlt.length) && anime?.mal_id) extra = (await fetchAnilist(anime))?.titles || [];
  const seen = new Set(), out = [];
  for(const t of [...stored, ...(dbAlt || []), ...extra]) {
    const v = String(t || "").trim(); if(!v || !/[A-Za-z]{2}/.test(v)) continue;
    const k = v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); if(!k || seen.has(k)) continue;
    seen.add(k); out.push(v);
  }
  return out.slice(0, 8);
}

/**
 * Apprentissage : quand l'utilisateur enregistre le lien exact d'UN animé, on repère comment le site construit ses liens
 * (identifiant AniList, identifiant MAL ou nom-en-slug) et on transforme la plateforme en modèle valable pour TOUS les animés.
 * Renvoie { learned: "anilist"|"mal"|"slug"|null }.
 */
export async function learnFromExact(platform, anime, rawUrl) {
  const url = normaliseUrl(rawUrl);
  if (!url || /\{[a-z_]+\}/i.test(platform.url)) return { learned: null };
  let u; try { u = new URL(url); } catch { return { learned: null }; }
  if (hostOf(u.toString()) !== hostOf(platform.url)) return { learned: null };
  const rest = u.pathname + u.search;
  const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const swap = (str, value, token, cls = "0-9A-Za-z") => {
    if (!value) return null;
    const re = new RegExp(`(?<![${cls}])${esc(value)}(?![${cls}])`, "i");
    return re.test(str) ? str.replace(re, token) : null;
  };
  let learned = null, out = rest, t;
  const al = await getAnilistId(anime);
  if ((t = swap(out, al, "{anilist}"))) { out = t; learned = "anilist"; }
  else if ((t = swap(out, anime?.mal_id, "{id}"))) { out = t; learned = "mal"; }
  const slug = titleToSlug(anime?.title_english || anime?.title || "");
  if (slug.length > 3 && (t = swap(out, slug, "{slug}", "a-z0-9-"))) { out = t; learned = learned || "slug"; }
  if (!learned) return { learned: null };
  const tpl = u.origin + out;
  if (!normaliseUrl(tpl)) return { learned: null };
  saveCustomPlatform({ id: platform.id, name: platform.name, url: tpl, mode: "auto" });
  return { learned };
}

// ── Résolution automatique (mode « auto ») ────────────────────────────────────
// Le processus principal d'Electron lit le site (recherche du site → meilleure correspondance avec le titre).
// Le résultat « fiche trouvée » est mémorisé 30 jours sur cet ordinateur : les clics suivants sont instantanés.
const K_AUTO = "animood_custom_autolinks", AUTO_TTL = 30 * 24 * 3600 * 1000;
const autoKey = (platformId, anime) => `${platformId}:${animeKey(anime)}`;
export const getAutoLink = (platformId, anime) => { const v = read(K_AUTO, {})[autoKey(platformId, anime)]; return v && v.url && Date.now() - v.t < AUTO_TTL ? v.url : ""; };
export function clearAutoLink(platformId, anime) { const m = read(K_AUTO, {}); delete m[autoKey(platformId, anime)]; try { localStorage.setItem(K_AUTO, JSON.stringify(m)); } catch { /* ok */ } }
const setAutoLink = (platformId, anime, url) => { const m = read(K_AUTO, {}); m[autoKey(platformId, anime)] = { url, t: Date.now() }; try { localStorage.setItem(K_AUTO, JSON.stringify(m)); } catch { /* ok */ } };

const usesAuto = (platform) => !/\{[a-z_]+\}/i.test(platform.url) && !(platform.mode === "slug" || (!platform.mode && /^https?:\/\/[^/]+\/.+/i.test(platform.url)));

/** Lien à ouvrir, en résolvant la fiche exacte si besoin. kind : exact | cached | page | search | fallback */
export async function resolveCustomUrl(platform, anime) {
  const exact = getExactLink(platform.id, anime);
  if (exact) return { url: exact, kind: "exact" };
  if (usesAuto(platform)) {
    const cached = getAutoLink(platform.id, anime);
    if (cached) return { url: cached, kind: "cached" };
    if (typeof window !== "undefined" && window.animood?.resolveSiteLink) {
      const titles = await collectTitles(anime);
      try {
        const r = await Promise.race([window.animood.resolveSiteLink({ host: hostOf(platform.url), titles }), new Promise((res) => setTimeout(() => res(null), 35000))]);
        if (r?.url && r.kind === "page") { setAutoLink(platform.id, anime, r.url); return { url: r.url, kind: "page" }; }
        if (r?.url && r.kind === "search") return { url: r.url, kind: "search" };
      } catch { /* on retombe sur le lien de secours */ }
    }
  }
  if (/\{anilist\}/i.test(platform.url)) { // modèle avec l'identifiant AniList : on le récupère (une fois, mémorisé)
    const al = await getAnilistId(anime);
    if (al) return { url: buildCustomUrl(platform, anime, { anilist: al }), kind: "template" };
  }
  const titles = usesAuto(platform) ? await collectTitles(anime, { online: false }) : [];
  return { url: buildCustomUrl(platform, anime, { titles }), kind: "fallback" };
}

export async function openCustomPlatform(platform, anime) {
  const { url, kind } = await resolveCustomUrl(platform, anime);
  if (!url) return kind;
  try { await window.animood.openStream(platform.id, url); } catch { window.open(url, "_blank", "noopener,noreferrer"); }
  return kind;
}

export const hostOf = (url = "") => { try { return new URL(url.replace(/\{[a-z_]+\}/gi, "x")).hostname.replace(/^www\./, ""); } catch { return ""; } };
export const platformColor = (name = "") => { // couleur stable (hex) dérivée du nom
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const sat = 0.7, l = 0.62, k = (n) => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, "0");
  return `#${f(0)}${f(8)}${f(4)}`;
};
