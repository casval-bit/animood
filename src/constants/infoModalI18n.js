// ─── ANIMOOD — Info Pages i18n ────────────────────────────────────────────────
// Contenu des pages : À propos, Contact, FAQ, Les Moods, Signalement
// Importé par InfoModal.jsx

export const INFO_MODAL_I18N = {
  // ────────────────────────────────────────────────────────────────────────────
  fr: {
    // ── À propos ──────────────────────────────────────────────────────────────
    about: {
      title: "À propos d'AniMood",
      tagline: "AniMood est une application de découverte d'animés basée sur l'humeur. Plutôt que de parcourir des listes interminables, tu choisis comment tu te sens — et AniMood sélectionne les œuvres qui correspondent à ce moment.",
      sections: [
        {
          h: "D'où viennent les données ?",
          p: "Les informations sur les animés (titres, synopsis, images, scores, genres) proviennent de MyAnimeList via l'API publique Jikan (jikan.moe). AniMood n'est pas affilié à MyAnimeList ni à Jikan. Les scores AniMood combinent le score MAL officiel et les votes de la communauté.",
        },
        {
          h: "Images & droits",
          p: "Les visuels des animés (affiches, illustrations) sont la propriété de leurs ayants droit respectifs — studios, éditeurs, distributeurs. AniMood les affiche uniquement à des fins d'identification, dans le cadre du fair use. Pour signaler un usage non autorisé : legal@animood.app",
        },
        {
          h: "Projet indépendant",
          p: "AniMood est un projet personnel passionnel, développé par un fan d'anime. Il n'est rattaché à aucune entreprise commerciale. Toutes les fonctionnalités sont gratuites, sans publicité ni abonnement.",
        },
        {
          h: "Open source",
          p: "Le code source d'AniMood est disponible publiquement. Tu peux contribuer, signaler des bugs ou proposer des améliorations directement sur GitHub.",
        },
      ],
      githubCta: "Voir le code sur GitHub",
    },

    // ── Contact ───────────────────────────────────────────────────────────────
    contact: {
      title: "Contact",
      intro: "Une question, une suggestion ou un problème ? Plusieurs façons de nous joindre selon ton besoin.",
      items: [
        {
          icon: "📧",
          title: "Questions générales",
          href: "mailto:contact@animood.app",
          desc: "contact@animood.app — réponse sous 3 à 5 jours ouvrés",
          action: "Écrire",
          external: false,
        },
        {
          icon: "🐛",
          title: "Bugs & problèmes techniques",
          href: "mailto:bugs@animood.app",
          desc: "bugs@animood.app — précise le navigateur, les étapes, une capture si possible",
          action: "Signaler",
          external: false,
        },
        {
          icon: "⚖️",
          title: "Droits & contenus",
          href: "mailto:legal@animood.app",
          desc: "legal@animood.app — retrait de contenu, propriété intellectuelle",
          action: "Contacter",
          external: false,
        },
        {
          icon: "🔒",
          title: "Données personnelles",
          href: "mailto:privacy@animood.app",
          desc: "privacy@animood.app — accès, rectification, suppression de tes données",
          action: "Écrire",
          external: false,
        },
      ],
    },

    // ── FAQ ───────────────────────────────────────────────────────────────────
    faq: {
      title: "Questions fréquentes",
      intro: "Les réponses aux questions les plus courantes sur AniMood.",
      items: [
        {
          q: "Comment fonctionne la sélection par mood ?",
          a: "Chaque animé reçoit un score sur plusieurs dimensions émotionnelles : intensité, légèreté, romance, hype, frissons, etc. Quand tu sélectionnes un ou plusieurs moods, AniMood calcule un score de correspondance et te présente les animés les plus adaptés à ton état du moment.",
        },
        {
          q: "Qu'est-ce que le score AniMood ?",
          a: "Le score AniMood combine le score officiel MyAnimeList (pondéré selon le nombre de votants) et les votes de la communauté AniMood. Plus un animé est voté, plus le poids de la communauté augmente dans le calcul final.",
        },
        {
          q: "Pourquoi certains animés n'apparaissent pas ?",
          a: "AniMood se concentre sur les animés avec un score MAL suffisant et un nombre minimum de votants. Les animés très récents ou peu connus peuvent ne pas apparaître. Les contenus adultes (rated Rx) et les hentai sont exclus des recommandations.",
        },
        {
          q: "Comment fonctionne le calendrier saisonnier ?",
          a: "Le calendrier affiche les animés en cours de diffusion (TV, ONA, OAV) avec leur jour de diffusion habituel. Les données proviennent de MyAnimeList et sont mises à jour automatiquement chaque semaine.",
        },
        {
          q: "Mes votes sont-ils publics ?",
          a: "Non. Tes votes et préférences restent privés par défaut. Seul le résultat agrégé (score communautaire) est visible, de façon anonyme.",
        },
        {
          q: "Puis-je corriger une fiche d'animé ?",
          a: "Les données viennent de MyAnimeList. Pour corriger un titre, un synopsis ou des genres, la modification doit être faite directement sur MAL. AniMood synchronise les données régulièrement.",
        },
        {
          q: "AniMood est-il gratuit ?",
          a: "Oui, entièrement. Pas d'abonnement, pas de publicités, pas d'achats in-app. C'est un projet passionnel gratuit.",
        },
      ],
    },

    // ── Les Moods / Catégories ─────────────────────────────────────────────────
    categories: {
      title: "Les Moods",
      intro: "Chaque Mood correspond à une envie ou un état d'esprit. AniMood utilise cette information pour te proposer les animés les plus adaptés à ton moment. Tu peux en sélectionner plusieurs à la fois.",
      descriptions: {
        hype:       "Combats épiques, adrénaline, montées en puissance",
        happy:      "Chaleur, bonne humeur, sourires garantis",
        emotional:  "Émotions profondes, larmes ou joie intense",
        dark:       "Ambiances sombres, drame, tragédie",
        chill:      "Apaisant, contemplatif, parfait pour se détendre",
        twisted:    "Psychologique, twists, suspense haletant",
        in_love:    "Romance, histoires d'amour, chemistry",
        thrills:    "Tension narrative, frissons, dread croissant",
      },
    },

    // ── Signalement ───────────────────────────────────────────────────────────
    moderation: {
      title: "Signaler un problème",
      sections: [
        {
          h: "Tu as rencontré un problème ?",
          p: "Merci de nous le signaler ! Chaque retour aide à améliorer AniMood. Que ce soit un bug, une erreur dans les données, un problème d'affichage ou un contenu inapproprié — on veut le savoir.",
        },
        {
          h: "🐛 Bug ou problème technique",
          p: "Envoie un e-mail à bugs@animood.app en précisant : une description du problème, les étapes pour le reproduire, ton navigateur et système d'exploitation, et si possible une capture d'écran.",
        },
        {
          h: "📊 Donnée incorrecte",
          p: "Score erroné, mauvais synopsis, image manquante ou incorrecte → bugs@animood.app en précisant le titre de l'animé et la correction à apporter.",
        },
        {
          h: "⚖️ Droit d'auteur & contenu",
          p: "Pour tout signalement de contenu protégé ou propriété intellectuelle : legal@animood.app — précise l'animé concerné, le type de contenu et tes coordonnées.",
        },
        {
          h: "💡 Suggestions",
          p: "Tu as une idée pour améliorer AniMood ? Écris-nous à contact@animood.app ou via GitHub. Tous les retours sont lus et pris en compte.",
        },
        {
          h: "Délai de traitement",
          p: "Les bugs critiques sont traités en priorité. Pour les autres signalements, comptez 5 à 10 jours ouvrés. AniMood est un projet indépendant — merci pour ta patience et ta contribution !",
        },
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  en: {
    // ── About ─────────────────────────────────────────────────────────────────
    about: {
      title: "About AniMood",
      tagline: "AniMood is a mood-based anime discovery app. Instead of scrolling through endless lists, you pick how you feel — and AniMood surfaces the anime that match your current state of mind.",
      sections: [
        {
          h: "Where does the data come from?",
          p: "Anime information (titles, synopses, images, scores, genres) comes from MyAnimeList via the public Jikan API (jikan.moe). AniMood is not affiliated with MyAnimeList or Jikan. AniMood scores combine the official MAL score with community votes.",
        },
        {
          h: "Images & rights",
          p: "Anime visuals (posters, illustrations) are the property of their respective rights holders — studios, publishers, distributors. AniMood displays them solely for identification purposes, within fair use guidelines. To report unauthorized use: legal@animood.app",
        },
        {
          h: "Independent project",
          p: "AniMood is an independent personal project, built by an anime fan. It is not affiliated with any commercial company. All features are free, with no ads or subscriptions.",
        },
        {
          h: "Open source",
          p: "AniMood's source code is publicly available. You can contribute, report bugs, or suggest improvements directly on GitHub.",
        },
      ],
      githubCta: "View on GitHub",
    },

    // ── Contact ───────────────────────────────────────────────────────────────
    contact: {
      title: "Contact",
      intro: "A question, suggestion, or problem? Several ways to reach us depending on your need.",
      items: [
        {
          icon: "📧",
          title: "General inquiries",
          href: "mailto:contact@animood.app",
          desc: "contact@animood.app — response within 3–5 business days",
          action: "Write",
          external: false,
        },
        {
          icon: "🐛",
          title: "Bugs & technical issues",
          href: "mailto:bugs@animood.app",
          desc: "bugs@animood.app — include your browser, steps to reproduce, a screenshot if possible",
          action: "Report",
          external: false,
        },
        {
          icon: "⚖️",
          title: "Rights & content",
          href: "mailto:legal@animood.app",
          desc: "legal@animood.app — content removal, intellectual property",
          action: "Contact",
          external: false,
        },
        {
          icon: "🔒",
          title: "Personal data",
          href: "mailto:privacy@animood.app",
          desc: "privacy@animood.app — access, correction, or deletion of your data",
          action: "Write",
          external: false,
        },
      ],
    },

    // ── FAQ ───────────────────────────────────────────────────────────────────
    faq: {
      title: "Frequently Asked Questions",
      intro: "Answers to the most common questions about AniMood.",
      items: [
        {
          q: "How does mood-based selection work?",
          a: "Each anime is scored across several emotional dimensions: intensity, lightheartedness, romance, hype, thrills, and more. When you select one or more moods, AniMood computes a match score and surfaces the anime best suited to your current state of mind.",
        },
        {
          q: "What is the AniMood score?",
          a: "The AniMood score combines the official MyAnimeList score (weighted by voter count) with AniMood community votes. The more users vote on an anime, the more weight the community vote carries in the final calculation.",
        },
        {
          q: "Why don't some anime appear?",
          a: "AniMood focuses on anime with a sufficient MAL score and a minimum number of voters. Very recent or obscure titles may not appear. Adult-rated content (Rx) and hentai are excluded from recommendations.",
        },
        {
          q: "How does the seasonal calendar work?",
          a: "The calendar shows currently airing anime (TV, ONA, OAV) with their usual broadcast day. Data comes from MyAnimeList and is updated automatically each week.",
        },
        {
          q: "Are my votes public?",
          a: "No. Your votes and preferences remain private by default. Only the aggregated community score is visible, anonymously.",
        },
        {
          q: "Can I correct an anime listing?",
          a: "Data comes from MyAnimeList. To fix a title, synopsis, or genres, the change must be made directly on MAL. AniMood syncs data regularly.",
        },
        {
          q: "Is AniMood free?",
          a: "Yes, entirely. No subscriptions, no ads, no in-app purchases. It's a free passion project.",
        },
      ],
    },

    // ── Moods Guide ───────────────────────────────────────────────────────────
    categories: {
      title: "Moods Guide",
      intro: "Each Mood corresponds to a craving or state of mind. AniMood uses this to recommend anime that fit your moment. You can select multiple moods at once.",
      descriptions: {
        hype:       "Epic fights, adrenaline, power-ups",
        happy:      "Warmth, good vibes, guaranteed smiles",
        emotional:  "Deep emotions, tears or intense joy",
        dark:       "Dark atmospheres, drama, tragedy",
        chill:      "Soothing, contemplative, great for winding down",
        twisted:    "Psychological, twists, gripping suspense",
        in_love:    "Romance, love stories, great chemistry",
        thrills:    "Narrative tension, dread, edge-of-your-seat",
      },
    },

    // ── Report an Issue ───────────────────────────────────────────────────────
    moderation: {
      title: "Report an Issue",
      sections: [
        {
          h: "Found a problem?",
          p: "Please let us know! Every report helps improve AniMood. Whether it's a bug, a data error, a display issue, or inappropriate content — we want to hear about it.",
        },
        {
          h: "🐛 Bug or technical issue",
          p: "Email bugs@animood.app with: a description of the problem, steps to reproduce it, your browser and OS, and a screenshot if possible.",
        },
        {
          h: "📊 Incorrect data",
          p: "Wrong score, bad synopsis, missing or wrong image → bugs@animood.app — specify the anime title and what needs to be corrected.",
        },
        {
          h: "⚖️ Copyright & content",
          p: "To report protected content or an intellectual property concern: legal@animood.app — specify the anime, content type, and your contact details.",
        },
        {
          h: "💡 Suggestions",
          p: "Have an idea to improve AniMood? Write to contact@animood.app or via GitHub. All feedback is read and considered.",
        },
        {
          h: "Processing time",
          p: "Critical bugs are handled with priority. For other reports, allow 5–10 business days. AniMood is an independent project — thank you for your patience and contribution!",
        },
      ],
    },
  },
};
