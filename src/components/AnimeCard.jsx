import { getMoodObj } from "../constants/moods.js";
import { getMoodTags, ptsToPct } from "../api/moods.js";
import { GLASS, GLASS_STYLE } from "../constants/theme.js";
import { StarRatingDisplay, QuickActionIcons } from "./ui.jsx";

const FALLBACK_IMG = "https://placehold.co/300x450/1a1a2e/818cf8?text=?";

function posterUrl(anime) {
  return anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || anime.image_url || anime.large_image;
}

// ─── Full card — poster + title + meta + genres (+ optional mood tags) ────────
export function AnimeCard({ anime, onClick, statusDot, moodPts, className = "", quickAction = "watched" }) {
  const img = posterUrl(anime);
  const genres = (anime.genres || []).map(g => g.name || g).slice(0, 2);
  const tags = moodPts ? getMoodTags(moodPts) : [];
  const pct = moodPts ? ptsToPct(moodPts) : {};
  const eps = anime.episodes;

  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onClick?.(anime)}
      onKeyDown={e => { if(e.key==="Enter"||e.key===" ") { e.preventDefault(); onClick?.(anime); } }}
      className={`group flex cursor-pointer flex-col overflow-hidden text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/15 ${GLASS} ${className}`}
      style={GLASS_STYLE}
    >
      <div className="relative aspect-2/3 w-full overflow-hidden bg-black/20">
        <img
          src={img || FALLBACK_IMG}
          alt={anime.title}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          onError={e => { e.target.src = FALLBACK_IMG; }}
        />
        <QuickActionIcons anime={anime} variant={quickAction} />
        {anime.score && (
          <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5">
            <StarRatingDisplay score={anime.score} />
          </div>
        )}
        {statusDot && (
          <div className="absolute bottom-1.5 left-1.5 h-2 w-2 rounded-full" style={{ background: statusDot, boxShadow: `0 0 4px ${statusDot}` }} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <div className="line-clamp-2 text-[12.5px] font-extrabold leading-tight text-slate-100">{anime.title}</div>
        <div className="text-[10px] text-slate-500">
          {anime.year || anime.aired?.prop?.from?.year || "?"} · {anime.type || "?"}{eps ? ` · ${eps} eps` : ""}
        </div>
        {genres.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {genres.map(g => (
              <span key={g} className="rounded bg-indigo-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300">{g}</span>
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {tags.map(mid => {
              const m = getMoodObj(mid);
              if(!m) return null;
              return (
                <span key={mid} className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}40` }}>
                  {m.emoji} {pct[mid] || 0}%
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Poster-only tile — favorites slots, "derniers complétés", journal grid ───
export function AnimePoster({ anime, onClick, statusDot, empty, onEmptyClick, loading }) {
  if(empty) {
    return (
      <button
        onClick={onEmptyClick}
        className="flex aspect-2/3 items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-white/3 text-xl text-white/20 transition hover:border-white/20 hover:text-white/40"
      >
        {onEmptyClick ? "+" : ""}
      </button>
    );
  }
  const img = anime ? posterUrl(anime) : null;
  return (
    <button
      onClick={() => anime && onClick?.(anime)}
      className="group relative aspect-2/3 overflow-hidden rounded-xl border border-white/8 bg-white/4 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_10px_30px_rgba(0,0,0,.4)]"
    >
      {loading && !img && (
        <div className="flex h-full w-full items-center justify-center"><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" /></div>
      )}
      {img && (
        <img src={img} alt={anime?.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" onError={e => { e.target.src = FALLBACK_IMG; }} />
      )}
      {statusDot && <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full" style={{ background: statusDot, boxShadow: `0 0 4px ${statusDot}` }} />}
    </button>
  );
}
