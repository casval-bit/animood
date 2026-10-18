import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { useSound } from "../context/SoundContext.jsx";
import { GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";
import { timeAgo } from "./ForumThreadModal.jsx";
import { HEADER_I18N } from "../constants/headerI18n.js";
import { SEARCH_I18N } from "../constants/searchI18n.js";
import { isDesktopApp } from "../utils/streamingLinks.js";
import { AiringCalendar } from "./search/AiringCalendar.jsx";

// ── Tab order desktop : Profil en premier ─────────────────────────────────────
function getTabs(t) {
  return [
    { id: "profile",   label: t.tabProfile,   emoji: "✦" },
    { id: "feed",      label: t.tabFeed,       emoji: "⌂" },
    { id: "moodboard", label: t.tabMoodboard,  emoji: "◈" },
    { id: "search",    label: t.tabSearch,     emoji: "⌕" },
    { id: "forum",     label: t.tabForum,      emoji: "⋈" },
    { id: "games",     label: t.tabGames || "JEUX", emoji: "⚔" },
  ];
}

// ── Palettes de couleurs par onglet ──────────────────────────────────────────
const TAB_AURA = {
  profile:   { primary: "#a855f7", secondary: "#7c3aed", accent: "#e879f9", name: "violet" },
  feed:      { primary: "#6366f1", secondary: "#4f46e5", accent: "#818cf8", name: "indigo" },
  moodboard: { primary: "#8b5cf6", secondary: "#7c3aed", accent: "#c084fc", name: "purple" },
  search:    { primary: "#3b82f6", secondary: "#2563eb", accent: "#60a5fa", name: "blue" },
  forum:     { primary: "#06b6d4", secondary: "#0891b2", accent: "#67e8f9", name: "cyan" },
  games:     { primary: "#f59e0b", secondary: "#d97706", accent: "#fcd34d", name: "amber" },
  messages:  { primary: "#6366f1", secondary: "#4f46e5", accent: "#818cf8", name: "indigo" },
};

function getAura(tabId) {
  return TAB_AURA[tabId] || TAB_AURA.feed;
}

// ── Inject CSS animations ─────────────────────────────────────────────────────
const DESKTOP_CSS = `
@keyframes orb-drift-1 {
  0%   { transform: translate(0px, 0px) scale(1); }
  33%  { transform: translate(18px, -8px) scale(1.08); }
  66%  { transform: translate(-10px, 5px) scale(0.95); }
  100% { transform: translate(0px, 0px) scale(1); }
}
@keyframes orb-drift-2 {
  0%   { transform: translateX(-50%) scale(1) rotate(0deg); }
  40%  { transform: translateX(-46%) scale(1.12) rotate(4deg); }
  80%  { transform: translateX(-54%) scale(0.92) rotate(-3deg); }
  100% { transform: translateX(-50%) scale(1) rotate(0deg); }
}
@keyframes orb-drift-3 {
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(-14px, 6px) scale(1.1); }
  100% { transform: translate(0, 0) scale(1); }
}
@keyframes tab-glow-pulse {
  0%, 100% { box-shadow: 0 0 10px rgba(168,85,247,0.6), 0 0 24px rgba(168,85,247,0.18); }
  50%       { box-shadow: 0 0 16px rgba(168,85,247,0.85), 0 0 38px rgba(168,85,247,0.28); }
}
@keyframes aura-sweep {
  0%   { opacity: 0; transform: scaleX(0.4); }
  100% { opacity: 1; transform: scaleX(1); }
}
@keyframes logo-breathe {
  0%, 100% { box-shadow: 0 0 20px rgba(124,58,237,0.5), 0 0 40px rgba(124,58,237,0.2), inset 0 1px 0 rgba(255,255,255,0.25); }
  50%       { box-shadow: 0 0 28px rgba(168,85,247,0.7), 0 0 55px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.3); }
}
@keyframes shimmer-flow {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes indicator-enter {
  0%   { opacity: 0; width: 0; }
  100% { opacity: 1; width: 36px; }
}
@keyframes tab-enter {
  0%   { opacity: 0; transform: translateY(4px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes orb-pulse-soft {
  0%, 100% { opacity: 0.7; }
  50%       { opacity: 1; }
}
@keyframes hd-icon-bob {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-1.5px); }
}
`;

function InjectDesktopCSS() {
  useEffect(() => {
    const id = "animood-desktop-header-css";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = DESKTOP_CSS;
      document.head.appendChild(style);
    }
  }, []);
  return null;
}

