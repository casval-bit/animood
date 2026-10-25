/**
 * Streaming platform deep-links for AniMood.
 *
 * Stratégie (par priorité) :
 *  1. URL directe depuis Jikan (DB champ streaming = [{name, url}]) ← la meilleure
 *  2. Slug explicite depuis l'anime_cache (champ streaming_slugs si disponible)
 *  3. Génération de slug depuis le titre (Crunchyroll seulement)
 *  4. Recherche avec titre nettoyé (fallback universel)
 *
 * Le champ `anime.streaming` vient de Jikan et contient les VRAIES URLs
 * (ex: {name:"Crunchyroll", url:"https://www.crunchyroll.com/series/GRDQPM1ZY"}).
 * C'est de loin le meilleur moyen d'arriver direct sur la page de l'animé.
 */

// ── Normalisation des noms de plateformes ─────────────────────────────────────
const PLATFORM_ALIASES = {
  "crunchyroll":            "crunchyroll",
  "netflix":                "netflix",
  "amazon prime video":     "amazon",
  "prime video":            "amazon",
  "amazon":                 "amazon",
  "hidive":                 "hidive",
  "adn":                    "adn",
  "animation digital network": "adn",
  "funimation":             "funimation",
  "hulu":                   "hulu",
  "disney plus":            "disney",
  "disney+":                "disney",
};

export function normaliseServiceName(name = "") {
  return PLATFORM_ALIASES[(name || "").toLowerCase().trim()] || null;
}

// ── Service definitions ────────────────────────────────────────────────────────
export const STREAMING_SERVICES = {
  crunchyroll: {
    id: "crunchyroll",
    label: "Crunchyroll",
    color: "#F47521",
    icon: "🟠",
    slugUrl:   (slug) => `https://www.crunchyroll.com/series/${slug}`,
    searchUrl: (title) =>
      `https://www.crunchyroll.com/search?q=${encodeURIComponent(cleanTitle(title))}`,
  },
  netflix: {
    id: "netflix",
    label: "Netflix",
    color: "#E50914",
    icon: "🔴",
    slugUrl: null,
    searchUrl: (title) =>
      `https://www.netflix.com/search?q=${encodeURIComponent(cleanTitle(title))}`,
  },
  amazon: {
    id: "amazon",
    label: "Prime Video",
    color: "#00A8E0",
    icon: "🔵",
    slugUrl: null,
    searchUrl: (title) =>
      `https://www.primevideo.com/search?phrase=${encodeURIComponent(cleanTitle(title))}`,
  },
  adn: {
    id: "adn",
    label: "ADN",
    color: "#3B82F6",
    icon: "🇫🇷",
    slugUrl:   (slug) => `https://animationdigitalnetwork.com/video/${slug}`,
    searchUrl: (title) =>
      `https://animationdigitalnetwork.com/catalog?search=${encodeURIComponent(cleanTitle(title))}`,
  },
  hidive: {
    id: "hidive",
    label: "HIDIVE",
    color: "#00B3FF",
    icon: "🌊",
    slugUrl:   (slug) => `https://www.hidive.com/stream/${slug}`,
    searchUrl: (title) =>
      `https://www.hidive.com/search#${encodeURIComponent(cleanTitle(title))}`,
  },
  funimation: {
    id: "funimation",
    label: "Funimation",
    color: "#410099",
    icon: "🟣",
    slugUrl: null,
    searchUrl: (title) =>
      `https://www.funimation.com/search/?q=${encodeURIComponent(cleanTitle(title))}`,
  },
  hulu: {
    id: "hulu",
    label: "Hulu",
    color: "#1CE783",
    icon: "🟢",
    slugUrl: null,
    searchUrl: (title) =>
      `https://www.hulu.com/search?q=${encodeURIComponent(cleanTitle(title))}`,
  },
  disney: {
    id: "disney",
    label: "Disney+",
    color: "#0A5CDB",
    icon: "✨",
    slugUrl: null,
    searchUrl: (title) =>
      `https://www.disneyplus.com/search?q=${encodeURIComponent(cleanTitle(title))}`,
  },
};

// Services toujours affichés (même sans confirmation)
export const DEFAULT_SHOW_SERVICES = ["crunchyroll", "netflix", "amazon", "adn"];

// ── Title utilities ────────────────────────────────────────────────────────────

