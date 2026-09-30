import { useState, useEffect } from "react";
import { useModalBack } from "../hooks/useModalBack.js";

export function Modal({ onClose, children, maxWidth = "max-w-lg", bodyClassName = "" }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  // Pushes a history entry on mount so the browser/device back button
  // closes this modal instead of navigating away from the page underneath.
  const requestClose = useModalBack(onClose);

  const close = () => {
    if(closing) return;
    setClosing(true);
    setVisible(false);
    requestClose();
  };

  return (
    <div
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
export function GameModal({ onClose, children, title, subtitle, maxWidth = "920px", fullHeight = false }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const requestClose = useModalBack(onClose);

  const close = () => {
    if(closing) return;
    setClosing(true);
    setVisible(false);
    requestClose();
  };

  return (
    <div onClick={close} style={{
      position:"fixed", inset:0, zIndex:300,
      display:"flex", alignItems:"center", justifyContent:"center", padding:12,
      transition:"all 0.2s",
      background: visible ? "rgba(0,0,8,0.88)" : "rgba(0,0,0,0)",
      backdropFilter: visible ? "blur(12px) saturate(0.6)" : "none",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position:"relative", width:"100%", maxWidth,
        height: fullHeight ? "94vh" : "auto", maxHeight:"94vh",
        display:"flex", flexDirection:"column",
        borderRadius:24,
        border:"1px solid rgba(124,58,237,0.35)",
        outline:"4px solid rgba(124,58,237,0.08)", outlineOffset:"2px",
        background:"var(--surface-1-strong)",
        boxShadow:"0 0 0 1px rgba(255,255,255,0.05), 0 24px 80px rgba(0,0,0,0.75), 0 0 80px rgba(109,40,217,0.14), inset 0 1px 0 rgba(255,255,255,0.06)",
        transition:"opacity 0.22s, transform 0.22s",
        transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
        opacity: visible ? 1 : 0,
        overflow:"hidden",
      }}>
        {/* Top shimmer */}
        <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,
          background:"linear-gradient(90deg,transparent,rgba(167,139,250,0.45),transparent)",pointerEvents:"none"}}/>

        {/* Title bar */}
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

        {/* Content */}
        <div style={{flex:1,minHeight:0,overflowY: fullHeight ? "hidden" : "auto",display:"flex",flexDirection:"column"}}>
          {typeof children === "function" ? children(close) : children}
        </div>
      </div>
    </div>
  );
}
