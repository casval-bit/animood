/* global process */
// ═════════════════════════════════════════════════════════════════════════════
// Aperçu des liens partagés : /anime/5114, /forum/12, /post/34, /u/pseudo (redirigés ici par vercel.json)
// ═════════════════════════════════════════════════════════════════════════════
// Discord, WhatsApp, X, iMessage… ne lancent pas le JavaScript de l'appli : ils lisent seulement les balises <meta>
// de la page. Cette fonction renvoie donc la page normale de l'appli (index.html), avec un titre, une description et
// une image propres au contenu partagé. Le navigateur, lui, charge l'appli comme d'habitude et ouvre le bon contenu
// (voir src/utils/shareLinks.js).
// En cas de souci (contenu introuvable, Supabase injoignable), la page part avec l'aperçu par défaut du site.

// Clé publique (la même que dans src/api/supabase.js, déjà visible dans le code du site) : lecture seule,
// limitée par la sécurité par ligne (supabase/security_rls_4_guest_read.sql).
const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";
const SITE = "https://animood.me";

const MOODS = {
  emotional: "💔 Emotional", happy: "✨ Happy", hype: "⚡ Hype", dark: "🩸 Dark",
  chill: "🌿 Chill", twisted: "🌀 Twisted", in_love: "🌸 In Love", thrills: "🎢 Thrills",
};

let indexCache = { html: null, at: 0 };

// Page de l'appli du déploiement en cours. Les déploiements de prévisualisation sont protégés par Vercel : on transmet
// l'autorisation reçue (cookie / jeton de contournement), sinon on récupèrerait la page de connexion de Vercel.
async function getIndexHtml(req) {
  if(indexCache.html && Date.now() - indexCache.at < 60_000) return indexCache.html;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const headers = {};
  if(req.headers.cookie) headers.cookie = req.headers.cookie;
  if(req.headers["x-vercel-protection-bypass"]) headers["x-vercel-protection-bypass"] = req.headers["x-vercel-protection-bypass"];
  const r = await fetch(`https://${host}/index.html`, { headers, redirect: "manual" });
  const html = r.ok ? await r.text() : "";
  if(!html.includes('<div id="root">') || !html.includes("/assets/")) throw new Error(`index.html ${r.status}`);
  indexCache = { html, at: Date.now() };
  return html;
}

async function db(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
      signal: ctrl.signal,
    });
    if(!r.ok) return null;
    const rows = await r.json();
    return rows?.[0] || null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};
