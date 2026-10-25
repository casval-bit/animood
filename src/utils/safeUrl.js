// Liens venant de la base (posts, anime_cache…) : n'importe quel compte peut y écrire.
// On n'ouvre / n'affiche que des liens web, jamais javascript:, data:, file:…
export function safeWebUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch { return ""; }
}

export function openWebUrl(url) {
  const u = safeWebUrl(url);
  if (u) window.open(u, "_blank", "noopener,noreferrer");
}
