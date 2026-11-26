// ─── AniMood 2026 : accès aux données ──────────────────────────────────────────────────────────────────────────────────
// • catalogue 2026 (table anime_cache, déjà en place) : recherche / liste pour remplir la tierlist, la grille et le top 3 ;
// • votes (table awards_2026, voir supabase/awards_2026_schema.sql) : un top 3 par membre.
// Si la table des votes n'a pas encore été créée dans Supabase, l'espace reste utilisable : le vote est gardé sur l'appareil
// (localStorage) et l'écran de résultats explique que le vote de la communauté arrive (réponse `missing: true`, jamais d'erreur).
import { sb } from "./supabase.js";
import { AWARDS_YEAR, FORMAT_GROUPS, ballotFromRow, normalizePicks, isEligible2026, buildRanking, buildPodium } from "../utils/awards2026.js";

export const AWARDS_SELECT = "mal_id,title,title_en,image_url,large_image,score,year,type,popularity,rating,genres,themes,aired_from,anime_season_label,country";
const BALLOT_SELECT = "username,pick1,pick2,pick3";
const PAGE = 1000;              // plafond de lignes par requête côté Supabase
const MAX_PAGES = 10;           // 10 000 votes : au-delà, on arrête (le classement reste juste sur cet échantillon, signalé par `truncated`)
const enc = encodeURIComponent;

/** La table n'existe pas encore (SQL pas lancé) ? Supabase répond « PGRST205 » / « 42P01 » / « schema cache ». */
export const isMissingTable = (err) => /PGRST205|PGRST200|42P01|schema cache|does not exist|Could not find the table/i.test(String(err?.message || err || ""));

// ── Catalogue ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Filtre « format » du sélecteur : liste positive de types MAL (les valeurs avec espace sont entre guillemets, comme l'attend PostgREST).
const typeFilter = (formatId) => {
  const group = FORMAT_GROUPS.find(g => g.id === formatId);
  if(!group?.types) return "&type=not.in.(CM,PV,Music)";                      // « tous » : tout sauf pubs, bandes-annonces et clips
  return `&type=in.(${group.types.map(t => (/\s/.test(t) ? `"${t}"` : t)).join(",")})`;
};

/**
 * Animés de 2026, tous formats et toutes origines (Japon, Chine, Corée…).
 * `q` : texte cherché dans le titre ; `format` : id d'un groupe de FORMAT_GROUPS ; `sort` : "popular" (rang MAL) | "score".
 * Renvoie les lignes éligibles (années / types vérifiés une seconde fois côté appli), `hasMore` (reste-t-il des pages ?) et `next` (décalage de la page suivante).
 */
