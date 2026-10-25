import React, { useState, useEffect } from "react";
import { ThemeProvider } from "./context/ThemeProvider.jsx";
import { LangProvider } from "./context/LangProvider.jsx";
import { AppProvider } from "./context/AppProvider.jsx";
import { SoundProvider, useSound } from "./context/SoundContext.jsx";
import { useApp } from "./context/useApp.js";
import { useLang } from "./context/useLang.js";
import { isDesktopApp } from "./utils/streamingLinks.js";
import { isInstalledApp } from "./utils/installedApp.js";
import { isInstallerPage, canPromptInstall, wasInstalled, onInstallChange, promptInstall } from "./utils/installPrompt.js";
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
import { GamesView } from "./views/GamesView.jsx";
import { MessagesView } from "./views/MessagesView.jsx";
import { ProfileView } from "./views/ProfileView.jsx";
import { UserProfileModal } from "./views/UserProfileModal.jsx";
import { SettingsView } from "./views/SettingsView.jsx";
import { DesktopUpdateBanner } from "./components/DesktopUpdateBanner.jsx";

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


function CategoriesPage({ onClose }) {
  const { lang } = useLang();
  return (
    <PageWrapper title="Catégories & Moods" onClose={onClose}>
      <p style={{fontSize:12,color:"var(--text-4)",marginBottom:20,lineHeight:1.7}}>
        AniMood classe chaque animé selon 8 émotions. Plus tu votes, plus les recommandations s'affinent.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[
          {emoji:"💔",label:"Emotional",color:"#A78BFA",desc:"Drames, larmes, histoires qui touchent"},
          {emoji:"✨",label:"Happy",color:"#FFD93D",desc:"Comédie, feel-good, sourires garantis"},
          {emoji:"⚡",label:"Hype",color:"#F97316",desc:"Action, combats, adrénaline"},
          {emoji:"🩸",label:"Dark",color:"#EF4444",desc:"Horreur, psychologique, atmosphère lourde"},
          {emoji:"🌿",label:"Chill",color:"#34D399",desc:"Slice of life, détente, rien de stressant"},
          {emoji:"🌀",label:"Twisted",color:"#06B6D4",desc:"Mindfuck, retournements, imprévisible"},
          {emoji:"🌸",label:"In Love",color:"#F9A8D4",desc:"Romance, shojo, histoires d'amour"},
          {emoji:"🎢",label:"Thrills",color:"#FB923C",desc:"Suspense, tension, mystère"},
        ].map(m => (
          <div key={m.label} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
            borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
            <span style={{fontSize:22,flexShrink:0}}>{m.emoji}</span>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:m.color,marginBottom:2}}>{m.label}</div>
              <div style={{fontSize:10,color:"var(--text-5)",lineHeight:1.5}}>{m.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </PageWrapper>
  );
}

function ModerationPage({ onClose }) {
  return (
    <PageWrapper title="Modération" onClose={onClose}>
      {[
        {h:"Signalement de contenu",p:"Utilise le bouton de signalement sur les fils de discussion ou commentaires pour alerter les modérateurs. Chaque signalement est examiné sous 48h."},
        {h:"Règles de la communauté",p:"Pas de harcèlement, pas de spam, pas de contenu hors-sujet. Les discussions doivent rester en lien avec l'anime ou la plateforme."},
        {h:"Sanctions",p:"En cas de violation des règles, le compte peut être suspendu temporairement ou définitivement selon la gravité."},
        {h:"Contact modération",p:"Pour toute question relative à la modération, utilise la page Contact."},
      ].map(s => (
        <div key={s.h} style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)",marginBottom:6}}>{s.h}</div>
          <p style={{fontSize:12,color:"var(--text-4)",lineHeight:1.7}}>{s.p}</p>
        </div>
      ))}
    </PageWrapper>
  );
}

// ── Page « Télécharger l'appli » : APK Android (servi par le site) + bureau (release GitHub)
const RELEASES_URL = "https://github.com/casval-bit/animood/releases/latest";
const RELEASES_API = "https://api.github.com/repos/casval-bit/animood/releases/latest";
const APK_URL = "/downloads/AniMood.apk"; // public/downloads/ — remplacer le fichier pour une nouvelle version
const SITE_URL = "https://animood-rho.vercel.app";

