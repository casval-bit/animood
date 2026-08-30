export const FORUM_I18N = {
  fr: {
    title: "💬 Forum",
    subtitle: "Le pouls de la communauté — humeur du moment, sorties à venir, nouveautés et derniers trailers.",
    loadingNews: "Chargement des actus…",
    emptyTitle: "Rien pour l'instant",
    emptySubtitle: "Reviens bientôt pour les dernières actus.",

    // ThreadRow
    animeFallback: "Anime",
    trailerBtn: "▶ Trailer",

    // ForumCategory
    topicCount: (n) => `${n} sujet${n !== 1 ? "s" : ""}`,
    seeLess: "▲ Voir moins",
    seeMore: (n) => `▼ Voir plus (${n})`,

    // countdownLabel
    countdownDays: (d) => `⏳ Dans ${d} j`,
    countdownTomorrow: "⏳ Demain",
    countdownToday: "⏳ Aujourd'hui",
    countdownSoon: "Bientôt disponible",
    countdownYear: (y) => `Prévu en ${y}`,
    countdownUnknown: "Date inconnue",

    // AnticipatedCard
    mostAnticipated: "🔥 Anime le plus attendu — meilleure popularité MAL",

    // CommunityMoodBlock
    communityMood: "😊 Humeur de la communauté",
    communityMoodEmpty: "Pas encore assez de votes cette semaine pour dégager une tendance.",
    communityMoodSubtitle: (n) => `Cette semaine, d'après ${n} réaction${n !== 1 ? "s" : ""} de mood`,

    // DiscussionsBlock
    discussions: "🔥 Discussions",
    newTopicBtn: "➕ Nouveau sujet",
    loading: "Chargement…",
    noDiscussions: "Aucune discussion pour l'instant",
    noDiscussionsSub: "Lance la première conversation de la communauté.",
    createTopicBtn: "➕ Créer un sujet",
    replyCount: (n) => `${n} réponse${n !== 1 ? "s" : ""}`,

    // ForumCategory sections
    upcomingTitle: "Prochaines sorties",
    upcomingSubtitle: "Annonces à venir",
    trailersTitle: "Derniers trailers",
    trailersSubtitle: "Bandes-annonces récentes",
    favoritesTitle: "Les plus ajoutés en favoris",
    favoritesSubtitle: "D'après les favoris épinglés des membres",
    newAnimeTitle: "Nouveaux animes ajoutés",
    newAnimeSubtitle: "Derniers ajouts à la base",
    metaTrailer: "Trailer",
    metaFavorite: "Favori",
    metaNew: "Nouveau",
    favoritesUnit: (n) => (n > 1 ? "favoris" : "favori"),

    // Mini-games
    miniGamesTitle: "🎮 Mini-jeux du jour",
    wordleTitle: "Wordle Animé",
    wordleLabel: "Wordle",
    posterTitle: "Poster Mystère",
    posterLabel: "Poster",
    chainTitle: "Chaîne Animé — 1v1",
    chainLabel: "Chaîne",
    timelineTitle: "Timeline — 1v1",
    timelineLabel: "Timeline",
  },

  en: {
    title: "💬 Forum",
    subtitle: "The pulse of the community — the mood right now, upcoming releases, new arrivals and the latest trailers.",
    loadingNews: "Loading news…",
    emptyTitle: "Nothing yet",
    emptySubtitle: "Come back soon for the latest news.",

    // ThreadRow
    animeFallback: "Anime",
    trailerBtn: "▶ Trailer",

    // ForumCategory
    topicCount: (n) => `${n} topic${n !== 1 ? "s" : ""}`,
    seeLess: "▲ See less",
    seeMore: (n) => `▼ See more (${n})`,

    // countdownLabel
    countdownDays: (d) => `⏳ In ${d} d`,
    countdownTomorrow: "⏳ Tomorrow",
    countdownToday: "⏳ Today",
    countdownSoon: "Coming soon",
    countdownYear: (y) => `Expected in ${y}`,
    countdownUnknown: "Unknown date",

    // AnticipatedCard
    mostAnticipated: "🔥 Most anticipated anime — best MAL popularity",

    // CommunityMoodBlock
    communityMood: "😊 Community mood",
    communityMoodEmpty: "Not enough votes yet this week to spot a trend.",
    communityMoodSubtitle: (n) => `This week, based on ${n} mood reaction${n !== 1 ? "s" : ""}`,

    // DiscussionsBlock
    discussions: "🔥 Discussions",
    newTopicBtn: "➕ New topic",
    loading: "Loading…",
    noDiscussions: "No discussions yet",
    noDiscussionsSub: "Start the community's first conversation.",
    createTopicBtn: "➕ Create a topic",
    replyCount: (n) => `${n} repl${n !== 1 ? "ies" : "y"}`,

    // ForumCategory sections
    upcomingTitle: "Upcoming releases",
    upcomingSubtitle: "Announcements to come",
    trailersTitle: "Latest trailers",
    trailersSubtitle: "Recent trailers",
    favoritesTitle: "Most added to favorites",
    favoritesSubtitle: "Based on members' pinned favorites",
    newAnimeTitle: "Newly added anime",
    newAnimeSubtitle: "Latest additions to the database",
    metaTrailer: "Trailer",
    metaFavorite: "Favorite",
    metaNew: "New",
    favoritesUnit: (n) => (n > 1 ? "favorites" : "favorite"),

    // Mini-games
    miniGamesTitle: "🎮 Mini-games of the day",
    wordleTitle: "Anime Wordle",
    wordleLabel: "Wordle",
    posterTitle: "Mystery Poster",
    posterLabel: "Poster",
    chainTitle: "Anime Chain — 1v1",
    chainLabel: "Chain",
    timelineTitle: "Timeline — 1v1",
    timelineLabel: "Timeline",
  },
};
