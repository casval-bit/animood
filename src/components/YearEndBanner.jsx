// ─── Bloc de fin d'année — juste sous l'en-tête (Forum du site, Forum et Jeux de l'appli de bureau) ──────────────────────────────
// Souhaite de bonnes fêtes et présente l'espace AniMood 2026 (tierlist, grille, top 3 de la communauté).
// Fermeture : la croix masque le bloc ; il ne revient pas quand on recharge la page (sessionStorage), mais il revient à la prochaine
// connexion (la déconnexion efface la marque, voir AppProvider) et quand on rouvre le site ou l'appli (nouvelle session).
// Il disparaît pour de bon après BANNER_LAST_DAY (utils/awards2026.js).
import { useState } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { awardsText } from "../constants/awardsI18n.js";
import { isBannerSeason, isBannerDismissed, dismissBanner } from "../utils/awards2026.js";

const safeSession = () => { try { return window.sessionStorage; } catch { return null; } };

export function YearEndBanner({ onOpen, maxWidth = 1152, gutter = 24 }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = awardsText(lang);
  const [hidden, setHidden] = useState(() => isBannerDismissed(safeSession(), myUsername));
  if(hidden || !isBannerSeason()) return null;

  const close = () => { dismissBanner(safeSession(), myUsername); setHidden(true); };

  return (
    <div style={{ maxWidth, margin: "0 auto", padding: `14px ${gutter}px 0` }}>
      <section role="region" aria-label={t.bannerTitle} data-testid="yearend-banner"
        style={{
          position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          padding: "14px 48px 14px 16px", borderRadius: 18,
          background: "linear-gradient(110deg, rgba(251,191,36,0.16) 0%, rgba(var(--ac-8b5cf6),0.18) 55%, rgba(var(--ac-e879f9),0.14) 100%)",
          border: "1px solid rgba(251,191,36,0.38)", boxShadow: "0 8px 28px rgba(251,191,36,0.10)",
        }}>
        {/* confettis décoratifs */}
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.55,
          backgroundImage: "radial-gradient(circle at 12% 28%, rgba(251,191,36,0.55) 0 2px, transparent 3px), radial-gradient(circle at 38% 78%, rgba(var(--ac-e879f9),0.5) 0 2px, transparent 3px), radial-gradient(circle at 63% 22%, rgba(var(--ac-a78bfa),0.55) 0 2px, transparent 3px), radial-gradient(circle at 86% 70%, rgba(251,191,36,0.5) 0 2px, transparent 3px)" }} />
        <span aria-hidden="true" style={{ position: "relative", display: "flex", width: 44, height: 44, flexShrink: 0, alignItems: "center", justifyContent: "center",
          borderRadius: 13, fontSize: 24, background: "rgba(251,191,36,0.18)", border: "1px solid rgba(251,191,36,0.4)" }}>🎆</span>
        <div style={{ position: "relative", flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: -0.2, color: "var(--text-1)" }}>{t.bannerTitle}</div>
          <p className="hidden sm:block" style={{ margin: "3px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--text-3)" }}>{t.bannerBody}</p>
          <p className="sm:hidden" style={{ margin: "3px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--text-3)" }}>{t.bannerBodyShort}</p>
        </div>
        <button type="button" onClick={onOpen} data-testid="yearend-open"
          style={{ position: "relative", flexShrink: 0, minHeight: 40, padding: "9px 16px", borderRadius: 12, border: "none", cursor: "pointer",
            fontSize: 12.5, fontWeight: 900, color: "#1f1300", background: "linear-gradient(135deg,#fbbf24,#f59e0b)", boxShadow: "0 4px 14px rgba(245,158,11,0.35)" }}>
          {t.bannerCta} →
        </button>
        <button type="button" onClick={close} aria-label={t.bannerClose} title={t.bannerClose} data-testid="yearend-close"
          style={{ position: "absolute", top: 8, right: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "50%", border: "1px solid rgba(var(--fg-rgb),0.12)", background: "rgba(var(--fg-rgb),0.06)", color: "var(--text-3)", cursor: "pointer", fontSize: 17, lineHeight: 1 }}>
          ×
        </button>
      </section>
    </div>
  );
}