// Lien du QR code : l'APK lui-même, le téléchargement démarre dès le scan
// (en local, celui du site en ligne : le téléphone ne voit pas localhost)
function apkAbsoluteUrl() {
  const { origin, hostname } = window.location;
  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(hostname);
  return (local ? SITE_URL : origin) + APK_URL;
}

// QR code à scanner avec un téléphone Android : télécharge directement l'APK
function InstallQrCode({ en }) {
  const [svg, setSvg] = useState(null);

  useEffect(() => {
    let alive = true;
    import("qrcode") // chargé seulement quand la page s'ouvre
      .then(({ default: QRCode }) => QRCode.toString(apkAbsoluteUrl(), {
        type: "svg", margin: 1, errorCorrectionLevel: "M",
        color: { dark: "#0f0a1f", light: "#ffffff" },
      }))
      .then(s => alive && setSvg(s))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!svg) return null;
  return (
    <div style={{display:"flex",alignItems:"center",gap:14,width:"100%",marginTop:4}}>
      <img src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)}
        alt={en ? "QR code to download the Android app" : "QR code pour télécharger l'appli Android"}
        style={{width:112,height:112,flexShrink:0,padding:6,borderRadius:12,background:"#fff",display:"block"}} />
      <div style={{fontSize:12,color:"var(--text-4, #64748b)",lineHeight:1.6}}>
        <div style={{fontWeight:800,color:"var(--text-1, #f1f5f9)",marginBottom:2}}>
          📱 {en ? "Scan with your Android phone" : "Scanne avec ton téléphone Android"}
        </div>
        {en
          ? "The APK downloads right away: open it and tap \"Install\" (the first time, allow installing from this source)."
          : "L'APK se télécharge tout de suite : ouvre-le et touche « Installer » (la 1re fois, autorise l'installation depuis cette source)."}
      </div>
    </div>
  );
}

