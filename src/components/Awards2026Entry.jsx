// ─── Entrée « AniMood 2026 » dans les Jeux ───────────────────────────────────────────────────────────────────────────────────────
// • variant "wide" : grande carte au-dessus des mini-jeux (onglet Jeux de l'appli de bureau), à part des jeux ;
// • variant "tile" : tuile compacte sur 2 colonnes en tête du panneau de jeux du forum (site web).
// Reste visible toute l'année (contrairement au bloc de fin d'année, qui disparaît après le 15 janvier).
import { useState } from "react";
import { useLang } from "../context/useLang.js";
import { awardsText } from "../constants/awardsI18n.js";

const GOLD = "251,191,36";

export function Awards2026Entry({ onOpen, variant = "wide" }) {
  const { lang } = useLang();
  const t = awardsText(lang);
  const [hover, setHover] = useState(false);

  if(variant === "tile") {
    return (
      <button type="button" onClick={onOpen} data-testid="awards-entry" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 11, cursor: "pointer", textAlign: "left", minWidth: 0,
          border: `1px solid rgba(${GOLD},${hover ? 0.6 : 0.38})`,
          background: `linear-gradient(110deg, rgba(${GOLD},${hover ? 0.2 : 0.13}), rgba(var(--ac-8b5cf6),0.12))`,
          transform: hover ? "translateY(-1px)" : "none", transition: "all .15s" }}>
        <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>🎆</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 900, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.entryTitle}</span>
          <span style={{ display: "block", marginTop: 1, fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.entrySection}</span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 13, fontWeight: 900, color: `rgb(${GOLD})` }}>→</span>
      </button>
    );
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="h-3.5 w-1 rounded-full" style={{ background: `rgb(${GOLD})` }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{t.entrySection}</span>
      </div>
      <button type="button" onClick={onOpen} data-testid="awards-entry" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: "flex", alignItems: "center", gap: 18, width: "100%", padding: "18px 22px", borderRadius: 20, cursor: "pointer", textAlign: "left",
          border: `1px solid rgba(${GOLD},${hover ? 0.6 : 0.4})`,
          background: `linear-gradient(110deg, rgba(${GOLD},${hover ? 0.18 : 0.12}) 0%, rgba(var(--ac-8b5cf6),0.14) 60%, rgba(var(--ac-e879f9),0.1) 100%)`,
          boxShadow: hover ? `0 14px 34px rgba(${GOLD},0.18)` : "none", transform: hover ? "translateY(-2px)" : "none", transition: "all .2s ease" }}>
        <span aria-hidden="true" style={{ display: "flex", width: 58, height: 58, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 16, fontSize: 30,
          background: `rgba(${GOLD},0.16)`, border: `1px solid rgba(${GOLD},0.4)` }}>🎆</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 18, fontWeight: 900, letterSpacing: -0.3, color: "var(--text-1)" }}>{t.entryTitle}</span>
          <span style={{ display: "block", marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-3)" }}>{t.entrySub}</span>
        </span>
        <span style={{ flexShrink: 0, padding: "9px 18px", borderRadius: 12, fontSize: 12.5, fontWeight: 900, color: "#1f1300", background: "linear-gradient(135deg,#fbbf24,#f59e0b)", boxShadow: "0 4px 14px rgba(245,158,11,0.3)" }}>
          {t.entryCta} →
        </span>
      </button>
    </section>
  );
}
