import { useState } from "react";
import { useLang } from "../context/useLang.js";
import { Modal } from "./Modal.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";
import { INFO_MODAL_I18N } from "../constants/infoModalI18n.js";
import { MOODS } from "../constants/moods.js";

// ─── Static footer pages — About / Contact / FAQ / Categories / Moderation ────
// type: "about" | "contact" | "faq" | "categories" | "moderation"
export function InfoModal({ type, onClose }) {
  const { lang } = useLang();
  const t = INFO_MODAL_I18N[lang] || INFO_MODAL_I18N.fr;
  const data = t[type];
  if(!data) return null;

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" bodyClassName="flex flex-col">
      <div className="px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
        <div className="text-[13px] font-black uppercase tracking-wide text-white">{data.title}</div>
      </div>
      <div className="max-h-[65vh] overflow-y-auto p-5">
        {type === "about"      && <AboutBody data={data} />}
        {type === "contact"    && <ContactBody data={data} />}
        {type === "faq"        && <FaqBody data={data} />}
        {type === "categories" && <CategoriesBody data={data} />}
        {type === "moderation" && <ModerationBody data={data} />}
      </div>
    </Modal>
  );
}

function Section({ h, p }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 text-[12.5px] font-black text-slate-200">{h}</div>
      <p className="text-[12px] leading-relaxed text-slate-500">{p}</p>
    </div>
  );
}

function AboutBody({ data }) {
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-slate-500">{data.tagline}</p>
      {data.sections.map(s => <Section key={s.h} {...s} />)}
      <a href="https://github.com/casval-bit/animood" target="_blank" rel="noopener noreferrer"
        className="inline-block text-[12px] font-bold text-violet-400 hover:text-violet-300">
        {data.githubCta} →
      </a>
    </div>
  );
}

function ContactBody({ data }) {
  return (
    <div>
      <p className="mb-4 text-[12px] leading-relaxed text-slate-500">{data.intro}</p>
      <div className="flex flex-col gap-2.5">
        {data.items.map(item => (
          <a key={item.title} href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/3 px-3.5 py-3 no-underline transition hover:border-violet-400/25 hover:bg-violet-500/8">
            <span className="shrink-0 text-xl">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-black text-slate-100">{item.title}</div>
              <div className="text-[10.5px] text-slate-500">{item.desc}</div>
            </div>
            <div className="shrink-0 text-[10.5px] font-bold text-violet-400">{item.action} →</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function FaqBody({ data }) {
  const [open, setOpen] = useState(null);
  return (
    <div>
      <p className="mb-3.5 text-[12px] leading-relaxed text-slate-500">{data.intro}</p>
      <div className="flex flex-col gap-2">
        {data.items.map((faq,i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-white/7"
            style={{ background: open===i ? "rgba(124,58,237,0.06)" : "rgba(255,255,255,0.02)" }}>
            <button onClick={() => setOpen(open===i ? null : i)}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left">
              <span className="text-[12px] font-bold text-slate-100">{faq.q}</span>
              <span className="shrink-0 text-sm font-black text-violet-400 transition-transform"
                style={{ transform: open===i ? "rotate(45deg)" : "rotate(0deg)" }}>+</span>
            </button>
            {open===i && <div className="px-3.5 pb-3.5 text-[11.5px] leading-relaxed text-slate-500">{faq.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoriesBody({ data }) {
  return (
    <div>
      <p className="mb-3.5 text-[12px] leading-relaxed text-slate-500">{data.intro}</p>
      <div className="grid grid-cols-2 gap-2">
        {MOODS.map(m => (
          <div key={m.id} className="flex items-center gap-2.5 rounded-xl border border-white/7 bg-white/3 px-3 py-2.5">
            <span className="text-lg">{m.emoji}</span>
            <div className="min-w-0">
              <div className="text-[11.5px] font-black" style={{ color: m.color }}>{m.label}</div>
              <div className="text-[9.5px] text-slate-500">{data.descriptions[m.id]}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModerationBody({ data }) {
  return <div className="space-y-4">{data.sections.map(s => <Section key={s.h} {...s} />)}</div>;
}
