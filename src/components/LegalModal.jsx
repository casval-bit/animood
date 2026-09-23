import { useLang } from "../context/useLang.js";
import { Modal } from "./Modal.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";
import { LEGAL_MODAL_I18N } from "../constants/legalModalI18n.js";

// ─── Legal notice / privacy policy — type: "legal" | "privacy" ────────────────
export function LegalModal({ type, onClose }) {
  const { lang } = useLang();
  const t = LEGAL_MODAL_I18N[lang] || LEGAL_MODAL_I18N.fr;
  const title = type === "privacy" ? t.privacyTitle : t.legalTitle;
  const sections = type === "privacy" ? t.privacySections : t.legalSections;

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" bodyClassName="flex flex-col">
      <div className="px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
        <div className="text-[13px] font-black uppercase tracking-wide text-white">{title}</div>
      </div>
      <div className="max-h-[65vh] overflow-y-auto p-5 space-y-4">
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">{t.placeholderNotice}</p>
        {sections.map(s => (
          <div key={s.h}>
            <div className="mb-1 text-[12.5px] font-black text-slate-200">{s.h}</div>
            <p className="text-[12px] leading-relaxed text-slate-500">{s.p}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
