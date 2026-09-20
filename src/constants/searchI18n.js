export const SEARCH_I18N = {
  fr: {
    title: "🔍 Recherche",
    subtitle: "Explore les animes et studios les plus populaires, ou cherche par titre.",

    tabAnime: "Animé",
    tabStudio: "Studio",
    tabArtist: "Artiste",
    tabMembers: "Membres",

    filterAll: "Tout",
    filterAnime: "Animé",
    filterMovie: "Film",
    filterOva: "OAV",

    popularNow: "🔥 Populaires en ce moment",
    popularMovies: "🎬 Coups de cœur films",
    popularOva: "💿 Coups de cœur OAV",
    studiosPopular: "🎬 Studios populaires",

    placeholderAnime: "Titre d'animé…",
    placeholderStudio: "Nom de studio…",
    placeholderArtist: "Nom de chanteur ou de groupe…",
    placeholderMembers: "Nom d'utilisateur…",

    loading: "Chargement…",
    searching: "Recherche…",
    searchingInProgress: "Recherche en cours…",
    resultCount: (n) => `${n} résultat${n !== 1 ? "s" : ""}`,

    membersYourConnections: "Tes abonnements et abonnés",
    noMembersTitle: "Aucun membre pour l'instant",
    noMembersSubtitle: "Cherche un pseudo pour trouver des membres",

    artistsPopular: "🎤 Artistes populaires",
    artistThemeCount: (n) => `🎵 ${n} opening${n !== 1 ? "s" : ""}/ending${n !== 1 ? "s" : ""}`,

    noResultsTitle: "Aucun résultat",
    noResultsSubtitle: "Essaie un autre terme",

    errorPrefix: (msg) => `Erreur : ${msg}`,
    jikanDown: "Jikan est temporairement indisponible — réessaie dans quelques secondes",
    animeThemesDown: "La base des openings est temporairement indisponible — réessaie dans quelques secondes",

    studioAnimationDefault: "Studio d'animation",
    studioPopularCount: (n) => `${n} animés populaires`,

    memberWatchedCount: (n) => ` · ${n} animés`,
    followerWord: (n) => `abonné${n !== 1 ? "s" : ""}`,
    followingWord: (n) => `suivi${n !== 1 ? "s" : ""}`,
    followingBadge: "Suivi",
    followerBadge: "Abonné",
  },

  en: {
    title: "🔍 Search",
    subtitle: "Explore the most popular anime and studios, or search by title.",

    tabAnime: "Anime",
    tabStudio: "Studio",
    tabArtist: "Artist",
    tabMembers: "Members",

    filterAll: "All",
    filterAnime: "Anime",
    filterMovie: "Movie",
    filterOva: "OVA",

    popularNow: "🔥 Popular right now",
    popularMovies: "🎬 Featured movies",
    popularOva: "💿 Featured OVAs",
    studiosPopular: "🎬 Popular studios",

    placeholderAnime: "Anime title…",
    placeholderStudio: "Studio name…",
    placeholderArtist: "Singer or band name…",
    placeholderMembers: "Username…",

    loading: "Loading…",
    searching: "Searching…",
    searchingInProgress: "Searching…",
    resultCount: (n) => `${n} result${n !== 1 ? "s" : ""}`,

    membersYourConnections: "Your follows and followers",
    noMembersTitle: "No members yet",
    noMembersSubtitle: "Search a username to find members",

    artistsPopular: "🎤 Popular artists",
    artistThemeCount: (n) => `🎵 ${n} opening${n !== 1 ? "s" : ""}/ending${n !== 1 ? "s" : ""}`,

    noResultsTitle: "No results",
    noResultsSubtitle: "Try another term",

    errorPrefix: (msg) => `Error: ${msg}`,
    jikanDown: "Jikan is temporarily unavailable — try again in a few seconds",
    animeThemesDown: "The opening database is temporarily unavailable — try again in a few seconds",

    studioAnimationDefault: "Animation studio",
    studioPopularCount: (n) => `${n} popular anime`,

    memberWatchedCount: (n) => ` · ${n} anime`,
    followerWord: (n) => `follower${n !== 1 ? "s" : ""}`,
    followingWord: () => `following`,
    followingBadge: "Following",
    followerBadge: "Follower",
  },
};
