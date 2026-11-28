// ─── Dates des notes d'un membre (table user_votes, colonne voted_at) — pour le calendrier d'activité de l'onglet Stats ─────────────────────────
// Une ligne par (membre, animé) : la date est celle de la dernière note donnée ou modifiée pour cet animé. Lecture par pages de 1 000 lignes
// (la limite de l'API), 3 pages au plus ; les notes les plus récentes d'abord. Ne rejette jamais.
import { sb } from "./supabase.js";
import { readPages } from "../utils/pagedRead.js";

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 3;

/** @returns {Promise<{ times: string[], failed: boolean, truncated: boolean }>} truncated = il y a peut-être plus de notes que ce qu'on a lu */
export async function loadVoteTimes(username) {
  if (!username) return { times: [], failed: false, truncated: false };
  const { items, failed, truncated } = await readPages(
    (offset) => sb.query(`user_votes?username=eq.${encodeURIComponent(username)}&voted_at=not.is.null&select=voted_at&order=voted_at.desc&limit=${PAGE_SIZE}&offset=${offset}`),
    { pageSize: PAGE_SIZE, maxPages: MAX_PAGES },
  );
  return { times: items.map((r) => r?.voted_at).filter(Boolean), failed, truncated };
}
