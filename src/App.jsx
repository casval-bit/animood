import { useState, useEffect } from "react";
import { ThemeProvider } from "./context/ThemeProvider.jsx";
import { LangProvider } from "./context/LangProvider.jsx";
import { AppProvider } from "./context/AppProvider.jsx";
import { useApp } from "./context/useApp.js";
import { useLang } from "./context/useLang.js";
import { Header } from "./components/Header.jsx";
import { Footer } from "./components/Footer.jsx";
import { Spinner } from "./components/Spinner.jsx";
import { AnimeDetailModal } from "./components/AnimeDetailModal.jsx";
import { ChatBubble } from "./components/ChatBubble.jsx";
import { LoginView } from "./views/LoginView.jsx";
import { FeedView } from "./views/FeedView.jsx";
import { MoodboardView } from "./views/MoodboardView.jsx";
import { SearchView } from "./views/SearchView.jsx";
import { ForumView } from "./views/ForumView.jsx";
import { MessagesView } from "./views/MessagesView.jsx";
import { ProfileView } from "./views/ProfileView.jsx";
import { UserProfileModal } from "./views/UserProfileModal.jsx";
import { SettingsView } from "./views/SettingsView.jsx";

function Shell() {
  const { session, profileReady } = useApp();
  const { lang } = useLang();
  const [activeTab, setActiveTab]   = useState(() => window.history.state?.tab || "moodboard");
  const [showSettings, setShowSettings] = useState(false);
  const [detailAnime, setDetailAnime]   = useState(null);
  const [openUser, setOpenUser]         = useState(null);
  const [pendingJoinGame, setPendingJoinGame] = useState(null);

  // Seed the very first history entry with the current tab so the first
  // back press has a well-defined page to land on instead of leaving the app.
  useEffect(() => {
    if (!window.history.state?.tab) {
      window.history.replaceState({ tab: activeTab }, "");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore the tab that was active when the browser/device back button is
  // pressed, instead of always falling back to the home tab.
  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state && e.state.tab) setActiveTab(e.state.tab);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const changeTab = (tab) => {
    if (tab === activeTab) return;
    window.history.pushState({ tab }, "");
    setActiveTab(tab);
  };

  if(!session && !window.__SKIP_AUTH__) return <LoginView />;
  if(!profileReady && !window.__SKIP_AUTH__) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <img src="/logo-mark.png" alt="AniMood" className="h-16 w-16 rounded-2xl object-cover" />
        <Spinner label={lang === "en" ? "Loading profile…" : "Chargement du profil…"} />
      </div>
    );
  }

  const openDetail = (anime) => setDetailAnime({ mal_id: anime.mal_id, seedData: anime });
  const closeDetail = () => setDetailAnime(null);

  const pages = {
    moodboard: <MoodboardView onOpenDetail={openDetail} />,
    search:    <SearchView onOpenDetail={openDetail} onOpenUser={setOpenUser} />,
    forum:     <ForumView onOpenDetail={openDetail} onOpenUser={setOpenUser}
                 pendingJoinGame={pendingJoinGame} onClearPendingJoin={() => setPendingJoinGame(null)} />,
    messages:  <MessagesView />,
  };

  return (
    <div className="min-h-screen">
      <Header activeTab={activeTab} onChangeTab={changeTab}
        onJoinGame={payload => { changeTab("forum"); setPendingJoinGame(payload); }} />
      <main>
        {/* Feed and Profile stay mounted for cross-sync */}
        <div style={{display: activeTab==="feed" ? "block" : "none"}}>
          <FeedView onOpenUser={setOpenUser} onOpenDetail={openDetail}/>
        </div>
        <div style={{display: activeTab==="profile" ? "block" : "none"}}>
          <ProfileView onOpenDetail={openDetail} onOpenSettings={() => setShowSettings(true)} onOpenUser={setOpenUser} />
        </div>
        {/* Other pages unmount when hidden — no sync needed */}
        {pages[activeTab]}
      </main>
      <Footer />
      <ChatBubble hidden={activeTab === "messages"} />

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}

      {detailAnime && (
        <AnimeDetailModal
          malId={detailAnime.mal_id}
          seedData={detailAnime.seedData}
          onClose={closeDetail}
          onOpenDetail={openDetail}
        />
      )}

      {openUser && (
        <UserProfileModal username={openUser} onClose={() => setOpenUser(null)} onOpenDetail={openDetail} onOpenUser={setOpenUser} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AppProvider>
          <Shell />
        </AppProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
