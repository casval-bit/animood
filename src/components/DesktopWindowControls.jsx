// ─── Appli de bureau : boutons de fenêtre intégrés à l'appli (Windows / Linux) ──────────────────────────
// L'appli installée n'a plus de cadre ni de menu natifs : on dessine ici réduire / agrandir / fermer,
// dans les couleurs de l'appli, et on ajoute une bande de déplacement (utile quand l'en-tête n'est pas affiché, ex. connexion).
// N'apparaît que si le shell Electron est « sans cadre » (window.animood.customFrame) : le site web et les anciens shells ne sont pas touchés.
import { useEffect, useState } from "react";

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };

function WinBtn({ label, onClick, danger, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        WebkitAppRegion: "no-drag", width: 42, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
        border: 0, cursor: "default", transition: "background .12s, color .12s",
        color: hov ? "#fff" : "rgba(196,181,253,0.75)",
        background: hov ? (danger ? "rgba(239,68,68,0.9)" : "rgba(139,92,246,0.28)") : "transparent",
      }}>
      {children}
    </button>
  );
}

export function DesktopWindowControls() {
  const api = typeof window !== "undefined" ? window.animood : null;
  const enabled = !!(api?.isDesktop && api.customFrame && api.platform !== "darwin");
  const [maxed, setMaxed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api.isMaximized?.().then(v => { if (alive) setMaxed(!!v); }).catch(() => {});
    const off = api.onWindowState?.(v => setMaxed(!!v));
    return () => { alive = false; off?.(); };
  }, [enabled, api]);

  if (!enabled) return null;
  return (
    <>
      {/* Bande de déplacement (sous l'en-tête, qui est lui-même déplaçable) */}
      <div aria-hidden="true" style={{ position: "fixed", top: 0, left: 0, right: 0, height: 30, zIndex: 150, WebkitAppRegion: "drag" }} />
      <div style={{
        position: "fixed", top: 0, right: 0, zIndex: 100000, display: "flex", overflow: "hidden",
        borderBottomLeftRadius: 12, background: "rgba(8,6,22,0.62)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(139,92,246,0.16)", borderTop: 0, borderRight: 0, WebkitAppRegion: "no-drag",
      }}>
        <WinBtn label="Réduire" onClick={() => api.minimize()}>
          <svg width="12" height="12" viewBox="0 0 12 12" {...ICON}><path d="M2 6.5h8" /></svg>
        </WinBtn>
        <WinBtn label={maxed ? "Restaurer" : "Agrandir"} onClick={() => api.maximize()}>
          {maxed
            ? <svg width="12" height="12" viewBox="0 0 12 12" {...ICON}><rect x="2" y="3.6" width="6.4" height="6.4" rx="1" /><path d="M4 3.6V2.6a.8.8 0 0 1 .8-.8H9.4a.8.8 0 0 1 .8.8V7.2a.8.8 0 0 1-.8.8H8.4" /></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" {...ICON}><rect x="2" y="2" width="8" height="8" rx="1.2" /></svg>}
        </WinBtn>
        <WinBtn label="Fermer" danger onClick={() => api.close()}>
          <svg width="12" height="12" viewBox="0 0 12 12" {...ICON}><path d="M2.4 2.4l7.2 7.2M9.6 2.4L2.4 9.6" /></svg>
        </WinBtn>
      </div>
    </>
  );
}