// Page ouverte par le QR code (/?installer) : sans compte, installation en un appui.
// Android (Chrome) : fenêtre d'installation native, sans APK ni « sources inconnues ».
// iPhone : marche à suivre Safari. Sinon : marche à suivre du menu + APK en secours.
function InstallPage({ onContinue }) {
  const { lang } = useLang();
  const en = lang === "en";
  const os = detectOS();
  const phone = os === "android" || os === "ios";
  const [canInstall, setCanInstall] = useState(canPromptInstall);
  const [done, setDone]             = useState(wasInstalled);
  const [waited, setWaited]         = useState(false); // Chrome n'a rien proposé après quelques secondes

  useEffect(() => {
    const off = onInstallChange(() => { setCanInstall(canPromptInstall()); setDone(wasInstalled()); });
    const t = setTimeout(() => setWaited(true), 4000);
    return () => { off(); clearTimeout(t); };
  }, []);

  const install = async () => {
    if (await promptInstall() === "accepted") setDone(true);
  };

  const btn = {
    display:"block",width:"100%",padding:"16px 20px",borderRadius:999,border:"none",cursor:"pointer",
    fontSize:16,fontWeight:900,textAlign:"center",textDecoration:"none",
    color:"#fff",background:"linear-gradient(135deg,#7c3aed,#ec4899)",boxShadow:"0 10px 28px rgba(124,58,237,.4)",
  };
  const card = {
    padding:"16px 18px",borderRadius:16,fontSize:13,lineHeight:1.7,textAlign:"left",
    color:"var(--text-3, #94a3b8)",background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.25)",
  };
  const linkStyle = {color:"#c084fc",fontWeight:700,textDecoration:"none",fontSize:13};

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"32px 16px"}}>
      <div style={{width:"100%",maxWidth:380,display:"flex",flexDirection:"column",alignItems:"center",gap:20,textAlign:"center"}}>
        <img src="/logo-mark.png" alt="" style={{width:88,height:88,borderRadius:24,objectFit:"cover",boxShadow:"0 12px 32px rgba(124,58,237,.35)"}}/>
        <div>
          <div style={{fontSize:26,fontWeight:900,color:"var(--text-1, #f1f5f9)"}}>
            {done ? (en ? "AniMood is installed 🎉" : "AniMood est installée 🎉") : (en ? "Install AniMood" : "Installe AniMood")}
          </div>
          <div style={{fontSize:13,color:"var(--text-4, #64748b)",marginTop:6}}>
            {done
              ? (en ? "Find it on your home screen." : "Retrouve-la sur ton écran d'accueil.")
              : (en ? "Discover anime by mood — free, no store needed." : "Découvre des animés selon ton humeur — gratuit, sans passer par un store.")}
          </div>
        </div>

        {!done && os === "ios" && (
          <div style={card}>
            <b style={{color:"var(--text-1, #f1f5f9)"}}>{en ? "On iPhone, 2 taps:" : "Sur iPhone, en 2 appuis :"}</b><br/>
            1. {en ? "Tap Share" : "Touche Partager"} <span style={{fontSize:16}}>⬆️</span> {en ? "at the bottom of Safari" : "en bas de Safari"}<br/>
            2. {en ? "Choose \"Add to Home Screen\"" : "Choisis « Sur l'écran d'accueil »"}
          </div>
        )}

        {!done && os !== "ios" && canInstall && (
          <button type="button" onClick={install} style={btn}>
            📲 {en ? "Install the app" : "Installer l'appli"}
          </button>
        )}

        {!done && os !== "ios" && !canInstall && !waited && (
          <Spinner label={en ? "Getting the app ready…" : "Préparation de l'appli…"} />
        )}

        {!done && os !== "ios" && !canInstall && waited && (
          <>
            {phone && (
              <div style={card}>
                <b style={{color:"var(--text-1, #f1f5f9)"}}>{en ? "Install from the browser menu:" : "Installe depuis le menu du navigateur :"}</b><br/>
                {en
                  ? "Tap ⋮ (top right in Chrome), then \"Install app\" or \"Add to Home screen\"."
                  : "Touche ⋮ (en haut à droite dans Chrome), puis « Installer l'appli » ou « Ajouter à l'écran d'accueil »."}
              </div>
            )}
            {!phone && <InstallQrCode en={en} />}
            {os === "android" && (
              <a href={APK_URL} download="AniMood.apk" style={linkStyle}>
                ⬇ {en ? "Or download the APK" : "Ou télécharger l'APK"}
              </a>
            )}
          </>
        )}

        <button type="button" onClick={onContinue} style={{...linkStyle,background:"none",border:"none",cursor:"pointer",color:"var(--text-4, #64748b)"}}>
          {en ? "Continue on the website →" : "Continuer sur le site →"}
        </button>
      </div>
    </div>
  );
}