/**
 * Nettoie un titre pour la recherche sur les plateformes.
 * Ex: "Re:Zero − Starting Life in Another World" → "Re Zero Starting Life in Another World"
 */
export function cleanTitle(title = "") {
  return title
    .replace(/[：:]/g, " ")
    .replace(/[−–—]/g, " ")
    .replace(/[～~]/g, " ")
    .replace(/[!！]/g, "")
    .replace(/[?？]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Génère un slug Crunchyroll depuis un titre.
 * "Re:Zero − Starting Life in Another World" → "re-zero-starting-life-in-another-world"
 * "Sword Art Online: Alicization"             → "sword-art-online-alicization"
 */
export function titleToSlug(title = "") {
  return title
    .toLowerCase()
    .replace(/[：:]/g, " ")
    .replace(/[−–—]/g, " ")
    .replace(/[～~]/g, " ")
    .replace(/[!！?？]/g, "")
    .replace(/[.,;'"''""\[\](){}]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")    // non-latin → espace
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── URL Builder ────────────────────────────────────────────────────────────────

/**
 * Construit la meilleure URL pour un service et un animé.
 *
 * @param {string} serviceId  — clé de STREAMING_SERVICES
 * @param {object} anime      — objet animé (title, title_english, streaming...)
 * @param {object} [slugsMap] — map optionnel { crunchyroll: "slug", ... }
 * @returns {string}
 */
export function getStreamingUrl(serviceId, anime, slugsMap = {}) {
  const svc = STREAMING_SERVICES[serviceId];
  if (!svc) return "";

  // ── 1. URL directe depuis Jikan (streaming = [{name, url}]) ──────────────
  // C'est la source la plus fiable — URL exacte de la page de l'animé.
  const jikanStreaming = anime?.streaming;
  if (Array.isArray(jikanStreaming)) {
    for (const entry of jikanStreaming) {
      const entryId = normaliseServiceName(entry?.name);
      if (entryId === serviceId && entry?.url) {
        // Nettoyer l'URL Jikan (parfois elle a des trailing slashes ou params)
        return entry.url.split("?")[0]; // on retire les query params Jikan
      }
    }
  }

  // ── 2. Slug explicite passé en paramètre ─────────────────────────────────
  const dbSlug = slugsMap?.[serviceId];
  if (dbSlug && svc.slugUrl) {
    return svc.slugUrl(dbSlug);
  }

  // ── 3. Crunchyroll : génération automatique de slug ──────────────────────
  // Fonctionne pour ~80% des animes car CR suit une convention stricte.
  if (serviceId === "crunchyroll" && svc.slugUrl) {
    const rawTitle = anime?.title_english || anime?.title || "";
    const slug = titleToSlug(rawTitle);
    if (slug && slug.length > 3) {
      return svc.slugUrl(slug);
    }
  }

  // ── 4. Fallback recherche ────────────────────────────────────────────────
  const searchTitle = anime?.title_english || anime?.title || "";
  return svc.searchUrl(searchTitle);
}

/**
 * Renvoie la liste des services confirmés disponibles (URL Jikan ou slug DB).
 */
export function getConfirmedServices(anime, slugsMap = {}) {
  const confirmed = new Set();

  // Depuis Jikan
  if (Array.isArray(anime?.streaming)) {
    for (const entry of anime.streaming) {
      const id = normaliseServiceName(entry?.name);
      if (id && STREAMING_SERVICES[id] && entry?.url) confirmed.add(id);
    }
  }

  // Depuis slugsMap
  for (const [id, slug] of Object.entries(slugsMap)) {
    if (slug && STREAMING_SERVICES[id]) confirmed.add(id);
  }

  return confirmed;
}

/**
 * Ouvre le lien streaming.
 * Desktop : IPC Electron (shell.openExternal).
 * Web     : window.open.
 */
export async function openStreamingLink(serviceId, anime, slugsMap = {}) {
  const url = getStreamingUrl(serviceId, anime, slugsMap);
  if (!url) return;

  if (isDesktopApp()) {
    try {
      await window.animood.openStream(serviceId, url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Détection Electron.
 */
export function isDesktopApp() {
  return typeof window !== "undefined" && window.animood?.isDesktop === true;
}

/** Appli de bureau installée depuis le Microsoft Store (les plateformes de streaming perso y sont désactivées). */
export function isStoreApp() {
  return isDesktopApp() && window.animood?.isStore === true;
}
