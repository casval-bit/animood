// ─── Search page fetchers — one per tab, no UI state ─────────────────────────
import { jikan } from "./jikan.js";
import { sb } from "./supabase.js";
import { studioBlurb } from "./studios.js";
import { searchArtists } from "./animethemes.js";

// Jikan orders by score; re-rank so exact / prefix title matches come first.
export async function searchAnime(query, typeFilter) {
  const params = { q:query, limit:24, order_by:"score", sort:"desc", sfw:false };
  if(typeFilter !== "all") params.type = typeFilter;
  const res = await jikan.searchAnime(params);
  const tLow = query.toLowerCase();
  const rank = (ti, en) => (ti===tLow||en===tLow)?3:(ti.startsWith(tLow)||en.startsWith(tLow))?2:(ti.includes(tLow)||en.includes(tLow))?1:0;
  return [...(res.data||[])].sort((a,b) =>
    rank((b.title||"").toLowerCase(), (b.title_english||"").toLowerCase()) -
    rank((a.title||"").toLowerCase(), (a.title_english||"").toLowerCase()));
}

export async function searchStudios(query, lang) {
  // First try Supabase — extract unique studios from anime_cache
  let studios = [];
  try {
    const enc = encodeURIComponent(query);
    const rows = await sb.query(
      `anime_cache?select=studios,country&studios=cs.%5B%7B%22name%22%3A%22${enc}%22%7D%5D&limit=500`
    );
    const studioMap = new Map();
    (rows||[]).forEach(row => {
      (row.studios||[]).forEach(s => {
        if(!s?.name || !s.name.toLowerCase().includes(query.toLowerCase())) return;
        if(!studioMap.has(s.mal_id)) {
          studioMap.set(s.mal_id, { mal_id: s.mal_id, name: s.name, count: 0, blurb: studioBlurb(s.name, lang), titles: [], country: null });
        }
        studioMap.get(s.mal_id).count++;
      });
    });
    studios = [...studioMap.values()].sort((a,b) => b.count - a.count).slice(0,30);
  } catch { /* fall through to Jikan */ }

  // Also try Jikan producers endpoint for broader coverage
  try {
    const r = await fetch(`https://api.jikan.moe/v4/producers?q=${encodeURIComponent(query)}&order_by=count&sort=desc&limit=20`);
    const d = await r.json();
    const jikanStudios = (d.data||[]).map(s => ({
      mal_id: s.mal_id, name: s.titles?.[0]?.title || "Studio", count: s.count,
      established: s.established, logo: s.images?.jpg?.image_url || null,
      blurb: studioBlurb(s.titles?.[0]?.title, lang), titles: [],
    }));
    // Merge — prefer Jikan entries (more complete) but keep Supabase-only ones
    const merged = new Map(studios.map(s => [s.mal_id, s]));
    jikanStudios.forEach(s => { merged.set(s.mal_id, { ...merged.get(s.mal_id)||{}, ...s }); });
    studios = [...merged.values()].sort((a,b) => b.count - a.count).slice(0,30);
  } catch { /* keep the Supabase-only list */ }

  return studios;
}

export async function searchMembers(query, blockedUsers) {
  const enc = encodeURIComponent(query);
  const rows = await sb.query(`profiles?or=(name.ilike.*${enc}*,username.ilike.*${enc}*)&select=username,name,avatar,bio,watched&limit=20`);
  return (rows||[]).filter(r => !blockedUsers?.has(r.username));
}

export { searchArtists };
