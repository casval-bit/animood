import { useState } from "react";
import { GLASS, GLASS_STYLE, GRADIENT_TEXT } from "../../constants/theme.js";

function initials(name = "") {
  const words = name.split(/\s+/).filter(Boolean);
  if(words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function nameColor(name = "") {
  let hash = 0;
  for(let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
}

function StudioLogo({ studio }) {
  const [broken, setBroken] = useState(false);
  if(studio.logo && !broken) {
    return <img src={studio.logo} alt={studio.name} onError={() => setBroken(true)} className="h-full w-full object-contain p-2" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-base font-black tracking-tight text-white" style={{ background: `linear-gradient(135deg, ${nameColor(studio.name)}, rgba(0,0,0,.35))` }}>
      {initials(studio.name)}
    </div>
  );
}

export function MemberCard({ u, onOpenUser, t }) {
  const avatar = u.avatar_base64 || (u.avatar?.startsWith?.("http") ? u.avatar : null);
  return (
    <button onClick={()=>onOpenUser(u.username)}
      className={`flex items-center gap-3 p-3.5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/15 ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-violet-600 to-fuchsia-500 text-lg">
        {avatar ? <img src={avatar} alt={u.name} className="h-full w-full object-cover"/> : (u.avatar||"👤")}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-black ${GRADIENT_TEXT}`}>{u.name||u.username}</div>
        <div className="mt-0.5 text-[10px] text-slate-500">
          @{u.username}{u.watched?.length ? t.memberWatchedCount(u.watched.length) : ""}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {u.followerCount !== undefined && (
            <>
              <span className="text-[10px] text-slate-400"><span className="font-bold text-slate-300">{u.followerCount}</span> {t.followerWord(u.followerCount)}</span>
              <span className="text-slate-600">·</span>
              <span className="text-[10px] text-slate-400"><span className="font-bold text-slate-300">{u.followingCount}</span> {t.followingWord(u.followingCount)}</span>
            </>
          )}
          {u.isFollowing && <span className="text-[9px] font-bold text-violet-400 bg-violet-400/10 rounded-full px-1.5 py-0.5">{t.followingBadge}</span>}
          {u.isFollower && <span className="text-[9px] font-bold text-slate-400 bg-white/5 rounded-full px-1.5 py-0.5">{t.followerBadge}</span>}
        </div>
        {u.bio && <div className="mt-0.5 text-[10px] italic text-slate-400 truncate">{u.bio}</div>}
      </div>
      <span className="text-slate-600">›</span>
    </button>
  );
}

export function StudioCard({ studio, onClick, t }) {
  return (
    <button onClick={onClick} className={`group flex flex-col gap-3 p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/15 ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <StudioLogo studio={studio} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[15px] font-black text-slate-100">{studio.name}</div>
            {studio.country && (
              <span className="shrink-0 rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">{studio.country.emoji} {studio.country.label}</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500">{studio.count ? t.studioPopularCount(studio.count) : t.studioAnimationDefault}</div>
        </div>
        <span className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5">›</span>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-400">{studio.blurb}</p>
      {studio.titles?.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {studio.titles.map(title => <span key={title} className="rounded-full bg-indigo-400/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">{title}</span>)}
        </div>
      )}
    </button>
  );
}

export function ArtistCard({ artist, onClick, t }) {
  return (
    <button onClick={onClick} className={`group flex items-center gap-3 p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/15 ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 text-base font-black tracking-tight text-white"
        style={{ background: `linear-gradient(135deg, ${nameColor(artist.name)}, rgba(0,0,0,.35))` }}>
        {initials(artist.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-black text-slate-100">{artist.name}</div>
        <div className="text-[10px] text-slate-500">{t.artistThemeCount(artist.themes.length)}</div>
      </div>
      <span className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5">›</span>
    </button>
  );
}
