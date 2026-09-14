import { useState, useEffect } from "react";

// ─── Standard Modal ────────────────────────────────────────────────────────────
export function Modal({ onClose, children, maxWidth = "max-w-lg", bodyClassName = "" }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const close = async () => {
    if(closing) return;
    setClosing(true);
    setVisible(false);
    try { await Promise.resolve(onClose()); } catch {}
  };

  // Convert Tailwind max-w class to px
  const widthMap = {"max-w-sm":"384px","max-w-md":"448px","max-w-lg":"512px","max-w-xl":"576px","max-w-2xl":"672px","max-w-4xl":"896px","max-w-6xl":"1152px"};
  const maxW = widthMap[maxWidth] || "512px";

  return (
    <div onClick={close} style={{
      position:"fixed",inset:0,zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16,
      transition:"background 0.2s, backdrop-filter 0.2s",
      background: visible ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0)",
      backdropFilter: visible ? "blur(6px)" : "none",
    }}>
      <div onClick={e => e.stopPropagation()} className={bodyClassName} style={{
        width:"100%", maxWidth:maxW, maxHeight:"90vh", overflowY:"auto",
        borderRadius:20, border:"1px solid rgba(255,255,255,0.09)",
        background:"var(--surface-1-strong)", boxShadow:"var(--shadow-modal)",
        transition:"all 0.2s",
        transform: visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
        opacity: visible ? 1 : 0,
      }}>
        {typeof children === "function" ? children(close) : children}
      </div>
    </div>
  );
}

// ─── Game Board Modal ──────────────────────────────────────────────────────────
export function GameModal({ onClose, children, title, subtitle, maxWidth = "920px", noPad = false }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const close = async () => {
    if(closing) return;
    setClosing(true);
    setVisible(false);
    await new Promise(r => setTimeout(r, 180));
    try { await Promise.resolve(onClose()); } catch {}
  };

  return (
    <div onClick={close} style={{
      position:"fixed",inset:0,zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center",padding:12,
      transition:"all 0.2s",
      background: visible ? "rgba(0,0,8,0.92)" : "rgba(0,0,0,0)",
      backdropFilter: visible ? "blur(12px) saturate(0.6)" : "none",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position:"relative", width:"100%", maxWidth, maxHeight:"94vh",
        display:"flex", flexDirection:"column",
        borderRadius:24,
        border:"1px solid rgba(124,58,237,0.35)",
        outline:"4px solid rgba(124,58,237,0.08)", outlineOffset:"2px",
        background:"linear-gradient(180deg, rgba(20,14,40,0.98) 0%, rgba(12,8,28,0.99) 100%)",
        boxShadow:"0 0 0 1px rgba(255,255,255,0.05), 0 4px 6px rgba(0,0,0,0.5), 0 24px 80px rgba(0,0,0,0.75), 0 0 80px rgba(109,40,217,0.14), inset 0 1px 0 rgba(255,255,255,0.06)",
        transition:"all 0.22s",
        transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
        opacity: visible ? 1 : 0,
        overflow:"hidden",
      }}>
        {/* Top shimmer */}
        <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,
          background:"linear-gradient(90deg,transparent,rgba(167,139,250,0.45),transparent)",
          pointerEvents:"none"}}/>

        {/* Header */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"15px 22px 13px",
          borderBottom:"1px solid rgba(255,255,255,0.06)",
          background:"rgba(255,255,255,0.02)",
          flexShrink:0,
        }}>
          <div>
            {title && <div style={{fontSize:13,fontWeight:900,color:"var(--text-1)",letterSpacing:0.2}}>{title}</div>}
            {subtitle && <div style={{fontSize:9,color:"var(--text-5)",marginTop:2}}>{subtitle}</div>}
          </div>
          <button onClick={close} style={{
            width:26,height:26,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.08)",
            background:"rgba(255,255,255,0.05)",color:"var(--text-4)",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
            transition:"all 0.15s",flexShrink:0,
          }}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.12)";e.currentTarget.style.color="var(--text-1)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color="var(--text-4)";}}>
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:"auto"}}>
          {typeof children === "function" ? children(close) : children}
        </div>

        {/* Bottom edge */}
        <div style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:1,
          background:"linear-gradient(90deg,transparent,rgba(124,58,237,0.2),transparent)",
          pointerEvents:"none"}}/>
      </div>
    </div>
  );
}
