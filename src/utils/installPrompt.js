// Invite « Installer l'appli » de Chrome (Android / ordinateur) : capturée dès le
// chargement, avant React, pour qu'un bouton puisse l'ouvrir en un seul appui.
// La page /?installer (cible du QR code) s'en sert : pas d'APK, pas de « sources inconnues ».
let deferred = null;
let installed = false;
const subs = new Set();
const notify = () => subs.forEach(fn => fn());

export const isInstallerPage = () => new URLSearchParams(window.location.search).has("installer");

export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    if (isInstallerPage()) e.preventDefault(); // notre gros bouton remplace la bannière de Chrome
    deferred = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function onInstallChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export const canPromptInstall = () => !!deferred;
export const wasInstalled = () => installed;

// Ouvre la fenêtre d'installation de Chrome → "accepted" | "dismissed" | "unavailable"
export async function promptInstall() {
  if (!deferred) return "unavailable";
  const e = deferred;
  deferred = null; // une invite ne sert qu'une fois
  notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome;
}
