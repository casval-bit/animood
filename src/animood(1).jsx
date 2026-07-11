// ─── ANIMOOD — App Root ───────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { AppContext, DEFAULT_PROFILE } from "./constants.js";
import { supabase, signInWithGoogle, signOut, onAuthChange, loadProfile, saveProfile } from "./api/supabase.js";
import { MoodboardPage, ResultsOverlay } from "./pages/MoodboardPage.jsx";
import { SearchPage, SearchTabIcon } from "./pages/SearchPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";
import { AnimeDetail } from "./pages/AnimeDetail.jsx";
import { SettingsPage } from "./pages/LoginSettings.jsx";
import { Spinner } from "./components/ui.jsx";

function FeedPage()  { return <div style={{padding:"80px 20px",color:"#6b7280",textAlign:"center"}}><div style={{fontSize:"48px",marginBottom:"12px"}}>🏠</div><p style={{fontWeight:700,color:"#9ca3af"}}>Feed — bientôt</p></div>; }
function ForumPage() { return <div style={{padding:"80px 20px",color:"#6b7280",textAlign:"center"}}><div style={{fontSize:"48px",marginBottom:"12px"}}>💬</div><p style={{fontWeight:700,color:"#9ca3af"}}>Forum — bientôt</p></div>; }

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleGoogle = async () => {
    setLoading(true); setError(null);
    try { await signInWithGoogle(); }
    catch(e) { setError(e.message); setLoading(false); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#09080f",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{width:"100%",maxWidth:"340px",textAlign:"center"}}>
        <div style={{fontSize:"56px",marginBottom:"12px"}}>🌀</div>
        <h1 style={{fontSize:"28px",fontWeight:900,color:"#f3f4f6",marginBottom:"6px",letterSpacing:"-0.5px"}}>AniMood</h1>
        <p style={{fontSize:"14px",color:"#6b7280",marginBottom:"40px"}}>Découvre des animés selon ton mood</p>

        <button onClick={handleGoogle} disabled={loading}
          style={{width:"100%",padding:"14px",borderRadius:"14px",border:"1px solid rgba(255,255,255,0.12)",
            background:"rgba(255,255,255,0.07)",color:"#f3f4f6",fontSize:"15px",fontWeight:700,
            cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            gap:"12px",transition:"all 0.2s"}}
          onMouseEnter={e=>!loading&&(e.currentTarget.style.background="rgba(255,255,255,0.12)")}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}>
          {loading ? <Spinner small/> : <>
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Se connecter avec Google
          </>}
        </button>

        {error && <p style={{color:"#ef4444",fontSize:"12px",marginTop:"12px"}}>{error}</p>}

        <p style={{fontSize:"11px",color:"#374151",marginTop:"24px",lineHeight:1.6}}>
          En te connectant tu acceptes que tes données soient stockées dans AniMood.<br/>
          Aucune donnée n'est partagée avec des tiers.
        </p>
      </div>
    </div>
  );
}

