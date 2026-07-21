// ─── SHARED UI PRIMITIVES — glass cards, gradient buttons, chips, tabs ────────
// Reuses the design tokens from constants/theme.js across the whole app so
// every screen reads as one product.
import { GRADIENT_PRIMARY, GLASS, GLASS_STYLE } from "../constants/theme.js";
import { useApp } from "../context/useApp.js";

export function GlassCard({ className = "", style = {}, children, as: Comp = "div", ...rest }) {
  return (
    <Comp className={`${GLASS} ${className}`} style={{ ...GLASS_STYLE, ...style }} {...rest}>
      {children}
    </Comp>
  );
}

export function GradientButton({ className = "", disabled, children, as: Comp = "button", ...rest }) {
  return (
    <Comp
      disabled={disabled}
      className={`rounded-full font-extrabold text-white transition-all duration-300 ${disabled ? "cursor-not-allowed opacity-40" : "hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_20px_50px_rgba(139,92,246,.5)]"} ${className}`}
      style={{ background: disabled ? "rgba(255,255,255,.06)" : GRADIENT_PRIMARY, boxShadow: disabled ? "none" : "0 12px 34px rgba(109,91,255,.35)" }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

export function SectionLabel({ children, className = "" }) {
  return <p className={`text-[11px] font-bold uppercase tracking-wider text-slate-500 ${className}`}>{children}</p>;
}

export function Chip({ label, emoji, selected, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${selected ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
      style={{
        background: selected ? GRADIENT_PRIMARY : "rgba(255,255,255,0.04)",
        border: selected ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: selected ? "0 6px 20px rgba(109,91,255,.35)" : "none",
      }}>
      {emoji && <span>{emoji}</span>}{label}
    </button>
  );
}

export function ChipGroup({ items, value, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(item => (
        <Chip key={item.id} label={item.label} emoji={item.emoji} selected={value.includes(item.id)} onClick={() => onToggle(item.id)} />
      ))}
    </div>
  );
}

// Underline-style tabs — used by Profile / UserProfileModal / Search category switchers.
export function TabBar({ tabs, active, onChange, className = "" }) {
  return (
    <div className={`flex gap-1 border-b border-white/6 ${className}`}>
      {tabs.map(t => {
        const isActive = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            className="relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold transition"
            style={{ color: isActive ? "#f8fafc" : "#4b5563" }}>
            {t.emoji && <span className={isActive ? "" : "opacity-50 grayscale"}>{t.emoji}</span>}
            {t.label}
            {isActive && <div className="absolute inset-x-1 bottom-0 h-0.5 rounded-full" style={{ background: GRADIENT_PRIMARY }} />}
          </button>
        );
      })}
    </div>
  );
}

export function StatPill({ label, emoji = "⭐" }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/4 px-3.5 py-1.5 text-xs font-semibold text-slate-300">
      <span className="text-amber-400">{emoji}</span>{label}
    </div>
  );
}

// Quick-tap favorite/watched toggles overlaid on a poster — always visible (not
// hover-only) so it works as well on mobile taps as on desktop clicks.
// Favorites reuse the profile's 5-slot showcase array; no-ops silently once full.
// Bookmark SVG icon (watchlist)
function BookmarkIcon({ filled, color = "#22c55e" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  );
}


// Eye icon for watched
function EyeIcon({ filled, color = "#818cf8" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3" fill={filled ? color : "none"}/>
    </svg>
  );
}

export function QuickActionIcons({ anime, variant = "watched" }) {
  const { me, saveMe } = useApp();
  const malId = anime.mal_id;
  const isWatched = me.watched.includes(malId);
  const isOnWatchlist = (me.statuses||{})[malId] === "watchlist";
  const highlights = me.highlights || [];
  const isHighlighted = highlights.includes(malId);

  const toggleWatched = (e) => {
    e.stopPropagation();
    saveMe({ ...me, watched: isWatched ? me.watched.filter(id => id !== malId) : [...me.watched, malId] });
  };

  const toggleWatchlist = (e) => {
    e.stopPropagation();
    const newStatuses = { ...(me.statuses||{}) };
    if(isOnWatchlist) delete newStatuses[malId];
    else newStatuses[malId] = "watchlist";
    saveMe({ ...me, statuses: newStatuses });
  };

  const toggleHighlight = (e) => {
    e.stopPropagation();
    const newHighlights = isHighlighted
      ? highlights.filter(id => id !== malId)
      : [...highlights, malId];
    // Sync first 5 highlights into favorites slots
    const newFavs = [null,null,null,null,null];
    newHighlights.slice(0,5).forEach((id,i) => { newFavs[i] = id; });
    saveMe({ ...me, highlights: newHighlights, favorites: newFavs });
  };

  return (
    <>
      {/* Left — watchlist bookmark OR watched eye */}
      {variant === "watchlist" ? (
        <button onClick={toggleWatchlist}
          title={isOnWatchlist ? "Retirer de la watchlist" : "Ajouter à la watchlist"}
          className="absolute left-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur transition hover:scale-110"
          style={{ background: isOnWatchlist ? "rgba(34,197,94,.85)" : "rgba(15,23,42,.65)", boxShadow: isOnWatchlist ? "0 0 12px rgba(34,197,94,.5)" : "none" }}>
          <BookmarkIcon filled={isOnWatchlist}/>
        </button>
      ) : (
        <button onClick={toggleWatched}
          title={isWatched ? "Marquer comme non-vu" : "Marquer comme vu"}
          className="absolute left-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur transition hover:scale-110"
          style={{ background: isWatched ? "rgba(129,140,248,.85)" : "rgba(15,23,42,.65)", boxShadow: isWatched ? "0 0 12px rgba(129,140,248,.5)" : "none" }}>
          <EyeIcon filled={isWatched}/>
        </button>
      )}

      {/* Right — Highlight heart (emoji, original style) */}
      <button onClick={toggleHighlight}
        title={isHighlighted ? "Retirer des Highlights" : "Ajouter aux Highlights"}
        className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs backdrop-blur transition hover:scale-110"
        style={{ background: isHighlighted ? "rgba(236,72,153,.85)" : "rgba(15,23,42,.65)", boxShadow: isHighlighted ? "0 0 12px rgba(236,72,153,.5)" : "none" }}>
        {isHighlighted ? "❤️" : "🤍"}
      </button>
    </>
  );
}

export function StarRatingDisplay({ score }) {
  const filled = Math.max(0, Math.min(5, Math.round((score||0)/2)));
  return (
    <span className="text-xs tracking-tight">
      <span className="text-amber-400">{"★".repeat(filled)}</span>
      <span className="text-slate-700">{"★".repeat(5-filled)}</span>
    </span>
  );
}