const httpUrl = (u) => (typeof u === "string" && /^https:\/\//.test(u) ? u : null);

async function profileName(username) {
  const p = await db(`profiles?username=eq.${encodeURIComponent(username)}&select=username,name,avatar`);
  return { name: p?.name || username, avatar: httpUrl(p?.avatar), exists: !!p };
}

// Titre / description / image selon le type de lien
async function buildMeta(type, id) {
  if(type === "anime") {
    const n = parseInt(id, 10);
    if(!n) return null;
    const [a, pts] = await Promise.all([
      db(`anime_cache?mal_id=eq.${n}&select=title,title_en,synopsis,score,year,episodes,type,large_image,image_url,genres`),
      db(`mood_pts_v4?mal_id=eq.${n}`),
    ]);
    if(!a) return null;
    const topMoods = pts
      ? Object.entries(MOODS).map(([k, label]) => [label, pts[k] || 0]).filter(([, v]) => v > 0)
          .sort((x, y) => y[1] - x[1]).slice(0, 2).map(([label]) => label)
      : [];
    const facts = [
      a.score ? `⭐ ${a.score}` : null, a.type, a.year,
      a.episodes ? `${a.episodes} ép.` : null,
      (a.genres || []).slice(0, 2).map(g => g.name || g).join(", ") || null,
    ].filter(Boolean).join(" · ");
    const moodLine = topMoods.length ? `Mood : ${topMoods.join(", ")}. ` : "";
    return {
      title: `${a.title_en || a.title} — AniMood`,
      description: clip(`${facts}. ${moodLine}${a.synopsis || ""}`, 220),
      image: httpUrl(a.large_image) || httpUrl(a.image_url),
      card: "summary", // affiche verticale : pas de grand format (elle serait recadrée)
    };
  }
  if(type === "thread") {
    const n = parseInt(id, 10);
    if(!n) return null;
    const t = await db(`forum_threads?id=eq.${n}&select=username,title,body,image_url,anime_title,anime_image,reply_count`);
    if(!t) return null;
    const author = await profileName(t.username);
    const replies = t.reply_count ? ` · ${t.reply_count} réponse${t.reply_count > 1 ? "s" : ""}` : "";
    return {
      title: `${t.title} — Forum AniMood`,
      description: clip(`Par ${author.name}${t.anime_title ? ` · ${t.anime_title}` : ""}${replies}. ${t.body}`, 220),
      image: httpUrl(t.image_url) || httpUrl(t.anime_image),
      card: httpUrl(t.image_url) ? "summary_large_image" : "summary",
    };
  }
  if(type === "post") {
    const n = parseInt(id, 10);
    if(!n) return null;
    const p = await db(`posts?id=eq.${n}&select=username,content,spoiler,anime_title,anime_image,image_url`);
    if(!p) return null;
    const author = await profileName(p.username);
    const text = p.spoiler ? "⚠️ Contient des spoilers, à lire sur AniMood." : p.content;
    return {
      title: `${author.name}${p.anime_title ? ` à propos de ${p.anime_title}` : ""} — AniMood`,
      description: clip(text, 220),
      image: p.spoiler ? null : (httpUrl(p.image_url) || httpUrl(p.anime_image)),
      card: !p.spoiler && httpUrl(p.image_url) ? "summary_large_image" : "summary",
    };
  }
  if(type === "user") {
    const username = String(id || "").slice(0, 60);
    if(!username) return null;
    const u = await profileName(username);
    if(!u.exists) return null;
    return {
      title: `${u.name} (@${username}) — AniMood`,
      description: `Les animés, les moods et la tierlist de ${u.name} sur AniMood.`,
      image: u.avatar,
      card: "summary",
    };
  }
  return null;
}

const metaRe = (attr, key, lead = "") =>
  new RegExp(`${lead}<meta ${attr}="${key.replace(/[:.]/g, "\\$&")}" content="[^"]*"\\s*/?>`);

// Remplace (ou ajoute) une balise <meta> ; la valeur est déjà échappée
function setMeta(html, attr, key, value) {
  const re = metaRe(attr, key);
  const tag = `<meta ${attr}="${key}" content="${value}" />`;
  return re.test(html) ? html.replace(re, () => tag) : html.replace("</head>", () => `  ${tag}\n  </head>`);
}
const dropMeta = (html, attr, key) => html.replace(metaRe(attr, key, "\\s*"), "");

function applyMeta(html, meta, path) {
  const url = esc(SITE + path);
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(meta.title)}</title>`);
  html = setMeta(html, "name", "description", esc(meta.description));
  html = setMeta(html, "property", "og:title", esc(meta.title));
  html = setMeta(html, "property", "og:description", esc(meta.description));
  html = setMeta(html, "property", "og:url", url);
  html = setMeta(html, "name", "twitter:title", esc(meta.title));
  html = setMeta(html, "name", "twitter:description", esc(meta.description));
  if(meta.image) {
    html = setMeta(html, "property", "og:image", esc(meta.image));
    html = setMeta(html, "name", "twitter:image", esc(meta.image));
    html = dropMeta(html, "property", "og:image:width");
    html = dropMeta(html, "property", "og:image:height");
    html = dropMeta(html, "property", "og:image:alt");
    html = setMeta(html, "name", "twitter:card", meta.card || "summary");
  }
  return html.replace("</head>", () => `  <link rel="canonical" href="${url}" />\n  </head>`);
}

const PREFIX = { anime: "/anime/", thread: "/forum/", post: "/post/", user: "/u/" };

export default async function handler(req, res) {
  const { type, id } = req.query || {};
  let html;
  try {
    html = await getIndexHtml(req);
  } catch {
    // Page de l'appli introuvable : retour à l'accueil plutôt qu'une erreur
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }
  if(PREFIX[type]) {
    const meta = await buildMeta(type, id).catch(() => null);
    if(meta) html = applyMeta(html, meta, PREFIX[type] + encodeURIComponent(id || ""));
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Gardé 5 min par le CDN de Vercel (vidé à chaque déploiement), jamais par le navigateur
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
  res.statusCode = 200;
  res.end(html);
}
