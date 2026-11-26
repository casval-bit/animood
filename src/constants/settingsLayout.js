// ─── Onglets des Paramètres ──────────────────────────────────────────────────────────────────────────────────────
// Mêmes onglets, dans le même ordre, sur le site web, l'APK et l'appli de bureau (avant : le bureau en avait 7 rangés d'une façon, le site 5
// d'une autre, avec « Notifications » en dernier). Seuls Sons et Streaming n'existent que sur le bureau.
//
//   Préférences   : thème, couleurs, langue            (ce qu'on règle une fois pour toutes)
//   Profil        : avatar, pseudo, cadre, bannière, badge   (ce que les autres voient de toi)
//   Confidentialité : qui voit ton profil, membres bloqués
//   Notifications : ce qui te prévient (cloche)
//   Sons          : effets sonores               (bureau)
//   Streaming     : plateformes, région, VPN      (bureau)
//   Données       : imports AniList / MyAnimeList
//   Compte        : déconnexion, suppression du compte (toujours en dernier)
//
// `label` = clé de texte dans SETTINGS_I18N (settingsI18n.js).
export const SETTINGS_CATEGORIES = [
  { id: "preferences",   label: "catPreferences" },
  { id: "profile",       label: "catProfile" },
  { id: "privacy",       label: "catPrivacy" },
  { id: "notifications", label: "catNotifications" },
  { id: "sound",         label: "catSound",     desktopOnly: true },
  { id: "streaming",     label: "catStreaming", desktopOnly: true },
  { id: "data",          label: "catData" },
  { id: "account",       label: "catAccount" },
];

export const DEFAULT_SETTINGS_CATEGORY = "preferences";

/** Onglets disponibles : tous sur le bureau, sans Sons ni Streaming ailleurs. */
export const settingsCategories = (desktop) => SETTINGS_CATEGORIES.filter(c => desktop || !c.desktopOnly);

/** Onglet à ouvrir : celui demandé s'il existe sur cette plateforme (ex. « profile » depuis le crayon du profil), sinon le premier. */
export const normalizeSettingsCategory = (id, desktop) =>
  settingsCategories(desktop).some(c => c.id === id) ? id : DEFAULT_SETTINGS_CATEGORY;
