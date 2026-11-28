// ─── Requête d'écriture de la note personnelle d'un animé dans user_votes (sans réseau : testable) ───────────────────────────
// Même écriture que le bouton « Enregistrer » de la fiche animé : une ligne par (username, mal_id), fusionnée si elle existe déjà ;
// les points d'humeur (pts_added) ne sont jamais touchés. Retirer la note remet `score` à null : la ligne reste (elle peut porter des humeurs).
// api/userVotes.js envoie la requête.

/** @returns {{path:string, method:string, prefer:string, body:object} | null} null si le compte ou l'animé n'est pas valide */
export function userScoreRequest(username, malId, score, moods = [], now = new Date()) {
  const id = Number(malId);
  if (!username || !(id > 0)) return null;
  if (score) {
    return {
      path: "user_votes?on_conflict=username,mal_id", method: "POST", prefer: "resolution=merge-duplicates",
      body: { username, mal_id: id, moods: moods || [], score, voted_at: now.toISOString() },
    };
  }
  return {
    path: `user_votes?username=eq.${encodeURIComponent(username)}&mal_id=eq.${id}`, method: "PATCH", prefer: "return=minimal",
    body: { score: null },
  };
}
