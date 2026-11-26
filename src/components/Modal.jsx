import { useState, useEffect } from "react";
import { useModalBack } from "../hooks/useModalBack.js";
import { useSound } from "../context/SoundContext.jsx";
import { overlayProps } from "../utils/desktopWindow.js";

export function Modal({ onClose, children, maxWidth = "max-w-lg", bodyClassName = "" }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const { playSound } = useSound();
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  // Pushes a history entry on mount so the browser/device back button
  // closes this modal instead of navigating away from the page underneath.
  const requestClose = useModalBack(onClose);

  const close = () => {
    if(closing) return;
    playSound("back");
    setClosing(true);
    setVisible(false);
    requestClose();
  };

  return (
    <div
      {...overlayProps()}
      onClick={close}
      className={`fixed inset-0 z-300 flex items-center justify-center p-4 transition-all duration-200 ${visible ? "bg-black/75 backdrop-blur-sm" : "bg-black/0"}`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`max-h-[88vh] w-full ${maxWidth} overflow-y-auto rounded-[22px] border border-white/9 backdrop-blur-xl transition-all duration-200 ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"} ${bodyClassName}`}
        style={{ background: "var(--surface-1-strong)", boxShadow: "var(--shadow-modal)" }}
      >
        {typeof children === "function" ? children(close) : children}
      </div>
    </div>
  );
}

// ─── Game board modal — framed window with a title bar, used by the mini-games ─
// Same back-button behaviour as Modal. `fullHeight` pins the window to the
// viewport height so a game can manage its own internal scrolling (Tierlist).
// `canClose` (optionnel) : renvoie false pour refuser la fermeture (partie en cours → le jeu affiche sa propre fenêtre « Abandonner ? »).
// `festive` (optionnel) : habillage « fête » (cadre doré, fond de page teinté, apparition en ressort) pour l'espace AniMood 2026. La barre de titre
// est alors remplacée par `hero` (un bandeau fourni par l'appelant) et la croix « Close » flotte en haut à droite par-dessus. Sans `festive`, rien ne change.
const FESTIVE_BACKDROP = "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(251,191,36,0.16), transparent 70%), rgba(8,3,24,0.9)";
const FESTIVE_SHADOW = "0 0 0 1px rgba(255,255,255,0.06), 0 28px 90px rgba(0,0,0,0.8), 0 0 70px rgba(251,191,36,0.2), 0 0 120px rgba(var(--ac-8b5cf6),0.24), inset 0 1px 0 rgba(255,255,255,0.12)";
export function GameModal({ onClose, children, title, subtitle, maxWidth = "920px", fullHeight = false, canClose, festive = false, hero = null }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const { playSound } = useSound();
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const requestClose = useModalBack(onClose, canClose);

  // `force === true` : fermeture sans redemander à `canClose` (bouton « Quitter » du jeu, une fois confirmé dans le jeu).
  // Les clics de la croix / du fond transmettent l'événement en 1er argument : seul `true` compte.
  const close = (force) => {
    if(closing) return;
    if(requestClose(force === true) === false) return;     // fermeture refusée : la fenêtre reste affichée telle quelle
    playSound("back");
    setClosing(true);
    setVisible(false);
  };
  const closeNow = () => close(true);

  return (
    <div {...overlayProps()} onClick={close} style={{
      position:"fixed", inset:0, zIndex:300,
      display:"flex", alignItems:"center", justifyContent:"center", padding:12,
      transition:"all 0.2s",
      background: visible ? (festive ? FESTIVE_BACKDROP : "rgba(0,0,8,0.88)") : "rgba(0,0,0,0)",
      backdropFilter: visible ? (festive ? "blur(14px) saturate(0.75)" : "blur(12px) saturate(0.6)") : "none",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position:"relative", width:"100%", maxWidth,
        height: fullHeight ? "94vh" : "auto", maxHeight:"94vh",
        display:"flex", flexDirection:"column",
        borderRadius: festive ? 28 : 24,
        border: festive ? "1px solid rgba(251,191,36,0.55)" : "1px solid rgba(var(--ac-7c3aed),0.35)",
        outline: festive ? "4px solid rgba(251,191,36,0.1)" : "4px solid rgba(var(--ac-7c3aed),0.08)", outlineOffset:"2px",
        background:"var(--surface-1-strong)",
        boxShadow: festive ? FESTIVE_SHADOW : "0 0 0 1px rgba(255,255,255,0.05), 0 24px 80px rgba(0,0,0,0.75), 0 0 80px rgba(var(--ac-6d28d9),0.14), inset 0 1px 0 rgba(255,255,255,0.06)",
        transition: festive ? "opacity 0.3s, transform 0.5s cubic-bezier(.34,1.4,.64,1)" : "opacity 0.22s, transform 0.22s",
        transform: visible ? "translateY(0) scale(1)" : festive ? "translateY(30px) scale(0.9)" : "translateY(16px) scale(0.96)",
        opacity: visible ? 1 : 0,
        overflow:"hidden",
      }}>
        {/* Top shimmer */}
        <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,zIndex:4,
          background: festive ? "linear-gradient(90deg,transparent,rgba(253,230,138,0.9),transparent)" : "linear-gradient(90deg,transparent,rgba(var(--ac-a78bfa),0.45),transparent)",pointerEvents:"none"}}/>

        {festive ? (
          <>
            {hero}
            {/* data-keep-bright : la croix reste dorée sur fond sombre en thème clair (sinon lighttext.mjs assombrit son texte clair) */}
            <button onClick={close} aria-label="Close" data-keep-bright="" style={{
              position:"absolute",top:12,right:12,zIndex:5,width:38,height:38,borderRadius:"50%",border:"1px solid rgba(251,191,36,0.6)",
              background:"rgba(12,6,34,0.6)",color:"#fde68a",cursor:"pointer",backdropFilter:"blur(6px)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:21,lineHeight:1}}>
              ×
            </button>
          </>
        ) : (
        /* Title bar */
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
          padding:"13px 18px 11px",borderBottom:"1px solid rgba(255,255,255,0.06)",
          background:"rgba(255,255,255,0.02)",flexShrink:0}}>
          <div style={{minWidth:0}}>
            {title && <div style={{fontSize:13,fontWeight:900,color:"var(--text-1)",letterSpacing:0.2}}>{title}</div>}
            {subtitle && <div style={{fontSize:10,color:"var(--text-5)",marginTop:2}}>{subtitle}</div>}
          </div>
          <button onClick={close} aria-label="Close" style={{
            width:28,height:28,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.08)",
            background:"rgba(255,255,255,0.05)",color:"var(--text-4)",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>
            ×
          </button>
        </div>
        )}

        {/* Content */}
        <div style={{flex:1,minHeight:0,overflowY: fullHeight ? "hidden" : "auto",display:"flex",flexDirection:"column"}}>
          {typeof children === "function" ? children(close, closeNow) : children}
        </div>
      </div>
    </div>
  );
}