// ── NotificationBell (appli de bureau) ── ──────────────────────────────────────────────
function DesktopNotificationBell({ onChangeTab, onJoinGame }) {
  const { activityNotifications, markActivityRead, markAllActivityRead, gameInvites, dismissGameInvite } = useApp();
  const { lang } = useLang();
  const { playSound } = useSound();
  const t = HEADER_I18N[lang] || HEADER_I18N.fr;
  const [open, setOpen] = useState(false);
  const activityCount = activityNotifications?.length || 0;
  const inviteCount   = gameInvites?.length || 0;
  const count = activityCount + inviteCount;

  const openNotif = (n) => {
    markActivityRead(n.type, n.id);
    setOpen(false);
    onChangeTab(n.type === "thread" || n.type === "thread-mention" ? "forum" : "feed");
  };

  const joinInvite = async (inv) => {
    await dismissGameInvite(inv.id, "accepted");
    setOpen(false);
    onJoinGame?.({ gameType: inv.game_type, roomId: inv.room_id, privateCode: inv.private_code });
  };

  return (
    <div className="relative">
      <button
        onClick={() => { const next = !open; setOpen(next); if(next && count > 0) playSound("notify"); }}
        title={t.notifications}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:scale-110"
        style={{ background: open ? GRADIENT_PRIMARY : "rgba(255,255,255,.07)", boxShadow: open ? "0 6px 18px rgba(109,91,255,.45)" : "none" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={open ? "#fff" : "var(--text-2)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 px-[3px] text-[9px] font-black leading-none text-white"
            style={{ background: "#f43f5e", borderColor: "transparent" }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-80 overflow-hidden rounded-2xl border border-white/8 backdrop-blur-xl"
            style={{ background: "var(--surface-1-strong)", boxShadow: "var(--shadow-modal)" }}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 text-[13px] font-black uppercase tracking-wide text-white" style={{ background: GRADIENT_PRIMARY }}>
              <span>{t.activity}</span>
              {activityCount > 0 && (
                <button onClick={() => markAllActivityRead()}
                  className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold normal-case tracking-normal text-white transition hover:bg-white/25">
                  {t.markAllRead}
                </button>
              )}
            </div>
            {inviteCount > 0 && (
              <div className="border-b border-white/6">
                {gameInvites.map(inv => (
                  <div key={inv.id} className="border-b border-white/4 px-4 py-2.5 last:border-b-0">
                    <div className="mb-1.5 text-[12px] font-bold text-slate-100">
                      {t.gameInvite(t.gameNames[inv.game_type] || inv.game_type, inv.from_user)}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => joinInvite(inv)}
                        className="flex-1 rounded-lg py-1 text-[11px] font-extrabold text-white transition hover:opacity-90"
                        style={{ background: GRADIENT_PRIMARY }}>{t.gameInviteJoin}</button>
                      <button onClick={() => dismissGameInvite(inv.id, "declined")}
                        className="rounded-lg border border-white/10 bg-white/4 px-2.5 py-1 text-[11px] font-bold text-slate-400 transition hover:bg-white/8">
                        {t.gameInviteDecline}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {count === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">{t.nothingNew}</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {activityNotifications.map(n => {
                  const isThread = n.type === "thread" || n.type === "thread-mention";
                  const isMention = n.type === "post-mention" || n.type === "thread-mention";
                  const text = n.lastComment.content ?? n.lastComment.body;
                  const place = t.place(isMention, isThread, n.isMine);
                  const verb = t.verb(isMention, isThread);
                  return (
                    <button key={`${n.type}-${n.id}`} onClick={() => openNotif(n)}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-white/6 px-4 py-3 text-left transition last:border-b-0 hover:bg-white/5">
                      <div className="text-[12px] font-bold text-slate-100">@{n.lastComment.username} {verb} {place}{n.count > 1 ? ` (${n.count})` : ""}</div>
                      {n.title && <div className="truncate text-[11px] text-violet-300">{n.title}</div>}
                      {text && <div className="truncate text-[11px] text-slate-500">« {text} »</div>}
                      <div className="text-[10px] text-slate-600">{timeAgo(n.lastComment.created_at, lang)}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── WindowControls ─────────────────────────────────────────────────────────────
function WindowControls() {
  if (!isDesktopApp() || window.animood?.platform === "darwin") return null;
  const [hovered, setHovered] = useState(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 8, WebkitAppRegion: "no-drag" }}>
      <button onMouseEnter={() => setHovered("min")} onMouseLeave={() => setHovered(null)}
        onClick={() => window.animood?.minimize()} title="Réduire"
        style={{ width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: hovered === "min" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
          color: "rgba(148,163,184,0.7)", transition: "all 0.15s" }}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="1" y="4.5" width="8" height="1" fill="currentColor" rx="0.5"/>
        </svg>
      </button>
      <button onMouseEnter={() => setHovered("max")} onMouseLeave={() => setHovered(null)}
        onClick={() => window.animood?.maximize()} title="Agrandir"
        style={{ width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: hovered === "max" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
          color: "rgba(148,163,184,0.7)", transition: "all 0.15s" }}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.2" rx="1.2"/>
        </svg>
      </button>
      <button onMouseEnter={() => setHovered("close")} onMouseLeave={() => setHovered(null)}
        onClick={() => window.animood?.close()} title="Fermer"
        style={{ width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: hovered === "close" ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.04)",
          color: hovered === "close" ? "#fff" : "rgba(148,163,184,0.7)",
          transition: "all 0.15s" }}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

// ── AmbientOrbs — réactives à l'onglet actif ─────────────────────────────────
function AmbientOrbs({ activeTab }) {
  const aura = getAura(activeTab);
  const [cur, setCur] = useState(aura);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    setTransitioning(true);
    const t = setTimeout(() => { setCur(aura); setTransitioning(false); }, 400);
    return () => clearTimeout(t);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = cur;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>

      {/* Main left orb */}
      <div style={{
        position: "absolute", top: -60, left: "6%",
        width: 320, height: 200,
        borderRadius: "50%",
        background: `radial-gradient(ellipse, ${c.primary}30 0%, ${c.primary}12 45%, transparent 70%)`,
        filter: "blur(24px)",
        animation: "orb-drift-1 9s ease-in-out infinite",
        transition: "background 0.8s ease",
      }} />

      {/* Wide center nebula */}
      <div style={{
        position: "absolute", top: -40, left: "50%",
        width: 600, height: 120,
        borderRadius: "50%",
        background: `radial-gradient(ellipse, ${c.secondary}20 0%, ${c.secondary}0a 55%, transparent 70%)`,
        filter: "blur(32px)",
        animation: "orb-drift-2 16s ease-in-out infinite",
        transition: "background 0.8s ease",
      }} />

      {/* Right accent orb */}
      <div style={{
        position: "absolute", top: -50, right: "8%",
        width: 260, height: 180,
        borderRadius: "50%",
        background: `radial-gradient(ellipse, ${c.accent}24 0%, ${c.accent}0e 50%, transparent 70%)`,
        filter: "blur(20px)",
        animation: "orb-drift-3 7s ease-in-out infinite 1s",
        transition: "background 0.8s ease",
      }} />

      {/* Deep center core */}
      <div style={{
        position: "absolute", top: "15%", left: "48%",
        width: 140, height: 60,
        borderRadius: "50%",
        background: `radial-gradient(ellipse, ${c.primary}35 0%, transparent 70%)`,
        filter: "blur(12px)",
        transform: "translateX(-50%)",
        animation: "orb-drift-1 5s ease-in-out infinite 0.5s",
        transition: "background 0.6s ease",
      }} />

      {/* Far left secondary */}
      <div style={{
        position: "absolute", top: -20, left: "28%",
        width: 180, height: 110,
        borderRadius: "50%",
        background: `radial-gradient(ellipse, ${c.secondary}18 0%, transparent 70%)`,
        filter: "blur(16px)",
        animation: "orb-drift-3 13s ease-in-out infinite 2s",
        transition: "background 0.7s ease",
      }} />

      {/* Far right micro */}
      <div style={{
        position: "absolute", top: -10, right: "28%",
        width: 120, height: 80,
        borderRadius: "50%",
        background: `radial-gradient(ellipse, ${c.accent}1c 0%, transparent 70%)`,
        filter: "blur(12px)",
        animation: "orb-drift-1 8s ease-in-out infinite 3s",
        transition: "background 0.6s ease",
      }} />

      {/* Energy bottom line — shimmer subtil */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent 0%, ${c.primary}40 25%, ${c.secondary}65 50%, ${c.accent}40 75%, transparent 100%)`,
        transition: "background 0.8s ease",
        animation: "shimmer-flow 5s linear infinite",
        backgroundSize: "200% 100%",
      }} />
    </div>
  );
}

// ── Icônes d'onglets (desktop) — trait fin, univers masque / mystique ────────
const TAB_ICON_PATHS = {
  // silhouette
  profile: [
    "M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2z",
    "M4.2 20.5c.6-3.7 3.9-6 7.8-6s7.2 2.3 7.8 6",
  ],
  // maison / foyer
  feed: [
    "M3 11.2 12 4l9 7.2",
    "M5.2 9.8V20h13.6V9.8",
    "M10 20v-5.4a2 2 0 0 1 4 0V20",
  ],
  // cristal
  moodboard: [
    "M12 2.5 19 8.6 12 21.5 5 8.6z",
    "M5 8.6h14",
    "M9.6 8.6 12 2.5l2.4 6.1M9.6 8.6 12 21.5l2.4-12.9",
  ],
  // œil mystique
  search: [
    "M2 12s3.6-6.6 10-6.6S22 12 22 12s-3.6 6.6-10 6.6S2 12 2 12z",
    "M12 9.2 12.9 11.1 15 12l-2.1.9L12 14.8l-.9-1.9L9 12l2.1-.9z",
  ],
  // plume / parole
  forum: [
    "M20.5 3.5c-6.4.4-11 4.3-12.6 10.7L6 18",
    "M20.5 3.5c.2 6.4-3.6 10.9-10 11.7",
    "M6 18l-2.5 2.5M9.5 15.5 13 15",
  ],
  // épées croisées
  games: [
    "M14.5 17.5 3 6V3h3l11.5 11.5",
    "M13 19l6-6M16 16l4 4M19 21l2-2",
    "M14.5 6.5 18 3h3v3l-3.5 3.5",
    "M5 14l4 4M7 17l-3 3M3 19l2 2",
  ],
};

function TabIcon({ id, size = 19 }) {
  const paths = TAB_ICON_PATHS[id];
  if (!paths) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// ── Séparateur orné entre deux onglets ────────────────────────────────────────
function TabDivider({ color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, width: 14, flexShrink: 0 }}>
      <span style={{ width: 1, height: 14, background: "linear-gradient(180deg, transparent, rgba(255,255,255,.14))" }} />
      <span style={{ width: 3, height: 3, background: "rgba(255,255,255,.22)", transform: "rotate(45deg)" }} />
      <span style={{ width: 1, height: 14, background: "linear-gradient(0deg, transparent, rgba(255,255,255,.14))" }} />
    </div>
  );
}

// ── DesktopTab — onglet mystique avec animations ──────────────────────────────
function DesktopTab({ tab, active, onClick, aura }) {
  const [hov, setHov] = useState(false);
  const isActive = active;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: "0 22px",
        borderRadius: 0,
        border: "none",
        cursor: "pointer",
        background: "transparent",
        position: "relative",
        height: "100%",
        minWidth: 80,
        WebkitAppRegion: "no-drag",
        transition: "all 0.2s cubic-bezier(.4,0,.2,1)",
      }}
    >
      {/* Fond de surbrillance actif */}
      {(isActive || hov) && (
        <div style={{
          position: "absolute",
          inset: "8px 4px",
          borderRadius: 14,
          background: isActive
            ? `linear-gradient(160deg, ${aura.primary}38 0%, ${aura.secondary}22 100%)`
            : "rgba(255,255,255,0.04)",
          border: isActive ? `1px solid ${aura.primary}30` : "1px solid transparent",
          transition: "all 0.25s cubic-bezier(.4,0,.2,1)",
          animation: isActive ? "tab-enter 0.2s ease-out" : "none",
        }} />
      )}

      {/* Indicateur bas (trait néon animé) */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: isActive ? 42 : 0,
        height: 3,
        borderRadius: 2,
        background: isActive
          ? `linear-gradient(90deg, ${aura.primary}, ${aura.secondary}, ${aura.accent})`
          : "transparent",
        boxShadow: isActive
          ? `0 0 12px ${aura.primary}ff, 0 0 28px ${aura.primary}66, 0 0 50px ${aura.primary}22`
          : "none",
        transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
        animation: isActive ? "tab-glow-pulse 2.5s ease-in-out infinite" : "none",
      }} />

      {/* Icône d'onglet */}
      <span style={{
        color: isActive
          ? aura.accent
          : hov
            ? "rgba(196,181,253,0.8)"
            : "rgba(130,142,170,0.6)",
        filter: isActive ? `drop-shadow(0 0 8px ${aura.primary}cc)` : "none",
        transition: "all 0.2s",
        position: "relative",
        lineHeight: 0,
        animation: isActive || hov ? "hd-icon-bob 2.8s ease-in-out infinite" : "none",
      }}>
        <TabIcon id={tab.id} />
      </span>

      {/* Label ALL CAPS fat */}
      <span style={{
        fontSize: 9.5,
        fontWeight: isActive ? 900 : 700,
        letterSpacing: isActive ? 1.8 : 1.3,
        textTransform: "uppercase",
        color: isActive
          ? "#fff"
          : hov
            ? "rgba(196,181,253,0.65)"
            : "rgba(100,116,139,0.5)",
        textShadow: isActive
          ? `0 0 10px ${aura.primary}88`
          : "none",
        transition: "all 0.2s",
        lineHeight: 1,
        position: "relative",
        whiteSpace: "nowrap",
      }}>
        {tab.label}
      </span>
    </button>
  );
}

// ── Header Web — identique à la version du site (v11.01), aucune modification ─────
function getWebTabs(t) {
  return [
    { id: "feed",      label: t.tabFeed,      emoji: "🏠" },
    { id: "moodboard", label: t.tabMoodboard, emoji: "🎭" },
    { id: "search",    label: t.tabSearch,    emoji: "🔍" },
    { id: "forum",     label: t.tabForum,     emoji: "💬" },
    { id: "profile",   label: t.tabProfile,   emoji: "👤" },
  ];
}

function WebNotificationBell({ onChangeTab, onJoinGame }) {
  const { activityNotifications, markActivityRead, markAllActivityRead, gameInvites, dismissGameInvite } = useApp();
  const { lang } = useLang();
  const t = HEADER_I18N[lang] || HEADER_I18N.fr;
  const [open, setOpen] = useState(false);
  const activityCount = activityNotifications?.length || 0;
  const inviteCount   = gameInvites?.length || 0;
  const count = activityCount + inviteCount;

  const openNotif = (n) => {
    markActivityRead(n.type, n.id);
    setOpen(false);
    onChangeTab(n.type === "thread" || n.type === "thread-mention" ? "forum" : "feed");
  };

  const joinInvite = async (inv) => {
    await dismissGameInvite(inv.id, "accepted");
    setOpen(false);
    onJoinGame?.({ gameType: inv.game_type, roomId: inv.room_id, privateCode: inv.private_code });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={t.notifications}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:scale-110"
        style={{ background: open ? GRADIENT_PRIMARY : "rgba(var(--fg-rgb),.06)", boxShadow: open ? "0 6px 18px rgba(109,91,255,.45)" : "none" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={open ? "#fff" : "var(--text-2)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span
            className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 px-[3px] text-[9px] font-black leading-none text-white"
            style={{ background: "#f43f5e", borderColor: "var(--surface-1-strong)" }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-[calc(100%+10px)] z-50 w-80 overflow-hidden rounded-2xl border border-white/8 backdrop-blur-xl"
            style={{ background: "var(--surface-1-strong)", boxShadow: "var(--shadow-modal)" }}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 text-[13px] font-black uppercase tracking-wide text-white" style={{ background: GRADIENT_PRIMARY }}>
              <span>{t.activity}</span>
              {activityCount > 0 && (
                <button
                  onClick={() => markAllActivityRead()}
                  className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold normal-case tracking-normal text-white transition hover:bg-white/25"
                >
                  {t.markAllRead}
                </button>
              )}
            </div>

            {/* Game invites — shown first, own accept/decline actions */}
            {inviteCount > 0 && (
              <div className="border-b border-white/6">
                {gameInvites.map(inv => (
                  <div key={inv.id} className="border-b border-white/4 px-4 py-2.5 last:border-b-0">
                    <div className="mb-1.5 text-[12px] font-bold text-slate-100">
                      {t.gameInvite(t.gameNames[inv.game_type] || inv.game_type, inv.from_user)}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => joinInvite(inv)}
                        className="flex-1 rounded-lg py-1 text-[11px] font-extrabold text-white transition hover:opacity-90"
                        style={{ background: GRADIENT_PRIMARY }}>
                        {t.gameInviteJoin}
                      </button>
                      <button onClick={() => dismissGameInvite(inv.id, "declined")}
                        className="rounded-lg border border-white/10 bg-white/4 px-2.5 py-1 text-[11px] font-bold text-slate-400 transition hover:bg-white/8">
                        {t.gameInviteDecline}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {count === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">{t.nothingNew}</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {activityNotifications.map(n => {
                  const isThread = n.type === "thread" || n.type === "thread-mention";
                  const isMention = n.type === "post-mention" || n.type === "thread-mention";
                  const text = n.lastComment.content ?? n.lastComment.body;
                  const place = t.place(isMention, isThread, n.isMine);
                  const verb = t.verb(isMention, isThread);
                  return (
                    <button key={`${n.type}-${n.id}`} onClick={() => openNotif(n)}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-white/6 px-4 py-3 text-left transition last:border-b-0 hover:bg-white/5">
                      <div className="text-[12px] font-bold text-slate-100">
                        @{n.lastComment.username} {verb} {place}{n.count > 1 ? ` (${n.count})` : ""}
                      </div>
                      {n.title && <div className="truncate text-[11px] text-violet-300">{n.title}</div>}
                      {text && <div className="truncate text-[11px] text-slate-500">« {text} »</div>}
                      <div className="text-[10px] text-slate-600">{timeAgo(n.lastComment.created_at, lang)}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function WebHeader({ activeTab, onChangeTab, onJoinGame, onOpenSettings, onOpenDownload }) {
  const { me, session, unreadPeers } = useApp();
  const { lang } = useLang();
  const t = HEADER_I18N[lang] || HEADER_I18N.fr;
  const TABS = getWebTabs(t);
  const unreadCount = unreadPeers?.size || 0;

  // Custom Cloudinary avatar > Google OAuth > emoji
  const avatarSrc = me.avatar?.startsWith?.("https://res.cloudinary.com")
    ? me.avatar
    : me.avatar?.startsWith?.("http")
    ? me.avatar
    : session?.user?.user_metadata?.avatar_url
    || null;

  return (
    <div className="sticky top-0 z-50 px-3 pt-3 sm:px-4">
      <header
        className="mx-auto flex max-w-6xl items-center gap-3 rounded-full border border-white/8 px-4 py-2.5 backdrop-blur-xl sm:gap-6 sm:px-5"
        style={{ background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="flex shrink-0 items-center gap-2">
          <img src="/logo-mark.png" alt="AniMood" className="h-8 w-8 rounded-full object-cover" />
          <span className={`hidden text-lg font-black tracking-tight sm:inline ${GRADIENT_TEXT}`}>
            AniMood
          </span>
        </div>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onChangeTab(tab.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-white transition sm:px-3.5 sm:py-2"
                style={{ background: active ? GRADIENT_PRIMARY : "transparent", color: active ? "#fff" : "var(--text-2)", boxShadow: active ? "0 6px 20px rgba(109,91,255,.35)" : "none" }}
              >
                <span className={active ? "" : "opacity-50 grayscale"}>{tab.emoji}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {onOpenDownload && (
          <button
            onClick={onOpenDownload}
            title={lang === "en" ? "Get the app" : "Télécharger l'appli"}
            aria-label={lang === "en" ? "Get the app" : "Télécharger l'appli"}
            className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold transition hover:scale-105 lg:px-3"
            style={{ background: "rgba(var(--fg-rgb),.06)", color: "var(--text-2)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4M12 6v6M9.5 9.5 12 12l2.5-2.5" />
            </svg>
            <span className="hidden lg:inline">{lang === "en" ? "App" : "Appli"}</span>
          </button>
        )}

        <WebNotificationBell onChangeTab={onChangeTab} onJoinGame={onJoinGame} />

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title={lang === "en" ? "Settings" : "Paramètres"}
            aria-label={lang === "en" ? "Settings" : "Paramètres"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] transition hover:scale-110"
            style={{ background: "rgba(var(--fg-rgb),.06)" }}
          >
            ⚙️
          </button>
        )}

        <button
          onClick={() => onChangeTab("messages")}
          title={t.messages}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:scale-110"
          style={{
            background: activeTab === "messages" ? GRADIENT_PRIMARY : "rgba(var(--fg-rgb),.06)",
            boxShadow: activeTab === "messages" ? "0 6px 18px rgba(109,91,255,.45)" : "none",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={activeTab === "messages" ? "#fff" : "var(--text-2)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-11z" />
            <path d="M3.5 6l7.7 6a1.5 1.5 0 0 0 1.8 0l7.7-6" />
          </svg>
          {unreadCount > 0 && (
            <span
              className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 px-[3px] text-[9px] font-black leading-none text-white"
              style={{ background: "#f43f5e", borderColor: "var(--surface-1-strong)" }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-2 pl-2 border-l border-white/8">
          <div className="h-7 w-7 rounded-full overflow-hidden flex items-center justify-center text-sm shrink-0"
            style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)"}}>
            {me.avatar?.startsWith?.("http")
              ? <img src={me.avatar} alt="avatar" className="h-full w-full object-cover"/>
              : <span>{me.avatar || "👤"}</span>}
          </div>
          <span className="hidden text-xs font-semibold text-slate-400 sm:inline">{me.name}</span>
        </div>
      </header>
    </div>
  );
}

// ── DesktopIconBtn ─────────────────────────────────────────────────────────────
function DesktopIconBtn({ active, onClick, title, badge, aura, children }) {
  const [hov, setHov] = useState(false);
  const a = aura || TAB_AURA.feed;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={title}
      style={{
        position: "relative",
        width: 38, height: 38, borderRadius: 11,
        border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: active
          ? `linear-gradient(135deg, ${a.primary}55, ${a.secondary}44)`
          : hov
            ? "rgba(255,255,255,0.09)"
            : "rgba(255,255,255,0.04)",
        boxShadow: active
          ? `0 0 16px ${a.primary}55, inset 0 1px 0 rgba(255,255,255,0.12)`
          : "none",
        color: active ? a.accent : hov ? "rgba(196,181,253,0.75)" : "rgba(100,116,139,0.65)",
        transition: "all 0.18s cubic-bezier(.4,0,.2,1)",
        WebkitAppRegion: "no-drag",
      }}
    >
      {children}
      {badge > 0 && (
        <span style={{
          position: "absolute", bottom: -2, right: -2,
          minWidth: 15, height: 15, borderRadius: 8,
          background: "#f43f5e", border: "2px solid rgba(4,3,16,0.9)",
          fontSize: 8, fontWeight: 900, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 2px",
        }}>{badge > 9 ? "9+" : badge}</span>
      )}
    </button>
  );
}

// ── AvatarChip ─────────────────────────────────────────────────────────────────
function AvatarChip({ me, onClick, aura }) {
  const [hov, setHov] = useState(false);
  const a = aura || TAB_AURA.feed;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "5px 13px 5px 5px",
        borderRadius: 13,
        border: "1px solid",
        borderColor: hov ? `${a.primary}55` : "rgba(255,255,255,0.07)",
        background: hov ? `${a.primary}18` : "rgba(255,255,255,0.04)",
        cursor: "pointer",
        transition: "all 0.18s cubic-bezier(.4,0,.2,1)",
        boxShadow: hov ? `0 0 14px ${a.primary}28` : "none",
        WebkitAppRegion: "no-drag",
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 9,
        background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
        overflow: "hidden", flexShrink: 0,
        boxShadow: "0 0 10px rgba(124,58,237,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        border: "1px solid rgba(139,92,246,0.3)",
      }}>
        {me?.avatar?.startsWith?.("http")
          ? <img src={me.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span>{me?.avatar || "👤"}</span>}
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700,
        letterSpacing: 0.3,
        color: hov ? "#c4b5fd" : "rgba(148,163,184,0.75)",
        maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        transition: "color 0.18s",
      }}>
        {me?.name || "Profil"}
      </span>
    </button>
  );
}

// ── DesktopHeader — header mystique cosmique ──────────────────────────────────
function DesktopHeader({ activeTab, onChangeTab, onJoinGame, onOpenSettings }) {
  const { me, unreadPeers } = useApp();
  const { lang } = useLang();
  const { playSound } = useSound();
  const t = HEADER_I18N[lang] || HEADER_I18N.fr;
  const calendarT = SEARCH_I18N[lang] || SEARCH_I18N.fr;
  const TABS = getTabs(t);
  const unreadCount = unreadPeers?.size || 0;
  const aura = getAura(activeTab);
  const [showCalendar, setShowCalendar] = useState(false);

  const switchTab = (id) => {
    playSound("tab");
    onChangeTab(id);
  };

  return (
    <>
      <InjectDesktopCSS />
      <div
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0,
          zIndex: 200,
          WebkitAppRegion: "drag",
          // Fond glassmorphism profond — cosmique
          background: [
            "linear-gradient(180deg,",
            "  rgba(6,8,16,0.97) 0%,",
            "  rgba(9,11,22,0.93) 60%,",
            "  rgba(12,14,28,0.88) 100%",
            ")"
          ].join(""),
          backdropFilter: "blur(48px) saturate(200%)",
          WebkitBackdropFilter: "blur(48px) saturate(200%)",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          // Bord bas néon réactif
          borderBottom: `1px solid ${aura.primary}35`,
          boxShadow: [
            `0 1px 0 ${aura.primary}15,`,
            "0 4px 32px rgba(0,0,0,0.7),",
            "0 24px 80px rgba(0,0,0,0.4)",
          ].join(""),
          height: 84,
          display: "flex",
          alignItems: "stretch",
          transition: "border-color 0.5s ease, box-shadow 0.5s ease",
        }}
      >
        {/* Orbes ambiants réactifs */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }}><AmbientOrbs activeTab={activeTab} /></div>
        {/* Filet de marque (dégradé AniMood) en lisière basse */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 1.5, pointerEvents: "none", background: "linear-gradient(90deg, transparent 0%, #6D5BFF 22%, #8B5CF6 50%, #EC4899 78%, transparent 100%)", opacity: 0.55 }} />

        {/* ─── Zone logo ──────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 13,
          padding: "0 32px 0 24px",
          flexShrink: 0,
          WebkitAppRegion: "drag",
          position: "relative",
          borderRight: "1px solid rgba(255,255,255,0.04)",
        }}>
          {/* Logo avec halo */}
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", inset: -6,
              borderRadius: 18,
              background: `radial-gradient(circle, ${aura.primary}44 0%, transparent 70%)`,
              filter: "blur(8px)",
              transition: "background 0.5s ease",
            }} />
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: "linear-gradient(135deg,#7c3aed 0%,#4f46e5 60%,#6366f1 100%)",
              animation: "logo-breathe 3s ease-in-out infinite",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
              position: "relative",
            }}>
              <img src="/logo-mark.png" alt="AniMood" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{
                position: "absolute", inset: -6,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${aura.primary}18 0%, transparent 70%)`,
                filter: "blur(4px)",
                animation: "orb-pulse-soft 4s ease-in-out infinite",
              }} />
            </div>
          </div>

          {/* Texte logo */}
          <div>
            <div style={{
              fontSize: 17, fontWeight: 900, letterSpacing: -0.5,
              background: "linear-gradient(135deg,#f0eaff 0%,#c4b5fd 35%,#818cf8 65%,#e879f9 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              lineHeight: 1, marginBottom: 4,
              backgroundSize: "200% 100%",
              animation: "shimmer-flow 6s linear infinite",
            }}>
              ANIMOOD
            </div>
            <div style={{
              fontSize: 7, fontWeight: 800,
              color: `${aura.primary}99`,
              letterSpacing: 2.5,
              textTransform: "uppercase",
              transition: "color 0.5s ease",
            }}>
              Desktop
            </div>
          </div>
        </div>

        {/* ─── Navigation tabs ──────────────────────────── */}
        <nav style={{
          display: "flex", alignItems: "stretch",
          flex: 1,
          WebkitAppRegion: "no-drag",
          paddingLeft: 4,
        }}>
          {TABS.map((tab, i) => (
            <div key={tab.id} style={{ display: "flex", alignItems: "stretch" }}>
              {i > 0 && <TabDivider color={aura.accent} />}
              <DesktopTab
                tab={tab}
                active={tab.id === activeTab}
                aura={aura}
                onClick={() => switchTab(tab.id)}
              />
            </div>
          ))}
        </nav>

        {/* ─── Actions droite ───────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 18px 0 14px",
          flexShrink: 0,
          WebkitAppRegion: "no-drag",
          borderLeft: "1px solid rgba(255,255,255,0.04)",
        }}>

          {/* Calendar dropdown */}
          <div style={{ position: "relative" }}>
            <DesktopIconBtn
              active={showCalendar}
              onClick={() => setShowCalendar(s => !s)}
              title="Calendrier animés"
              aura={aura}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </DesktopIconBtn>

            {showCalendar && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 298 }} onClick={() => setShowCalendar(false)} />
                <div style={{
                  position: "fixed", right: 18, top: 90,
                  zIndex: 299,
                  width: "min(1120px, calc(100vw - 36px))", maxHeight: "calc(100vh - 112px)",
                  overflow: "auto",
                  borderRadius: 20,
                  border: "1px solid rgba(139,92,246,0.2)",
                  background: "linear-gradient(135deg, rgba(8,4,24,0.98) 0%, rgba(12,7,32,0.96) 100%)",
                  backdropFilter: "blur(40px)",
                  WebkitBackdropFilter: "blur(40px)",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(139,92,246,0.12)",
                  WebkitAppRegion: "no-drag",
                }}>
                  <div style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 10, fontWeight: 800, letterSpacing: 2,
                    textTransform: "uppercase", color: "rgba(139,92,246,0.7)",
                  }}>
                    📅 CALENDRIER ANIMÉS
                  </div>
                  <div style={{ padding: 16 }}>
                    <AiringCalendar onOpenDetail={() => setShowCalendar(false)} me={me} t={calendarT} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Messages */}
          <DesktopIconBtn
            active={activeTab === "messages"}
            onClick={() => { playSound("click"); onChangeTab("messages"); }}
            title={t.messages}
            badge={unreadCount}
            aura={aura}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-11z" />
              <path d="M3.5 6l7.7 6a1.5 1.5 0 0 0 1.8 0l7.7-6" />
            </svg>
          </DesktopIconBtn>

          {/* Notifications */}
          <DesktopNotificationBell onChangeTab={onChangeTab} onJoinGame={onJoinGame} />

          {/* Paramètres — entre les notifications et la photo de profil */}
          {onOpenSettings && (
            <DesktopIconBtn
              onClick={() => { playSound("click"); onOpenSettings(); }}
              title={lang === "en" ? "Settings" : "Paramètres"}
              aura={aura}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3.1" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </DesktopIconBtn>
          )}

          {/* Séparateur */}
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.05)", margin: "0 4px" }} />

          {/* Avatar */}
          <AvatarChip me={me} onClick={() => switchTab("profile")} aura={aura} />

        </div>
      </div>
    </>
  );
}

// ── Export principal ───────────────────────────────────────────────────────────
export function Header({ activeTab, onChangeTab, onJoinGame, onOpenSettings, onOpenDownload }) {
  if (isDesktopApp()) {
    return <DesktopHeader activeTab={activeTab} onChangeTab={onChangeTab} onJoinGame={onJoinGame} onOpenSettings={onOpenSettings} />;
  }
  return <WebHeader activeTab={activeTab} onChangeTab={onChangeTab} onJoinGame={onJoinGame} onOpenSettings={onOpenSettings} onOpenDownload={onOpenDownload} />;
}
