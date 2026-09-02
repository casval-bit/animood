// ─── Shared profile photo — avatar_base64 > http avatar URL > emoji/initials ──
export function Avatar({ profile, size = 40, fallback, className = "" }) {
  const src = profile?.avatar_base64 || (profile?.avatar?.startsWith?.("http") ? profile.avatar : null);
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/8 font-black text-slate-300 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (profile?.avatar || fallback || "👤")}
    </div>
  );
}