function detectOS() {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "win";
  if (/Mac OS X|Macintosh/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return null;
}

// Range les fichiers de la release par système (noms générés par electron-builder)
function pickAssets(assets = []) {
  const by = (re) => assets.filter(a => re.test(a.name) && !/\.blockmap$/i.test(a.name));
  return {
    win:   by(/\.exe$/i),
    mac:   by(/\.dmg$/i),
    linux: by(/\.(AppImage|deb)$/i),
  };
}

function DownloadPage({ onClose }) {
  const { lang } = useLang();
  const en = lang === "en";
  const [release, setRelease] = useState(null);
  const [status, setStatus]   = useState("loading"); // loading | ready | none
  const os = detectOS();

  useEffect(() => {
    let alive = true;
    fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!alive) return;
        const files = data ? pickAssets(data.assets) : null;
        if (files && (files.win.length || files.mac.length || files.linux.length)) {
          setRelease({ version: data.tag_name, files });
          setStatus("ready");
        } else setStatus("none");
      })
      .catch(() => alive && setStatus("none"));
    return () => { alive = false; };
  }, []);

  const platforms = [
    { id: "win",   icon: "🪟", label: "Windows", hint: "Windows 10 / 11" },
    { id: "mac",   icon: "🍎", label: "macOS",   hint: en ? "Intel & Apple Silicon" : "Intel et Apple Silicon" },
    { id: "linux", icon: "🐧", label: "Linux",   hint: "AppImage / .deb" },
  ].sort((a, b) => (b.id === os) - (a.id === os)); // le système détecté en premier

  const assetLabel = (name) => {
    if (/arm64/i.test(name)) return "Apple Silicon (M1+)";
    if (/\.dmg$/i.test(name)) return "Intel";
    if (/\.AppImage$/i.test(name)) return "AppImage";
    if (/\.deb$/i.test(name)) return ".deb";
    return en ? "Installer" : "Installateur";
  };
  const sizeMb = (b) => `${Math.round(b / 1048576)} Mo`;

  return (
    <PageWrapper title={en ? "Get the app" : "Télécharger l'appli"} onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:32}}>
        <img src="/logo-mark.png" alt="" style={{width:56,height:56,borderRadius:16,objectFit:"cover"}}/>
        <div>
          <div style={{fontSize:28,fontWeight:900,color:"var(--text-1, #f1f5f9)"}}>{en ? "AniMood apps" : "Les applis AniMood"}</div>
          <div style={{fontSize:13,color:"var(--text-4, #64748b)",marginTop:4}}>
            {en ? "On your phone and your computer — same account, lists and messages as the website"
                : "Sur ton téléphone et ton ordinateur — même compte, mêmes listes et messages que sur le site"}
          </div>
        </div>
      </div>

      <Section title={en ? "On your phone" : "Sur téléphone"}>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[
            { id: "android", icon: "🤖", label: "Android", hint: en ? "APK · updates itself with the website" : "APK · se met à jour avec le site" },
            { id: "ios",     icon: "🍏", label: "iPhone / iPad", hint: en ? "Safari → Share → Add to Home Screen" : "Safari → Partager → Sur l'écran d'accueil" },
          ].sort((a, b) => (b.id === os) - (a.id === os)).map(p => {
            const mine = p.id === os;
            return (
              <div key={p.id} style={{
                display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",
                padding:"14px 16px",borderRadius:14,
                background: mine ? "rgba(124,58,237,0.10)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${mine ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.06)"}`,
              }}>
                <span style={{fontSize:26}}>{p.icon}</span>
                <div style={{flex:1,minWidth:140}}>
                  <div style={{fontSize:14,fontWeight:800,color:"var(--text-1, #f1f5f9)"}}>
                    {p.label}{mine && <span style={{marginLeft:8,fontSize:10,fontWeight:800,color:"#c084fc"}}>{en ? "YOUR DEVICE" : "TON APPAREIL"}</span>}
                  </div>
                  <div style={{fontSize:11,color:"var(--text-4, #64748b)"}}>{p.hint}</div>
                </div>
                {p.id === "android" && (
                  <a href={APK_URL} download="AniMood.apk"
                    style={{
                      padding:"8px 14px",borderRadius:999,fontSize:12,fontWeight:800,textDecoration:"none",
                      color:"#fff",background:"linear-gradient(135deg,#7c3aed,#ec4899)",
                      boxShadow: mine ? "0 6px 18px rgba(124,58,237,.35)" : "none",
                    }}>
                    ⬇ {en ? "Download APK" : "Télécharger l'APK"}
                  </a>
                )}
                {p.id === "android" && mine && (
                  <a href="/?installer" style={{fontSize:12,fontWeight:800,color:"#c084fc",textDecoration:"none"}}>
                    📲 {en ? "Install in one tap" : "Installer en un appui"}
                  </a>
                )}
                {p.id === "android" && os !== "android" && os !== "ios" && <InstallQrCode en={en} />}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={en ? "On your computer" : "Sur ordinateur"}>
        <div style={{marginBottom:12}}>
          {en
            ? "A dedicated Games tab, animated profile frames, sounds, quick anime search and automatic updates."
            : "Un onglet Jeux dédié, des cadres de profil animés, des sons, une recherche d'animés rapide et les mises à jour automatiques."}
          {release?.version && <> · <b style={{color:"#c084fc"}}>{release.version}</b></>}
        </div>
        {status === "loading" && <Spinner label={en ? "Looking for the latest version…" : "Recherche de la dernière version…"} />}

        {status === "none" && (
          <div style={{padding:"18px 20px",borderRadius:14,background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.25)"}}>
            <div style={{fontWeight:800,color:"var(--text-1, #f1f5f9)",marginBottom:4}}>
              {en ? "Coming soon 🚧" : "Bientôt disponible 🚧"}
            </div>
            {en ? "The first version of the desktop app hasn't been published yet. " : "La première version de l'appli de bureau n'a pas encore été publiée. "}
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" style={{color:"#c084fc",fontWeight:700,textDecoration:"none"}}>
              {en ? "Check the releases on GitHub" : "Voir les versions sur GitHub"} →
            </a>
          </div>
        )}

        {status === "ready" && (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {platforms.map(p => {
              const files = release.files[p.id];
              const mine = p.id === os;
              return (
                <div key={p.id} style={{
                  display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",
                  padding:"14px 16px",borderRadius:14,
                  background: mine ? "rgba(124,58,237,0.10)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${mine ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.06)"}`,
                }}>
                  <span style={{fontSize:26}}>{p.icon}</span>
                  <div style={{flex:1,minWidth:140}}>
                    <div style={{fontSize:14,fontWeight:800,color:"var(--text-1, #f1f5f9)"}}>
                      {p.label}{mine && <span style={{marginLeft:8,fontSize:10,fontWeight:800,color:"#c084fc"}}>{en ? "YOUR SYSTEM" : "TON SYSTÈME"}</span>}
                    </div>
                    <div style={{fontSize:11,color:"var(--text-4, #64748b)"}}>{p.hint}</div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {files.length ? files.map(f => (
                      <a key={f.name} href={f.browser_download_url} title={f.name}
                        style={{
                          padding:"8px 14px",borderRadius:999,fontSize:12,fontWeight:800,textDecoration:"none",
                          color:"#fff",background:"linear-gradient(135deg,#7c3aed,#ec4899)",
                          boxShadow: mine ? "0 6px 18px rgba(124,58,237,.35)" : "none",
                        }}>
                        ⬇ {assetLabel(f.name)} <span style={{opacity:.7,fontWeight:600}}>· {sizeMb(f.size)}</span>
                      </a>
                    )) : (
                      <span style={{fontSize:11,color:"var(--text-5, #475569)"}}>{en ? "Not available yet" : "Pas encore disponible"}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={en ? "Installation" : "Installation"}>
        <p style={{margin:"0 0 8px"}}>
          {en
            ? "Android: open the downloaded APK and allow installing apps from this source when asked."
            : "Android : ouvre l'APK téléchargé et autorise l'installation depuis cette source quand Android le demande."}
        </p>
        {en
          ? "Windows may show a \"Windows protected your PC\" warning because the app isn't signed yet: click \"More info\" then \"Run anyway\". On macOS, the first time, open System Settings → Privacy & Security and click \"Open Anyway\" next to AniMood. Updates then install by themselves."
          : "Windows peut afficher « Windows a protégé votre ordinateur » car l'appli n'est pas encore signée : clique sur « Informations complémentaires » puis « Exécuter quand même ». Sur Mac, la première fois, va dans Réglages Système → Confidentialité et sécurité et clique sur « Ouvrir quand même » à côté d'AniMood. Les mises à jour s'installent ensuite toutes seules."}
      </Section>
    </PageWrapper>
  );
}

function LegalPage({ type, onClose }) {
  const sections = type === "privacy" ? [
    {h:"Données collectées",p:"Nom d'utilisateur, avatar, liste des animés vus, notes et votes de moods. Aucune donnée bancaire ou sensible n'est collectée."},
    {h:"Utilisation des données",p:"Tes données sont utilisées uniquement pour personnaliser tes recommandations et afficher ton profil public."},
    {h:"Stockage",p:"Les données sont stockées sur Supabase (EU). Tu peux demander la suppression de ton compte à tout moment via la page Contact."},
    {h:"Cookies",p:"AniMood utilise uniquement les cookies nécessaires à l'authentification. Aucun cookie publicitaire."},
  ] : [
    {h:"Éditeur",p:"AniMood est un projet indépendant open-source. Dépôt GitHub : github.com/casval-bit/animood"},
    {h:"Hébergement",p:"L'application est hébergée sur des services cloud tiers (Vercel, Supabase)."},
    {h:"Propriété intellectuelle",p:"Les données d'animés proviennent de MAL via l'API Jikan et AniList. Les images et titres restent la propriété de leurs ayants droit respectifs."},
    {h:"Responsabilité",p:"AniMood est fourni tel quel, sans garantie. L'éditeur ne peut être tenu responsable des contenus publiés par les utilisateurs."},
  ];
  return (
    <PageWrapper title={type === "privacy" ? "Politique de confidentialité" : "Mentions légales"} onClose={onClose}>
      <div style={{padding:"10px 14px",borderRadius:10,background:"rgba(251,191,36,0.08)",
        border:"1px solid rgba(251,191,36,0.2)",marginBottom:20,
        fontSize:11,color:"#fbbf24",lineHeight:1.6}}>
        ⚠️ Ces informations sont données à titre indicatif et seront mises à jour lors du lancement officiel.
      </div>
      {sections.map(s => (
        <div key={s.h} style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)",marginBottom:6}}>{s.h}</div>
          <p style={{fontSize:12,color:"var(--text-4)",lineHeight:1.7}}>{s.p}</p>
        </div>
      ))}
    </PageWrapper>
  );
}

function Shell() {
  const { session, profileReady } = useApp();
  const { lang } = useLang();
  const { playSound } = useSound();
  // Desktop démarre sur le profil, web sur moodboard
  const [activeTab, setActiveTab]   = useState(() => window.history.state?.tab || (isDesktopApp() ? "profile" : "moodboard"));
  const [showSettings, setShowSettings] = useState(false);
  const [detailAnime, setDetailAnime]   = useState(null);
  const [openUser, setOpenUser]         = useState(null);
  const [pendingJoinGame, setPendingJoinGame] = useState(null);
  const [activePage, setActivePage] = useState(null);
  const [legalPage, setLegalPage]     = useState(null);
  // Page d'installation du QR code : avant la connexion, et jamais dans une appli déjà installée
  const [installer, setInstaller]     = useState(() => isInstallerPage() && !isInstalledApp());

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
    playSound("tab");
    window.history.pushState({ tab }, "");
    setActiveTab(tab);
  };

  if (installer) {
    return <InstallPage onContinue={() => { window.history.replaceState(window.history.state, "", "/"); setInstaller(false); }} />;
  }
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
    // Onglet JEUX : appli de bureau uniquement (le site garde les jeux dans le forum)
    ...(isDesktopApp() ? { games: <GamesView
                 pendingJoinGame={pendingJoinGame} onClearPendingJoin={() => setPendingJoinGame(null)} /> } : {}),
    messages:  <MessagesView />,
  };

  const desktop = isDesktopApp();

  return (
    // Web sur téléphone : place réservée sous la barre d'onglets du bas (WebBottomNav)
    <div className={desktop ? "min-h-screen" : "min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0"} style={desktop ? { paddingTop: 80 } : {}}>
      <Header activeTab={activeTab} onChangeTab={changeTab} onOpenSettings={() => setShowSettings(true)}
        onOpenDownload={isInstalledApp() ? undefined : () => setActivePage("download")}
        onJoinGame={payload => { changeTab(desktop ? "games" : "forum"); setPendingJoinGame(payload); }} />
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
      <Footer onOpenPage={(p) => { if(p==="legal"||p==="privacy") setLegalPage(p); else setActivePage(p); }}/>
      <ChatBubble hidden={activeTab === "messages"} />

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}

      {detailAnime && (
        <AnimeDetailModal
          malId={detailAnime.mal_id}
          seedData={detailAnime.seedData}
          onClose={closeDetail}
          onOpenDetail={openDetail}
          onOpenUser={setOpenUser}
        />
      )}

      {activePage === "about"      && <AboutPage      onClose={()=>setActivePage(null)}/>}
      {activePage === "contact"   && <ContactPage   onClose={()=>setActivePage(null)}/>}
      {activePage === "faq"       && <FAQPage       onClose={()=>setActivePage(null)}/>}
      {activePage === "categories" && <CategoriesPage onClose={()=>setActivePage(null)}/>}
      {activePage === "moderation" && <ModerationPage onClose={()=>setActivePage(null)}/>}
      {activePage === "download"   && <DownloadPage   onClose={()=>setActivePage(null)}/>}
      {legalPage && <LegalPage type={legalPage} onClose={()=>setLegalPage(null)}/>}

      {openUser && (
        <UserProfileModal username={openUser} onClose={() => setOpenUser(null)} onOpenDetail={openDetail} onOpenUser={setOpenUser} />
      )}
      <DesktopUpdateBanner />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <SoundProvider>
          <AppProvider>
            <Shell />
          </AppProvider>
        </SoundProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
