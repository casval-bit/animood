import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AniMoodApp from "./App.jsx";
import { isDesktopApp } from "./utils/streamingLinks.js";
import { captureInstallPrompt } from "./utils/installPrompt.js";
import { DesktopWindowControls } from "./components/DesktopWindowControls.jsx";

// Avant le rendu : Chrome peut proposer l'installation dès le chargement de la page
captureInstallPrompt();

// ─── Appli de bureau uniquement : police Inter + variables propres au desktop ─
// (le site web n'est pas concerné : rien n'est posé ni chargé hors Electron)
if (isDesktopApp()) {
  document.documentElement.dataset.app = "desktop";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap";
  document.head.appendChild(link);
}

// ─── Écran tactile (site mobile + APK) : l'appui long sur une image n'ouvre pas
// le menu « Télécharger l'image » du navigateur. Les onContextMenu de React
// (ex. « En boucle » du profil) continuent de se déclencher.
if (window.matchMedia?.("(hover: none)").matches) {
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest?.("img")) e.preventDefault();
  });
}

// ─── Register Service Worker (PWA) ────────────────────────────────────────
// Prod only — in dev its cache-first rule would pin stale Vite modules
// (index.html unregisters any leftover one).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // Silently fail — SW is a progressive enhancement
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AniMoodApp />
    <DesktopWindowControls />
  </React.StrictMode>
);
