// ─── Résolveur de liens pour les plateformes personnalisées (appli de bureau) ───
// L'utilisateur ne donne que « monsite.com ». Pour chaque animé, on retrouve la page tout seul :
//   1. on lit la page d'accueil du site pour découvrir SON formulaire de recherche (ou sa description OpenSearch) ;
//   2. à défaut on essaie les modèles de recherche les plus courants (?s=, /search?q=, …) ;
//   3. on lance la recherche avec le titre de l'animé et on prend le lien dont le texte/slug ressemble le plus au titre.
// Tourne dans le processus principal d'Electron (pas de CORS). Lecture seule : uniquement des GET, rien n'est envoyé hors du site.
// Garde-fous : http(s) uniquement, adresses privées/locales refusées (anti-SSRF), 8 s et 1,5 Mo max par page.
import dns from "node:dns/promises";
import net from "node:net";
import { Buffer } from "node:buffer";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_BYTES = 1_500_000, TIMEOUT_MS = 8000, MAX_HOPS = 4;
const COMMON_TEMPLATES = ["/?s={q}", "/search?q={q}", "/search?keyword={q}", "/search?query={q}", "/recherche?q={q}", "/search/{q}", "/catalogue?search={q}"];

// ── réseau ─────────────────────────────────────────────────────────────────
const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
};
async function assertPublic(hostname, allowPrivate) {
  if (allowPrivate) return;
  if (net.isIP(hostname)) { if (isPrivateIp(hostname)) throw new Error("private"); return; }
  const addrs = await dns.lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("private");
}

async function getText(url, opts, hop = 0) {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
  await assertPublic(u.hostname, opts.allowPrivate);
  const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5", "Accept-Language": "fr,en;q=0.8" } });
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    if (hop >= MAX_HOPS) throw new Error("redirects");
    return getText(new URL(res.headers.get("location"), u).toString(), opts, hop + 1);
  }
  const reader = res.body?.getReader();
  let got = 0; const chunks = [];
  if (reader) {
    for (;;) { const { done, value } = await reader.read(); if (done) break; got += value.length; chunks.push(value); if (got > MAX_BYTES) { try { await reader.cancel(); } catch { /* ok */ } break; } }
  }
  return { status: res.status, url: u.toString(), text: Buffer.concat(chunks).toString("utf8") };
}

// ── texte ──────────────────────────────────────────────────────────────────
const strip = (s = "") => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const norm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["the", "a", "an", "of", "no", "wa", "to", "de", "la", "le", "les", "du", "des", "et", "season", "saison", "vostfr", "vf", "hd", "episode", "anime", "streaming"]);
const toks = (s) => norm(s).split(" ").filter((t) => t && !STOP.has(t));
function similarity(candidate, title) {
  const a = new Set(toks(candidate)), b = toks(title);
  if (!a.size || !b.length) return 0;
  const inter = b.filter((t) => a.has(t)).length;
  const union = new Set([...a, ...b]).size;
  const jac = inter / union;
  const allIn = inter === b.length;
  return allIn ? Math.max(jac, 0.55 + 0.45 * jac) : jac; // le titre entier est présent → bon signe, mais plus il y a de bruit autour, plus le score baisse
}
const baseHost = (h) => h.replace(/^www\./, "").split(".").slice(-2).join(".");
const BAD_PATH = /\/(tag|tags|genre|genres|category|categories|categorie|page|author|user|login|register|signin|signup|contact|dmca|privacy|terms|search|recherche|forum|wp-login|feed|filter)(\/|$|\?)/i;

/** Liens candidats d'une page de résultats, triés par ressemblance avec les titres. */
export function rankLinks(html, pageUrl, titles) {
  const page = new URL(pageUrl), out = new Map();
  const re = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1], inner = m[2];
    const href = (attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean);
    if (!href || /^(#|javascript:|mailto:|tel:|data:)/i.test(href)) continue;
    let u; try { u = new URL(href.replace(/&amp;/g, "&"), page); } catch { continue; }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (baseHost(u.hostname) !== baseHost(page.hostname)) continue;
    if (u.pathname === "/" || u.pathname === page.pathname && !u.search) continue;
    if (/\.(jpe?g|png|gif|webp|svg|css|js|ico|xml)$/i.test(u.pathname) || BAD_PATH.test(u.pathname)) continue;
    const label = [strip(inner), (attrs.match(/\btitle\s*=\s*"([^"]*)"/i) || [])[1], (inner.match(/\balt\s*=\s*"([^"]*)"/i) || [])[1]].filter(Boolean).join(" ");
    const slug = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "").replace(/\.(html?|php)$/i, "").replace(/[-_]+/g, " ");
    let score = 0;
    for (const t of titles) score = Math.max(score, similarity(label, t), similarity(slug, t) * 0.97);
    if (!score) continue;
    const key = u.origin + u.pathname + u.search, prev = out.get(key);
    if (!prev || score > prev.score) out.set(key, { url: u.toString(), score, depth: u.pathname.split("/").filter(Boolean).length });
  }
  return [...out.values()].sort((x, y) => y.score - x.score || x.url.length - y.url.length);
}

