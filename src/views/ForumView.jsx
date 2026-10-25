import { useState, useEffect, useRef } from "react";
import { fetchNewAnime, fetchUpcomingAnime, supabaseRowToAnime } from "../api/jikan.js";
import { fetchAiredDates } from "../api/anilist.js";
import { sb, follows } from "../api/supabase.js";
import { topMoods } from "../api/moods.js";
import { MOODS, getMoodObj } from "../constants/moods.js";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { NewThreadModal, ThreadModal, TagPill, timeAgo } from "../components/ForumThreadModal.jsx";
import { Avatar } from "../components/Avatar.jsx";
import { MoodOctagon } from "../components/MoodOctagon.jsx";
import { WordleGame, PosterGame, OpQuizGame } from "../components/MiniGames.jsx";
import { Matchmaking, ChainGame, TimelineGame, CluescaleMatchmaking, CluescaleGame, UndercoverLobby, UndercoverGame } from "../components/GameSystem.jsx";
import { TierlistStudio } from "../components/Tierlist.jsx";
import { GameModal } from "../components/Modal.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";
import { FORUM_I18N } from "../constants/forumI18n.js";
import { isDesktopApp } from "../utils/streamingLinks.js";
import { ForumExplorer } from "../components/ForumExplorer.jsx";

const FALLBACK_IMG = "https://placehold.co/64x92/1a1a2e/818cf8?text=?";
const TYPE_EMOJI = { TV:"📺", Movie:"🎬", OVA:"💿", ONA:"🌐", Special:"✨" };
// Rows shown per section before the "Voir plus" toggle.
const SECTION_PREVIEW = 8;
const DISCUSSIONS_PREVIEW = 6;
const NEW_ANIME_PREVIEW = 5; // desktop : nouveautés visibles dans la grille
const LEADERBOARD_SIZE = 10;
const TAB_KEY = "animood_forum_tab";
const TABS = ["discussions", "airing", "upcoming", "popular"];

function posterUrl(anime) {
  return anime.large_image || anime.image_url || anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
}

// Real countdown once AniList gives us a day-level date; falls back to the year
// we already have (from Jikan) rather than showing nothing while it loads.
function countdownLabel(anime, airedDates, t) {
  const date = airedDates[anime.mal_id];
  if(date) {
    const days = Math.ceil((date - Date.now()) / 86400000);
    if(days > 1) return t.countdownDays(days);
    if(days === 1) return t.countdownTomorrow;
    if(days === 0) return t.countdownToday;
    return t.countdownSoon;
  }
  return anime.year ? t.countdownYear(anime.year) : t.countdownUnknown;
}

function defaultStat(anime) {
  return { primary: anime.score ? `★ ${anime.score}` : "—", secondary: anime.episodes ? `${anime.episodes} eps` : "?" };
}

