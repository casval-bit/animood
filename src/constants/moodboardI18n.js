export const MOODBOARD_I18N = {
  fr: {
    title: "Moodboard",
    subtitle: "Trouve ton prochain anime selon ton humeur.",
    tagline: "Jusqu'à 3 moods · recommandations IA personnalisées",

    moodLabel: "Mood",
    moodMax: "(max 3)",
    guideLabel: "Guide",
    guideTitle: "🎭 Les 8 moods",

    duration: "Durée",
    country: "Pays d'origine",
    type: "Type",

    friendRecs: "Recommandations amis",
    friendToggle: "❤️ Coups de cœur amis",

    excludedCount: (n) => `✓ ${n} animés exclus · 🤖 mood IA activé`,

    analyzing: "Analyse en cours…",
    otherSuggestions: "🎲 Autres suggestions",
    moreSuggestions: "🎲 Encore d'autres ?",
    lockedSuggestions: "🔒 Modifie ta sélection",
    lockedHint: "Change les moods pour relancer",

    noResultsTitle: "Aucun animé trouvé",
    noResultsSubtitle: "Essaie d'autres filtres",

    emptyTitle: "Choisis tes moods.",
    emptySubtitle: "Nous trouverons le meilleur anime.",
    statAnimeCount: "12 000 animes",
    statAiRecs: "Recommandations IA",
    statSatisfaction: "98% de satisfaction",

    currentMood: "Mood actuel",
    dominantGenres: "Genres dominants",
    compatibility: "Compatibilité",
    previewHint: "Clique sur « Trouver mon anime » pour voir tes recommandations personnalisées.",

    findBtn: "✨ Trouver mon anime",
    pickMoodBtn: "Choisis un mood d'abord",

    viewBtn: "Voir →",
    episodes: (n) => `${n} épisodes`,

    friendLikedOne: (u) => `@${u} l'a aimé`,
    friendLikedFew: (n) => `${n} l'ont aimé`,
    friendLikedMany: "Plusieurs amis l'ont aimé",

    recommendedForYou: "Recommandé pour toi",
    alignedWithMood: (pct, m) => `${pct}% aligné avec ton mood ${m.emoji} ${m.label}`,

    moodDescriptions: {
      emotional: "Larmes, drama intense, émotions déchirantes. Anime qui touchent profondément.",
      happy:     "Comédie, situations drôles, humour. Anime qui font rire et sourire.",
      hype:      "Action, adrénaline, combats intenses. Anime qui font monter la pression.",
      dark:      "Sombre, mature, violent, désespoir. Anime qui explorent le côté obscur.",
      chill:     "Contemplatif, calme, apaisant. Slice-of-life et anime relaxants.",
      twisted:   "Psychologique, mind games, rebondissements. Anime qui font réfléchir.",
      in_love:   "Romantique, attachement, amour. Anime qui font battre le cœur.",
      thrills:   "Tension narrative, enjeux élevés, frissons. Anime qui tiennent en haleine.",
    },
  },

  en: {
    title: "Moodboard",
    subtitle: "Find your next anime based on your mood.",
    tagline: "Up to 3 moods · personalized AI recommendations",

    moodLabel: "Mood",
    moodMax: "(max 3)",
    guideLabel: "Guide",
    guideTitle: "🎭 The 8 moods",

    duration: "Duration",
    country: "Country of origin",
    type: "Type",

    friendRecs: "Friend recommendations",
    friendToggle: "❤️ Friends' favorites",

    excludedCount: (n) => `✓ ${n} anime excluded · 🤖 AI mood enabled`,

    analyzing: "Analyzing…",
    otherSuggestions: "🎲 Other suggestions",
    moreSuggestions: "🎲 Even more?",
    lockedSuggestions: "🔒 Change your selection",
    lockedHint: "Change the moods to try again",

    noResultsTitle: "No anime found",
    noResultsSubtitle: "Try different filters",

    emptyTitle: "Choose your moods.",
    emptySubtitle: "We'll find the best anime for you.",
    statAnimeCount: "12,000 anime",
    statAiRecs: "AI recommendations",
    statSatisfaction: "98% satisfaction",

    currentMood: "Current mood",
    dominantGenres: "Dominant genres",
    compatibility: "Compatibility",
    previewHint: "Click \"Find my anime\" to see your personalized recommendations.",

    findBtn: "✨ Find my anime",
    pickMoodBtn: "Pick a mood first",

    viewBtn: "View →",
    episodes: (n) => `${n} episodes`,

    friendLikedOne: (u) => `@${u} liked this`,
    friendLikedFew: (n) => `${n} liked this`,
    friendLikedMany: "Several friends liked this",

    recommendedForYou: "Recommended for you",
    alignedWithMood: (pct, m) => `${pct}% aligned with your ${m.emoji} ${m.label} mood`,

    moodDescriptions: {
      emotional: "Tears, intense drama, heart-wrenching emotions. Anime that hit deep.",
      happy:     "Comedy, funny situations, humor. Anime that make you laugh and smile.",
      hype:      "Action, adrenaline, intense fights. Anime that ramp up the pressure.",
      dark:      "Dark, mature, violent, hopeless. Anime that explore the darker side.",
      chill:     "Contemplative, calm, soothing. Slice-of-life and relaxing anime.",
      twisted:   "Psychological, mind games, twists. Anime that make you think.",
      in_love:   "Romantic, attachment, love. Anime that make your heart race.",
      thrills:   "Narrative tension, high stakes, chills. Anime that keep you on edge.",
    },
  },
};
