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

/**
 * Détecte si on est sur un grand écran (PC/tablette paysage) via le web,
 * pour afficher la version adaptée sans être dans Electron (isDesktopApp).
 * Utile pour le responsive : les composants web peuvent s'adapter à la
 * largeur de l'écran comme le ferait la version desktop.
 */
export function isWebDesktop() {
  if (typeof window === "undefined") return false;
  if (isDesktopApp()) return false; // déjà en mode desktop Electron
  return window.matchMedia?.("(min-width: 1024px) and (hover: hover)").matches;
}
