export const PROFILE_I18N = {
  fr: {
    // Tabs
    tabProfile: "Profil",
    tabJournal: "Journal",
    tabLists: "Listes",
    tabPosts: "Mes Posts",
    tabStats: "Stats",

    // PersonalMoodRadar
    calculating: "Calcul en cours…",
    moodProfileTitle: "🎭 Ton profil émotionnel",
    basedOn: (count, total) => `Basé sur ${count} animés vus sur ${total}`,

    // TopGenres
    topGenresTitle: "🎌 Genres les plus vus",
    loading: "Chargement…",

    // StatBars (genres/studios/VAs sort buttons)
    sortCount: "Quantité",
    sortAvgRating: "Note moy.",

    // YearCurve tooltip
    yearTooltip: (year, avg, count) => `${year} — ★${avg} (${count} animés)`,

    // StatsTab
    statAnimeWatchedTV: "Animés vus (TV)",
    statEpisodesWatched: "Épisodes vus",
    statAnimeRated: "Animés notés",
    statAvgRating: "Note moyenne",
    ratingDistribution: "📊 Distribution des notes",
    avgRatingByYear: "📅 Note moyenne par année",
    dominantMoods: "🎭 Moods dominants",
    moodSortCount: "Nb #1",
    moodSortAvg: "Score moy.",
    moodStatCount: (count, avg) => `${count} animés${avg ? ` · ★${avg}` : ""}`,
    moodStatAvg: (avg, count) => `★${avg||"—"} · ${count} animés`,

    // Header
    bioPlaceholder: "Ton style d'anime…",
    addBioPlaceholder: "✏️ Ajoute une bio…",
    followerLabel: (n) => `abonné${n!==1?"s":""}`,
    followingLabel: (n) => `abonnement${n!==1?"s":""}`,

    // Profile tab
    favoritesTitle: "❤️ Favoris",
    editDone: "Terminé",
    editBtn: "Modifier",
    dragHint: "Glisse pour réordonner · ✕ pour retirer",
    recentlyWatchedTitle: "🕐 Derniers vus",
    seeAllArrow: "Voir tout →",
    pinnedListEmpty: "Liste vide — ajoute des animés depuis l'onglet Listes",
    pinListTitle: "Épingler une liste",
    pinListDesc: "Affiche une liste perso sur ton profil",
    statVus: "Vus",
    statNotes: "Notés",
    statMoy: "Moy.",
    rateToSeeDistribution: "Note des animés pour voir ta distribution",

    // Journal tab
    aniListSubLists: "📋 Sous-listes AniList",
    journalEmptyTitle: "Ton journal est vide",
    notRated: "Non noté",

    // Lists tab
    animeCount: (n) => `${n} animé${n!==1?"s":""}`,
    highlightsSuffix: "Les 5 premiers dans tes favoris",
    highlightsSuffixModal: "Les 5 premiers dans tes favoris du profil",
    pinnedBadge: "Épinglée",
    pinBtnActive: "📌 Épinglée",
    pinBtnInactive: "📌 Épingler",
    createListPlaceholder: "Nom de la liste…",
    createBtn: "Créer",
    createListTitle: "Créer une liste",
    createListDesc: "Organise tes animés par thème",
    deleteBtn: "Supprimer",
    searchPlaceholder: "Rechercher…",
    addAnimeTitle: "Ajouter un animé",

    // Highlights modal
    highlightsEmptyTitle: "Aucun highlight",
    highlightsEmptySubtitle: "Ajoute des animés via ❤️ sur leurs fiches",

    // Watchlist modal
    watchlistEmptyTitle: "Watchlist vide",
    watchlistEmptySubtitle: "Ajoute des animés via 🎯 sur leur fiche",

    // Custom list modal
    listEmptyTitle: "Liste vide",
    listEmptySubtitle: "Recherche des animés à ajouter ci-dessous",

    // Posts tab
    loadingPosts: "Chargement des posts…",
    noPostsTitle: "Aucun post pour l'instant",
    postTypeWritten: "✍️ Post",
    postTypeCommented: "💬 Commenté",
    dateLocale: "fr-FR",
    confirmDeletePost: "Supprimer ce post ?",
    commentsLabel: "💬 Commentaires",
    loadingComments: "Chargement…",
    noComments: "Aucun commentaire",

    // Stats tab
    calculatingStats: "Calcul des stats…",
    noStatsTitle: "Aucune donnée disponible",

    // Frame picker modal
    framesUnlockedTitle: "🖼 Cadres débloqués",
    frameCount: (n) => `${n} cadre${n!==1?"s":""} débloqué${n!==1?"s":""}`,
    noFrameTitle: "Aucun cadre",
    noFrameDesc: "Avatar sans cadre",
    frameCatWatched: "📺 Animés vus",
    frameCatContribution: "🗳️ Contribution",
    frameCatFollowers: "👥 Followers",
    frameCatGenre: "🎌 Genre",

    // Avatar picker modal
    chooseAvatarTitle: "Choisir un avatar",
  },

  en: {
    // Tabs
    tabProfile: "Profile",
    tabJournal: "Journal",
    tabLists: "Lists",
    tabPosts: "My Posts",
    tabStats: "Stats",

    // PersonalMoodRadar
    calculating: "Calculating…",
    moodProfileTitle: "🎭 Your emotional profile",
    basedOn: (count, total) => `Based on ${count} watched anime out of ${total}`,

    // TopGenres
    topGenresTitle: "🎌 Most watched genres",
    loading: "Loading…",

    // StatBars (genres/studios/VAs sort buttons)
    sortCount: "Count",
    sortAvgRating: "Avg. rating",

    // YearCurve tooltip
    yearTooltip: (year, avg, count) => `${year} — ★${avg} (${count} anime)`,

    // StatsTab
    statAnimeWatchedTV: "Anime watched (TV)",
    statEpisodesWatched: "Episodes watched",
    statAnimeRated: "Anime rated",
    statAvgRating: "Average rating",
    ratingDistribution: "📊 Rating distribution",
    avgRatingByYear: "📅 Average rating by year",
    dominantMoods: "🎭 Dominant moods",
    moodSortCount: "# Top",
    moodSortAvg: "Avg. score",
    moodStatCount: (count, avg) => `${count} anime${avg ? ` · ★${avg}` : ""}`,
    moodStatAvg: (avg, count) => `★${avg||"—"} · ${count} anime`,

    // Header
    bioPlaceholder: "Your anime style…",
    addBioPlaceholder: "✏️ Add a bio…",
    followerLabel: (n) => `follower${n!==1?"s":""}`,
    followingLabel: () => "following",

    // Profile tab
    favoritesTitle: "❤️ Favorites",
    editDone: "Done",
    editBtn: "Edit",
    dragHint: "Drag to reorder · ✕ to remove",
    recentlyWatchedTitle: "🕐 Recently watched",
    seeAllArrow: "See all →",
    pinnedListEmpty: "Empty list — add anime from the Lists tab",
    pinListTitle: "Pin a list",
    pinListDesc: "Show a custom list on your profile",
    statVus: "Watched",
    statNotes: "Rated",
    statMoy: "Avg.",
    rateToSeeDistribution: "Rate anime to see your distribution",

    // Journal tab
    aniListSubLists: "📋 AniList sub-lists",
    journalEmptyTitle: "Your journal is empty",
    notRated: "Not rated",

    // Lists tab
    animeCount: (n) => `${n} anime`,
    highlightsSuffix: "First 5 shown in your favorites",
    highlightsSuffixModal: "First 5 shown in your profile favorites",
    pinnedBadge: "Pinned",
    pinBtnActive: "📌 Pinned",
    pinBtnInactive: "📌 Pin",
    createListPlaceholder: "List name…",
    createBtn: "Create",
    createListTitle: "Create a list",
    createListDesc: "Organize your anime by theme",
    deleteBtn: "Delete",
    searchPlaceholder: "Search…",
    addAnimeTitle: "Add an anime",

    // Highlights modal
    highlightsEmptyTitle: "No highlights",
    highlightsEmptySubtitle: "Add anime via ❤️ on their pages",

    // Watchlist modal
    watchlistEmptyTitle: "Empty watchlist",
    watchlistEmptySubtitle: "Add anime via 🎯 on their page",

    // Custom list modal
    listEmptyTitle: "Empty list",
    listEmptySubtitle: "Search for anime to add below",

    // Posts tab
    loadingPosts: "Loading posts…",
    noPostsTitle: "No posts yet",
    postTypeWritten: "✍️ Post",
    postTypeCommented: "💬 Commented",
    dateLocale: "en-US",
    confirmDeletePost: "Delete this post?",
    commentsLabel: "💬 Comments",
    loadingComments: "Loading…",
    noComments: "No comments yet",

    // Stats tab
    calculatingStats: "Calculating stats…",
    noStatsTitle: "No data available",

    // Frame picker modal
    framesUnlockedTitle: "🖼 Unlocked frames",
    frameCount: (n) => `${n} frame${n!==1?"s":""} unlocked`,
    noFrameTitle: "No frame",
    noFrameDesc: "Avatar without a frame",
    frameCatWatched: "📺 Watched anime",
    frameCatContribution: "🗳️ Contribution",
    frameCatFollowers: "👥 Followers",
    frameCatGenre: "🎌 Genre",

    // Avatar picker modal
    chooseAvatarTitle: "Choose an avatar",
  },
};
