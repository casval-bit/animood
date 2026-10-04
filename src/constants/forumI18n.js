export const FORUM_I18N = {
  fr: {
    title: "💬 Forum",
    subtitle: "Le pouls de la communauté — discussions, mini-jeux, animés de la saison et sorties à venir.",
    loadingNews: "Chargement des actus…",
    emptyTitle: "Rien pour l'instant",
    emptySubtitle: "Reviens bientôt pour les dernières actus.",

    // ThreadRow
    animeFallback: "Anime",
    trailerBtn: "▶ Trailer",
    searchTrailer: "▶ Chercher le trailer",

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
    upcomingSubtitle: "Bandes-annonces et annonces à venir",
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
    opquizTitle: "Quiz OP",
    opquizLabel: "Quiz OP",
    chainTitle: "Chaîne Animé — 1v1",
    chainLabel: "Chaîne",
    timelineTitle: "Timeline — 1v1",
    timelineLabel: "Timeline",
    eloChainLabel: "⛓ Elo Chaîne",
    eloTimelineLabel: "📅 Elo Timeline",
    wordlePtsLabel: "🎯 Pts Wordle",
    posterPtsLabel: "🖼 Pts Poster",
    opquizPtsLabel: "🎵 Pts Quiz OP",
    cluescaleLabel: "Cluescale",
    cluescalePtsLabel: "🎭 Pts Cluescale",
    undercoverLabel: "Undercover",
    tierlistLabel: "Tierlist",
    gameTypeTool: "outil",
    opquizSubtitle: "Reconnais l'animé par son opening",
    convBtn: "💬 Discussion",
    noConversation: "Aucune discussion",
    newDiscussion: "+ Nouvelle discussion",
    airingTitle: "Animés de la saison",
    airingSubtitle: "En cours de diffusion",
    metaAiring: "En cours",
    totalPtsLabel: (n) => `${n} pts total`,
    unlocksFramesLabel: "🎮 Débloque des cadres profil",
    leaderboardTitle: "🥇 Classement général",
    leaderboardEmpty: "Personne n'a encore joué !",
    youLabel: "toi",
    eloLeaderboardTitle: (gameLabel) => `🏆 Classement ${gameLabel}`,
    confirmForfeit: "Êtes-vous sûr de vouloir quitter ? Cela comptera comme un abandon.",
    tabs: { discussions: "💬 Discussions", airing: "📡 Saison", upcoming: "📅 À venir", popular: "❤️ Populaires" },
  },

  en: {
    title: "💬 Forum",
    subtitle: "The pulse of the community — discussions, mini-games, this season's anime and upcoming releases.",
    loadingNews: "Loading news…",
    emptyTitle: "Nothing yet",
    emptySubtitle: "Come back soon for the latest news.",

    // ThreadRow
    animeFallback: "Anime",
    trailerBtn: "▶ Trailer",
    searchTrailer: "▶ Search trailer",

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
    upcomingSubtitle: "Trailers and upcoming announcements",
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
    opquizTitle: "OP Quiz",
    opquizLabel: "OP Quiz",
    chainTitle: "Anime Chain — 1v1",
    chainLabel: "Chain",
    timelineTitle: "Timeline — 1v1",
    timelineLabel: "Timeline",
    eloChainLabel: "⛓ Chain Elo",
    eloTimelineLabel: "📅 Timeline Elo",
    wordlePtsLabel: "🎯 Wordle Pts",
    posterPtsLabel: "🖼 Poster Pts",
    opquizPtsLabel: "🎵 OP Quiz Pts",
    cluescaleLabel: "Cluescale",
    cluescalePtsLabel: "🎭 Cluescale Pts",
    undercoverLabel: "Undercover",
    tierlistLabel: "Tierlist",
    gameTypeTool: "tool",
    opquizSubtitle: "Guess the anime from its opening",
    convBtn: "💬 Discuss",
    noConversation: "No discussions yet",
    newDiscussion: "+ New discussion",
    airingTitle: "This season's anime",
    airingSubtitle: "Currently airing",
    metaAiring: "Airing",
    totalPtsLabel: (n) => `${n} pts total`,
    unlocksFramesLabel: "🎮 Unlocks profile frames",
    leaderboardTitle: "🥇 Leaderboard",
    leaderboardEmpty: "No one has played yet!",
    youLabel: "you",
    eloLeaderboardTitle: (gameLabel) => `🏆 ${gameLabel} leaderboard`,
    confirmForfeit: "Are you sure you want to leave? This will count as a forfeit.",
    tabs: { discussions: "💬 Discussions", airing: "📡 Season", upcoming: "📅 Upcoming", popular: "❤️ Popular" },
  },
};
