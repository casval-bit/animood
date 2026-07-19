import { useState, useEffect } from "react";

// Generic centered modal shell — backdrop blur + scale/fade transition.
// `children` can be a node or a render-prop `(close) => node` when the content
// needs its own explicit close button (✕) in addition to backdrop-click-to-close.
export function Modal({ onClose, children, maxWidth = "max-w-lg", bodyClassName = "" }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
  const close = () => { setVisible(false); setTimeout(onClose, 200); };

  return (
    <div
      onClick={close}
      className={`fixed inset-0 z-300 flex items-center justify-center p-4 transition-all duration-200 ${visible ? "bg-black/75 backdrop-blur-sm" : "bg-black/0"}`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`max-h-[88vh] w-full ${maxWidth} overflow-y-auto rounded-[22px] border border-white/9 backdrop-blur-xl transition-all duration-200 ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"} ${bodyClassName}`}
        style={{ background: "rgba(17,24,39,.92)", boxShadow: "0 25px 60px rgba(0,0,0,.5)" }}
      >
        {typeof children === "function" ? children(close) : children}
      </div>
    </div>
  );
}
