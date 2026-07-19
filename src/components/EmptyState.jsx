import { GLASS, GLASS_STYLE } from "../constants/theme.js";

export function EmptyState({ emoji = "😶", title, subtitle }) {
  return (
    <div className={`flex flex-col items-center gap-2 px-6 py-16 text-center text-slate-600 ${GLASS}`} style={GLASS_STYLE}>
      <div className="text-4xl">{emoji}</div>
      {title && <p className="font-bold text-slate-400">{title}</p>}
      {subtitle && <p className="text-xs text-slate-600">{subtitle}</p>}
    </div>
  );
}
