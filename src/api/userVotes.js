// ─── Note personnelle d'un animé dans user_votes (scores d'amis, stats de la communauté) ───────────────────────────────────────
// Les erreurs sont avalées comme dans la fiche animé : le profil reste la référence, user_votes sert aux scores d'amis.
// La requête est construite par utils/userVoteRequest.js (testé) ; renvoie false si l'écriture n'a pas abouti.
import { sb } from "./supabase.js";
import { userScoreRequest } from "../utils/userVoteRequest.js";

/**
 * @param {string} username  compte connecté
 * @param {number} malId
 * @param {number} score     1 à 10 ; 0 / null = retirer la note
 * @param {string[]} [moods] humeurs déjà choisies pour cet animé (conservées telles quelles)
 */
export async function saveUserScore(username, malId, score, moods = []) {
  const req = userScoreRequest(username, malId, score, moods);
  if (!req) return false;
  try {
    await sb.query(req.path, { method: req.method, headers: { ...sb.headers, Prefer: req.prefer }, body: JSON.stringify(req.body) });
    return true;
  } catch {
    return false;
  }
}
