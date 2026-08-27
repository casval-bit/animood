import { useState } from "react";
import { ThemeProvider } from "./context/ThemeProvider.jsx";
import { LangProvider } from "./context/LangProvider.jsx";
import { AppProvider } from "./context/AppProvider.jsx";
import { useApp } from "./context/useApp.js";
import { Header } from "./components/Header.jsx";
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
  const [activeTab, setActiveTab]   = useState("moodboard");
  const [showSettings, setShowSettings] = useState(false);
  const [detailAnime, setDetailAnime]   = useState(null);
  const [openUser, setOpenUser]         = useState(null);

  if(!session && !window.__SKIP_AUTH__) return <LoginView />;
  if(!profileReady && !window.__SKIP_AUTH__) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <span className="text-3xl">🌀</span>
        <Spinner label="Chargement du profil…" />
      </div>
    );
  }

  const openDetail = (anime) => setDetailAnime({ mal_id: anime.mal_id, seedData: anime });
  const closeDetail = () => setDetailAnime(null);

  const pages = {
    feed:      <FeedView onOpenUser={setOpenUser} />,
    moodboard: <MoodboardView onOpenDetail={openDetail} />,
    search:    <SearchView onOpenDetail={openDetail} onOpenUser={setOpenUser} />,
    forum:     <ForumView onOpenDetail={openDetail} onOpenUser={setOpenUser} />,
    messages:  <MessagesView />,
    profile:   <ProfileView onOpenDetail={openDetail} onOpenSettings={() => setShowSettings(true)} />,
  };

  return (
    <div className="min-h-screen">
      <Header activeTab={activeTab} onChangeTab={setActiveTab} />
      <main>{pages[activeTab]}</main>
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
        <UserProfileModal username={openUser} onClose={() => setOpenUser(null)} onOpenDetail={openDetail} />
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
