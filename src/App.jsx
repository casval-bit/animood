import React, { useState } from "react";
import { ThemeProvider } from "./context/ThemeProvider.jsx";
import { AppProvider } from "./context/AppProvider.jsx";
import { LangProvider } from "./context/LangProvider.jsx";
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



// ── Static Pages ──────────────────────────────────────────────────────────────
function PageWrapper({ title, onClose, children }) {
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:400,
      background:"var(--surface-1-strong, #0f0a1e)",
      overflowY:"auto",
    }}>
      {/* Back arrow */}
      <div style={{
        position:"sticky",top:0,
        background:"rgba(10,7,20,0.9)",backdropFilter:"blur(12px)",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
        padding:"14px 24px",display:"flex",alignItems:"center",gap:12,
        zIndex:1,
      }}>
        <button onClick={onClose} style={{
          display:"flex",alignItems:"center",gap:8,
          background:"none",border:"none",cursor:"pointer",
          color:"var(--text-2, #cbd5e1)",padding:"4px 0",
          fontSize:14,fontWeight:700,transition:"color 0.15s",
        }}
        onMouseEnter={e=>e.currentTarget.style.color="#c084fc"}
        onMouseLeave={e=>e.currentTarget.style.color="var(--text-2, #cbd5e1)"}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Retour
        </button>
        <div style={{
          fontSize:15,fontWeight:900,
          background:"linear-gradient(135deg,#7c3aed,#ec4899)",
          WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
        }}>{title}</div>
      </div>
      {/* Content */}
      <div style={{maxWidth:720,margin:"0 auto",padding:"40px 24px 80px"}}>
        {children}
      </div>
    </div>
  );
}

