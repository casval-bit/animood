import { isDesktopApp } from "./streamingLinks.js";

// Vrai quand AniMood tourne déjà comme appli installée : bureau (Electron),
// APK Android (TWA) ou PWA ajoutée à l'écran d'accueil. Sert à cacher « Télécharger l'appli ».
export function isInstalledApp() {
  if (isDesktopApp()) return true;
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || window.navigator.standalone === true               // iOS « Sur l'écran d'accueil »
    || document.referrer.startsWith("android-app://");    // APK Android (TWA)
}
