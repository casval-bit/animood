// ─── Appli de bureau : fenêtre sans cadre (Electron, Windows / Linux) ─────────────────────────────────────────────────
// L'en-tête (84 px) et la bande du haut sont des zones « déplacer la fenêtre » (-webkit-app-region: drag). Chromium les garde actives
// même sous une fenêtre ouverte : l'ordre d'empilement (z-index) et le recouvrement ne comptent pas, seul compte l'ordre dans le document.
// Un bouton placé dans les 84 px du haut d'une fenêtre (le « ← » des Paramètres, « Retour » des pages du pied de page, la croix d'une fiche haute)
// recevait donc le clic comme un début de déplacement de la fenêtre : la page ne le voyait jamais.
//
//   overlayProps()  → à étaler sur la racine d'une fenêtre qui recouvre l'en-tête : plus de zone de déplacement sous elle
//   titleBarProps() → à étaler sur la barre de titre d'une page plein écran : elle reste déplaçable, sauf ses boutons
//
// Les règles sont dans index.css (html[data-app="desktop"] [data-overlay] / [data-titlebar]).
// Sur le site web et l'APK, les deux fonctions renvoient un objet vide : le DOM ne change pas.
// tests/desktopWindow.test.mjs vérifie que chaque calque plein écran posé au-dessus de l'en-tête est bien marqué.
import { isDesktopApp } from "./streamingLinks.js";

const OVERLAY = { "data-overlay": "" };
const TITLEBAR = { "data-titlebar": "" };
const NONE = {};

export const overlayProps = () => (isDesktopApp() ? OVERLAY : NONE);
export const titleBarProps = () => (isDesktopApp() ? TITLEBAR : NONE);
