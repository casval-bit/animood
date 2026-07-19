export function Spinner({ small, label }) {
  const size = small ? "h-[18px] w-[18px] border-2" : "h-7 w-7 border-[3px]";
  return (
    <div className={`flex items-center justify-center gap-2 ${small ? "p-2" : "p-10"}`}>
      <div className={`${size} animate-spin rounded-full border-white/10 border-t-violet-400`} />
      {label && <span className="text-xs text-slate-500">{label}</span>}
    </div>
  );
}
