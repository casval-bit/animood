export const SETTINGS_I18N = {
  fr: {
    title: "Paramètres",

    catPreferences: "Préférences",
    catProfile: "Profil",
    catData: "Données",
    catAccount: "Compte",

    appearance: "🎨 Apparence",
    themeDark: "Sombre",
    themeDarkDesc: "Thème par défaut",
    themeLight: "Clair",
    themeLightDesc: "Style réseau social",

    language: "🌐 Langue",

    avatar: "🖼 Avatar",
    avatarUpload: "📁 Uploader une image",
    avatarUploading: "Traitement…",
    avatarHint: "JPG, PNG ou WebP · max 2 Mo",
    avatarRemove: "Supprimer l'avatar personnalisé",
    avatarGoogle: "Avatar Google actif — uploade une image pour le remplacer",

    username: "👤 Nom d'utilisateur",
    usernameDesc: "Le nom affiché sur ton profil, dans le forum et les mentions.",
    usernamePlaceholder: "Ton nom d'utilisateur…",
    usernameSaveBtn: "Enregistrer",
    usernameSaved: "✅ Nom mis à jour",

    frame: "🎖 Cadre de profil",
    framesLoading: "Chargement des cadres…",
    frameNone: "Aucun cadre",
    frameNoneDesc: "Avatar sans cadre",
    frameCatWatched: "📺 Animés vus",
    frameCatContribution: "🗳️ Contribution",
    frameCatFollowers: "👥 Followers",
    frameCatGenre: "🎌 Genre",
    frameCatGames: "🎮 Jeux",
    frameLocked: (label) => `🔒 ${label} — non débloqué`,

    importAnilist: "📥 Importer depuis AniList",
    importAnilistDesc: "Entre ton pseudo AniList — ta liste doit être publique. Les notes seront synchronisées pour le système de notes AniMood. Tu peux relancer l'import à tout moment (même pseudo) pour resynchroniser ta liste après l'avoir mise à jour sur AniList.",
    importAnilistLabel: "Pseudo AniList",
    importAnilistPlaceholder: "ex : Josh",
    importBtn: "Importer",
    importBtnReimport: "🔄 Réimporter",
    importAnilistSuccess: (s) => `✅ ${s.watched} animés · ${s.rated} notes synchronisées${s.skipped > 0 ? ` · ${s.skipped} ignorés` : ""}`,

    importXml: "📥 Importer un fichier XML (MyAnimeList)",
    importXmlDesc: "Exporte ta liste MAL au format XML depuis ton profil et importe-la ici.",
    importXmlBtn: "📂 Choisir un fichier XML",
    importXmlBtnLoading: "Import en cours…",
    importXmlSuccess: (s) => `✅ ${s.watched} animés · ${s.rated} notes`,

    logoutTitle: "🚪 Déconnexion",
    logoutBtn: "Se déconnecter",

    deleteAccountTitle: "⚠️ Supprimer le compte",
    deleteAccountDesc: "Cette action supprimera définitivement ton compte et toutes tes données. Irréversible.",
    deleteAccountBtn: "Supprimer mon compte",
    deleteAccountNotReady: "Fonctionnalité bientôt disponible.",
  },

  en: {
    title: "Settings",

    catPreferences: "Preferences",
    catProfile: "Profile",
    catData: "Data",
    catAccount: "Account",

    appearance: "🎨 Appearance",
    themeDark: "Dark",
    themeDarkDesc: "Default theme",
    themeLight: "Light",
    themeLightDesc: "Social network style",

    language: "🌐 Language",

    avatar: "🖼 Avatar",
    avatarUpload: "📁 Upload an image",
    avatarUploading: "Processing…",
    avatarHint: "JPG, PNG or WebP · max 2MB",
    avatarRemove: "Remove custom avatar",
    avatarGoogle: "Google avatar active — upload an image to replace it",

    username: "👤 Username",
    usernameDesc: "The name shown on your profile, in the forum and in mentions.",
    usernamePlaceholder: "Your username…",
    usernameSaveBtn: "Save",
    usernameSaved: "✅ Name updated",

    frame: "🎖 Profile frame",
    framesLoading: "Loading frames…",
    frameNone: "No frame",
    frameNoneDesc: "Avatar without a frame",
    frameCatWatched: "📺 Watched anime",
    frameCatContribution: "🗳️ Contribution",
    frameCatFollowers: "👥 Followers",
    frameCatGenre: "🎌 Genre",
    frameCatGames: "🎮 Games",
    frameLocked: (label) => `🔒 ${label} — not unlocked`,

    importAnilist: "📥 Import from AniList",
    importAnilistDesc: "Enter your AniList username — your list must be public. Ratings will be synced to AniMood's rating system. You can re-run the import anytime (same username) to resync your list after updating it on AniList.",
    importAnilistLabel: "AniList username",
    importAnilistPlaceholder: "e.g. Josh",
    importBtn: "Import",
    importBtnReimport: "🔄 Re-import",
    importAnilistSuccess: (s) => `✅ ${s.watched} anime · ${s.rated} ratings synced${s.skipped > 0 ? ` · ${s.skipped} skipped` : ""}`,

    importXml: "📥 Import an XML file (MyAnimeList)",
    importXmlDesc: "Export your MAL list as XML from your profile and import it here.",
    importXmlBtn: "📂 Choose an XML file",
    importXmlBtnLoading: "Importing…",
    importXmlSuccess: (s) => `✅ ${s.watched} anime · ${s.rated} ratings`,

    logoutTitle: "🚪 Log out",
    logoutBtn: "Log out",

    deleteAccountTitle: "⚠️ Delete account",
    deleteAccountDesc: "This will permanently delete your account and all your data. Irreversible.",
    deleteAccountBtn: "Delete my account",
    deleteAccountNotReady: "Feature coming soon.",
  },
};
