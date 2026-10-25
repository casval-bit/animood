/** Identifiant YouTube depuis l'objet trailer de Jikan/Supabase ({youtube_id, url, embed_url}) ou un lien. */
export function youtubeIdOf(trailer) {
  const t = typeof trailer === "string" ? { url: trailer } : (trailer || {});
  if (/^[\w-]{11}$/.test(t.youtube_id || "")) return t.youtube_id;
  for (const raw of [t.url, t.embed_url]) {
    if (!raw) continue;
    const m = String(raw).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
    if (m) return m[1];
  }
  return null;
}

