// ─── POPULAR STUDIOS — derived from real anime_cache data, no guesswork ───────
import { sb } from "./supabase.js";

const STUDIO_BLURBS = {
  fr: {
    "MAPPA":              "Studio en pleine ascension, réputé pour son animation dynamique et ses productions sombres et intenses.",
    "Ufotable":           "Célèbre pour ses scènes d'action et ses effets visuels numériques spectaculaires.",
    "Kyoto Animation":    "Studio culte pour la finesse de son animation et ses histoires tranche-de-vie touchantes.",
    "Madhouse":           "Un des studios les plus prolifiques et versatiles de l'industrie, tous genres confondus.",
    "Bones":              "Reconnu pour ses scènes d'action fluides et ses univers riches.",
    "Wit Studio":         "Animations soignées et mises en scène cinématographiques.",
    "A-1 Pictures":       "Studio polyvalent derrière de nombreux succès populaires tous genres.",
    "Production I.G":     "Pionnier de l'animation japonaise, célèbre pour ses productions cyberpunk et d'action.",
    "Trigger":            "Studio indépendant reconnu pour son style visuel énergique et original.",
    "CloverWorks":        "Studio moderne, souvent associé aux drames romantiques et psychologiques.",
    "David Production":   "Connu pour son style visuel flamboyant et ses adaptations fidèles.",
    "Toei Animation":     "Le plus ancien studio d'animation japonais, à l'origine de nombreuses licences légendaires.",
    "Sunrise":            "Studio historique, pilier du genre mecha et des grandes sagas d'action.",
    "Studio Pierrot":     "Spécialisé dans les longues séries shōnen à succès.",
    "White Fox":          "Studio compact reconnu pour ses adaptations soignées et son sens du rythme narratif.",
    "Shaft":              "Studio à l'identité visuelle forte et expérimentale.",
    "Doga Kobo":          "Spécialiste des comédies et tranche-de-vie pleines de peps.",
    "P.A. Works":         "Réputé pour ses drames visuellement soignés ancrés dans des lieux réels.",
    "Studio Deen":        "Studio historique aux productions variées, du shōnen au fantastique.",
    "OLM":                "Studio derrière de nombreuses licences familiales sur le long terme.",
  },
  en: {
    "MAPPA":              "A studio on the rise, known for its dynamic animation and dark, intense productions.",
    "Ufotable":           "Famous for its action scenes and spectacular digital visual effects.",
    "Kyoto Animation":    "A cult studio celebrated for the finesse of its animation and its touching slice-of-life stories.",
    "Madhouse":           "One of the industry's most prolific and versatile studios, across every genre.",
    "Bones":              "Known for its fluid action scenes and rich worlds.",
    "Wit Studio":         "Polished animation with cinematic direction.",
    "A-1 Pictures":       "A versatile studio behind many popular hits across all genres.",
    "Production I.G":     "A pioneer of Japanese animation, famous for its cyberpunk and action productions.",
    "Trigger":            "An independent studio known for its energetic, original visual style.",
    "CloverWorks":        "A modern studio often associated with romantic and psychological dramas.",
    "David Production":   "Known for its flamboyant visual style and faithful adaptations.",
    "Toei Animation":     "The oldest Japanese animation studio, behind many legendary franchises.",
    "Sunrise":            "A historic studio, a pillar of the mecha genre and major action sagas.",
    "Studio Pierrot":     "Specialized in long-running, successful shōnen series.",
    "White Fox":          "A compact studio known for polished adaptations and a strong sense of narrative pacing.",
    "Shaft":              "A studio with a bold, experimental visual identity.",
    "Doga Kobo":          "Specialist in lively comedies and slice-of-life shows.",
    "P.A. Works":         "Known for visually polished dramas grounded in real-world settings.",
    "Studio Deen":        "A historic studio with varied productions, from shōnen to fantasy.",
    "OLM":                "The studio behind many long-running family franchises.",
  },
};
const DEFAULT_BLURB = {
  fr: "Studio d'animation japonais reconnu pour la qualité de ses productions.",
  en: "A Japanese animation studio known for the quality of its productions.",
};

const BLURBS_LOWER = {
  fr: Object.fromEntries(Object.entries(STUDIO_BLURBS.fr).map(([k,v]) => [k.toLowerCase(), v])),
  en: Object.fromEntries(Object.entries(STUDIO_BLURBS.en).map(([k,v]) => [k.toLowerCase(), v])),
};

export function studioBlurb(name, lang = "fr") {
  const table = BLURBS_LOWER[lang] || BLURBS_LOWER.fr;
  return table[(name||"").toLowerCase()] || DEFAULT_BLURB[lang] || DEFAULT_BLURB.fr;
}

// Same JP/other granularity as constants/filters.js COUNTRIES, so studio badges
// stay consistent with the anime country filter used across the app.
export function countryBadge(code, lang = "fr") {
  return code === "JP"
    ? { code:"JP",    emoji:"🇯🇵", label: lang === "en" ? "Japan" : "Japon" }
    : { code:"other", emoji:"🌍", label: lang === "en" ? "International" : "International" };
}

export async function fetchPopularStudios(limit = 12, lang = "fr") {
  const rows = await sb.query("anime_cache?select=mal_id,title,score,studios,country&order=score.desc.nullslast&limit=300");
  const map = new Map();
  (rows||[]).forEach(row => {
    (row.studios||[]).forEach(s => {
      if(!s?.mal_id) return;
      if(!map.has(s.mal_id)) map.set(s.mal_id, { mal_id: s.mal_id, name: s.name, count: 0, titles: [], countryCounts: { JP:0, other:0 } });
      const entry = map.get(s.mal_id);
      entry.count += 1;
      entry.countryCounts[row.country === "JP" ? "JP" : "other"] += 1;
      if(entry.titles.length < 3 && !entry.titles.includes(row.title)) entry.titles.push(row.title);
    });
  });
  return [...map.values()]
    .sort((a,b) => b.count - a.count)
    .slice(0, limit)
    .map(({ countryCounts, ...s }) => ({
      ...s,
      blurb: studioBlurb(s.name, lang),
      country: countryBadge(countryCounts.JP >= countryCounts.other ? "JP" : "other", lang),
    }));
}

// For studios sourced directly from Jikan (e.g. free-text studio search), which
// carry no country info — cross-reference anime_cache via jsonb containment on
// the studios array to derive the same JP/other majority badge.
export async function getStudioCountries(studioIds, lang = "fr") {
  const ids = [...new Set(studioIds)].filter(Boolean);
  if(!ids.length) return {};
  const orClause = ids.map(id => `studios.cs.[{"mal_id":${id}}]`).join(",");
  let rows;
  try {
    rows = await sb.query(`anime_cache?select=country,studios&or=(${orClause})&limit=500`);
  } catch { return {}; }
  const counts = new Map();
  (rows||[]).forEach(row => {
    (row.studios||[]).forEach(s => {
      if(!ids.includes(s.mal_id)) return;
      if(!counts.has(s.mal_id)) counts.set(s.mal_id, { JP:0, other:0 });
      counts.get(s.mal_id)[row.country === "JP" ? "JP" : "other"] += 1;
    });
  });
  const out = {};
  counts.forEach((c, id) => { out[id] = countryBadge(c.JP >= c.other ? "JP" : "other", lang); });
  return out;
}
