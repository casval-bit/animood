import { useState } from "react";

export function ScoreChart({ ratings }) {
  const [tooltip, setTooltip] = useState(null);
  const counts = Array(10).fill(0);
  Object.values(ratings).forEach(r => { if(r.score >= 1 && r.score <= 10) counts[r.score-1]++; });
  const max = Math.max(...counts, 1);
  return (
    <div className="flex h-14 items-end gap-1">
      {counts.map((c, i) => (
        <div
          key={i}
          onMouseEnter={() => setTooltip(i)}
          onMouseLeave={() => setTooltip(null)}
          className="relative flex flex-1 cursor-pointer flex-col items-center gap-1"
        >
          {tooltip === i && c > 0 && (
            <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/15 bg-black/90 px-2 py-1 text-[11px] font-extrabold text-slate-100">
              {c} animé{c > 1 ? "s" : ""}
            </div>
          )}
          <div
            className="w-full rounded-t"
            style={{
              height: `${Math.max((c/max)*42, c>0?4:2)}px`,
              background: c > 0 ? "linear-gradient(180deg,#c084fc,#818cf8)" : "rgba(var(--fg-rgb),0.06)",
              transition: "height 0.3s",
            }}
          />
          <span className="text-[7px] text-slate-600">{i+1}</span>
        </div>
      ))}
    </div>
  );
}
