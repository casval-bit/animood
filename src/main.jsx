import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AniMoodApp from "./App.jsx";

// ─── Register Service Worker (PWA) ────────────────────────────────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // Silently fail — SW is a progressive enhancement
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AniMoodApp />
  </React.StrictMode>
);
