import { useState } from "react";
import { useLang } from "../context/useLang.js";
import { GRADIENT_TEXT } from "../constants/theme.js";
import { FOOTER_I18N } from "../constants/footerI18n.js";
import { LegalModal } from "./LegalModal.jsx";

export function Footer() {
  const { lang } = useLang();
  const t = FOOTER_I18N[lang] || FOOTER_I18N.fr;
  const year = new Date().getFullYear();
  const [legalModal, setLegalModal] = useState(null); // "legal" | "privacy" | null

  return (
    <footer className="mx-auto mt-10 max-w-6xl px-3 pb-8 pt-4 sm:px-4">
      <div className="flex flex-col items-center gap-2 border-t border-white/8 pt-6 text-center">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌀</span>
          <span className={`text-sm font-black tracking-tight ${GRADIENT_TEXT}`}>AniMood</span>
        </div>
        <p className="text-xs text-slate-500">{t.tagline}</p>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <button onClick={() => setLegalModal("legal")} className="underline-offset-2 hover:underline">{t.legalLink}</button>
          <span className="text-slate-700">·</span>
          <button onClick={() => setLegalModal("privacy")} className="underline-offset-2 hover:underline">{t.privacyLink}</button>
        </div>
        <p className="text-[11px] text-slate-600">{t.rights(year)}</p>
      </div>

      {legalModal && <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />}
    </footer>
  );
}
