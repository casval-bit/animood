// Adresses partageables : chaque animé, sujet du forum, post et profil a sa propre adresse.
//   /anime/5114   /forum/12   /post/34   /u/pseudo
// Côté hébergeur, vercel.json envoie ces adresses vers api/share.js, qui renvoie la page de l'appli avec un aperçu
// (titre, description, image) propre au contenu, pour Discord, WhatsApp, X…

// Adresse publique du site : les liens copiés depuis l'appli de bureau ou l'ancienne adresse vercel.app pointent ici
export const SITE_URL = import.meta.env.DEV ? window.location.origin : "https://animood.me";

export const linkPath = {
  anime: (id)       => `/anime/${id}`,
  thread: (id)      => `/forum/${id}`,
  post: (id)        => `/post/${id}`,
  user: (username)  => `/u/${encodeURIComponent(username)}`,
};

// Lit l'adresse courante : { type: "anime" | "thread" | "post" | "user", id } ou null
export function parseRoute(pathname = window.location.pathname) {
  const m = pathname.match(/^\/(anime|forum|post|u)\/([^/]+)\/?$/);
  if(!m) return null;
  const [, kind, raw] = m;
  if(kind === "u") {
    let name = raw;
    try { name = decodeURIComponent(raw); } catch { /* adresse mal formée : on garde tel quel */ }
    return { type: "user", id: name };
  }
  const id = parseInt(raw, 10);
  if(!Number.isFinite(id) || id <= 0) return null;
  return { type: kind === "forum" ? "thread" : kind, id };
}

// Partage natif sur téléphone (menu « Partager » du système), sinon copie du lien.
// Renvoie "shared", "copied" ou null (annulé / impossible).
export async function shareLink(path, title) {
  const url = SITE_URL + path;
  const mobile = typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches;
  if(mobile) {
    try { await navigator.share({ title: title ? `${title} — AniMood` : "AniMood", url }); return "shared"; }
    catch (e) { if(e?.name === "AbortError") return null; }
  }
  try { await navigator.clipboard.writeText(url); return "copied"; }
  catch {
    // Vieux navigateurs / contexte non sécurisé : copie à l'ancienne
    const ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok ? "copied" : null;
  }
}
