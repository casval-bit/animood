import { useApp } from "../context/useApp.js";
import { GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";

const TABS = [
  { id: "feed",      label: "Feed",      emoji: "🏠" },
  { id: "moodboard", label: "Moodboard", emoji: "🎭" },
  { id: "search",    label: "Search",    emoji: "🔍" },
  { id: "forum",     label: "Forum",     emoji: "💬" },
  { id: "profile",   label: "Profil",    emoji: "👤" },
];

export function Header({ activeTab, onChangeTab }) {
  const { me, session } = useApp();

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
        style={{ background: "rgba(17,24,39,.75)", boxShadow: "0 15px 45px rgba(0,0,0,.35)" }}
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
                style={{ background: active ? GRADIENT_PRIMARY : "transparent", color: active ? "#fff" : "#94a3b8", boxShadow: active ? "0 6px 20px rgba(109,91,255,.35)" : "none" }}
              >
                <span className={active ? "" : "opacity-50 grayscale"}>{tab.emoji}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

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
