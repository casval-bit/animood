// ─── MOODBOARD / SEARCH FILTERS ───────────────────────────────────────────────
const LABELS = {
  fr: { all:"Tout", short:"Court", medium:"Moyen", long:"Long", TV:"Animé",  Movie:"Film",  OVA:"OAV", JP:"Japonais",  other:"Autres" },
  en: { all:"All",  short:"Short", medium:"Medium", long:"Long", TV:"Anime", Movie:"Movie", OVA:"OVA", JP:"Japanese", other:"Other" },
};

const DURATION_META   = [{id:"all",emoji:"🔀"},{id:"short",emoji:"⚡"},{id:"medium",emoji:"📺"},{id:"long",emoji:"📚"}];
const MEDIA_TYPE_META = [{id:"all",emoji:"🔀"},{id:"TV",emoji:"📺"},{id:"Movie",emoji:"🎬"},{id:"OVA",emoji:"💿"}];
const COUNTRY_META    = [{id:"all",emoji:"🔀"},{id:"JP",emoji:"🇯🇵"},{id:"other",emoji:"🌍"}];

const withLabels = (meta, lang) => {
  const labels = LABELS[lang] || LABELS.fr;
  return meta.map(m => ({ ...m, label: labels[m.id] }));
};

export const getDurations  = (lang = "fr") => withLabels(DURATION_META, lang);
export const getMediaTypes = (lang = "fr") => withLabels(MEDIA_TYPE_META, lang);
export const getCountries  = (lang = "fr") => withLabels(COUNTRY_META, lang);

export const STREAMING_COLORS = {"Netflix":"#E50914","Crunchyroll":"#F47521","ADN":"#00AEEF","Hidive":"#00BCD4","Amazon Prime Video":"#00A8E0","Funimation":"#410099"};
