import { useState } from "react";

export function StarRating({ value, onChange }) {
  const [hov, setHov] = useState(null);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <span
          key={n}
          onMouseEnter={() => setHov(n)}
          onMouseLeave={() => setHov(null)}
          onClick={() => onChange(n)}
          className={`cursor-pointer text-lg transition-colors ${n <= (hov ?? value ?? 0) ? "text-amber-400" : "text-slate-700"}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}
