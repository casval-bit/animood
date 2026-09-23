export const USER_PROFILE_MODAL_I18N = {
  fr: {
    loading: "Chargement…",
    notFound: "Profil introuvable",

    followers: "abonnés",
    following: "abonnements",
    mutualFollowersTitle: (count) => `👥 ${count} abonné${count>1?"s":""} en commun`,

    followBtn: "Suivre",
    followingBtn: "Suivi ✓",
    messageBtn: "💬 Message",
    moreOptions: "Plus d'options",
    unblockBtn: "Débloquer",
    blockBtn: (username) => `🚫 Bloquer @${username}`,

    statWatched: "Vus",
    statRated: "Notés",
    statAvg: "Moy.",
    statFollowers: "Abonnés",

    tabProfile: "Profil",
    tabJournal: "Journal",
    tabLists: "Listes",

    favorites: "❤️ Favoris",
    highlightsTitle: "⭐ Highlights",
    emptyList: "Liste vide",
    moodRadar: "🎭 Profil émotionnel",
    scoreDistribution: "📊 Distribution des notes",
    badgeSectionTitle: "🏆 Badges",

    journalEmpty: "Aucun animé dans le journal",
    listsEmpty: "Aucune liste",

    timeJustNow: "à l'instant",
    timeDayUnit: "j",
  },

  en: {
    loading: "Loading…",
    notFound: "Profile not found",

    followers: "followers",
    following: "following",
    mutualFollowersTitle: (count) => `👥 ${count} mutual follower${count>1?"s":""}`,

    followBtn: "Follow",
    followingBtn: "Following ✓",
    messageBtn: "💬 Message",
    moreOptions: "More options",
    unblockBtn: "Unblock",
    blockBtn: (username) => `🚫 Block @${username}`,

    statWatched: "Watched",
    statRated: "Rated",
    statAvg: "Avg.",
    statFollowers: "Followers",

    tabProfile: "Profile",
    tabJournal: "Journal",
    tabLists: "Lists",

    favorites: "❤️ Favorites",
    highlightsTitle: "⭐ Highlights",
    emptyList: "Empty list",
    moodRadar: "🎭 Emotional profile",
    scoreDistribution: "📊 Rating distribution",
    badgeSectionTitle: "🏆 Badges",

    journalEmpty: "No anime in the journal",
    listsEmpty: "No lists",

    timeJustNow: "just now",
    timeDayUnit: "d",
  },
};
