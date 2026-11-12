import { useApp } from "../context/useApp.js";
import { useGuestT } from "../hooks/useGuestT.js";
import { GLASS, GLASS_STYLE, GRADIENT_TEXT } from "../constants/theme.js";
import { GradientButton } from "./ui.jsx";

// Page affichée à la place d'un onglet réservé aux membres (fil, forum, profil, messages, jeux)
export function GuestLockedView({ tab }) {
  const { leaveGuest } = useApp();
  const t = useGuestT();
  const info = t.locked[tab] || t.locked.profile;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-5 py-16 text-center">
      <div className={`w-full p-8 ${GLASS}`} style={GLASS_STYLE}>
        <div className="mb-3 text-5xl">{info.icon}</div>
        <h2 className={`mb-2 text-2xl font-black tracking-tight ${GRADIENT_TEXT}`}>{t.lockedTitle}</h2>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">{info.text}</p>

        <div className="mb-6 rounded-2xl border border-white/6 bg-white/3 p-4 text-left">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.lockedFeatures}</div>
          <ul className="flex flex-col gap-1.5">
            {t.perks.map(p => (
              <li key={p} className="flex gap-2 text-[13px] text-slate-300"><span className="text-violet-400">✦</span>{p}</li>
            ))}
          </ul>
        </div>

        <GradientButton onClick={leaveGuest} className="w-full py-3.5 text-[15px]">{t.signInGoogle}</GradientButton>
      </div>
    </div>
  );
}

// Encart compact (fiche d'animé, paramètres) qui remplace une action réservée aux membres
export function GuestSignInCard({ title, text, className = "" }) {
  const { leaveGuest } = useApp();
  const t = useGuestT();
  return (
    <div className={`rounded-2xl border border-violet-400/20 bg-violet-400/6 p-4 ${className}`}>
      {title && <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-400/70">{title}</div>}
      <p className="mb-3 text-[12px] leading-relaxed text-slate-400">{text}</p>
      <GradientButton onClick={leaveGuest} className="w-full py-2.5 text-[13px]">{t.signIn}</GradientButton>
    </div>
  );
}
