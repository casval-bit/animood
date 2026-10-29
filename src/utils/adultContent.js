// Contenu pour adultes (hentai, Rx, « doujin ») : masqué du calendrier et de « récemment terminés »,
// sauf si l'utilisateur l'a lui-même mis dans sa liste (voir isVisibleInCalendar).
const names = (list) => (Array.isArray(list) ? list : []).map(g => String(g?.name ?? g ?? "").toLowerCase());

export function isAdultAnime(a) {
  if(!a) return false;
  if(/^rx\b/i.test(String(a.rating || ""))) return true; // « Rx - Hentai » (MAL / Jikan)
  const tags = [...names(a.genres), ...names(a.themes)];
  if(tags.some(n => n === "hentai" || n === "erotica" || n === "doujin" || n === "doujinshi")) return true; // AniList met « Hentai » dans les genres
  return /\bdoujin(shi)?\b|同人/i.test(`${a.title || ""} ${a.title_en || ""} ${a.title_jp || ""}`);
}

// Statuts qui comptent comme « je l'ai mis dans ma liste » : l'anime reste alors visible
const KEEP = new Set(["watchlist", "watching", "onhold"]);
export const isVisibleInCalendar = (a, myStatuses) => !isAdultAnime(a) || KEEP.has(myStatuses?.[a.mal_id]);
