// ─── « Les plus actifs cette semaine » : animés autour desquels la communauté AniMood s'est le plus activée (7 derniers jours) ───
// Aucun SQL à installer : tout vient de tables que tout compte connecté lit déjà (user_votes, posts, comments, forum_threads,
// forum_replies — voir supabase/security_rls_1_private.sql) et d'anime_cache pour les fiches. Le classement est dans utils/communityActivity.js.
import { sb } from "./supabase.js";
import { supabaseRowToAnime } from "./jikan.js";
import { collectEvents, rankActivity } from "../utils/communityActivity.js";

const TTL_MS = 5 * 60_000;                  // les évènements sont gardés 5 min : changer de filtre ou d'onglet ne relance pas 5 requêtes
const POOL = 24;                            // animés classés dont on va chercher la fiche (le filtre Film / OAV en écarte une partie)
const ANIME_SELECT = "mal_id,title,title_en,synopsis,score,rank,year,episodes,type,image_url,large_image,genres,studios";

let cache = null;                           // { at, promise }
const cachedEvents = () => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = collectEvents((path) => sb.query(path));
  cache = { at: Date.now(), promise };
  promise.catch(() => { if (cache?.promise === promise) cache = null; });
  return promise;
};

/** Oublie les évènements gardés (après qu'on a voté, posté…). */
export const resetHotAnimeCache = () => { cache = null; };

/**
 * Animés les plus actifs sur 7 jours, avec leur fiche : [{ ...anime, activity: { members, actions, score } }], du plus au moins actif.
 * @param {{limit?:number, type?:string|null, exclude?:Set<string>}} [opts] type : « TV », « Movie », « OVA » ; exclude : membres bloqués.
 */
export async function fetchHotAnime({ limit = 6, type = null, exclude = null } = {}) {
  const ranked = rankActivity(await cachedEvents(), { exclude, limit: POOL });
  if (!ranked.length) return [];
  let rows;
  try { rows = (await sb.query(`anime_cache?mal_id=in.(${ranked.map((r) => r.mal_id).join(",")})&limit=${ranked.length}&select=${ANIME_SELECT}`)) || []; } catch { return []; }
  const byId = new Map(rows.map((r) => [r.mal_id, r]));
  const out = [];
  for (const r of ranked) {                 // l'ordre du classement est conservé ; un animé absent d'anime_cache est ignoré
    const row = byId.get(r.mal_id);
    if (!row) continue;
    const anime = supabaseRowToAnime(row);
    if (type && anime.type !== type) continue;
    out.push({ ...anime, activity: { members: r.members, actions: r.actions, score: r.score } });
    if (out.length >= limit) break;
  }
  return out;
}
