/**
 * DesktopUpdateBanner — shown only in the Electron desktop app.
 * Listens for auto-updater events from the main process and shows a banner
 * when a new version is ready to install.
 */

import { useState, useEffect } from "react";
import { isDesktopApp } from "../utils/streamingLinks.js";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

export function DesktopUpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);
  const [updateInfo, setUpdateInfo]   = useState(null);

  useEffect(() => {
    if (!isDesktopApp()) return;

    const offAvailable = window.animood.onUpdateAvailable((info) => {
      // Just available — downloading in background, no action yet
      console.info("[AniMood] Update available:", info?.version);
    });

    const offDownloaded = window.animood.onUpdateDownloaded((info) => {
      setUpdateInfo(info);
      setUpdateReady(true);
    });

    return () => {
      offAvailable?.();
      offDownloaded?.();
    };
  }, []);

  if (!isDesktopApp() || !updateReady) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex items-center gap-3 rounded-2xl border border-white/10 p-4 shadow-2xl backdrop-blur-xl"
      style={{ background: "var(--surface-1-strong)", minWidth: 280 }}
    >
      <span className="text-xl">🎉</span>
      <div className="flex-1">
        <div className="text-[13px] font-black text-slate-100">
          Mise à jour disponible !
        </div>
        <div className="text-[11px] text-slate-500">
          Version {updateInfo?.version} prête à installer.
        </div>
      </div>
      <button
        onClick={() => {
          // Tell Electron to quit-and-install
          window.animood.openExternal("animood://update-now").catch(() => {});
          // Fallback: reload the app (the updater installs on next launch)
        }}
        className="rounded-xl px-3 py-1.5 text-[11px] font-extrabold text-white transition hover:opacity-90"
        style={{ background: GRADIENT_PRIMARY }}
      >
        Redémarrer
      </button>
      <button
        onClick={() => setUpdateReady(false)}
        className="text-slate-500 hover:text-slate-300 transition text-lg leading-none"
        title="Plus tard"
      >
        ✕
      </button>
    </div>
  );
}
