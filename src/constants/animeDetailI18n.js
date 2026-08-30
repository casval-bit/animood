export const ANIME_DETAIL_I18N = {
  fr: {
    loading: "Chargement…",
    myScoreBadge: (score) => `Ma note : ${score}/10`,

    synopsis: "Synopsis",
    availableOn: "Disponible sur",
    staff: "Staff",
    charactersVoice: "Personnages & Seiyuu",
    errorPrefix: (msg) => `Erreur : ${msg}`,

    animoodScore: "Note AniMood",
    userVotes: (n) => `/10 · ${n} vote${n !== 1 ? "s" : ""} utilisateur${n !== 1 ? "s" : ""}`,
    notRatedYet: "Pas encore noté",

    yourFriends: "Tes amis",
    friendsAvgOf: (n) => `moy. de ${n} amis`,
    friendsLabel: "amis",

    myRating: "Ma note",
    moodPrompt: "Ton ressenti (max 3 moods) :",

    saving: "Enregistrement…",
    saved: "✓ Enregistré",
    save: "Sauvegarder",
    watchedBadge: "✓ Vu",
    markWatched: "Marquer vu",
    watchTrailer: "▶ Voir le trailer",
  },

  en: {
    loading: "Loading…",
    myScoreBadge: (score) => `My rating: ${score}/10`,

    synopsis: "Synopsis",
    availableOn: "Available on",
    staff: "Staff",
    charactersVoice: "Characters & Voice Actors",
    errorPrefix: (msg) => `Error: ${msg}`,

    animoodScore: "AniMood Score",
    userVotes: (n) => `/10 · ${n} user vote${n !== 1 ? "s" : ""}`,
    notRatedYet: "Not rated yet",

    yourFriends: "Your friends",
    friendsAvgOf: (n) => `avg. of ${n} friends`,
    friendsLabel: "friends",

    myRating: "My rating",
    moodPrompt: "Your vibe (max 3 moods):",

    saving: "Saving…",
    saved: "✓ Saved",
    save: "Save",
    watchedBadge: "✓ Watched",
    markWatched: "Mark watched",
    watchTrailer: "▶ Watch trailer",
  },
};
