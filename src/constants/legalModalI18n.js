// ─── ANIMOOD — Legal Pages i18n ───────────────────────────────────────────────
// Contenu des pages : Mentions légales, Politique de confidentialité
// Importé par LegalModal.jsx

const YEAR = new Date().getFullYear();
const DATE_FR = new Date().toLocaleDateString("fr-FR", { year:"numeric", month:"long", day:"numeric" });
const DATE_EN = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });

export const LEGAL_MODAL_I18N = {
  // ────────────────────────────────────────────────────────────────────────────
  fr: {
    placeholderNotice: `Dernière mise à jour : ${DATE_FR}`,

    // ── Mentions légales ──────────────────────────────────────────────────────
    legalTitle: "Mentions légales",
    legalSections: [
      {
        h: "Éditeur",
        p: `AniMood est un projet personnel indépendant. Contact éditeur : contact@animood.app — Pour les questions relatives aux droits : legal@animood.app`,
      },
      {
        h: "Propriété intellectuelle",
        p: `© ${YEAR} AniMood — Tous droits réservés. Le code source, le design, les textes, les systèmes de notation et les fonctionnalités d'AniMood sont la propriété exclusive de leur auteur. Toute reproduction, distribution ou utilisation commerciale sans autorisation écrite préalable est interdite.`,
      },
      {
        h: "Données tierces & attributions",
        p: `AniMood utilise des données provenant de MyAnimeList (myanimelist.net) via l'API Jikan (jikan.moe) — titres, synopsis, scores, genres, images. MAL est une marque déposée ; AniMood n'y est pas affilié. AniMood utilise également certaines données d'AniList (anilist.co) à titre complémentaire. Les affiches et illustrations d'animés sont la propriété de leurs ayants droit (studios, éditeurs, distributeurs) et sont affichées dans le cadre du fair use.`,
      },
      {
        h: "Limitation de responsabilité",
        p: "AniMood s'efforce de fournir des informations exactes et à jour, mais ne peut garantir l'exactitude ou l'exhaustivité des données affichées, celles-ci dépendant de sources tierces. AniMood ne saurait être tenu responsable des erreurs ou omissions, ni des dommages directs ou indirects résultant de l'utilisation du service.",
      },
      {
        h: "Disponibilité du service",
        p: "AniMood est un projet personnel gratuit. L'accès au service peut être interrompu à tout moment sans préavis, notamment pour maintenance ou mise à jour. Aucune garantie de disponibilité n'est offerte.",
      },
      {
        h: "Droit applicable",
        p: "Les présentes mentions légales sont régies par le droit français. Tout litige relatif à l'utilisation d'AniMood sera soumis à la compétence exclusive des juridictions françaises.",
      },
      {
        h: "Contact",
        p: "Pour toute question relative aux mentions légales ou aux droits : legal@animood.app",
      },
    ],

    // ── Politique de confidentialité ──────────────────────────────────────────
    privacyTitle: "Politique de confidentialité",
    privacySections: [
      {
        h: "Introduction",
        p: "AniMood attache une grande importance à la protection de ta vie privée. Cette politique explique quelles données sont collectées, pourquoi, et comment elles sont utilisées. En utilisant AniMood, tu acceptes les pratiques décrites ici.",
      },
      {
        h: "Données collectées",
        p: "AniMood peut collecter : données de compte (e-mail, pseudonyme si tu crées un compte), données d'activité (animés consultés, moods sélectionnés, votes, listes), données techniques (navigateur, système, langue, fuseau horaire), préférences d'interface. AniMood ne collecte pas de nom complet, adresse postale, numéro de téléphone ni données de paiement.",
      },
      {
        h: "Utilisation des données",
        p: "Les données collectées servent uniquement à faire fonctionner le service et personnaliser ton expérience, calculer le score communautaire (votes agrégés et anonymisés), améliorer les recommandations et fonctionnalités, et assurer la sécurité du service. Tes données ne sont jamais vendues ni utilisées à des fins publicitaires.",
      },
      {
        h: "Hébergement & partage",
        p: "AniMood utilise Supabase (supabase.com) pour la base de données et l'authentification. Les données sont stockées sur des serveurs sécurisés dans l'Union Européenne. Aucune donnée personnelle n'est partagée avec des tiers à des fins commerciales.",
      },
      {
        h: "Cookies & stockage local",
        p: "AniMood peut utiliser le stockage local du navigateur (localStorage) pour mémoriser ta langue préférée, conserver tes préférences d'interface et maintenir ta session active. Aucun cookie de tracking ou publicitaire n'est utilisé.",
      },
      {
        h: "Conservation des données",
        p: "Les données de compte et d'activité sont conservées tant que ton compte est actif. En cas de suppression de compte, tes données personnelles sont effacées dans un délai de 30 jours. Les données agrégées et anonymisées (votes, scores communautaires) peuvent être conservées indéfiniment.",
      },
      {
        h: "Tes droits (RGPD)",
        p: "Conformément au RGPD, tu disposes des droits d'accès, de rectification, d'effacement, de portabilité et d'opposition concernant tes données personnelles. Pour exercer ces droits : privacy@animood.app",
      },
      {
        h: "Sécurité",
        p: "AniMood met en œuvre des mesures techniques appropriées pour protéger tes données contre tout accès non autorisé, perte ou divulgation. Aucun système n'est infaillible et aucune sécurité absolue ne peut être garantie.",
      },
      {
        h: "Mineurs",
        p: "AniMood n'est pas destiné aux enfants de moins de 13 ans. Nous ne collectons pas sciemment de données personnelles concernant des mineurs de moins de 13 ans. Si tu as connaissance d'un tel cas : legal@animood.app",
      },
      {
        h: "Modifications",
        p: "Cette politique peut être mise à jour à tout moment. Les modifications importantes seront signalées dans l'application. L'utilisation continue d'AniMood après modification vaut acceptation de la nouvelle politique.",
      },
      {
        h: "Contact",
        p: "Pour toute question relative à la confidentialité de tes données : privacy@animood.app",
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  en: {
    placeholderNotice: `Last updated: ${DATE_EN}`,

    // ── Legal Notice ──────────────────────────────────────────────────────────
    legalTitle: "Legal Notice",
    legalSections: [
      {
        h: "Publisher",
        p: "AniMood is an independent personal project. Publisher contact: contact@animood.app — Rights-related inquiries: legal@animood.app",
      },
      {
        h: "Intellectual property",
        p: `© ${YEAR} AniMood — All rights reserved. AniMood's source code, design, texts, scoring systems, and features are the exclusive property of their author. Any reproduction, distribution, or commercial use without prior written authorization is prohibited.`,
      },
      {
        h: "Third-party data & attributions",
        p: "AniMood uses data from MyAnimeList (myanimelist.net) via the Jikan API (jikan.moe) — titles, synopses, scores, genres, images. MAL is a registered trademark; AniMood is not affiliated with it. AniMood also uses supplementary data from AniList (anilist.co). Anime posters and illustrations are the property of their respective rights holders (studios, publishers, distributors) and are displayed within fair use guidelines.",
      },
      {
        h: "Limitation of liability",
        p: "AniMood strives to provide accurate and up-to-date information, but cannot guarantee the accuracy or completeness of the data displayed, as it relies on third-party sources. AniMood shall not be liable for any errors or omissions, or for direct or indirect damages resulting from use of the service.",
      },
      {
        h: "Service availability",
        p: "AniMood is a free personal project. Access to the service may be interrupted at any time without notice, including for maintenance or updates. No uptime guarantee is offered.",
      },
      {
        h: "Governing law",
        p: "This legal notice is governed by French law. Any dispute relating to the use of AniMood shall be subject to the exclusive jurisdiction of the French courts.",
      },
      {
        h: "Contact",
        p: "For questions about this legal notice or intellectual property: legal@animood.app",
      },
    ],

    // ── Privacy Policy ────────────────────────────────────────────────────────
    privacyTitle: "Privacy Policy",
    privacySections: [
      {
        h: "Introduction",
        p: "AniMood is committed to protecting your privacy. This policy explains what data is collected, why, and how it is used. By using AniMood, you agree to the practices described here.",
      },
      {
        h: "Data collected",
        p: "AniMood may collect: account data (email, username if you create an account), activity data (anime viewed, moods selected, votes cast, lists created), technical data (browser, OS, language, time zone), and interface preferences. AniMood does not collect full names, postal addresses, phone numbers, or payment data.",
      },
      {
        h: "Use of data",
        p: "Collected data is used solely to run the service and personalize your experience, calculate the community score (aggregated, anonymized votes), improve recommendations and features, and ensure service security. Your data is never sold or used for advertising purposes.",
      },
      {
        h: "Hosting & sharing",
        p: "AniMood uses Supabase (supabase.com) for database and authentication. Data is stored on secure servers within the European Union. No personal data is shared with third parties for commercial purposes.",
      },
      {
        h: "Cookies & local storage",
        p: "AniMood may use browser local storage (localStorage) to remember your preferred language, save interface preferences, and keep your session active. No tracking or advertising cookies are used.",
      },
      {
        h: "Data retention",
        p: "Account and activity data is retained for as long as your account is active. If you delete your account, your personal data is erased within 30 days. Aggregated and anonymized data (votes, community scores) may be retained indefinitely.",
      },
      {
        h: "Your rights (GDPR)",
        p: "Under the GDPR, you have the rights of access, rectification, erasure, portability, and objection regarding your personal data. To exercise these rights: privacy@animood.app",
      },
      {
        h: "Security",
        p: "AniMood implements appropriate technical measures to protect your data against unauthorized access, loss, or disclosure. No system is infallible and no absolute security can be guaranteed.",
      },
      {
        h: "Minors",
        p: "AniMood is not intended for children under 13. We do not knowingly collect personal data from children under 13. If you become aware of such a case: legal@animood.app",
      },
      {
        h: "Changes",
        p: "This policy may be updated at any time. Significant changes will be announced within the app. Continued use of AniMood after changes constitutes acceptance of the updated policy.",
      },
      {
        h: "Contact",
        p: "For any questions about your data privacy: privacy@animood.app",
      },
    ],
  },
};
