// ─── Fiches d'animés en lot (table anime_cache) — pour la compatibilité entre membres ─────────────────────────────────────────────────
// Quelques colonnes seulement (genres, studios, année, affiche…), par lots de 100 comme les autres lectures en masse de l'appli.
// Mémoire de session : un animé déjà lu (ou absent du cache : null) n'est pas redemandé.
import { sb } from "./supabase.js";

const COLUMNS = "mal_id,title,title_en,image_url,large_image,genres,studios,year,type,popularity,score,episodes,duration";
const CHUNK = 100;
const store = new Map();                 // mal_id → ligne, ou null quand l'animé n'est pas dans le cache

/**
 * Charge les fiches qui manquent ; ne rejette jamais.
 * @returns {Promise<{ rows: Object<number, object>, failed: boolean }>}  failed = au moins un lot n'a pas pu être lu (il sera retenté la prochaine fois)
 */
export async function loadAnimeMeta(ids) {
  const wanted = [...new Set((ids || []).map(Number).filter((n) => n > 0))];
  const need = wanted.filter((id) => !store.has(id));
  const chunks = [];
  for (let i = 0; i < need.length; i += CHUNK) chunks.push(need.slice(i, i + CHUNK));
  let failed = false;
  await Promise.all(chunks.map(async (chunk) => {
    try {
      const rows = await sb.query(`anime_cache?mal_id=in.(${chunk.join(",")})&select=${COLUMNS}&limit=${chunk.length}`);
      for (const r of rows || []) store.set(r.mal_id, r);
      for (const id of chunk) if (!store.has(id)) store.set(id, null);
    } catch { failed = true; }
  }));
  const rows = {};
  for (const id of wanted) if (store.get(id)) rows[id] = store.get(id);
  return { rows, failed };
}