// ── découverte du formulaire de recherche ──────────────────────────────────
const SEARCH_NAMES = /^(s|q|query|keyword|keywords|search|searchword|k|term|text|title|story|name|do_search)$/i;
function formTemplates(html, base) {
  const out = [];
  for (const f of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = f[1], body = f[2];
    if (/method\s*=\s*["']?post/i.test(attrs)) continue;
    const inputs = [...body.matchAll(/<input\b([^>]*)>/gi)].map((i) => ({ name: (i[1].match(/\bname\s*=\s*["']([^"']*)["']/i) || [])[1], type: (i[1].match(/\btype\s*=\s*["']?([a-z]+)/i) || [])[1] || "text", value: (i[1].match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1] || "" }));
    const field = inputs.find((i) => i.name && (i.type === "search" || SEARCH_NAMES.test(i.name)) && i.type !== "hidden");
    if (!field) continue;
    let action; try { action = new URL(((attrs.match(/\baction\s*=\s*["']([^"']*)["']/i) || [])[1] || "").replace(/&amp;/g, "&") || base, base); } catch { continue; }
    if (baseHost(action.hostname) !== baseHost(new URL(base).hostname)) continue;
    const params = inputs.filter((i) => i.type === "hidden" && i.name).map((i) => `${encodeURIComponent(i.name)}=${encodeURIComponent(i.value)}`);
    const q = new URLSearchParams(action.search);
    const kept = [...q.entries()].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    const looksSearch = /search|recherche|catalog|s\b/i.test(attrs + body.slice(0, 400)) || SEARCH_NAMES.test(field.name);
    const tpl = `${action.origin}${action.pathname}?${[...kept, ...params, `${encodeURIComponent(field.name)}={q}`].join("&")}`;
    out.push({ tpl, score: looksSearch ? 2 : 1 });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.tpl);
}
async function openSearchTemplate(html, base, opts) {
  const link = html.match(/<link\b[^>]*opensearchdescription\+xml[^>]*>/i)?.[0];
  const href = link && (link.match(/\bhref\s*=\s*["']([^"']*)["']/i) || [])[1];
  if (!href) return null;
  try {
    const x = await getText(new URL(href.replace(/&amp;/g, "&"), base).toString(), opts);
    const u = x.text.match(/<Url\b[^>]*type\s*=\s*["']text\/html["'][^>]*>/i)?.[0] || "";
    const t = (u.match(/template\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!t) return null;
    return t.replace(/&amp;/g, "&").replace(/\{searchTerms\??\}/g, "{q}").replace(/[?&][^?&=]+=\{[^}]*\?\}/g, "").replace(/\{[^}]*\?\}/g, "");
  } catch { return null; }
}
const fill = (tpl, base, q) => new URL(tpl.replace("{q}", encodeURIComponent(q)), base).toString();

const templateMemory = new Map(); // host → modèle qui a déjà fonctionné

/**
 * @param {{host:string, titles:string[]}} req
 * @returns {Promise<{url:string|null, kind:"page"|"search"|"none"}>}
 *   page = lien direct vers la fiche trouvée ; search = page de résultats du site (aucune fiche sûre) ; none = rien d'exploitable.
 */
export async function resolveSiteLink({ host, titles }, opts = {}) {
  const hostname = String(host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!opts.baseUrl && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostname)) return { url: null, kind: "none" };
  const ts = [...new Set((titles || []).map((t) => String(t || "").trim()).filter(Boolean))].slice(0, 4);
  if (!ts.length) return { url: null, kind: "none" };
  const attempts = [];
  const extra = ts.map((t) => t.split(/\s+/).slice(0, 4).join(" ")).filter((t) => !ts.includes(t));
  const queries = [...ts, ...extra].slice(0, 5);

  let base = opts.baseUrl || `https://${hostname}/`, home = null;
  try { home = await getText(base, opts); } catch { if (!opts.baseUrl) { try { base = `http://${hostname}/`; home = await getText(base, opts); } catch { /* injoignable */ } } }
  if (!home) return { url: null, kind: "none" };
  base = home.url;

  const templates = [];
  if (templateMemory.has(hostname)) templates.push(templateMemory.get(hostname));
  const os = await openSearchTemplate(home.text, base, opts); if (os) templates.push(os);
  templates.push(...formTemplates(home.text, base));
  const discovered = templates.length;
  templates.push(...COMMON_TEMPLATES);
  const uniq = [...new Set(templates)].slice(0, 9);

  let fallbackSearch = null;
  for (const [i, tpl] of uniq.entries()) {
    for (const q of queries.slice(0, i < discovered ? 3 : 1)) {
      let r; try { r = await getText(fill(tpl, base, q), opts); } catch { continue; }
      attempts.push(`${tpl} ${r.status}`);
      if (r.status >= 400) break;
      const best = rankLinks(r.text, r.url, ts)[0];
      if (best && best.score >= 0.6) { templateMemory.set(hostname, tpl); return { url: best.url, kind: "page", template: tpl }; }
      if (!fallbackSearch && i < discovered) fallbackSearch = r.url;
    }
  }
  return fallbackSearch ? { url: fallbackSearch, kind: "search" } : { url: null, kind: "none" };
}
