// ─── Titres alternatifs d'un animé (partagé par les scripts de synchronisation) ───────────────────────────────
// Sert aux plateformes de streaming personnalisées de l'appli de bureau : certains sites nomment un animé autrement
// (« NIPPON SANGOKU: The Three Nations of the Crimson Sun » au lieu de « Nippon Sangoku »), alors on essaie chaque variante.
// Seuls les titres en alphabet latin sont gardés (les sites se cherchent en romaji / anglais).

export const MAX_ALT_TITLES = 12;

const NON_LATIN = /[Ͱ-ϿЀ-ӿ֐-ۿऀ-෿฀-໿぀-ヿ㐀-鿿가-힯ｦ-ﾟ]/;
const key = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Aplatit une ou plusieurs listes de titres → tableau trié, sans doublon (accents / casse / ponctuation ignorés). */
export function buildAltTitles(...lists) {
  const seen = new Set(), out = [];
  for (const t of lists.flat(Infinity)) {
    const v = String(t ?? "").trim().replace(/\s+/g, " ");
    if (v.length < 2 || v.length > 200 || NON_LATIN.test(v) || !/[A-Za-z]{2}/.test(v)) continue;
    const k = key(v);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(v);
    if (out.length >= MAX_ALT_TITLES) break;
  }
  return out;
}

/** Titres Jikan (`titles: [{type, title}]`) rangés par utilité : anglais, défaut, synonymes, puis les autres langues. */
export function jikanTitleList(titles) {
  const rank = { English: 0, Default: 1, Synonym: 2 };
  return (Array.isArray(titles) ? titles : [])
    .filter((t) => t && t.title)
    .sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9))
    .map((t) => t.title);
}