export default function AniMoodApp() {
  const [session, setSession]         = useState(null);
  const [activeTab, setActiveTab]     = useState("moodboard");
  const [showSettings, setShowSettings] = useState(false);
  const [overlay, setOverlay]         = useState(null);
  const [detailData, setDetailData]   = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [me, setMe]                   = useState(DEFAULT_PROFILE);

  // Listen for auth state changes (Google OAuth redirect)
  useEffect(() => {
    const { data: { subscription } } = onAuthChange(async (sess) => {
      setSession(sess);
      if(sess) {
        const email    = sess.user.email;
        const username = email.split("@")[0].replace(/[^a-z0-9]/gi,"").toLowerCase().slice(0,20);
        const name     = sess.user.user_metadata?.full_name || username;
        const avatar   = sess.user.user_metadata?.avatar_url || "🎮";
        const profile  = await loadProfile(username) || { ...DEFAULT_PROFILE, id:username, name, avatar };
        setMe(profile);
        setProfileReady(true);
      } else {
        setProfileReady(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Persist profile on change
  useEffect(() => {
    if(session && profileReady) {
      const email    = session.user.email;
      const username = email.split("@")[0].replace(/[^a-z0-9]/gi,"").toLowerCase().slice(0,20);
      saveProfile(username, me);
    }
  }, [me]);

  const handleLogout = async () => { await signOut(); setSession(null); setProfileReady(false); };

  if(!session) return <LoginScreen/>;
  if(!profileReady) return (
    <div style={{minHeight:"100vh",background:"#09080f",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"16px"}}>
      <span style={{fontSize:"32px"}}>🌀</span>
      <Spinner label="Chargement du profil…"/>
    </div>
  );

  const ctx = { me, setMe };
  const openDetail  = a => setDetailData({mal_id:a.mal_id, seedData:a});
  const closeDetail = () => setDetailData(null);

  const TABS_CFG = [
    {id:"feed",      label:"Feed",   icon:()=><span style={{fontSize:"20px",filter:activeTab==="feed"?"none":"grayscale(1) opacity(0.4)"}}>🏠</span>},
    {id:"moodboard", label:"Mood",   icon:()=><span style={{fontSize:"20px",filter:activeTab==="moodboard"?"none":"grayscale(1) opacity(0.4)"}}>🎭</span>},
    {id:"search",    label:"Search", icon:()=><SearchTabIcon active={activeTab==="search"}/>},
    {id:"forum",     label:"Forum",  icon:()=><span style={{fontSize:"20px",filter:activeTab==="forum"?"none":"grayscale(1) opacity(0.4)"}}>💬</span>},
    {id:"profile",   label:"Profil", icon:()=><span style={{fontSize:"20px",filter:activeTab==="profile"?"none":"grayscale(1) opacity(0.4)"}}>👤</span>},
  ];

  const pages = {
    feed:      <FeedPage/>,
    moodboard: <MoodboardPage onShowResults={d=>setOverlay(d)}/>,
    search:    <SearchPage onOpenDetail={openDetail}/>,
    forum:     <ForumPage/>,
    profile:   <ProfilePage onOpenDetail={openDetail} onOpenSettings={()=>setShowSettings(true)}/>,
  };

  return (
    <AppContext.Provider value={ctx}>
      <div style={{maxWidth:"430px",margin:"0 auto",height:"100vh",background:"#09080f",color:"#f3f4f6",fontFamily:"'SF Pro Display',-apple-system,sans-serif",display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>

        <div style={{position:"absolute",top:0,left:0,right:0,zIndex:10,padding:"16px 20px 12px",background:"linear-gradient(180deg,rgba(9,8,15,0.98) 0%,rgba(9,8,15,0) 100%)",display:"flex",alignItems:"center",justifyContent:"space-between",pointerEvents:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
            <span style={{fontSize:"18px"}}>🌀</span>
            <span style={{fontWeight:900,fontSize:"16px",letterSpacing:"-0.5px",background:"linear-gradient(90deg,#c084fc,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>AniMood</span>
          </div>
          <div style={{pointerEvents:"all",cursor:"pointer"}} onClick={()=>setActiveTab("profile")}>
            {session?.user?.user_metadata?.avatar_url
              ? <img src={session.user.user_metadata.avatar_url} style={{width:"28px",height:"28px",borderRadius:"50%",objectFit:"cover"}} alt="avatar"/>
              : <span style={{fontSize:"13px",color:"#6b7280"}}>{me.avatar} {me.name}</span>}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",paddingTop:"56px"}}>{pages[activeTab]}</div>

        <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(9,8,15,0.95)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",padding:"8px 0 20px",zIndex:100}}>
          {TABS_CFG.map(tab=>{
            const active=tab.id===activeTab;
            return <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"3px",padding:"6px 0"}}>
              {tab.icon()}
              <span style={{fontSize:"10px",fontWeight:active?700:500,color:active?"#c084fc":"#4b5563"}}>{tab.label}</span>
              {active&&<div style={{width:"16px",height:"2px",borderRadius:"2px",background:"linear-gradient(90deg,#7c3aed,#818cf8)",marginTop:"1px"}}/>}
            </button>;
          })}
        </div>

        {showSettings&&(
          <div style={{position:"absolute",inset:0,zIndex:500,background:"#09080f",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:"12px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              <button onClick={()=>setShowSettings(false)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:"20px",padding:0}}>←</button>
              <span style={{fontSize:"16px",fontWeight:800,color:"#f3f4f6"}}>Paramètres</span>
            </div>
            <SettingsPage onLogout={()=>{handleLogout();setShowSettings(false);}}/>
          </div>
        )}

        {overlay&&(
          <ResultsOverlay
            results={overlay.results} selectedMoods={overlay.selectedMoods} generating={overlay.generating}
            onClose={()=>setOverlay(null)}
            onReroll={async()=>{
              if(!overlay.onReroll) return;
              setOverlay(p=>({...p,generating:true}));
              const{results}=await overlay.onReroll();
              setOverlay(p=>({...p,results,generating:false}));
            }}
            onOpenDetail={a=>{setOverlay(null);openDetail(a);}}
          />
        )}

        {detailData&&<AnimeDetail malId={detailData.mal_id} seedData={detailData.seedData} onClose={closeDetail}/>}
      </div>
    </AppContext.Provider>
  );
}