export async function searchAnime2026({ q = "", format = "all", sort = "popular", limit = 36, offset = 0 } = {}) {
  const text = String(q || "").trim().replace(/[*,()"]/g, " ").replace(/\s+/g, " ").trim();
  let path = `anime_cache?year=eq.${AWARDS_YEAR}${typeFilter(format)}&select=${AWARDS_SELECT}`;
  if(text.length >= 2) path += `&or=(title.ilike.*${enc(text)}*,title_en.ilike.*${enc(text)}*)`;
  path += sort === "score" ? "&order=score.desc.nullslast,popularity.asc.nullslast" : "&order=popularity.asc.nullslast,score.desc.nullslast";
  path += `&limit=${limit + 1}&offset=${offset}`;
  const rows = await sb.query(path) || [];
  const page = rows.slice(0, limit);
  return { rows: page.filter(r => isEligible2026(r)), hasMore: rows.length > limit, next: offset + page.length };
}

/** Lignes du catalogue pour des identifiants (par paquets de 150) ; les animés introuvables ou non éligibles sont ignorés. */
export async function fetchAnimeByIds(ids, { onlyEligible = true } = {}) {
  const list = [...new Set((ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if(!list.length) return [];
  const parts = await Promise.all(Array.from({ length: Math.ceil(list.length / 150) }, (_, i) =>
    sb.query(`anime_cache?mal_id=in.(${list.slice(i * 150, i * 150 + 150).join(",")})&select=${AWARDS_SELECT}`).catch(() => [])));
  const rows = parts.flat().filter(Boolean);
  return onlyEligible ? rows.filter(r => isEligible2026(r)) : rows;
}

/** Animés de 2026 que j'ai dans mes listes (notés, vus, en cours, à voir…). */
export async function fetchMyAnime2026(me) {
  const ids = new Set();
  const add = (id) => { const n = Number(id); if(Number.isInteger(n) && n > 0) ids.add(n); };
  Object.keys(me?.ratings || {}).forEach(add);
  Object.keys(me?.statuses || {}).forEach(add);
  (me?.watched || []).forEach(add);
  (me?.favorites || []).forEach(a => add(a?.mal_id ?? a));
  const list = [...ids];
  if(!list.length) return [];
  const parts = await Promise.all(Array.from({ length: Math.ceil(list.length / 150) }, (_, i) =>
    sb.query(`anime_cache?mal_id=in.(${list.slice(i * 150, i * 150 + 150).join(",")})&year=eq.${AWARDS_YEAR}&select=${AWARDS_SELECT}`).catch(() => [])));
  return parts.flat().filter(r => r && isEligible2026(r));
}

// ── Votes (table awards_2026) ──────────────────────────────────────────────────────────────────────────────────────────
/** Mon vote : { picks: [a, b, c] | null, missing } — `missing` = table pas encore créée. */
export async function fetchMyBallot(username) {
  if(!username) return { picks: null, missing: false };
  try {
    const rows = await sb.query(`awards_2026?username=eq.${enc(username)}&select=${BALLOT_SELECT}&limit=1`);
    return { picks: ballotFromRow(rows?.[0])?.picks || null, missing: false };
  } catch(e) {
    if(isMissingTable(e)) return { picks: null, missing: true };
    throw e;
  }
}

/** Enregistre (ou remplace) mon top 3. { ok } ou { missing } ; toute autre erreur est relancée pour que l'écran l'affiche. */
export async function saveMyBallot(username, picks) {
  const clean = normalizePicks(picks);
  if(!username || !clean) throw new Error("vote incomplet");
  try {
    await sb.query("awards_2026?on_conflict=username", {
      method: "POST",
      headers: { ...sb.headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ username, pick1: clean[0], pick2: clean[1], pick3: clean[2], updated_at: new Date().toISOString() }),
    });
    return { ok: true };
  } catch(e) {
    if(isMissingTable(e)) return { ok: false, missing: true };
    throw e;
  }
}

/** Retire mon vote. */
export async function deleteMyBallot(username) {
  if(!username) return { ok: false };
  try {
    await sb.query(`awards_2026?username=eq.${enc(username)}`, { method: "DELETE" });
    return { ok: true };
  } catch(e) {
    if(isMissingTable(e)) return { ok: false, missing: true };
    throw e;
  }
}

/**
 * Tous les votes (communauté) ou ceux d'une liste de pseudos (amis). Lit par pages de 1000 (limite de Supabase) pour ne rien perdre en silence.
 * → { ballots: [{ username, picks }], missing, truncated }
 */
export async function fetchBallots({ usernames = null } = {}) {
  const out = { ballots: [], missing: false, truncated: false };
  try {
    if(usernames) {
      const list = [...new Set(usernames.filter(Boolean))];
      const parts = await Promise.all(Array.from({ length: Math.ceil(list.length / 80) }, (_, i) =>
        sb.query(`awards_2026?username=in.(${list.slice(i * 80, i * 80 + 80).map(enc).join(",")})&select=${BALLOT_SELECT}&limit=${PAGE}`)));
      out.ballots = parts.flat().map(ballotFromRow).filter(Boolean);
      return out;
    }
    for(let page = 0; page < MAX_PAGES; page++) {
      const rows = await sb.query(`awards_2026?select=${BALLOT_SELECT}&order=username.asc&limit=${PAGE}&offset=${page * PAGE}`) || [];
      out.ballots.push(...rows.map(ballotFromRow).filter(Boolean));
      if(rows.length < PAGE) return out;
    }
    out.truncated = true;
    return out;
  } catch(e) {
    if(isMissingTable(e)) return { ballots: [], missing: true, truncated: false };
    throw e;
  }
}

/**
 * Podium de la communauté pour le bloc de fin d'année : { status: "ready" | "empty" | "missing", voters, top } (voir buildPodium dans utils/awards2026.js).
 * « missing » : la table des votes n'existe pas encore. Une panne réseau est relancée : le bloc garde alors son dernier podium.
 * À grande échelle (plusieurs milliers de votants), il faudra remplacer la lecture de tous les votes par un total calculé côté serveur.
 */
export async function fetchCommunityPodium() {
  const bal = await fetchBallots();
  if(bal.missing) return { status: "missing", voters: 0, top: [] };
  const draft = buildRanking(bal.ballots, { mode: "points", scope: "community", limit: 15 });
  const rows = draft.list.length ? await fetchAnimeByIds(draft.list.map(r => r.id)) : [];
  if(draft.list.length && !rows.length) throw new Error("catalogue indisponible");       // des votes existent mais on n'a rien pu lire du catalogue : panne, pas « aucun vote »
  const { voters, top } = buildPodium(bal.ballots, new Map(rows.map(r => [r.mal_id, r])));
  return { status: top.length ? "ready" : "empty", voters, top };
}
