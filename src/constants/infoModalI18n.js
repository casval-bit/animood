// ─── Static info pages reachable from the footer: About / Contact / FAQ /
// Categories (the 8 moods) / Content moderation policy. All read-only —
// no admin queue, no backend, same spirit as LegalModal.jsx.
export const INFO_MODAL_I18N = {
  fr: {
    about: {
      title: "🌀 À propos",
      tagline: "Découvre les animés qui matchent ton humeur",
      sections: [
        { h: "C'est quoi AniMood ?", p: "AniMood est une plateforme communautaire de recommandation d'animés basée sur les émotions. Au lieu de chercher par genre ou popularité, tu choisis ton humeur du moment — et AniMood te trouve l'animé parfait pour y correspondre." },
        { h: "Comment ça marche ?", p: "Chaque animé de notre base est associé à un profil émotionnel construit à partir des votes de la communauté et d'une analyse IA. Quand tu sélectionnes une ou plusieurs humeurs (Hype, Chill, Dark, Emotional…), le moteur calcule les meilleurs matchs et te propose 3 animés. Tu peux reroll autant que tu veux." },
        { h: "Projet open source", p: "AniMood est un projet communautaire et open source. Le code est disponible sur GitHub." },
      ],
      githubCta: "Voir le code sur GitHub",
    },
    contact: {
      title: "✉️ Contact",
      intro: "Une question, une suggestion, ou envie de contribuer au projet ? Voici comment nous joindre.",
      items: [
        { icon: "📧", title: "Email", desc: "Pour toute question générale", action: "contact@animood.app", href: "mailto:contact@animood.app" },
        { icon: "🐛", title: "Signaler un bug", desc: "Ouvre une issue sur GitHub", action: "github.com/casval-bit/animood/issues", href: "https://github.com/casval-bit/animood/issues", external: true },
        { icon: "💡", title: "Suggérer une fonctionnalité", desc: "Une idée pour améliorer AniMood ?", action: "Ouvrir une discussion GitHub", href: "https://github.com/casval-bit/animood/discussions", external: true },
        { icon: "🤝", title: "Contribuer", desc: "Fork, PR, ou simplement une étoile sur le repo", action: "github.com/casval-bit/animood", href: "https://github.com/casval-bit/animood", external: true },
      ],
    },
    faq: {
      title: "❓ FAQ",
      intro: "Les questions les plus fréquentes sur AniMood.",
      items: [
        { q: "Comment fonctionnent les recommandations ?", a: "AniMood combine les votes de la communauté et une analyse IA pour construire un profil émotionnel pour chaque animé. Quand tu sélectionnes une humeur, on calcule les animés dont le profil émotionnel correspond le mieux." },
        { q: "Mes animés vus sont-ils pris en compte ?", a: "Oui — les animés que tu as marqués comme vus, en cours ou abandonnés sont exclus des recommandations. Tu peux gérer ta liste depuis ton profil." },
        { q: "Comment voter pour les moods d'un animé ?", a: "Clique sur n'importe quel animé pour ouvrir sa fiche détail. Tu y trouveras le moodboard de la communauté, avec la possibilité de voter pour les moods qui te semblent correspondre." },
        { q: "Puis-je suggérer un animé manquant ?", a: "La base de données est synchronisée automatiquement avec MyAnimeList via Jikan. Si un animé est absent, il sera probablement ajouté lors de la prochaine sync hebdomadaire. Tu peux aussi ouvrir une issue sur GitHub." },
        { q: "AniMood est-il gratuit ?", a: "Oui, complètement gratuit et sans publicité. C'est un projet communautaire open source." },
        { q: "Comment signaler un bug ou un problème ?", a: "Via la page Contact ou directement sur GitHub Issues. Décris le problème et les étapes pour le reproduire — ça aide beaucoup." },
        { q: "Les mini-jeux sont-ils disponibles en solo ?", a: "Oui — Anidle, Poster et Quiz OP sont des jeux solo jouables chaque jour. LinkUp, Timeline et Cluescale sont des jeux multijoueur que tu peux lancer depuis le Forum." },
        { q: "Comment inviter des amis à jouer ?", a: "Depuis le lobby d'une partie privée LinkUp/Timeline/Cluescale, tu peux inviter un abonné ou une personne que tu suis directement. Il/elle reçoit l'invitation dans sa cloche de notifications et peut rejoindre en un clic." },
      ],
    },
    categories: {
      title: "🎨 Catégories",
      intro: "AniMood organise ses recommandations autour de 8 humeurs (« moods »). Chaque animé de la base a un profil construit sur ces 8 axes — plus le profil d'un animé correspond aux humeurs choisies, plus il te sera recommandé.",
      descriptions: {
        emotional: "Touchant, mélancolique",
        happy:     "Feel-good, léger",
        hype:      "Action, adrénaline",
        dark:      "Sombre, mature",
        chill:     "Relaxant, tranche de vie",
        twisted:   "Psychologique, complexe",
        in_love:   "Romance, tendresse",
        thrills:   "Suspense, tension",
      },
    },
    moderation: {
      title: "🛡️ Contenu à revoir",
      sections: [
        { h: "Filtre automatique", p: "Les posts, threads et réponses du forum passent par un filtre qui bloque à la publication les mots et expressions les plus problématiques (insultes graves, incitation à la haine…), y compris leurs variantes déguisées (accents, chiffres à la place de lettres, etc.)." },
        { h: "Ce que ça ne couvre pas", p: "Ce filtre attrape les cas évidents, pas les abus de contexte (harcèlement ciblé, désinformation, contenu limite mais sans mot banni). Pour ça, on compte sur les signalements de la communauté." },
        { h: "Signaler un contenu", p: "Pas encore de bouton dédié dans l'interface — en attendant, signale tout contenu problématique via la page Contact (bug/GitHub Issues) en donnant un lien ou une description précise. Une vraie file de modération avec examen manuel est envisagée pour une prochaine version." },
        { h: "Tu peux déjà agir toi-même", p: "Bloquer un utilisateur (depuis son profil, menu ⋯) cache immédiatement ses posts, threads et réponses pour toi, et coupe les messages privés dans les deux sens." },
      ],
    },
    close: "Fermer",
  },

  en: {
    about: {
      title: "🌀 About",
      tagline: "Discover anime that match your mood",
      sections: [
        { h: "What is AniMood?", p: "AniMood is a community-driven anime recommendation platform built around emotions. Instead of browsing by genre or popularity, you pick your current mood — and AniMood finds the perfect anime for it." },
        { h: "How does it work?", p: "Every anime in our database has an emotional profile built from community votes and AI analysis. When you pick one or more moods (Hype, Chill, Dark, Emotional…), the engine computes the best matches and gives you 3 anime. Reroll as many times as you want." },
        { h: "Open source project", p: "AniMood is a community, open-source project. The code is available on GitHub." },
      ],
      githubCta: "View the code on GitHub",
    },
    contact: {
      title: "✉️ Contact",
      intro: "Got a question, a suggestion, or want to contribute to the project? Here's how to reach us.",
      items: [
        { icon: "📧", title: "Email", desc: "For any general question", action: "contact@animood.app", href: "mailto:contact@animood.app" },
        { icon: "🐛", title: "Report a bug", desc: "Open an issue on GitHub", action: "github.com/casval-bit/animood/issues", href: "https://github.com/casval-bit/animood/issues", external: true },
        { icon: "💡", title: "Suggest a feature", desc: "An idea to improve AniMood?", action: "Open a GitHub discussion", href: "https://github.com/casval-bit/animood/discussions", external: true },
        { icon: "🤝", title: "Contribute", desc: "Fork, PR, or just a star on the repo", action: "github.com/casval-bit/animood", href: "https://github.com/casval-bit/animood", external: true },
      ],
    },
    faq: {
      title: "❓ FAQ",
      intro: "The most frequently asked questions about AniMood.",
      items: [
        { q: "How do the recommendations work?", a: "AniMood combines community votes and AI analysis to build an emotional profile for each anime. When you pick a mood, we compute the anime whose profile matches it best." },
        { q: "Are my watched anime taken into account?", a: "Yes — anime you've marked as watched, watching or dropped are excluded from recommendations. You can manage your list from your profile." },
        { q: "How do I vote on an anime's moods?", a: "Click any anime to open its detail page. You'll find the community moodboard there, where you can vote for the moods you feel fit." },
        { q: "Can I suggest a missing anime?", a: "The database syncs automatically with MyAnimeList via Jikan. If an anime is missing, it'll likely show up in the next weekly sync. You can also open a GitHub issue." },
        { q: "Is AniMood free?", a: "Yes, completely free and ad-free. It's a community open-source project." },
        { q: "How do I report a bug or issue?", a: "Via the Contact page or directly on GitHub Issues. Describe the problem and the steps to reproduce it — that helps a lot." },
        { q: "Are the mini-games available solo?", a: "Yes — Anidle, Poster and OP Quiz are solo games playable daily. LinkUp, Timeline and Cluescale are multiplayer games you can launch from the Forum." },
        { q: "How do I invite friends to play?", a: "From a private LinkUp/Timeline/Cluescale room's lobby, you can invite a follower or someone you follow directly. They get the invite in their notification bell and can join with one click." },
      ],
    },
    categories: {
      title: "🎨 Categories",
      intro: "AniMood organizes its recommendations around 8 moods. Every anime in the database has a profile built on these 8 axes — the closer an anime's profile matches your picked moods, the more it gets recommended to you.",
      descriptions: {
        emotional: "Touching, melancholic",
        happy:     "Feel-good, light",
        hype:      "Action, adrenaline",
        dark:      "Dark, mature",
        chill:     "Relaxing, slice-of-life",
        twisted:   "Psychological, complex",
        in_love:   "Romance, tenderness",
        thrills:   "Suspense, tension",
      },
    },
    moderation: {
      title: "🛡️ Content under review",
      sections: [
        { h: "Automatic filter", p: "Forum posts, threads and replies go through a filter that blocks the most problematic words and phrases at publish time (serious insults, hate speech…), including disguised variants (accents, digits swapped for letters, etc.)." },
        { h: "What it doesn't catch", p: "This filter catches the obvious cases, not context-dependent abuse (targeted harassment, misinformation, borderline content with no banned word). For that, we rely on community reports." },
        { h: "Reporting content", p: "No dedicated in-app button yet — in the meantime, report any problematic content via the Contact page (bug/GitHub Issues) with a link or a precise description. A real moderation queue with manual review is planned for a future version." },
        { h: "You can already act yourself", p: "Blocking a user (from their profile, ⋯ menu) immediately hides their posts, threads and replies for you, and cuts off DMs both ways." },
      ],
    },
    close: "Close",
  },
};
