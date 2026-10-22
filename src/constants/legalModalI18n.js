// ─── ANIMOOD — Legal Pages i18n ───────────────────────────────────────────────
// Contenu des pages : Mentions légales, Politique de confidentialité
// Importé par LegalModal.jsx. Coordonnées et date : src/constants/siteInfo.js
// Révision du 22 octobre 2026 : relue d'après ce que fait réellement l'appli (connexion Google, Supabase, Cloudinary, Vercel…).

import { SITE_INFO } from "./siteInfo.js";

const YEAR = new Date().getFullYear();
const { contactEmail: CONTACT, legalEmail: LEGAL, privacyEmail: PRIVACY, lastUpdated } = SITE_INFO;

export const LEGAL_MODAL_I18N = {
  // ────────────────────────────────────────────────────────────────────────────
  fr: {
    placeholderNotice: `Dernière mise à jour : ${lastUpdated.fr}`,

    // ── Mentions légales ──────────────────────────────────────────────────────
    legalTitle: "Mentions légales",
    legalSections: [
      {
        h: "Éditeur",
        p: `AniMood est un site et une application gratuits, édités à titre non professionnel par une personne physique. Conformément à l'article 6, III, 2° de la loi n° 2004-575 du 21 juin 2004 (LCEN), l'identité de l'éditeur est communiquée à l'hébergeur et peut être transmise à l'autorité judiciaire sur demande. Contact : ${CONTACT}`,
      },
      {
        h: "Hébergement",
        p: "Site web : Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis (vercel.com). Base de données et authentification : Supabase (supabase.com). Images envoyées par les utilisateurs : Cloudinary (cloudinary.com). Fichier d'installation Android (APK) : servi par le site ; applications de bureau : versions publiées sur GitHub (github.com/casval-bit/animood).",
      },
      {
        h: "Propriété intellectuelle",
        p: `© ${YEAR} AniMood. Le design, les textes, les systèmes de notation et les fonctionnalités d'AniMood sont la propriété de leur auteur. Le code source est consultable publiquement sur GitHub ; sauf mention contraire dans le dépôt, tous droits sont réservés. Toute reproduction ou utilisation commerciale sans autorisation écrite préalable est interdite.`,
      },
      {
        h: "Sources de données & attributions",
        p: "Les informations sur les animés (titres, synopsis, scores, genres, images) proviennent de MyAnimeList (myanimelist.net) via l'API Jikan (jikan.moe), et de façon complémentaire d'AniList (anilist.co). Les musiques d'ouverture et de fin proviennent d'AnimeThemes (animethemes.moe). Les disponibilités par pays sont fournies par JustWatch via TMDB : This product uses the TMDB API but is not endorsed or certified by TMDB. Les jours de diffusion et les épisodes sortis s'appuient aussi sur le flux RSS public de LiveChart (livechart.me). Les bandes-annonces sont lues depuis YouTube et soumises à ses conditions d'utilisation. MyAnimeList, AniList, TMDB, JustWatch, LiveChart, YouTube et les noms des plateformes de streaming sont des marques de leurs propriétaires respectifs ; AniMood n'est affilié à aucun d'eux et n'a aucun partenariat avec eux.",
      },
      {
        h: "Images et droits des ayants droit",
        p: `Les affiches et illustrations d'animés appartiennent à leurs ayants droit (studios, éditeurs, distributeurs). AniMood les affiche uniquement pour identifier les œuvres. Si tu es ayant droit et souhaites le retrait d'un visuel ou d'un texte, écris à ${LEGAL} en précisant l'œuvre concernée : il sera retiré dans les meilleurs délais.`,
      },
      {
        h: "Contenus publiés par les utilisateurs",
        p: `Les utilisateurs sont seuls responsables de ce qu'ils publient (forum, publications, messages, photo et description de profil). Pour signaler un contenu illicite ou contraire aux règles, utilise la page « Signaler un problème » ou écris à ${LEGAL} en indiquant le contenu concerné et le motif. Les contenus manifestement illicites sont retirés promptement.`,
      },
      {
        h: "Liens et plateformes de streaming",
        p: "AniMood affiche des liens vers des plateformes de streaming officielles, sans partenariat ni rémunération. Lorsqu'un animé n'est proposé que dans d'autres pays, une indication peut renvoyer vers des sites de VPN (liens officiels, sans partenariat ni commission) : il appartient à l'utilisateur de vérifier les conditions d'utilisation de la plateforme avant d'y recourir. AniMood n'héberge, ne diffuse et n'indexe aucun fichier vidéo protégé. Dans l'application de bureau (hors Microsoft Store), l'utilisateur peut ajouter lui-même l'adresse de sites de son choix : AniMood ne fournit aucune liste de sites et se contente d'ouvrir l'adresse saisie ; l'utilisateur est seul responsable des sites qu'il ajoute et du respect de leurs conditions et de la loi de son pays.",
      },
      {
        h: "Limitation de responsabilité",
        p: "AniMood s'efforce de fournir des informations exactes et à jour, mais ne peut garantir l'exactitude ou l'exhaustivité des données affichées, celles-ci dépendant de sources tierces. AniMood ne saurait être tenu responsable des erreurs ou omissions, ni des dommages directs ou indirects résultant de l'utilisation du service, ni du contenu des sites vers lesquels il renvoie.",
      },
      {
        h: "Disponibilité du service",
        p: "AniMood est un projet personnel gratuit. L'accès au service peut être interrompu à tout moment sans préavis, notamment pour maintenance ou mise à jour. Aucune garantie de disponibilité n'est offerte.",
      },
      {
        h: "Droit applicable",
        p: "Les présentes mentions légales sont régies par le droit français. En cas de litige, les juridictions françaises sont compétentes, sous réserve des droits impératifs dont bénéficient les consommateurs.",
      },
      {
        h: "Contact",
        p: `Questions générales : ${CONTACT} — droits d'auteur et contenus : ${LEGAL} — données personnelles : ${PRIVACY}`,
      },
    ],

    // ── Politique de confidentialité ──────────────────────────────────────────
    privacyTitle: "Politique de confidentialité",
    privacySections: [
      {
        h: "Qui est responsable de tes données ?",
        p: `L'éditeur d'AniMood (voir les mentions légales) est responsable du traitement de tes données personnelles. Pour toute question : ${PRIVACY}`,
      },
      {
        h: "Données collectées",
        p: "Compte : tu te connectes avec Google ; AniMood reçoit l'adresse e-mail, le nom et la photo de ton compte Google (jamais ton mot de passe). Profil : pseudo, description, avatar, cadres, animés favoris. Activité : listes et statuts d'animés, notes, humeurs, votes, scores et classements des mini-jeux, abonnements. Contenus : publications, discussions du forum, messages privés, images que tu envoies. Appareil : langue, fuseau horaire et préférences, enregistrés sur ton appareil. AniMood ne collecte ni numéro de téléphone, ni adresse postale, ni moyen de paiement.",
      },
      {
        h: "Pourquoi et sur quelle base",
        p: "Faire fonctionner le service que tu utilises : compte, profil, forum, messages, listes, jeux (exécution du service). Assurer la sécurité, prévenir les abus et calculer le score communautaire à partir de votes agrégés (intérêt légitime). Afficher des notifications du navigateur si tu les actives (ton consentement). Tes données ne sont jamais vendues ni utilisées pour de la publicité ou du profilage commercial.",
      },
      {
        h: "Qui reçoit tes données",
        p: "Prestataires qui font tourner AniMood : Supabase (base de données et connexion), Vercel (hébergement du site), Cloudinary (images envoyées), Google (connexion avec ton compte Google). Services appelés directement par ton navigateur, qui voient ton adresse IP : Jikan, AniList, AnimeThemes (données d'animés), YouTube (bandes-annonces, lecteur en mode renforcé de confidentialité), Google Fonts (police Inter), placehold.co (images de remplacement), GitHub (page de téléchargement et mises à jour de l'application de bureau). Aucun outil publicitaire ni de mesure d'audience n'est utilisé.",
      },
      {
        h: "Transferts hors de l'Union européenne",
        p: "Certains prestataires (Vercel, Google, Cloudinary, Supabase) peuvent traiter des données aux États-Unis ou ailleurs. Ces transferts sont encadrés par les mécanismes prévus par le RGPD (clauses contractuelles types ou cadre de protection des données UE–États-Unis).",
      },
      {
        h: "Cookies & stockage local",
        p: "AniMood n'utilise aucun cookie publicitaire ni traceur. Il enregistre sur ton appareil (stockage local du navigateur et cache de l'application) uniquement ce qui est nécessaire : ta session de connexion, ta langue, ton pays choisi pour les disponibilités de streaming (aucune géolocalisation), tes préférences d'affichage et le fonctionnement hors connexion. Ce stockage strictement nécessaire ne demande pas de consentement ; tu peux l'effacer à tout moment depuis les réglages de ton navigateur (tu seras alors déconnecté).",
      },
      {
        h: "Applis de bureau et mobile",
        p: "Les applications (Windows, macOS, Linux, Android) affichent le site AniMood : tout ce qui précède s'applique à l'identique. L'application de bureau vérifie les mises à jour sur GitHub, qui voit alors ton adresse IP. Les plateformes de streaming que tu ajoutes et les liens mémorisés restent sur ton ordinateur ; rien n'est envoyé à AniMood. Pour retrouver la page d'un animé, l'application contacte depuis ton ordinateur les sites que tu as ajoutés et le moteur de recherche DuckDuckGo. Sur iPhone, l'« application » est le site ajouté à l'écran d'accueil.",
      },
      {
        h: "Durées de conservation",
        p: `Ton compte et tes contenus sont conservés tant que ton compte existe. Pour supprimer ton compte, écris à ${PRIVACY} depuis l'adresse de ton compte (le bouton de suppression dans les réglages n'est pas encore actif) : tes données personnelles et messages sont effacés dans un délai de 30 jours. Les données agrégées et anonymisées (votes, scores communautaires) peuvent être conservées. Les journaux techniques sont conservés par les hébergeurs selon leurs propres règles.`,
      },
      {
        h: "Tes droits (RGPD)",
        p: `Tu disposes des droits d'accès, de rectification, d'effacement, de portabilité, de limitation et d'opposition. Pour les exercer : ${PRIVACY} — réponse sous un mois. Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (cnil.fr).`,
      },
      {
        h: "Sécurité",
        p: "Les échanges avec le site sont chiffrés (HTTPS) et l'accès à la base de données est contrôlé. Aucun système n'est infaillible : aucune sécurité absolue ne peut être garantie. En cas de violation de données présentant un risque pour toi, tu seras informé conformément à la loi.",
      },
      {
        h: "Âge minimum",
        p: `AniMood s'adresse aux personnes de 15 ans et plus (âge du consentement numérique en France). En dessous, l'accord d'un parent est nécessaire. Si tu penses qu'un enfant de moins de 15 ans a créé un compte sans cet accord, écris à ${PRIVACY}.`,
      },
      {
        h: "Modifications",
        p: "Cette politique peut évoluer. La date de dernière mise à jour est indiquée en haut de la page et les changements importants sont signalés dans l'application.",
      },
      {
        h: "Contact",
        p: `Pour toute question relative à tes données personnelles : ${PRIVACY}`,
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  en: {
    placeholderNotice: `Last updated: ${lastUpdated.en}`,

    // ── Legal Notice ──────────────────────────────────────────────────────────
    legalTitle: "Legal Notice",
    legalSections: [
      {
        h: "Publisher",
        p: `AniMood is a free website and app published on a non-professional basis by a private individual. In accordance with article 6, III, 2 of French law no. 2004-575 of 21 June 2004 (LCEN), the publisher's identity has been provided to the hosting provider and can be disclosed to the judicial authorities on request. Contact: ${CONTACT}`,
      },
      {
        h: "Hosting",
        p: "Website: Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA (vercel.com). Database and authentication: Supabase (supabase.com). User-uploaded images: Cloudinary (cloudinary.com). Android installation file (APK): served by the website; desktop apps: releases published on GitHub (github.com/casval-bit/animood).",
      },
      {
        h: "Intellectual property",
        p: `© ${YEAR} AniMood. AniMood's design, texts, scoring systems and features are the property of their author. The source code is publicly viewable on GitHub; unless stated otherwise in the repository, all rights are reserved. Any reproduction or commercial use without prior written authorization is prohibited.`,
      },
      {
        h: "Data sources & attributions",
        p: "Anime information (titles, synopses, scores, genres, images) comes from MyAnimeList (myanimelist.net) via the Jikan API (jikan.moe), and additionally from AniList (anilist.co). Opening and ending themes come from AnimeThemes (animethemes.moe). Availability by country is provided by JustWatch through TMDB: This product uses the TMDB API but is not endorsed or certified by TMDB. Broadcast days and released episodes also rely on LiveChart's public RSS feed (livechart.me). Trailers are played from YouTube and subject to its terms of service. MyAnimeList, AniList, TMDB, JustWatch, LiveChart, YouTube and the names of streaming platforms are trademarks of their respective owners; AniMood is not affiliated with, or partnered with, any of them.",
      },
      {
        h: "Images and rights holders",
        p: `Anime posters and artwork belong to their rights holders (studios, publishers, distributors). AniMood displays them solely to identify the works. If you are a rights holder and want a visual or text removed, email ${LEGAL} naming the work concerned: it will be removed as soon as possible.`,
      },
      {
        h: "User-generated content",
        p: `Users are solely responsible for what they post (forum, posts, messages, profile photo and bio). To report unlawful or rule-breaking content, use the "Report an Issue" page or email ${LEGAL} with the content concerned and the reason. Manifestly unlawful content is removed promptly.`,
      },
      {
        h: "Links and streaming platforms",
        p: "AniMood shows links to official streaming platforms, with no partnership or payment. When an anime is only offered in other countries, a hint may link to VPN websites (official links, no partnership or commission): it is up to the user to check the platform's terms of use before relying on one. AniMood does not host, stream or index any protected video file. In the desktop app (outside the Microsoft Store), users can add the address of sites of their own choice: AniMood provides no list of sites and only opens the address typed in; users are solely responsible for the sites they add and for complying with their terms and local law.",
      },
      {
        h: "Limitation of liability",
        p: "AniMood strives to provide accurate and up-to-date information, but cannot guarantee the accuracy or completeness of the data displayed, as it relies on third-party sources. AniMood shall not be liable for any errors or omissions, for direct or indirect damages resulting from use of the service, or for the content of the sites it links to.",
      },
      {
        h: "Service availability",
        p: "AniMood is a free personal project. Access to the service may be interrupted at any time without notice, including for maintenance or updates. No uptime guarantee is offered.",
      },
      {
        h: "Governing law",
        p: "This legal notice is governed by French law. In case of dispute, the French courts have jurisdiction, subject to the mandatory rights of consumers.",
      },
      {
        h: "Contact",
        p: `General questions: ${CONTACT} — copyright and content: ${LEGAL} — personal data: ${PRIVACY}`,
      },
    ],

    // ── Privacy Policy ────────────────────────────────────────────────────────
    privacyTitle: "Privacy Policy",
    privacySections: [
      {
        h: "Who is responsible for your data?",
        p: `AniMood's publisher (see the legal notice) is the controller of your personal data. For any question: ${PRIVACY}`,
      },
      {
        h: "Data collected",
        p: "Account: you sign in with Google; AniMood receives the email address, name and photo of your Google account (never your password). Profile: username, bio, avatar, frames, favorite anime. Activity: anime lists and statuses, ratings, moods, votes, mini-game scores and rankings, follows. Content: posts, forum discussions, private messages, images you upload. Device: language, time zone and preferences, saved on your device. AniMood does not collect phone numbers, postal addresses or payment details.",
      },
      {
        h: "Why and on what basis",
        p: "To run the service you use: account, profile, forum, messages, lists, games (performance of the service). To keep the service secure, prevent abuse and compute the community score from aggregated votes (legitimate interest). To show browser notifications if you turn them on (your consent). Your data is never sold or used for advertising or commercial profiling.",
      },
      {
        h: "Who receives your data",
        p: "Providers that run AniMood: Supabase (database and sign-in), Vercel (website hosting), Cloudinary (uploaded images), Google (sign-in with your Google account). Services called directly by your browser, which can see your IP address: Jikan, AniList, AnimeThemes (anime data), YouTube (trailers, privacy-enhanced player), Google Fonts (Inter typeface), placehold.co (placeholder images), GitHub (download page and desktop app updates). No advertising or analytics tools are used.",
      },
      {
        h: "Transfers outside the European Union",
        p: "Some providers (Vercel, Google, Cloudinary, Supabase) may process data in the United States or elsewhere. These transfers rely on the mechanisms provided by the GDPR (standard contractual clauses or the EU–US data privacy framework).",
      },
      {
        h: "Cookies & local storage",
        p: "AniMood uses no advertising cookies or trackers. It stores on your device (browser local storage and the app cache) only what is necessary: your sign-in session, your language, the country you picked for streaming availability (no geolocation), your display preferences and offline operation. This strictly necessary storage does not require consent; you can clear it at any time in your browser settings (you will then be signed out).",
      },
      {
        h: "Desktop and mobile apps",
        p: "The apps (Windows, macOS, Linux, Android) display the AniMood website: everything above applies identically. The desktop app checks for updates on GitHub, which then sees your IP address. The streaming platforms you add and the links it remembers stay on your computer; nothing is sent to AniMood. To find an anime's page, the app contacts, from your computer, the sites you added and the DuckDuckGo search engine. On iPhone, the \"app\" is the website added to your home screen.",
      },
      {
        h: "Data retention",
        p: `Your account and content are kept as long as your account exists. To delete your account, email ${PRIVACY} from your account address (the delete button in settings is not active yet): your personal data and messages are erased within 30 days. Aggregated and anonymized data (votes, community scores) may be kept. Technical logs are kept by the hosting providers under their own rules.`,
      },
      {
        h: "Your rights (GDPR)",
        p: `You have the rights of access, rectification, erasure, portability, restriction and objection. To exercise them: ${PRIVACY} — we reply within one month. If you believe your rights are not being respected, you can lodge a complaint with the CNIL (cnil.fr) or your local data protection authority.`,
      },
      {
        h: "Security",
        p: "Communication with the site is encrypted (HTTPS) and access to the database is controlled. No system is infallible: no absolute security can be guaranteed. If a data breach presents a risk to you, you will be informed as required by law.",
      },
      {
        h: "Minimum age",
        p: `AniMood is intended for people aged 15 and over (the age of digital consent in France). Below that age, a parent's permission is required. If you think a child under 15 has created an account without it, email ${PRIVACY}.`,
      },
      {
        h: "Changes",
        p: "This policy may change. The date of the last update is shown at the top of the page and significant changes are announced within the app.",
      },
      {
        h: "Contact",
        p: `For any question about your personal data: ${PRIVACY}`,
      },
    ],
  },
};
