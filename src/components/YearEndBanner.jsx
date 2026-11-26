// ─── Bloc de fin d'année — juste sous l'en-tête (Forum du site, Forum et Jeux de l'appli de bureau) ──────────────────────────────
// Souhaite de bonnes fêtes, présente l'espace AniMood 2026 (tierlist, grille, top 3) et montre le PODIUM de la communauté : les 3 animés en tête
// au total des points, avec leurs affiches (components/awards/Podium.jsx). Le podium se met à jour tout seul (useCommunityPodium : toutes les
// 90 s, au retour sur la page, et tout de suite quand je vote). Sans table de votes ou en cas de panne au premier chargement, le bloc s'affiche sans podium.
// Fermeture : la croix masque le bloc ; il ne revient pas quand on recharge la page (sessionStorage), mais il revient à la prochaine
// connexion (la déconnexion efface la marque, voir AppProvider) et quand on rouvre le site ou l'appli (nouvelle session).
// Il disparaît pour de bon après BANNER_LAST_DAY (utils/awards2026.js).
// C'est un îlot sombre (data-keep-bright) : même rendu « nuit de fête » en thème clair et sombre, comme la carte de la grille exportée.
import { useState } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { awardsText } from "../constants/awardsI18n.js";
import { isBannerSeason, isBannerDismissed, dismissBanner } from "../utils/awards2026.js";
import { useCommunityPodium } from "./awards/useCommunityPodium.js";
import { Podium } from "./awards/Podium.jsx";

const safeSession = () => { try { return window.sessionStorage; } catch { return null; } };

const BACKGROUND = [
  "radial-gradient(440px 180px at 0% 0%, rgba(251,191,36,0.24), transparent 72%)",
  "radial-gradient(400px 200px at 100% 100%, rgba(var(--ac-e879f9),0.22), transparent 70%)",
  "linear-gradient(115deg, #2a1650 0%, #1d1043 52%, #2a1239 100%)",
].join(", ");
const CONFETTI = [
  "radial-gradient(circle at 12% 28%, rgba(251,191,36,0.6) 0 2px, transparent 3px)",
  "radial-gradient(circle at 38% 82%, rgba(var(--ac-e879f9),0.55) 0 2px, transparent 3px)",
  "radial-gradient(circle at 63% 18%, rgba(var(--ac-a78bfa),0.6) 0 2px, transparent 3px)",
  "radial-gradient(circle at 81% 72%, rgba(251,191,36,0.5) 0 2px, transparent 3px)",
  "radial-gradient(circle at 93% 24%, rgba(var(--ac-e879f9),0.5) 0 1.5px, transparent 2.5px)",
  "radial-gradient(circle at 5% 80%, rgba(var(--ac-a78bfa),0.5) 0 1.5px, transparent 2.5px)",
].join(", ");

export function YearEndBanner({ onOpen, maxWidth = 1152, gutter = 24 }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = awardsText(lang);
  const [hidden, setHidden] = useState(() => isBannerDismissed(safeSession(), myUsername));
  const live = !hidden && isBannerSeason();
  const podium = useCommunityPodium(live);          // aucune lecture ni actualisation tant que le bloc est fermé ou hors saison
  if(!live) return null;

  const close = () => { dismissBanner(safeSession(), myUsername); setHidden(true); };
  const withPodium = podium.status !== "missing" && podium.status !== "error";

  const icon = (
    <span aria-hidden="true" className="md:row-span-2" style={{ position: "relative", display: "flex", width: 44, height: 44, flexShrink: 0, alignItems: "center", justifyContent: "center",
      borderRadius: 13, fontSize: 24, background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.45)" }}>🎆</span>
  );
  const title = <div style={{ position: "relative", fontSize: 16, fontWeight: 900, letterSpacing: -0.2, lineHeight: 1.25, color: "#fff7e0" }}>{t.bannerTitle}</div>;
  const body = (
    <>
      <p className="col-span-2 hidden sm:block md:col-span-1" style={{ position: "relative", margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "rgba(245,243,255,0.84)" }}>{t.bannerBody}</p>
      <p className="col-span-2 sm:hidden" style={{ position: "relative", margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "rgba(245,243,255,0.84)" }}>{t.bannerBodyShort}</p>
    </>
  );
  const cta = (extra) => (
    <button type="button" onClick={onOpen} data-testid="yearend-open" className={extra}
      style={{ position: "relative", flexShrink: 0, minHeight: 42, padding: "9px 18px", borderRadius: 12, border: "none", cursor: "pointer",
        fontSize: 13, fontWeight: 900, color: "#1f1300", background: "linear-gradient(135deg,#fde68a,#fbbf24 45%,#f59e0b)", boxShadow: "0 6px 18px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.55)" }}>
      {t.bannerCta} →
    </button>
  );

  return (
    <div style={{ maxWidth, margin: "0 auto", padding: `14px ${gutter}px 0` }}>
      <section role="region" aria-label={t.bannerTitle} data-testid="yearend-banner" data-keep-bright="" data-podium={withPodium ? "1" : "0"}
        className="px-4 pb-4 pt-3.5 md:pr-14"
        style={{ position: "relative", overflow: "hidden", borderRadius: 20, color: "#f5f3ff", background: BACKGROUND,
          border: "1px solid rgba(251,191,36,0.5)", boxShadow: "0 10px 34px rgba(251,191,36,0.14), 0 0 0 1px rgba(255,255,255,0.04) inset" }}>
        {/* confettis et étincelles décoratifs */}
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.7, backgroundImage: CONFETTI }} />
        <span aria-hidden="true" className="awards-twinkle" style={{ position: "absolute", top: 9, left: "47%", fontSize: 13, color: "#fde68a", pointerEvents: "none" }}>✦</span>
        <span aria-hidden="true" className="awards-twinkle" style={{ position: "absolute", bottom: 10, left: "30%", fontSize: 10, color: "#f0abfc", pointerEvents: "none", animationDelay: "1.2s" }}>✦</span>

        {withPodium ? (
          // Téléphone : titre, texte, podium, bouton (en colonne). Bureau : le texte et le bouton à gauche, centrés en hauteur, le podium à droite.
          <div className="relative grid gap-3 md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[1fr_auto_auto_1fr] md:gap-x-7">
            <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 pr-10 md:col-start-1 md:row-start-2 md:items-start md:gap-y-1 md:pr-0">{icon}{title}{body}</div>
            <div className="md:col-start-2 md:row-start-1 md:row-span-4"><Podium podium={podium} onOpen={onOpen} t={t} /></div>
            <div className="md:col-start-1 md:row-start-3">{cta("w-full md:w-auto")}</div>
          </div>
        ) : (
          <div className="relative flex flex-wrap items-center gap-3.5 pr-10 md:pr-0">
            <div className="grid min-w-0 flex-[1_1_260px] grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 md:items-start md:gap-y-1">{icon}{title}{body}</div>
            {cta("")}
          </div>
        )}

        <button type="button" onClick={close} aria-label={t.bannerClose} title={t.bannerClose} data-testid="yearend-close"
          style={{ position: "absolute", top: 8, right: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "50%", border: "1px solid rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.1)", color: "rgba(245,243,255,0.9)", cursor: "pointer", fontSize: 17, lineHeight: 1 }}>
          ×
        </button>
      </section>
    </div>
  );
}
