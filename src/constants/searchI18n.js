export const SEARCH_I18N = {
  fr: {
    title: "🔍 Recherche",
    subtitle: "Cherche un animé, un studio, un artiste ou un membre — ou explore la saison en cours.",

    tabAnime: "Animé",
    tabStudio: "Studio",
    tabArtist: "Artiste",
    tabMembers: "Membres",
    tabSeason: "Saison",

    seasonTitle: "📅 Saison en cours",
    seasonSubtitle: "Animés TV · classés par jour de diffusion",
    days: ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"],
    today: "AUJOURD'HUI",
    scheduledWord: (n) => `animé${n !== 1 ? "s" : ""} planifié${n !== 1 ? "s" : ""}`,
    seasonYear: (y) => `Saison en cours · ${y}`,
    myCalendar: "Mon calendrier",
    viewDay: "Jour",
    viewWeek: "Semaine",
    noAnimeThisDay: "Aucun animé diffusé ce jour-là",
    localTimeNote: "Jours et heures convertis dans ton fuseau horaire (diffusion d'origine au Japon).",
    jstTooltip: (time) => `${time} heure japonaise (JST)`,
    dayAnimeCount: (n) => `${n} animé${n !== 1 ? "s" : ""}`,
    recurring: "récurrent",
    unknownDay: (n) => `📺 Jour non précisé (${n})`,
    noBroadcastData: "Données de diffusion non disponibles — affichage par popularité",

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
    animeThemesDown: "AnimeThemes, la base des openings/endings, est hors ligne pour le moment (panne chez eux) — réessaie un peu plus tard.",
    retry: "Réessayer",

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
    subtitle: "Search for an anime, studio, artist or member — or browse the current season.",

    tabAnime: "Anime",
    tabStudio: "Studio",
    tabArtist: "Artist",
    tabMembers: "Members",
    tabSeason: "Season",

    seasonTitle: "📅 Current season",
    seasonSubtitle: "TV anime · by broadcast day",
    days: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    today: "TODAY",
    scheduledWord: () => "scheduled anime",
    seasonYear: (y) => `Current season · ${y}`,
    myCalendar: "My calendar",
    viewDay: "Day",
    viewWeek: "Week",
    noAnimeThisDay: "No anime airing on this day",
    localTimeNote: "Days and times converted to your timezone (original broadcast in Japan).",
    jstTooltip: (time) => `${time} Japan time (JST)`,
    dayAnimeCount: (n) => `${n} anime`,
    recurring: "ongoing",
    unknownDay: (n) => `📺 Day not specified (${n})`,
    noBroadcastData: "Broadcast data unavailable — sorted by popularity",

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
    animeThemesDown: "AnimeThemes, the opening/ending database, is offline right now (outage on their side) — try again a bit later.",
    retry: "Retry",

    studioAnimationDefault: "Animation studio",
    studioPopularCount: (n) => `${n} popular anime`,

    memberWatchedCount: (n) => ` · ${n} anime`,
    followerWord: (n) => `follower${n !== 1 ? "s" : ""}`,
    followingWord: () => `following`,
    followingBadge: "Following",
    followerBadge: "Follower",
  },
};
