// ─── DESKTOP-ONLY — modern filter deck for the Moodboard (lower left panel) ───
// Same DA as the new profile: inner glass cards, HUD section headers with a
// gradient tick, tile selectors with the brand gradient on the active state.
// Not used by the web version (which keeps ChipGroup).
import { GRADIENT_PRIMARY } from "../constants/theme.js";

const HINTS = {
  fr: { all: "", short: "< 15 ép.", medium: "15 – 50 ép.", long: "50+ ép." },
  en: { all: "", short: "< 15 eps", medium: "15 – 50 eps", long: "50+ eps" },
};

function SectionHead({ icon, label, hint }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-3.5 w-1 rounded-full" style={{ background: GRADIENT_PRIMARY }} />
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      {icon && <span className="text-xs opacity-70">{icon}</span>}
      {hint && <span className="ml-auto text-[10px] font-medium text-slate-600">{hint}</span>}
    </div>
  );
}

function Tile({ item, selected, onClick, sub, wide }) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl px-2 py-2.5 text-center transition-all duration-200 ${selected ? "-translate-y-px" : "hover:-translate-y-px hover:bg-white/6"} ${wide ? "col-span-2" : ""}`}
      style={{
        background: selected ? GRADIENT_PRIMARY : "rgba(var(--fg-rgb),0.035)",
        border: selected ? "1px solid transparent" : "1px solid rgba(var(--fg-rgb),0.07)",
        boxShadow: selected ? "0 8px 22px rgba(109,91,255,.32)" : "none",
      }}
    >
      {selected && (
        <span className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(circle at 50% -20%, rgba(255,255,255,.35), transparent 60%)" }} />
      )}
      <span className={`relative text-lg leading-none transition-transform duration-200 ${selected ? "scale-110" : "opacity-80 grayscale-[35%] group-hover:scale-110 group-hover:opacity-100 group-hover:grayscale-0"}`}>{item.emoji}</span>
      <span className={`relative text-[11px] font-bold leading-tight ${selected ? "text-white" : "text-slate-300"}`}>{item.label}</span>
      {sub ? <span className={`relative text-[9px] font-medium leading-none ${selected ? "text-white/75" : "text-slate-600"}`}>{sub}</span> : null}
    </button>
  );
}

function Card({ children }) {
  return <div className="rounded-2xl border border-white/6 bg-white/3 p-3.5">{children}</div>;
}

export function MoodFilters({
  lang, t, durations, countries, mediaTypes,
  duration, onDuration, selCountries, onCountry, selTypes, onType,
  friendOn, onFriendToggle, excludedCount,
}) {
  const hints = HINTS[lang] || HINTS.fr;
  const multiHint = lang === "en" ? "multi" : "multiple";
  return (
    <div className="flex flex-col gap-3">
      {/* Type — anime / film / OAV */}
      <Card>
        <SectionHead label={t.type} hint={multiHint} />
        <div className="grid grid-cols-4 gap-2">
          {mediaTypes.map(it => (
            <Tile key={it.id} item={it} selected={selTypes.includes(it.id)} onClick={() => onType(it.id)} />
          ))}
        </div>
      </Card>

      {/* Durée */}
      <Card>
        <SectionHead label={t.duration} />
        <div className="grid grid-cols-4 gap-2">
          {durations.map(it => (
            <Tile key={it.id} item={it} selected={duration === it.id} onClick={() => onDuration(it.id)} sub={hints[it.id]} />
          ))}
        </div>
      </Card>

      {/* Pays d'origine */}
      <Card>
        <SectionHead label={t.country} hint={multiHint} />
        <div className="grid grid-cols-3 gap-2">
          {countries.map(it => (
            <Tile key={it.id} item={it} selected={selCountries.includes(it.id)} onClick={() => onCountry(it.id)} />
          ))}
        </div>
      </Card>

      {/* Coups de cœur amis */}
      <button
        onClick={onFriendToggle}
        className="group flex items-center gap-3 rounded-2xl border border-white/6 bg-white/3 px-3.5 py-3 text-left transition hover:bg-white/5"
        style={friendOn ? { borderColor: "rgba(139,92,246,.35)", background: "rgba(139,92,246,.07)" } : undefined}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
          style={{ background: friendOn ? GRADIENT_PRIMARY : "rgba(var(--fg-rgb),0.06)", boxShadow: friendOn ? "0 6px 18px rgba(109,91,255,.35)" : "none" }}>
          ❤️
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">{t.friendRecs}</span>
          <span className="block truncate text-xs font-semibold text-slate-300">{t.friendToggle.replace(/^❤️\s*/, "")}</span>
        </span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${friendOn ? "" : "bg-white/15"}`}
          style={friendOn ? { background: GRADIENT_PRIMARY } : undefined}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${friendOn ? "translate-x-4" : "translate-x-0.5"}`} />
        </span>
      </button>

      {/* Exclusions */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-white/6 bg-white/3 px-3.5 py-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[11px] font-medium text-slate-400">{t.excludedCount(excludedCount)}</span>
      </div>
    </div>
  );
}
