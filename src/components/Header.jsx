import { useState } from "react";
import { useApp } from "../context/useApp.js";
import { GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";
import { timeAgo } from "./ForumThreadModal.jsx";

const TABS = [
  { id: "feed",      label: "Feed",      emoji: "🏠" },
  { id: "moodboard", label: "Moodboard", emoji: "🎭" },
  { id: "search",    label: "Search",    emoji: "🔍" },
  { id: "forum",     label: "Forum",     emoji: "💬" },
  { id: "profile",   label: "Profil",    emoji: "👤" },
];

function NotificationBell({ onChangeTab }) {
  const { activityNotifications, markActivityRead } = useApp();
  const [open, setOpen] = useState(false);
  const count = activityNotifications?.length || 0;

  const openNotif = (n) => {
    markActivityRead(n.type, n.id);
    setOpen(false);
    onChangeTab(n.type === "thread" || n.type === "thread-mention" ? "forum" : "feed");
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
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
            <div className="px-4 py-3 text-[13px] font-black uppercase tracking-wide text-white" style={{ background: GRADIENT_PRIMARY }}>
              🔔 Activité
            </div>
            {count === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">Rien de nouveau pour l'instant.</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {activityNotifications.map(n => {
                  const isThread = n.type === "thread" || n.type === "thread-mention";
                  const isMention = n.type === "post-mention" || n.type === "thread-mention";
                  const text = n.lastComment.content ?? n.lastComment.body;
                  const place = isMention
                    ? (isThread ? "un sujet" : "un post")
                    : isThread
                    ? (n.isMine ? "ton sujet" : "un sujet que tu suis")
                    : (n.isMine ? "ton post" : "un post que tu suis");
                  const verb = isMention ? "t'a mentionné dans" : isThread ? "a répondu à" : "a commenté";
                  return (
                    <button key={`${n.type}-${n.id}`} onClick={() => openNotif(n)}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-white/6 px-4 py-3 text-left transition last:border-b-0 hover:bg-white/5">
                      <div className="text-[12px] font-bold text-slate-100">
                        @{n.lastComment.username} {verb} {place}{n.count > 1 ? ` (${n.count})` : ""}
                      </div>
                      {n.title && <div className="truncate text-[11px] text-violet-300">{n.title}</div>}
                      {text && <div className="truncate text-[11px] text-slate-500">« {text} »</div>}
                      <div className="text-[10px] text-slate-600">{timeAgo(n.lastComment.created_at)}</div>
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

export function Header({ activeTab, onChangeTab }) {
  const { me, session, unreadPeers } = useApp();
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
          <span className="text-xl">🌀</span>
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

        <NotificationBell onChangeTab={onChangeTab} />

        <button
          onClick={() => onChangeTab("messages")}
          title="Messages"
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
