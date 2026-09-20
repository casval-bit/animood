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
