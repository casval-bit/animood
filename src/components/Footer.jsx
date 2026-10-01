import { useState } from "react";
import { useLang } from "../context/useLang.js";
import { GRADIENT_TEXT } from "../constants/theme.js";
import { FOOTER_I18N } from "../constants/footerI18n.js";
import { LegalModal } from "./LegalModal.jsx";
import { InfoModal } from "./InfoModal.jsx";

export function Footer({ onOpenPage }) {
  const { lang } = useLang();
  const t = FOOTER_I18N[lang] || FOOTER_I18N.fr;
  const year = new Date().getFullYear();
  const [legalModal, setLegalModal] = useState(null); // "legal" | "privacy" | null
  const [infoModal, setInfoModal]   = useState(null); // "about" | "contact" | "faq" | "categories" | "moderation" | null

  return (
    <footer className="mx-auto mt-10 max-w-6xl px-3 pb-8 pt-4 sm:px-4">
      <div className="flex flex-col items-center gap-2 border-t border-white/8 pt-6 text-center">
        <div className="flex items-center gap-2">
          <img src="/logo-mark.png" alt="" className="h-6 w-6 rounded-full object-cover" />
          <span className={`text-sm font-black tracking-tight ${GRADIENT_TEXT}`}>AniMood</span>
        </div>
        <p className="text-xs text-slate-500">{t.tagline}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {[
            {label:t.aboutLink,      onClick:()=>onOpenPage?.("about")},
            {label:t.categoriesLink, onClick:()=>setInfoModal("categories")},
            {label:t.contactLink,    onClick:()=>onOpenPage?.("contact")},
            {label:t.faqLink,        onClick:()=>onOpenPage?.("faq")},
            {label:t.moderationLink, onClick:()=>setInfoModal("moderation")},
            {label:t.legalLink,      onClick:()=>setLegalModal("legal")},
            {label:t.privacyLink,    onClick:()=>setLegalModal("privacy")},
          ].map(btn => (
            <button key={btn.label} onClick={btn.onClick}
              className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-[11px] text-slate-400 transition hover:border-white/20 hover:bg-white/8 hover:text-slate-200">
              {btn.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-600">{t.rights(year)}</p>
      </div>

      {legalModal && <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />}
      {infoModal && <InfoModal type={infoModal} onClose={() => setInfoModal(null)} />}
    </footer>
  );
}