// ─── One row = one "sujet" — thumbnail, title, blurb, stats, type/year ─────────
function ThreadRow({ anime, onClick, metaLabel, trailerLink, convLink, statOverride, dominantMood, t, compact = false }) {
  const img = posterUrl(anime);
  const genres = (anime.genres || []).map(g => g.name || g).slice(0, 3).join(" · ");
  const stat = (statOverride || defaultStat)(anime);
  const [convThreads, setConvThreads] = useState(null);
  const [showConvMenu, setShowConvMenu] = useState(false);
  const [openThread, setOpenThread] = useState(null);
  const { myUsername } = useApp();

  // Fetched on first open of the menu rather than on mount — a section of 24
  // airing rows would otherwise fire 24 queries just to render the page.
  useEffect(() => {
    if(!showConvMenu || convThreads || !anime.mal_id) return;
    sb.query(`forum_threads?anime_id=eq.${anime.mal_id}&order=created_at.desc&limit=2`)
      .then(rows => setConvThreads(rows || []))
      .catch(() => setConvThreads([]));
  }, [showConvMenu, convThreads, anime.mal_id]);

  return (
    <div className="flex w-full items-center gap-3.5 border-b border-white/6 px-4 py-3 transition last:border-b-0 hover:bg-white/5 sm:gap-4 sm:px-5">
      <button onClick={() => onClick?.(anime)} className="flex min-w-0 flex-1 items-center gap-3.5 text-left sm:gap-4">
        <img loading="lazy" decoding="async"
          src={img || FALLBACK_IMG} alt=""
          onError={e => { e.target.src = FALLBACK_IMG; }}
          className="h-14 w-10 shrink-0 rounded-md object-cover shadow-md"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold text-slate-100">{anime.title}</div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[11px] text-slate-500">{genres || anime.type || t.animeFallback}</span>
            {dominantMood && (
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: `${dominantMood.color}20`, color: dominantMood.color }}>
                {dominantMood.emoji} {dominantMood.label}
              </span>
            )}
          </div>
        </div>
        {stat.primary && (
          <div className="hidden shrink-0 flex-col items-end gap-0.5 text-right sm:flex">
            <div className="text-[12px] font-black text-amber-400">{stat.primary}</div>
            {stat.secondary && <div className="text-[10px] text-slate-600">{stat.secondary}</div>}
          </div>
        )}
        {(anime.year || anime.type) && (
          <div className={`hidden w-32 shrink-0 items-center gap-2 border-l border-white/6 pl-3 ${compact ? "" : "md:flex"}`}>
            <div className="min-w-0">
              {!(trailerLink && anime.trailer?.url) && metaLabel && (
                <div className="truncate text-[11px] font-semibold text-slate-300">{metaLabel(anime)}</div>
              )}
              {(anime.year || anime.type) && (
                <div className="truncate text-[10px] text-slate-600">
                  {[anime.year, anime.type].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          </div>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {trailerLink && (
          <a
            href={anime.trailer?.url || `https://youtube.com/results?search_query=${encodeURIComponent(anime.title + " trailer")}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="shrink-0 rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-bold text-slate-100 transition hover:bg-white/15"
          >
            {anime.trailer?.url ? t.trailerBtn : t.searchTrailer}
          </a>
        )}
        {convLink && (
          <div className="relative">
            <button
              onClick={e=>{e.stopPropagation();setShowConvMenu(p=>!p);}}
              className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition"
              style={{background:"rgba(124,58,237,0.15)",color:"#c084fc",border:"1px solid rgba(124,58,237,0.2)"}}>
              {t.convBtn}
            </button>
            {showConvMenu && (
              <div className="fixed inset-0 z-40" onClick={e=>{e.stopPropagation();setShowConvMenu(false);}} />
            )}
            {showConvMenu && (
              <div onClick={e=>e.stopPropagation()}
                style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:50,
                  background:"#161226",border:"1px solid rgba(255,255,255,0.1)",
                  borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
                  minWidth:220,padding:8}}>
                {!convThreads ? (
                  <div style={{fontSize:10,color:"var(--text-4)",padding:"6px 10px"}}>{t.loading}</div>
                ) : convThreads.length > 0 ? convThreads.map(th => (
                  <button key={th.id} onClick={()=>{setOpenThread(th);setShowConvMenu(false);}}
                    style={{display:"block",width:"100%",textAlign:"left",padding:"8px 10px",
                      borderRadius:8,background:"none",border:"none",cursor:"pointer",
                      color:"var(--text-1)",fontSize:11,fontWeight:600}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                    onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    💬 {th.title}
                  </button>
                )) : (
                  <div style={{fontSize:10,color:"var(--text-4)",padding:"6px 10px"}}>{t.noConversation}</div>
                )}
                <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",marginTop:4,paddingTop:4}}>
                  <button onClick={()=>{onClick?.(anime);setShowConvMenu(false);}}
                    style={{display:"block",width:"100%",textAlign:"left",padding:"6px 10px",
                      borderRadius:8,background:"none",border:"none",cursor:"pointer",
                      color:"#c084fc",fontSize:11,fontWeight:700}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(124,58,237,0.08)"}
                    onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    {t.newDiscussion}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {openThread && (
        <ThreadModal thread={openThread} username={myUsername}
          onClose={()=>setOpenThread(null)} onOpenUser={null}/>
      )}
    </div>
  );
}

// ─── One category = banner header + list of rows, à la forum sub-section ──────
// `maxVisible` trims long lists (e.g. "Nouveaux animes") behind a "Voir plus" toggle
// so obscure/low-interest entries don't dominate the page by default.
function ForumCategory({ emoji, title, subtitle, items, onOpenDetail, metaLabel, trailerLink, convLink, statOverride, dominantMoods, maxVisible, t, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  if(!items.length) return null;
  const visible = maxVisible && !expanded ? items.slice(0, maxVisible) : items;

  return (
    <div className={`${compact ? "" : "mb-6"} overflow-hidden ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{
        background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div>
          <div className="text-[13px] font-black tracking-wide" style={{color:"var(--text-1)"}}>{title}</div>
          {subtitle && <div className="text-[10.5px]" style={{color:"var(--text-4)"}}>{subtitle}</div>}
        </div>
        <div className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold"
          style={{background:"rgba(124,58,237,0.15)",color:"#c084fc",border:"1px solid rgba(124,58,237,0.2)"}}>
          {t.topicCount(items.length)}
        </div>
      </div>
      <div>
        {visible.map(a => (
          <ThreadRow
            key={a.mal_id} anime={a} onClick={onOpenDetail} metaLabel={metaLabel}
            trailerLink={trailerLink} convLink={convLink} statOverride={statOverride}
            dominantMood={dominantMoods?.[a.mal_id]} t={t} compact={compact}
          />
        ))}
      </div>
      {maxVisible && items.length > maxVisible && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full border-t border-white/6 px-5 py-2.5 text-center text-[11px] font-bold text-violet-300 transition hover:bg-white/5"
        >
          {expanded ? t.seeLess : t.seeMore(items.length - maxVisible)}
        </button>
      )}
    </div>
  );
}

// ─── Hero card — the single upcoming anime with the best real MAL popularity rank ──
function AnticipatedCard({ anime, airedDates, onOpenDetail, t, flush = false }) {
  if(!anime) return null;
  const img = posterUrl(anime);
  const genres = (anime.genres || []).map(g => g.name || g).slice(0, 3).join(" · ");
  const hasTrailer = !!anime.trailer?.url;
  return (
    <div
      className={`${flush ? "h-full" : "mb-6"} flex w-full items-center gap-5 overflow-hidden p-5 text-left ${GLASS}`}
      style={{ background: `linear-gradient(135deg, rgba(139,92,246,.22), rgba(236,72,153,.14)), ${GLASS_STYLE.background}`, boxShadow: GLASS_STYLE.boxShadow }}
    >
      <button onClick={() => onOpenDetail?.(anime)} className="flex min-w-0 flex-1 items-center gap-5 text-left">
        <img loading="lazy" decoding="async" src={img || FALLBACK_IMG} alt="" onError={e => { e.target.src = FALLBACK_IMG; }} className="h-32 w-24 shrink-0 rounded-xl object-cover shadow-lg sm:h-36 sm:w-26" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-fuchsia-300">{t.mostAnticipated}</div>
          <div className="mb-1 truncate text-[19px] font-black text-slate-50 sm:text-[22px]">{anime.title}</div>
          <div className="mb-3 truncate text-[11.5px] text-slate-400">{genres || anime.type}</div>
          <div className="flex items-center gap-2">
            <div className={`inline-block rounded-full bg-white/10 px-3 py-1.5 font-bold text-white ${hasTrailer ? "text-[10.5px] text-white/70" : "text-[12px]"}`}>
              {countdownLabel(anime, airedDates, t)}
            </div>
          </div>
        </div>
      </button>
      <a
        href={anime.trailer?.url || `https://youtube.com/results?search_query=${encodeURIComponent(anime.title + " trailer")}`}
        target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-black text-violet-700 shadow-md transition hover:scale-105 hover:shadow-lg"
      >
        {hasTrailer ? t.trailerBtn : t.searchTrailer}
      </a>
    </div>
  );
}

// ─── Community mood pulse — real aggregation of user_votes.moods over 7 days ──
function CommunityMoodBlock({ loaded, counts, total, t }) {
  if(!loaded) return null;
  const ranked = MOODS.map(m => ({ ...m, count: counts[m.id] || 0 }))
    .sort((a, b) => b.count - a.count)
    .filter(m => m.count > 0)
    .map(m => ({ ...m, pct: Math.round((m.count / total) * 100) }));

  return (
    <div className={`mb-6 p-5 ${GLASS}`} style={GLASS_STYLE}>
      <div className="mb-0.5 text-[13px] font-black text-slate-100">{t.communityMood}</div>
      {total === 0 ? (
        <div className="mt-1 text-[11px] text-slate-500">{t.communityMoodEmpty}</div>
      ) : (
        <>
          <div className="mb-4 text-[10.5px] text-slate-500">{t.communityMoodSubtitle(total)}</div>
          <MoodOctagon
            pts={counts} size={190} title={null}
            className="mx-auto mb-4 w-fit rounded-xl border border-white/6 bg-white/3 p-2.5"
          />
          <div className="flex flex-col gap-2">
            {ranked.map(m => (
              <div key={m.id} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-300">{m.emoji} {m.label}</span>
                <span className="shrink-0 text-[11px] font-bold text-slate-400">{m.pct}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Humeur de la communauté — version large (desktop) ─────────────────────────
// Trois lectures des mêmes votes (7 derniers jours) : classement, tendance du jour, moment de la journée.
const SLOTS = [
  { id: "morning", fr: "Matin", en: "Morning", icon: "🌅", from: 6, to: 12 },
  { id: "afternoon", fr: "Après-midi", en: "Afternoon", icon: "☀️", from: 12, to: 18 },
  { id: "evening", fr: "Soir", en: "Evening", icon: "🌆", from: 18, to: 24 },
  { id: "night", fr: "Nuit", en: "Night", icon: "🌙", from: 0, to: 6 },
];
function CommunityMoodWide({ loaded, counts, total, rows = [], lang = "fr", t }) {
  const [view, setView] = useState("ranking");
  if(!loaded) return null;
  const en = lang === "en";
  const ranked = MOODS.map(m => ({ ...m, count: counts[m.id] || 0, pct: total ? Math.round(((counts[m.id] || 0) / total) * 100) : 0 })).sort((a, b) => b.count - a.count);
  const top = ranked[0];
  const max = Math.max(1, ...ranked.map(m => m.count));

  // Tendance : part de chaque mood dans les dernières 24 h comparée à celle des 6 jours précédents.
  const dayAgo = Date.now() - 86400000;
  const tally = (list) => { const c = {}; let n = 0; list.forEach(r => (r.moods || []).forEach(m => { c[m] = (c[m] || 0) + 1; n++; })); return { c, n }; };
  const recent = tally(rows.filter(r => r.voted_at && new Date(r.voted_at).getTime() >= dayAgo));
  const before = tally(rows.filter(r => r.voted_at && new Date(r.voted_at).getTime() < dayAgo));
  const trend = MOODS.map(m => {
    const a = recent.n ? (recent.c[m.id] || 0) / recent.n : 0, b = before.n ? (before.c[m.id] || 0) / before.n : 0;
    return { ...m, delta: Math.round((a - b) * 100), today: recent.c[m.id] || 0 };
  }).sort((x, y) => y.delta - x.delta);
  const tmax = Math.max(1, ...trend.map(m => Math.abs(m.delta)));

  // Moment de la journée
  const slots = SLOTS.map(s => {
    const c = {}; let n = 0;
    rows.forEach(r => { if(!r.voted_at) return; const h = new Date(r.voted_at).getHours(); if(h >= s.from && h < s.to) (r.moods || []).forEach(m => { c[m] = (c[m] || 0) + 1; n++; }); });
    const lead = MOODS.map(m => ({ ...m, c: c[m.id] || 0 })).sort((x, y) => y.c - x.c)[0];
    return { ...s, c, n, lead: n ? lead : null };
  });
  const smax = Math.max(1, ...slots.map(s => s.n));

  const tabs = [["ranking", en ? "Ranking" : "Classement"], ["trend", en ? "Today" : "Aujourd'hui"], ["day", en ? "Time of day" : "Moment"]];

  return (
    <div className={`flex h-full flex-col p-5 ${GLASS}`} style={{ ...GLASS_STYLE, minHeight: 290 }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-black text-slate-100">{t.communityMood}</div>
          <div className="text-[10.5px] text-slate-500">{total === 0 ? t.communityMoodEmpty : t.communityMoodSubtitle(total)}</div>
        </div>
        {total > 0 && (
          <div className="flex shrink-0 gap-0.5 rounded-lg border border-white/8 bg-white/3 p-0.5">
            {tabs.map(([id, label]) => (
              <button key={id} onClick={() => setView(id)} className="rounded-md px-2.5 py-1 text-[10.5px] font-bold transition"
                style={view === id ? { background: "rgba(124,58,237,.28)", color: "#e9e5ff" } : { color: "rgb(148,163,184)" }}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {total > 0 && view === "ranking" && (
        <>
          <div className="mb-3 flex items-center gap-3 rounded-xl border px-3.5 py-2.5" style={{ borderColor: top.color + "44", background: `linear-gradient(90deg, ${top.color}1c, transparent)` }}>
            <span className="text-[28px] leading-none" style={{ filter: `drop-shadow(0 0 10px ${top.color})` }}>{top.emoji}</span>
            <div>
              <div className="text-[9.5px] font-bold uppercase tracking-widest text-slate-500">{en ? "The community mostly feels" : "La communauté ressent surtout"}</div>
              <div className="text-[15px] font-extrabold" style={{ color: top.color }}>{top.label} <span className="text-[12px] font-bold text-slate-400">· {top.pct}%</span></div>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 content-between gap-x-5 gap-y-2">
            {ranked.map(m => (
              <div key={m.id} className="min-w-0">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-300"><span className="truncate">{m.emoji} {m.label}</span><span className="text-slate-500">{m.pct}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/6"><div className="h-full rounded-full" style={{ width: `${(m.count / max) * 100}%`, background: `linear-gradient(90deg, ${m.color}88, ${m.color})`, boxShadow: `0 0 8px ${m.color}66`, transition: "width .6s" }} /></div>
              </div>
            ))}
          </div>
        </>
      )}

      {total > 0 && view === "trend" && (
        <div className="flex flex-1 flex-col justify-between gap-1.5">
          <div className="mb-1 text-[10.5px] text-slate-500">{en ? "Share of votes in the last 24 h vs the days before" : "Part des votes sur les dernières 24 h comparée aux jours d'avant"}</div>
          {trend.map(m => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="w-22 shrink-0 truncate text-[11px] font-semibold text-slate-300">{m.emoji} {m.label}</span>
              <div className="relative h-2 flex-1 rounded-full bg-white/5">
                <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-white/20" />
                <div className="absolute top-0 h-full rounded-full" style={{ width: `${(Math.abs(m.delta) / tmax) * 50}%`, [m.delta >= 0 ? "left" : "right"]: "50%", background: m.delta >= 0 ? m.color : "rgba(148,163,184,.55)", boxShadow: m.delta >= 0 ? `0 0 8px ${m.color}77` : "none" }} />
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] font-bold" style={{ color: m.delta > 0 ? "#34d399" : m.delta < 0 ? "#f87171" : "rgb(100,116,139)" }}>{m.delta > 0 ? "▲" : m.delta < 0 ? "▼" : "•"} {Math.abs(m.delta)}</span>
            </div>
          ))}
        </div>
      )}

      {total > 0 && view === "day" && (
        <div className="grid flex-1 grid-cols-4 gap-3">
          {slots.map(s => (
            <div key={s.id} className="flex min-w-0 flex-col items-center">
              <div className="mb-1 h-6 text-[18px] leading-6" title={s.lead ? s.lead.label : ""}>{s.lead ? s.lead.emoji : "·"}</div>
              <div className="flex w-full max-w-14 flex-1 flex-col-reverse overflow-hidden rounded-lg bg-white/4" style={{ minHeight: 96 }}>
                <div className="flex flex-col-reverse overflow-hidden rounded-lg" style={{ height: `${(s.n / smax) * 100}%`, transition: "height .6s" }}>
                  {MOODS.map(m => s.c[m.id] ? <div key={m.id} title={`${m.label} ${s.c[m.id]}`} style={{ flex: s.c[m.id], background: m.color, opacity: m === s.lead ? 1 : 0.62 }} /> : null)}
                </div>
              </div>
              <div className="mt-1.5 text-[10.5px] font-bold text-slate-300">{s.icon} {en ? s.en : s.fr}</div>
              <div className="text-[9.5px] text-slate-500">{s.lead ? s.lead.label : "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiscussionsBlock({ threads, replyCounts, unreadCounts, loaded, profileCache, onOpenThread, onNewThread, t, lang }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? threads : threads.slice(0, DISCUSSIONS_PREVIEW);
  return (
    <div className={`mb-6 overflow-hidden ${GLASS}`} style={GLASS_STYLE}>
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
        <div className="text-[13px] font-black uppercase tracking-wide text-white">{t.discussions}</div>
        <button onClick={onNewThread}
          className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[12px] font-black text-violet-700 shadow-md transition hover:scale-105 hover:shadow-lg">
          {t.newTopicBtn}
        </button>
      </div>

      {!loaded ? (
        <div className="p-4"><Spinner small label={t.loading} /></div>
      ) : threads.length === 0 ? (
        <div className="p-6 text-center">
          <div className="mb-1 text-sm font-bold text-slate-300">{t.noDiscussions}</div>
          <div className="mb-4 text-[11px] text-slate-500">{t.noDiscussionsSub}</div>
          <button onClick={onNewThread}
            className="rounded-xl bg-linear-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white">
            {t.createTopicBtn}
          </button>
        </div>
      ) : (
        <div>
          {visible.map(th => {
            const unread = unreadCounts[th.id] || 0;
            const profile = profileCache[th.username];
            return (
              <button
                key={th.id} onClick={() => onOpenThread(th)}
                className="flex w-full items-start gap-3 border-b border-white/6 px-5 py-3.5 text-left transition last:border-b-0 hover:bg-white/5"
              >
                <Avatar profile={profile} size={36} fallback={th.username.slice(0,2).toUpperCase()} className="mt-0.5 text-[11px]"/>
                {th.image_url && (
                  <img loading="lazy" decoding="async" src={th.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" onError={e=>{e.target.style.display="none";}} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-slate-100">💬 {th.title}</div>
                  <div className="mb-1 truncate text-[11px] text-slate-500">
                    <span className={`font-bold ${GRADIENT_TEXT}`}>{profile?.name || th.username}</span> · @{th.username} · {timeAgo(th.created_at, lang)}
                  </div>
                  {th.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {th.tags.map(id => <TagPill key={id} id={id} />)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className={`text-[11px] font-bold ${unread > 0 ? "text-slate-100" : "text-slate-400"}`}>
                    {t.replyCount(replyCounts[th.id] || 0)}
                  </div>
                  {unread > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-[3px] text-[9px] font-black leading-none text-white" style={{ background: "#f43f5e" }}>
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {threads.length > DISCUSSIONS_PREVIEW && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full border-t border-white/6 px-5 py-2.5 text-center text-[11px] font-bold text-violet-300 transition hover:bg-white/5"
            >
              {expanded ? t.seeLess : t.seeMore(threads.length - DISCUSSIONS_PREVIEW)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Section switcher — one section at a time instead of one endless column.
function ForumTabs({ tab, onChange, badges, t }) {
  return (
    <div className="mb-5 flex gap-1.5 overflow-x-auto rounded-2xl border border-white/8 bg-white/3 p-1.5">
      {TABS.map(id => {
        const active = tab === id;
        return (
          <button
            key={id} onClick={() => onChange(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold transition sm:flex-1 sm:justify-center ${active ? "text-white shadow-md" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
            style={active ? { background: GRADIENT_PRIMARY } : undefined}
          >
            {t.tabs[id]}
            {badges[id] > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-[3px] text-[9px] font-black leading-none text-white" style={{ background: "#f43f5e" }}>
                {badges[id] > 9 ? "9+" : badges[id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Unified game panel: a 2-column grid of buttons (each showing the player's own
// score for that game) plus an inline top-10 leaderboard ranked by points_total,
// with the player's own rank shown below it when they're outside the top 10.
function GamePanel({ myUsername, following, onWordle, onPoster, onOpQuiz, onChain, onTimeline, onCluescale, onUndercover, onTierlist, t }) {
  const [elo, setElo]                 = useState(null);
  const [hover, setHover]             = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank]           = useState(null);

  useEffect(() => {
    if(!myUsername) return;
    sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`)
      .then(r => { if(r?.[0]) setElo(r[0]); })
      .catch(()=>{});
  }, [myUsername]);

  useEffect(() => {
    // Total recomputed client-side from the per-game columns so Undercover
    // points count even where the server-side points_total lags behind.
    sb.query("game_elo?select=username,elo_chain,elo_timeline,pts_wordle,pts_poster,pts_opquiz,pts_cluescale,pts_undercover&limit=200")
      .then(rows => {
        if(!rows?.length) return;
        const ranked = rows.map(r => ({
          username: r.username,
          total: (r.elo_chain||400)+(r.elo_timeline||400)+(r.pts_wordle||0)+(r.pts_poster||0)+(r.pts_opquiz||0)+(r.pts_cluescale||0)+(r.pts_undercover||0),
        })).sort((a,b)=>b.total-a.total);
        setLeaderboard(ranked.slice(0,LEADERBOARD_SIZE));
        const pos = ranked.findIndex(r => r.username === myUsername);
        setMyRank(pos>=0 ? {rank:pos+1, points_total:ranked[pos].total} : null);
      }).catch(()=>{});
  }, [myUsername]);

  const followingSet = new Set(following||[]);
  function usernameColor(u) {
    if(u===myUsername) return "#c084fc";
    if(followingSet.has(u)) return "#22c55e";
    return "var(--text-2)";
  }

  const GAMES = [
    {id:"wordle",    emoji:"🎯", label:t.wordleLabel,    color:"124,58,237", pts:elo?.pts_wordle||0,     onClick:onWordle,   type:"solo"},
    {id:"poster",    emoji:"🖼", label:t.posterLabel,    color:"236,72,153", pts:elo?.pts_poster||0,     onClick:onPoster,   type:"solo"},
    {id:"opquiz",    emoji:"🎵", label:t.opquizLabel,    color:"56,189,248", pts:elo?.pts_opquiz||0,     onClick:onOpQuiz,   type:"solo"},
    {id:"chain",     emoji:"⛓", label:t.chainLabel,     color:"251,191,36", pts:elo?.elo_chain||400,    onClick:onChain,    type:"vs"},
    {id:"timeline",  emoji:"📅", label:t.timelineLabel,  color:"34,197,94",  pts:elo?.elo_timeline||400, onClick:onTimeline, type:"vs"},
    {id:"cluescale", emoji:"🎭", label:t.cluescaleLabel, color:"251,113,133",pts:elo?.pts_cluescale||0,  onClick:onCluescale,type:"multi"},
    {id:"undercover",emoji:"🕵️", label:t.undercoverLabel,color:"244,114,182",pts:elo?.pts_undercover||0, onClick:onUndercover,type:"multi"},
    {id:"tierlist",  emoji:"📊", label:t.tierlistLabel,  color:"34,211,238", pts:null,                   onClick:onTierlist, type:"tool"},
  ];

  return (
    <div>
      {/* Vertical tiles of equal height: in a 280px sidebar a horizontal
          emoji/label/score row left the label ~50px and misaligned the
          score-less Tierlist tile. */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:6}}>
        {GAMES.map(g => {
          const isHover = hover===g.id, rgb=g.color;
          return (
            <button key={g.id} onClick={g.onClick}
              onMouseEnter={()=>setHover(g.id)} onMouseLeave={()=>setHover(null)}
              style={{display:"flex",flexDirection:"column",gap:6,padding:"9px 10px",borderRadius:11,cursor:"pointer",minWidth:0,
                border:`1px solid rgba(${rgb},${isHover?0.45:0.22})`,
                background:isHover?`rgba(${rgb},0.15)`:`rgba(${rgb},0.07)`,
                transform:isHover?"translateY(-1px)":"none",
                transition:"all 0.15s",textAlign:"left"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,width:"100%"}}>
                <span style={{fontSize:18,lineHeight:1,width:22,textAlign:"center",flexShrink:0}}>{g.emoji}</span>
                <span style={{fontSize:11,fontWeight:900,color:`rgb(${rgb})`,background:`rgba(${rgb},0.14)`,borderRadius:6,
                  padding:"2px 7px",minWidth:30,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>
                  {g.pts === null ? "→" : elo ? g.pts : "—"}
                </span>
              </div>
              <div style={{minWidth:0,width:"100%"}}>
                <div style={{fontSize:11.5,fontWeight:800,color:`rgb(${rgb})`,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.label}</div>
                <div style={{fontSize:9,fontWeight:600,color:"var(--text-5)",marginTop:1,textTransform:"uppercase",letterSpacing:0.4}}>
                  {g.type==="vs"?"1v1 · elo":g.type==="multi"?"multi":g.type==="tool"?t.gameTypeTool:"solo · pts"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {elo && (
        <div style={{marginTop:7,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:9,
          background:"linear-gradient(90deg,rgba(124,58,237,0.08),rgba(56,189,248,0.05))",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontSize:9,color:"var(--text-5)",fontWeight:700}}>{t.unlocksFramesLabel}</div>
          <div style={{fontSize:13,fontWeight:900,color:"var(--text-1)"}}>{elo ? (elo.elo_chain||400)+(elo.elo_timeline||400)+(elo.pts_wordle||0)+(elo.pts_poster||0)+(elo.pts_opquiz||0)+(elo.pts_cluescale||0)+(elo.pts_undercover||0) : 0}</div>
        </div>
      )}

      {leaderboard.length>0 && (
        <div style={{marginTop:12}}>
          <div style={{fontSize:10,fontWeight:800,color:"var(--text-5)",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{t.leaderboardTitle}</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {leaderboard.map((r,i) => {
              const isMe=r.username===myUsername, isFriend=followingSet.has(r.username);
              const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
              return (
                <div key={r.username} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,
                  background:isMe?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.02)",
                  border:isMe?"1px solid rgba(124,58,237,0.2)":"1px solid transparent"}}>
                  <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{medal||`${i+1}`}</div>
                  <div style={{flex:1,fontSize:10,fontWeight:isMe||isFriend?800:500,color:usernameColor(r.username),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {r.username}{isMe && <span style={{marginLeft:4,fontSize:9,color:"#c084fc"}}>({t.youLabel})</span>}
                  </div>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{r.total}</div>
                </div>
              );
            })}
            {myRank && myRank.rank>LEADERBOARD_SIZE && (
              <>
                <div style={{padding:"3px 8px",textAlign:"center",fontSize:9,color:"var(--text-6)"}}>·  ·  ·</div>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)"}}>
                  <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{myRank.rank}</div>
                  <div style={{flex:1,fontSize:10,fontWeight:800,color:"#c084fc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{myUsername}</div>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{myRank.points_total}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tierlist window: Saison / Année / Perso tabs above the board ──────────────
function TierlistPanel() {
  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      <TierlistStudio/>
    </div>
  );
}

// ── Per-game Elo leaderboard — shown inside the LinkUp/Timeline matchmaking modal ──
function EloLeaderboard({ gameType, myUsername, following }) {
  const { lang } = useLang();
  const t = FORUM_I18N[lang] || FORUM_I18N.fr;
  const [rows, setRows]     = useState([]);
  const [myRank, setMyRank] = useState(null);
  const field = gameType === "chain" ? "elo_chain" : "elo_timeline";
  const followingSet = new Set(following||[]);

  useEffect(() => {
    sb.query(`game_elo?select=username,${field}&order=${field}.desc&limit=200`)
      .then(data => {
        if(!data?.length) return;
        const sorted = [...data].sort((a,b)=>(b[field]||400)-(a[field]||400));
        setRows(sorted.slice(0,20).map((r,i)=>({username:r.username,pts:r[field]||400,rank:i+1})));
        const pos = sorted.findIndex(r=>r.username===myUsername);
        if(pos>=20) setMyRank({rank:pos+1,pts:sorted[pos][field]||400});
      }).catch(()=>{});
  }, [gameType, myUsername]); // eslint-disable-line react-hooks/exhaustive-deps

  if(!rows.length) return null;

  function uColor(u) {
    if(u===myUsername) return "#c084fc";
    if(followingSet.has(u)) return "#22c55e";
    return "var(--text-2)";
  }

  return (
    <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
      <div style={{fontSize:9,fontWeight:800,color:"var(--text-5)",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>
        {t.eloLeaderboardTitle(gameType==="chain" ? t.chainLabel : t.timelineLabel)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {rows.map(r=>{
          const isMe=r.username===myUsername;
          const medal=r.rank===1?"🥇":r.rank===2?"🥈":r.rank===3?"🥉":null;
          return (
            <div key={r.username} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,
              background:isMe?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.02)",
              border:isMe?"1px solid rgba(124,58,237,0.2)":"1px solid transparent"}}>
              <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{medal||r.rank}</div>
              <div style={{flex:1,fontSize:10,fontWeight:isMe||followingSet.has(r.username)?800:500,
                color:uColor(r.username),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {r.username}
              </div>
              <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{r.pts}</div>
            </div>
          );
        })}
        {myRank && (
          <>
            <div style={{padding:"3px 8px",textAlign:"center",fontSize:9,color:"var(--text-6)"}}>· · ·</div>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,
              background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)"}}>
              <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{myRank.rank}</div>
              <div style={{flex:1,fontSize:10,fontWeight:800,color:"#c084fc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{myUsername}</div>
              <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{myRank.pts}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ForumView({ onOpenDetail, onOpenUser, pendingJoinGame, onClearPendingJoin }) {
  const { myUsername, activityNotifications, markActivityRead, blockedUsers } = useApp();
  const [followingList, setFollowingList] = useState([]);
  useEffect(() => {
    if(!myUsername) return;
    follows.getFollowing(myUsername).then(setFollowingList).catch(()=>{});
  }, [myUsername]);
  const { lang } = useLang();
  const t = FORUM_I18N[lang] || FORUM_I18N.fr;
  const [newAnime, setNewAnime] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [airingAnime, setAiringAnime] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [airedDates, setAiredDates] = useState({});
  const [dominantMoods, setDominantMoods] = useState({});

  const [moodCounts, setMoodCounts] = useState({});
  const [moodTotal, setMoodTotal]   = useState(0);
  const [moodRows, setMoodRows]     = useState([]); // desktop : votes bruts (tendance / moment de la journée)
  const [moodLoaded, setMoodLoaded] = useState(false);

  const [favorites, setFavorites]         = useState([]); // [{anime, count}]
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  const [threads, setThreads]         = useState([]);
  const [replyCounts, setReplyCounts] = useState({});
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [profileCache, setProfileCache] = useState({});
  const [showNewThread, setShowNewThread] = useState(false);
  const [explorerKey, setExplorerKey] = useState(0); // desktop : relance l'explorateur après création d'un sujet
  const [openThread, setOpenThread]       = useState(null);
  const [tab, setTab] = useState(() => {
    try { const saved = localStorage.getItem(TAB_KEY); return TABS.includes(saved) ? saved : "discussions"; }
    catch { return "discussions"; }
  });
  const changeTab = (id) => { setTab(id); try { localStorage.setItem(TAB_KEY, id); } catch { /* storage unavailable */ } };
  const [showWordle, setShowWordle]       = useState(false);
  const [showPoster, setShowPoster]       = useState(false);
  const [showOpQuiz, setShowOpQuiz]       = useState(false);
  const [showCluescale, setShowCluescale] = useState(false);
  const [cluescaleRoom, setCluescaleRoom] = useState(null);
  const [showUndercover, setShowUndercover]       = useState(false);
  const [undercoverPlayers, setUndercoverPlayers] = useState(null);
  const [showTierlist, setShowTierlist]           = useState(false);
  const [matchmaking, setMatchmaking]     = useState(null);
  const [activeRoom, setActiveRoom]       = useState(null);
  const [activeGame, setActiveGame]       = useState(null);
  const chainCloseRef    = useRef(null);
  const timelineCloseRef = useRef(null);

  // Auto-join a room after accepting a game invite from the notification bell
  // (Header.jsx → App.jsx switches to this tab and hands us the invite payload).
  useEffect(() => {
    if(!pendingJoinGame) return;
    const { gameType, roomId, privateCode } = pendingJoinGame;
    onClearPendingJoin?.();
    if(gameType === "cluescale") {
      sb.query(`game_rooms?id=eq.${roomId}&limit=1`).then(async rows => {
        const r = rows?.[0];
        if(!r) return;
        const currentPlayers = r.state?.players || [r.player1, r.player2, r.player3, r.player4].filter(Boolean);
        // Register myself as a player (same playerN + state.players bookkeeping
        // as the manual "join with code" path) so the host actually sees me in
        // the lobby, instead of just opening the room read-only.
        if(currentPlayers.includes(myUsername) || currentPlayers.length >= 4) {
          setCluescaleRoom({...r, players: currentPlayers});
          return;
        }
        const newPlayers = [...currentPlayers, myUsername];
        const playerField = `player${newPlayers.length}`;
        await sb.query(`game_rooms?id=eq.${r.id}`, {
          method: "PATCH", headers: { ...sb.headers, "Prefer": "return=minimal" },
          body: JSON.stringify({ [playerField]: myUsername, state: {...r.state, players: newPlayers} }),
        }).catch(()=>{});
        setCluescaleRoom({...r, [playerField]: myUsername, state: {...r.state, players: newPlayers}, players: newPlayers});
      }).catch(()=>{});
    } else {
      sb.query(`game_rooms?private_code=eq.${encodeURIComponent(privateCode)}&status=eq.waiting&limit=1`).then(async rows => {
        const r = rows?.[0];
        if(!r) return;
        await sb.query(`game_rooms?id=eq.${r.id}`, {
          method: "PATCH", headers: { ...sb.headers, "Prefer": "return=minimal" },
          body: JSON.stringify({ player2: myUsername, elo2: 400, status: "active" }),
        }).catch(()=>{});
        setActiveRoom({...r, player2: myUsername, elo2: 400});
        setActiveGame(gameType);
      }).catch(()=>{});
    }
  }, [pendingJoinGame]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGameClose = async (gameRef) => {
    if(gameRef) {
      const confirmed = window.confirm(t.confirmForfeit);
      if(!confirmed) return;
      await gameRef();
    }
    setActiveRoom(null);
    setActiveGame(null);
  };

  // Sourced from the same activityNotifications the header bell reads — so the
  // inline badge below and the bell always agree on what's actually unread.
  const unreadCounts = {};
  (activityNotifications || []).forEach(n => {
    if(n.type === "thread" || n.type === "thread-mention") unreadCounts[n.id] = (unreadCounts[n.id] || 0) + n.count;
  });

  const openThreadRead = (t) => { markActivityRead("thread", t.id); markActivityRead("thread-mention", t.id); setOpenThread(t); };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      sb.query("anime_cache?type=eq.TV&status=eq.Not%20yet%20aired&select=mal_id,title,title_en,synopsis,score,year,episodes,type,image_url,large_image,genres,status,trailer,broadcast&order=popularity.asc.nullslast&limit=30").catch(()=>[]),
      fetchNewAnime(15),
    ]).then(([u, n]) => { if(!cancelled) { setUpcoming(u||[]); setNewAnime(n); } })
      .finally(() => { if(!cancelled) setLoading(false); });
    // Airing TV anime for seasonal section
    sb.query("anime_cache?type=eq.TV&status=eq.Currently%20Airing&select=mal_id,title,title_en,synopsis,score,year,episodes,type,image_url,large_image,genres,status,trailer&order=score.desc.nullslast&limit=24")
      .then(rows => { if(!cancelled && rows?.length) setAiringAnime(rows); })
      .catch(()=>{});
    return () => { cancelled = true; };
  }, []);

  // Progressive enhancement — exact air dates for the countdown, fetched after
  // the upcoming list itself has rendered so it never blocks first paint.
  useEffect(() => {
    if(!upcoming.length) return;
    let cancelled = false;
    fetchAiredDates(upcoming.map(a => a.mal_id), lang).then(dates => { if(!cancelled) setAiredDates(dates); });
    return () => { cancelled = true; };
  }, [upcoming, lang]);

  // Dominant mood per visible anime — one batched query for every row on the page.
  useEffect(() => {
    const ids = [...new Set([...airingAnime, ...upcoming, ...newAnime, ...favorites.map(f => f.anime)].map(a => a.mal_id))];
    if(!ids.length) return;
    let cancelled = false;
    sb.getMoodPtsBatch(ids).then(rows => {
      if(cancelled) return;
      const out = {};
      Object.entries(rows).forEach(([id, pts]) => {
        const [topId] = topMoods(pts, 1)[0] || [];
        if(topId) out[id] = getMoodObj(topId);
      });
      setDominantMoods(out);
    });
    return () => { cancelled = true; };
  }, [airingAnime, upcoming, newAnime, favorites]);

  useEffect(() => {
    let cancelled = false;
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    sb.getRecentMoodVotes(since).then(rows => {
      if(cancelled) return;
      const counts = {};
      let total = 0;
      rows.forEach(r => (r.moods || []).forEach(m => { counts[m] = (counts[m] || 0) + 1; total++; }));
      setMoodCounts(counts);
      setMoodTotal(total);
      setMoodRows(rows);
    }).finally(() => { if(!cancelled) setMoodLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // Real "most favorited" — tallies every profile's pinned favorites (4-slot showcase),
  // no fabricated counts.
  useEffect(() => {
    let cancelled = false;
    sb.getAllFavorites().then(async profiles => {
      if(cancelled) return;
      const counts = {};
      profiles.forEach(p => (p.favorites || []).forEach(id => { if(id) counts[id] = (counts[id] || 0) + 1; }));
      const topIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => parseInt(id));
      if(!topIds.length) { setFavoritesLoaded(true); return; }
      const rows = await sb.getAnimeCacheByIds(topIds).catch(() => []);
      const byId = {}; rows.forEach(r => { byId[r.mal_id] = supabaseRowToAnime(r); });
      const list = topIds.filter(id => byId[id]).map(id => ({ anime: byId[id], count: counts[id] }));
      if(!cancelled) setFavorites(list);
    }).finally(() => { if(!cancelled) setFavoritesLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    sb.listThreads(20).then(async rows => {
      if(cancelled) return;
      const visible = blockedUsers?.size ? rows.filter(t => !blockedUsers.has(t.username)) : rows;
      setThreads(visible);
      const counts = await sb.getReplyCounts(visible.map(r => r.id), [...(blockedUsers||[])]);
      if(!cancelled) setReplyCounts(counts);
      const usernames = [...new Set(visible.map(t => t.username))];
      if(usernames.length) {
        try {
          const profs = await sb.query(`profiles?username=in.(${usernames.map(u=>encodeURIComponent(u)).join(",")})&select=username,name,avatar,avatar_base64`);
          if(!cancelled && profs?.length) {
            const cache = {};
            profs.forEach(p => { cache[p.username] = p; });
            setProfileCache(cache);
          }
        } catch {}
      }
    }).finally(() => { if(!cancelled) setThreadsLoaded(true); });
    return () => { cancelled = true; };
  }, [myUsername, blockedUsers]);

  const mostAnticipated = upcoming.reduce((best, a) => {
    if(a.popularity == null) return best;
    if(!best || a.popularity < best.popularity) return a;
    return best;
  }, null);

  const desktop = isDesktopApp();

  // ── DESKTOP : pas de barre latérale, pas de mini-jeux (onglet Jeux dédié),
  // humeur communautaire en bandeau, recherche avancée, catégories en grille large.
  const empty = !loading && !upcoming.length && !newAnime.length;
  const desktopBody = (
    <>
      <div className="mb-6 animate-slide-up">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight text-slate-50 md:text-[32px]">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      {loading && <Spinner label={t.loadingNews} />}
      {empty && <EmptyState emoji="💬" title={t.emptyTitle} subtitle={t.emptySubtitle} />}

      {!loading && (
        <>
          <div className={`mb-8 grid items-stretch gap-6 ${mostAnticipated ? "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" : ""}`}>
            {mostAnticipated && <AnticipatedCard flush anime={mostAnticipated} airedDates={airedDates} onOpenDetail={onOpenDetail} t={t} />}
            <CommunityMoodWide loaded={moodLoaded} counts={moodCounts} total={moodTotal} rows={moodRows} lang={lang} t={t} />
          </div>

          <ForumExplorer
            lang={lang} unreadCounts={unreadCounts} blockedUsers={blockedUsers}
            onOpenThread={openThreadRead} onNewThread={() => setShowNewThread(true)} refreshKey={explorerKey}
          />

          <div className="grid items-start gap-6 lg:grid-cols-2">
            {airingAnime.length > 0 && (
              <ForumCategory compact maxVisible={6}
                emoji="📡" title={t.airingTitle} subtitle={t.airingSubtitle}
                items={airingAnime} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
                metaLabel={a => a.score ? `★ ${a.score}` : t.metaAiring} convLink t={t}
              />
            )}
            <ForumCategory compact maxVisible={6}
              emoji="📅" title={t.upcomingTitle} subtitle={t.upcomingSubtitle}
              items={upcoming} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={a => countdownLabel(a, airedDates, t)} trailerLink t={t}
            />
            <ForumCategory compact maxVisible={NEW_ANIME_PREVIEW}
              emoji="🆕" title={t.newAnimeTitle} subtitle={t.newAnimeSubtitle}
              items={newAnime} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
              metaLabel={() => t.metaNew} t={t}
            />
            {favoritesLoaded && favorites.length > 0 && (
              <ForumCategory compact
                emoji="❤️" title={t.favoritesTitle} subtitle={t.favoritesSubtitle}
                items={favorites.map(f => f.anime)} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
                metaLabel={() => t.metaFavorite} t={t}
                statOverride={a => {
                  const f = favorites.find(x => x.anime.mal_id === a.mal_id);
                  return { primary: `❤️ ${f?.count ?? 0}`, secondary: t.favoritesUnit(f?.count ?? 0) };
                }}
              />
            )}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className={desktop ? "mx-auto max-w-7xl px-6 py-8" : "mx-auto max-w-6xl px-6 py-8"}>
      {desktop ? desktopBody : (
        <>
      <div className="mb-8 animate-slide-up">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight text-slate-50 md:text-[32px]">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <ForumTabs
            tab={tab} onChange={changeTab} t={t}
            badges={{ discussions: Object.values(unreadCounts).reduce((a, b) => a + b, 0) }}
          />

          {tab === "discussions" && (
            <DiscussionsBlock
              threads={threads} replyCounts={replyCounts} unreadCounts={unreadCounts} loaded={threadsLoaded}
              profileCache={profileCache} onOpenThread={openThreadRead} onNewThread={() => setShowNewThread(true)}
              t={t} lang={lang}
            />
          )}

          {/* Animés saisonniers en cours — avec bouton 💬 discussion */}
          {tab === "airing" && (
            airingAnime.length > 0 ? (
              <ForumCategory
                emoji="📡" title={t.airingTitle} subtitle={t.airingSubtitle}
                items={airingAnime} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
                metaLabel={a => a.score ? `★ ${a.score}` : t.metaAiring} convLink maxVisible={SECTION_PREVIEW} t={t}
              />
            ) : loading ? <Spinner label={t.loadingNews} /> : <EmptyState emoji="📡" title={t.emptyTitle} subtitle={t.emptySubtitle} />
          )}

          {(tab === "upcoming" || tab === "popular") && loading && <Spinner label={t.loadingNews} />}

          {/* Prochaines sorties — le plus attendu en tête, puis la liste */}
          {tab === "upcoming" && !loading && (
            upcoming.length > 0 ? (
              <>
                <AnticipatedCard anime={mostAnticipated} airedDates={airedDates} onOpenDetail={onOpenDetail} t={t} />
                <ForumCategory
                  emoji="📅" title={t.upcomingTitle} subtitle={t.upcomingSubtitle}
                  items={upcoming} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
                  metaLabel={a => countdownLabel(a, airedDates, t)} trailerLink maxVisible={SECTION_PREVIEW} t={t}
                />
              </>
            ) : <EmptyState emoji="📅" title={t.emptyTitle} subtitle={t.emptySubtitle} />
          )}

          {/* Les + favoris, puis les derniers ajouts à la base */}
          {tab === "popular" && !loading && (
            !newAnime.length && !favorites.length ? (
              <EmptyState emoji="❤️" title={t.emptyTitle} subtitle={t.emptySubtitle} />
            ) : (
              <>
                {favoritesLoaded && favorites.length > 0 && (
                  <ForumCategory
                    emoji="❤️" title={t.favoritesTitle} subtitle={t.favoritesSubtitle}
                    items={favorites.map(f => f.anime)} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
                    metaLabel={() => t.metaFavorite} t={t}
                    statOverride={a => {
                      const f = favorites.find(x => x.anime.mal_id === a.mal_id);
                      return { primary: `❤️ ${f?.count ?? 0}`, secondary: t.favoritesUnit(f?.count ?? 0) };
                    }}
                  />
                )}
                <ForumCategory
                  emoji="🆕" title={t.newAnimeTitle} subtitle={t.newAnimeSubtitle}
                  items={newAnime} onOpenDetail={onOpenDetail} dominantMoods={dominantMoods}
                  metaLabel={() => t.metaNew} maxVisible={5} t={t}
                />
              </>
            )
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:sticky lg:top-6 lg:w-[280px]">
          {/* Mini-jeux + classement — en premier : c'est la partie interactive */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.miniGamesTitle}</div>
            <GamePanel
              myUsername={myUsername}
              following={followingList}
              onWordle={()=>setShowWordle(true)}
              onPoster={()=>setShowPoster(true)}
              onOpQuiz={()=>setShowOpQuiz(true)}
              onChain={()=>setMatchmaking("chain")}
              onTimeline={()=>setMatchmaking("timeline")}
              onCluescale={()=>setShowCluescale(true)}
              onUndercover={()=>setShowUndercover(true)}
              onTierlist={()=>setShowTierlist(true)}
              t={t}
            />
          </div>

          <CommunityMoodBlock loaded={moodLoaded} counts={moodCounts} total={moodTotal} t={t} />
        </aside>
      </div>

        </>
      )}

      {showNewThread && (
        <NewThreadModal
          username={myUsername}
          onClose={() => setShowNewThread(false)}
          onCreated={t => { setShowNewThread(false); setThreads(list => [t, ...list]); setExplorerKey(k => k + 1); }}
        />
      )}
      {openThread && (
        <ThreadModal thread={openThread} username={myUsername} onClose={() => setOpenThread(null)} onOpenUser={onOpenUser} />
      )}
      {showWordle && (
        <GameModal onClose={()=>setShowWordle(false)} title={`🎯 ${t.wordleLabel}`} maxWidth="680px">
          {() => <WordleGame onClose={()=>setShowWordle(false)}/>}
        </GameModal>
      )}
      {showPoster && (
        <GameModal onClose={()=>setShowPoster(false)} title={`🖼 ${t.posterLabel}`} maxWidth="560px">
          {() => <PosterGame onClose={()=>setShowPoster(false)}/>}
        </GameModal>
      )}
      {showOpQuiz && (
        <GameModal onClose={()=>setShowOpQuiz(false)} title={`🎵 ${t.opquizLabel}`} subtitle={t.opquizSubtitle} maxWidth="680px">
          {() => <OpQuizGame onClose={()=>setShowOpQuiz(false)}/>}
        </GameModal>
      )}

      {matchmaking && !activeRoom && (
        <GameModal onClose={()=>setMatchmaking(null)} title={matchmaking === "chain" ? `⛓ ${t.chainLabel}` : `📅 ${t.timelineLabel}`} maxWidth="400px">
          {() => (
            <div>
              <Matchmaking gameType={matchmaking} onClose={()=>setMatchmaking(null)}
                onMatch={room=>{setActiveRoom(room);setActiveGame(matchmaking);setMatchmaking(null);}}/>
              <div style={{padding:"0 16px 16px"}}>
                <EloLeaderboard gameType={matchmaking} myUsername={myUsername} following={followingList}/>
              </div>
            </div>
          )}
        </GameModal>
      )}
      {activeRoom && activeGame === "chain" && (
        <GameModal onClose={async()=>handleGameClose(chainCloseRef.current)} title={`⛓ ${t.chainLabel}`} maxWidth="896px">
          {() => <ChainGame room={activeRoom}
            onClose={async()=>{
              await handleGameClose(chainCloseRef.current);
            }}
            onReady={(forfaitFn)=>{ chainCloseRef.current = forfaitFn; }}/>}
        </GameModal>
      )}
      {activeRoom && activeGame === "timeline" && (
        <GameModal onClose={async()=>handleGameClose(timelineCloseRef.current)} title={`📅 ${t.timelineLabel}`} maxWidth="1152px">
          {() => <TimelineGame room={activeRoom}
            onClose={async()=>{
              await handleGameClose(timelineCloseRef.current);
            }}
            onReady={(forfaitFn)=>{ timelineCloseRef.current = forfaitFn; }}/>}
        </GameModal>
      )}
      {showCluescale && !cluescaleRoom && (
        <GameModal onClose={()=>setShowCluescale(false)} title={`🎭 ${t.cluescaleLabel}`} maxWidth="400px">
          {() => <CluescaleMatchmaking
            onClose={()=>setShowCluescale(false)}
            onMatch={room=>{setCluescaleRoom(room);setShowCluescale(false);}}/>}
        </GameModal>
      )}
      {cluescaleRoom && (
        <GameModal onClose={()=>setCluescaleRoom(null)} title={`🎭 ${t.cluescaleLabel}`} maxWidth="560px">
          {() => <CluescaleGame room={cluescaleRoom} onClose={()=>setCluescaleRoom(null)}/>}
        </GameModal>
      )}
      {showUndercover && (
        <GameModal onClose={()=>{ setShowUndercover(false); setUndercoverPlayers(null); }} title={`🕵️ ${t.undercoverLabel}`} maxWidth="440px">
          {(close) => undercoverPlayers
            ? <UndercoverGame key={undercoverPlayers.map(p => p.username + (p.isImpostor ? "*" : "")).join("|")}
                players={undercoverPlayers} onClose={close} onReplay={()=>setUndercoverPlayers(null)}/>
            : <UndercoverLobby onStart={setUndercoverPlayers}/>}
        </GameModal>
      )}
      {showTierlist && (
        <GameModal onClose={()=>setShowTierlist(false)} title={`📊 ${t.tierlistLabel}`} maxWidth="1100px" fullHeight>
          {() => <TierlistPanel/>}
        </GameModal>
      )}
    </div>
  );
}
