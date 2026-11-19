// ─── Activité de la communauté AniMood par animé, sur une période (par défaut les 7 derniers jours) ───────────────
// Les sources (notes / votes d'humeur, posts du Feed, commentaires, sujets et réponses du Forum) sont ramenées à des évènements
// { kind, mal_id, username, at } ; ce module les récupère (collectEvents), les agrège et les classe (rankActivity).
// Aucune dépendance au navigateur ni à Supabase : la fonction de requête est injectée, donc tout est testable tel quel.

export const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Poids d'un évènement : lancer une discussion (post, sujet) > y réagir (commentaire, réponse) > noter ou voter. */
export const WEIGHTS = { post: 3, thread: 3, comment: 2, reply: 2, vote: 1 };
/** Plafond de points par membre et par animé : un seul membre très bavard ne peut pas, à lui seul, faire monter un animé. */
export const MEMBER_CAP = 6;
/** Un membre qui note plus de VOTE_BURST animés dans la période (import AniList, rattrapage de sa liste…) : ses notes ne comptent pas. */
export const VOTE_BURST = 10;

/**
 * Classe les animés par activité de la communauté.
 * @param {{kind:string, mal_id:number, username:string, at:string|number}[]} events
 * @param {{now?:number, windowMs?:number, exclude?:Set<string>, cap?:number, voteBurst?:number, limit?:number}} [opts]
 *   exclude : pseudos à ignorer (membres bloqués).
 * @returns {{mal_id:number, score:number, members:number, actions:number, lastAt:number}[]}
 *   score = somme, sur les membres, de leurs points plafonnés ; égalité → plus de membres, puis activité la plus récente.
 */
export function rankActivity(events, { now = Date.now(), windowMs = WEEK_MS, exclude = null, cap = MEMBER_CAP, voteBurst = VOTE_BURST, limit = 24 } = {}) {
  const since = now - windowMs, until = now + 3600_000;          // une heure de tolérance pour une horloge en avance
  const valid = [], votesBy = new Map();
  for (const e of events || []) {
    const mal_id = Number(e?.mal_id), weight = WEIGHTS[e?.kind], user = typeof e?.username === "string" ? e.username : "", at = Date.parse(e?.at);
    if (!weight || !user || !Number.isInteger(mal_id) || mal_id <= 0 || !Number.isFinite(at) || at < since || at > until) continue;
    if (exclude?.has?.(user)) continue;
    valid.push({ kind: e.kind, mal_id, user, at, weight });
    if (e.kind === "vote") votesBy.set(user, (votesBy.get(user) || 0) + 1);
  }
  const byAnime = new Map();
  for (const e of valid) {
    if (e.kind === "vote" && votesBy.get(e.user) > voteBurst) continue;
    let a = byAnime.get(e.mal_id);
    if (!a) byAnime.set(e.mal_id, (a = { mal_id: e.mal_id, members: new Map(), actions: 0, lastAt: 0 }));
    a.members.set(e.user, (a.members.get(e.user) || 0) + e.weight);
    a.actions++;
    if (e.at > a.lastAt) a.lastAt = e.at;
  }
  return [...byAnime.values()]
    .map((a) => ({ mal_id: a.mal_id, members: a.members.size, actions: a.actions, lastAt: a.lastAt, score: [...a.members.values()].reduce((n, p) => n + Math.min(cap, p), 0) }))
    .sort((x, y) => y.score - x.score || y.members - x.members || y.lastAt - x.lastAt || x.mal_id - y.mal_id)
    .slice(0, limit);
}

const ids = (list) => [...new Set(list.filter((v) => v != null))];

/**
 * Récupère les évènements de la période. `query(path)` renvoie les lignes (tableau) d'une requête PostgREST ; en cas d'échec d'une table,
 * ses évènements manquent simplement (les autres comptent quand même).
 * Les commentaires et les réponses n'ont pas d'animé : ils prennent celui de leur post / sujet (parfois plus ancien que la période : 2e requête).
 */
export async function collectEvents(query, { now = Date.now(), windowMs = WEEK_MS, rowLimit = 1500 } = {}) {
  const since = encodeURIComponent(new Date(now - windowMs).toISOString());
  const rows = async (path) => { try { return (await query(path)) || []; } catch { return []; } };
  const [votes, posts, comments, threads, replies] = await Promise.all([
    rows(`user_votes?voted_at=gte.${since}&select=mal_id,username,voted_at&limit=${rowLimit}`),
    rows(`posts?created_at=gte.${since}&anime_id=not.is.null&select=id,anime_id,username,created_at&limit=${rowLimit}`),
    rows(`comments?created_at=gte.${since}&select=post_id,username,created_at&limit=${rowLimit}`),
    rows(`forum_threads?created_at=gte.${since}&anime_id=not.is.null&select=id,anime_id,username,created_at&limit=${rowLimit}`),
    rows(`forum_replies?created_at=gte.${since}&select=thread_id,username,created_at&limit=${rowLimit}`),
  ]);
  const postAnime = new Map(posts.map((p) => [p.id, p.anime_id]));
  const threadAnime = new Map(threads.map((t) => [t.id, t.anime_id]));
  const lookups = 200;
  const missingPosts = ids(comments.map((c) => c.post_id)).filter((id) => !postAnime.has(id)).slice(0, lookups);
  const missingThreads = ids(replies.map((r) => r.thread_id)).filter((id) => !threadAnime.has(id)).slice(0, lookups);
  const [olderPosts, olderThreads] = await Promise.all([
    missingPosts.length ? rows(`posts?id=in.(${missingPosts.join(",")})&anime_id=not.is.null&select=id,anime_id&limit=${lookups}`) : [],
    missingThreads.length ? rows(`forum_threads?id=in.(${missingThreads.join(",")})&anime_id=not.is.null&select=id,anime_id&limit=${lookups}`) : [],
  ]);
  olderPosts.forEach((p) => postAnime.set(p.id, p.anime_id));
  olderThreads.forEach((t) => threadAnime.set(t.id, t.anime_id));
  return [
    ...votes.map((v) => ({ kind: "vote", mal_id: v.mal_id, username: v.username, at: v.voted_at })),
    ...posts.map((p) => ({ kind: "post", mal_id: p.anime_id, username: p.username, at: p.created_at })),
    ...comments.map((c) => ({ kind: "comment", mal_id: postAnime.get(c.post_id), username: c.username, at: c.created_at })),
    ...threads.map((t) => ({ kind: "thread", mal_id: t.anime_id, username: t.username, at: t.created_at })),
    ...replies.map((r) => ({ kind: "reply", mal_id: threadAnime.get(r.thread_id), username: r.username, at: r.created_at })),
  ];
}
