import { useState, useRef, useEffect } from "react";
import { useLang } from "../context/useLang.js";
import { shareLink } from "../utils/shareLinks.js";

const LABELS = {
  fr: { share: "Partager", copied: "Lien copié !", title: "Partager le lien" },
  en: { share: "Share", copied: "Link copied!", title: "Share link" },
};

// Bouton « Partager » : menu de partage du téléphone, ou lien copié dans le presse-papier.
// variant "pill" (texte + icône) ou "icon" (rond, pour les bannières d'image)
export function ShareButton({ path, title, variant = "pill", className = "", style }) {
  const { lang } = useLang();
  const t = LABELS[lang] || LABELS.fr;
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async (e) => {
    e.stopPropagation();
    const res = await shareLink(path, title);
    if(res === "copied") {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    }
  };

  const icon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" />
    </svg>
  );

  if(variant === "icon") {
    return (
      <button type="button" onClick={onClick} title={t.title} aria-label={t.title}
        className={`flex h-8 items-center justify-center gap-1.5 rounded-full bg-black/50 px-2.5 text-slate-200 backdrop-blur transition hover:bg-black/70 ${className}`}
        style={style}>
        {icon}
        {copied && <span className="text-[11px] font-bold">{t.copied}</span>}
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} title={t.title} aria-label={t.title}
      className={className}
      style={{
        background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
        color: copied ? "#34d399" : "var(--text-3)", fontSize: 12, fontWeight: 700, transition: "color 0.15s", ...style,
      }}>
      {icon}<span>{copied ? t.copied : t.share}</span>
    </button>
  );
}