function AboutPage({ onClose }) {
  return (
    <PageWrapper title="À propos" onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:32}}>
        <span style={{fontSize:48}}>🌀</span>
        <div>
          <div style={{fontSize:28,fontWeight:900,color:"var(--text-1, #f1f5f9)"}}>AniMood</div>
          <div style={{fontSize:13,color:"var(--text-4, #64748b)",marginTop:4}}>
            Découvre les animés qui matchent ton humeur
          </div>
        </div>
      </div>

      <Section title="C'est quoi AniMood ?">
        AniMood est une plateforme communautaire de recommandation d'animés basée sur les émotions.
        Au lieu de chercher par genre ou popularité, tu choisis ton humeur du moment — et AniMood te trouve
        l'animé parfait pour y correspondre.
      </Section>

      <Section title="Comment ça marche ?">
        Chaque animé dans notre base de données est associé à un profil émotionnel construit à partir
        des votes de la communauté et d'une analyse IA. Quand tu sélectionnes une ou plusieurs humeurs
        (Hype, Chill, Dark, Emotional...), notre moteur calcule les meilleurs matchs et te propose 3 animés.
        Tu peux reroll autant que tu veux.
      </Section>

      <Section title="Les 8 moods">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
          {[
            {emoji:"💔",label:"Emotional",color:"#A78BFA",desc:"Touchant, mélancolique"},
            {emoji:"✨",label:"Happy",color:"#FFD93D",desc:"Feel-good, feel-good"},
            {emoji:"⚡",label:"Hype",color:"#F97316",desc:"Action, adrénaline"},
            {emoji:"🩸",label:"Dark",color:"#EF4444",desc:"Sombre, mature"},
            {emoji:"🌿",label:"Chill",color:"#34D399",desc:"Relaxant, slice-of-life"},
            {emoji:"🌀",label:"Twisted",color:"#06B6D4",desc:"Psychologique, complexe"},
            {emoji:"🌸",label:"In Love",color:"#F9A8D4",desc:"Romance, tendresse"},
            {emoji:"🎢",label:"Thrills",color:"#FB923C",desc:"Suspense, tension"},
          ].map(m => (
            <div key={m.label} style={{
              display:"flex",alignItems:"center",gap:10,
              padding:"10px 14px",borderRadius:12,
              background:"rgba(255,255,255,0.03)",
              border:"1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{fontSize:20}}>{m.emoji}</span>
              <div>
                <div style={{fontSize:12,fontWeight:800,color:m.color}}>{m.label}</div>
                <div style={{fontSize:10,color:"var(--text-5, #475569)"}}>{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Projet open source">
        AniMood est un projet communautaire et open source.
        Le code est disponible sur{" "}
        <a href="https://github.com/casval-bit/animood" target="_blank" rel="noopener noreferrer"
          style={{color:"#c084fc",textDecoration:"none",fontWeight:700}}>
          GitHub
        </a>.
      </Section>
    </PageWrapper>
  );
}

function ContactPage({ onClose }) {
  return (
    <PageWrapper title="Contact" onClose={onClose}>
      <div style={{fontSize:13,color:"var(--text-3, #94a3b8)",marginBottom:32,lineHeight:1.7}}>
        Tu as une question, une suggestion ou tu veux contribuer au projet ?
        Voici comment nous contacter.
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {[
          {
            icon:"📧",
            title:"Email",
            desc:"Pour toute question générale",
            action:"contact@animood.app",
            href:"mailto:contact@animood.app",
          },
          {
            icon:"🐛",
            title:"Signaler un bug",
            desc:"Ouvre une issue sur GitHub",
            action:"github.com/casval-bit/animood/issues",
            href:"https://github.com/casval-bit/animood/issues",
            external:true,
          },
          {
            icon:"💡",
            title:"Suggérer une fonctionnalité",
            desc:"Une idée pour améliorer AniMood ?",
            action:"Ouvrir une discussion GitHub",
            href:"https://github.com/casval-bit/animood/discussions",
            external:true,
          },
          {
            icon:"🤝",
            title:"Contribuer",
            desc:"Fork, PR, ou simplement une étoile sur le repo",
            action:"github.com/casval-bit/animood",
            href:"https://github.com/casval-bit/animood",
            external:true,
          },
        ].map(item => (
          <a key={item.title} href={item.href}
            target={item.external?"_blank":undefined}
            rel={item.external?"noopener noreferrer":undefined}
            style={{
              display:"flex",alignItems:"center",gap:14,
              padding:"16px 20px",borderRadius:14,textDecoration:"none",
              background:"rgba(255,255,255,0.03)",
              border:"1px solid rgba(255,255,255,0.07)",
              transition:"all 0.15s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(124,58,237,0.08)";e.currentTarget.style.borderColor="rgba(124,58,237,0.25)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.03)";e.currentTarget.style.borderColor="rgba(255,255,255,0.07)";}}>
            <span style={{fontSize:24,flexShrink:0}}>{item.icon}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800,color:"var(--text-1, #f1f5f9)",marginBottom:2}}>{item.title}</div>
              <div style={{fontSize:11,color:"var(--text-5, #475569)"}}>{item.desc}</div>
            </div>
            <div style={{fontSize:11,color:"#c084fc",fontWeight:600,flexShrink:0}}>{item.action} →</div>
          </a>
        ))}
      </div>
    </PageWrapper>
  );
}

function FAQPage({ onClose }) {
  const [open, setOpen] = React.useState(null);
  const faqs = [
    {
      q:"Comment fonctionnent les recommandations ?",
      a:"AniMood combine les votes de la communauté et une analyse IA pour construire un profil émotionnel pour chaque animé. Quand tu sélectionnes une humeur, on calcule les animés dont le profil émotionnel correspond le mieux.",
    },
    {
      q:"Mes animes vus sont-ils pris en compte ?",
      a:"Oui — les animés que tu as marqués comme vus, en cours ou abandonnés sont exclus des recommandations. Tu peux gérer ta liste depuis ton profil.",
    },
    {
      q:"Comment voter pour les moods d'un animé ?",
      a:"Clique sur n'importe quel animé pour ouvrir sa page de détail. Tu y trouveras le moodboard de la communauté avec la possibilité de voter pour les moods qui te semblent correspondre.",
    },
    {
      q:"Puis-je suggérer un animé manquant ?",
      a:"La base de données est synchronisée automatiquement avec MyAnimeList via Jikan. Si un animé est absent, il sera probablement ajouté lors de la prochaine sync hebdomadaire. Tu peux aussi ouvrir une issue sur GitHub.",
    },
    {
      q:"AniMood est-il gratuit ?",
      a:"Oui, complètement gratuit et sans publicité. C'est un projet communautaire open source.",
    },
    {
      q:"Comment signaler un bug ou un problème ?",
      a:"Via la page Contact ou directement sur GitHub Issues. Décris le problème et les étapes pour le reproduire — ça aide beaucoup.",
    },
    {
      q:"Les jeux sont-ils disponibles en solo ?",
      a:"Oui — Anidle, Poster et Opening Quiz sont des jeux solo jouables chaque jour. LinkUp, Timeline et Cluescale sont des jeux multijoueur que tu peux lancer depuis le Forum.",
    },
    {
      q:"Comment inviter des amis à jouer ?",
      a:"Depuis le lobby d'un jeu multijoueur, tu peux inviter tes amis directement via le système de notifications. Ils reçoivent une invitation dans leur cloche et peuvent rejoindre en un clic.",
    },
  ];

  return (
    <PageWrapper title="FAQ" onClose={onClose}>
      <div style={{fontSize:13,color:"var(--text-3, #94a3b8)",marginBottom:28,lineHeight:1.7}}>
        Les questions les plus fréquentes sur AniMood.
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {faqs.map((faq,i) => (
          <div key={i} style={{
            borderRadius:12,overflow:"hidden",
            border:"1px solid rgba(255,255,255,0.07)",
            background: open===i?"rgba(124,58,237,0.06)":"rgba(255,255,255,0.02)",
            transition:"all 0.15s",
          }}>
            <button onClick={()=>setOpen(open===i?null:i)} style={{
              width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"14px 18px",background:"none",border:"none",cursor:"pointer",textAlign:"left",
            }}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--text-1, #f1f5f9)",paddingRight:12}}>
                {faq.q}
              </div>
              <div style={{
                fontSize:16,color:"#c084fc",flexShrink:0,
                transform:open===i?"rotate(45deg)":"rotate(0deg)",
                transition:"transform 0.2s",
              }}>+</div>
            </button>
            {open===i && (
              <div style={{
                padding:"0 18px 16px",
                fontSize:12,color:"var(--text-3, #94a3b8)",lineHeight:1.7,
              }}>
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </PageWrapper>
  );
}

function Section({ title, children }) {
  return (
    <div style={{marginBottom:28}}>
      <div style={{
        fontSize:12,fontWeight:900,color:"#c084fc",
        letterSpacing:1,textTransform:"uppercase",marginBottom:10,
      }}>{title}</div>
      <div style={{fontSize:13,color:"var(--text-3, #94a3b8)",lineHeight:1.7}}>{children}</div>
    </div>
  );
}

function Footer({ onOpenPage }) {
  const year = new Date().getFullYear();
  return (
    <footer style={{
      borderTop:"1px solid rgba(255,255,255,0.06)",
      background:"rgba(10,7,20,0.8)",
      backdropFilter:"blur(12px)",
      padding:"32px 24px 24px",
      marginTop:"auto",
    }}>
      <div style={{maxWidth:960,margin:"0 auto",display:"flex",flexDirection:"column",gap:24}}>
        {/* Logo + tagline */}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>🌀</span>
          <div>
            <div style={{
              fontSize:16,fontWeight:900,
              background:"linear-gradient(135deg,#7c3aed,#ec4899)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            }}>AniMood</div>
            <div style={{fontSize:10,color:"rgba(148,163,184,0.5)",marginTop:1}}>
              Découvre les animés qui matchent ton humeur
            </div>
          </div>
        </div>

        {/* Links */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[
            {label:"À propos",   page:"about"},
            {label:"Contact",    page:"contact"},
            {label:"GitHub",     href:"https://github.com/casval-bit/animood", external:true},
            {label:"FAQ",        page:"faq"},
            {label:"Signaler",   href:"https://github.com/casval-bit/animood/issues", external:true},
          ].map(({label,href,page,external}) => (
            <a key={label}
              href={page?undefined:href}
              target={external?"_blank":undefined}
              rel={external?"noopener noreferrer":undefined}
              onClick={page?(e=>{e.preventDefault();onOpenPage(page);}):undefined}
              style={{
                padding:"6px 14px",borderRadius:20,fontSize:11,fontWeight:600,
                color:"rgba(148,163,184,0.7)",textDecoration:"none",
                border:"1px solid rgba(255,255,255,0.07)",
                background:"rgba(255,255,255,0.03)",
                transition:"all 0.15s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.color="#c084fc";e.currentTarget.style.borderColor="rgba(124,58,237,0.3)";e.currentTarget.style.background="rgba(124,58,237,0.08)";}}
              onMouseLeave={e=>{e.currentTarget.style.color="rgba(148,163,184,0.7)";e.currentTarget.style.borderColor="rgba(255,255,255,0.07)";e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
              {label}
            </a>
          ))}
        </div>

        {/* Copyright */}
        <div style={{fontSize:10,color:"rgba(148,163,184,0.35)"}}>
          © {year} AniMood — Fait avec 💜 pour les fans d'anime
        </div>
      </div>
    </footer>
  );
}

function Shell() {
  const { session, profileReady } = useApp();
  const [activeTab, setActiveTab]             = useState("moodboard");
  const [showSettings, setShowSettings]       = useState(false);
  const [detailAnime, setDetailAnime]         = useState(null);
  const [openUser, setOpenUser]               = useState(null);
  const [pendingJoinGame, setPendingJoinGame] = useState(null);
  const [activePage, setActivePage] = useState(null); // "about" | "contact" | "faq"

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
    forum:     <ForumView pendingJoinGame={pendingJoinGame} onClearPendingJoin={()=>setPendingJoinGame(null)} onOpenDetail={openDetail} onOpenUser={setOpenUser} />,
    messages:  <MessagesView />,
    profile:   <ProfileView onOpenDetail={openDetail} onOpenSettings={() => setShowSettings(true)} />,
  };

  return (
    <div className="min-h-screen">
      <Header activeTab={activeTab} onChangeTab={setActiveTab} onJoinGame={payload=>{ setActiveTab("forum"); setPendingJoinGame(payload); }} />
      <main>{pages[activeTab]}</main>
      <Footer onOpenPage={setActivePage}/>
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
      {activePage === "about"   && <AboutPage   onClose={()=>setActivePage(null)}/>}
      {activePage === "contact" && <ContactPage onClose={()=>setActivePage(null)}/>}
      {activePage === "faq"     && <FAQPage     onClose={()=>setActivePage(null)}/>}
      {openUser && (
        <UserProfileModal username={openUser} onClose={() => setOpenUser(null)} onOpenDetail={openDetail} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
      <ThemeProvider>
        <AppProvider>
          <Shell />
        </AppProvider>
      </ThemeProvider>
    </LangProvider>
  );
}
