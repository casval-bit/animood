// ─── ANIMOOD — App Root ───────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { AppContext, DEFAULT_PROFILE } from "./constants.js";
import { loadSession, saveSession, clearSession, loadProfile, saveProfile } from "./api/supabase.js";
import { MoodboardPage, ResultsOverlay } from "./pages/MoodboardPage.jsx";
import { SearchPage, SearchTabIcon } from "./pages/SearchPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";
import { AnimeDetail } from "./pages/AnimeDetail.jsx";
import { LoginScreen, SettingsPage } from "./pages/LoginSettings.jsx";
import { Spinner } from "./components/ui.jsx";

function FeedPage()  { return <div style={{padding:"80px 20px",color:"#6b7280",textAlign:"center"}}><div style={{fontSize:"48px",marginBottom:"12px"}}>🏠</div><p style={{fontWeight:700,color:"#9ca3af"}}>Feed — bientôt</p></div>; }
function ForumPage() { return <div style={{padding:"80px 20px",color:"#6b7280",textAlign:"center"}}><div style={{fontSize:"48px",marginBottom:"12px"}}>💬</div><p style={{fontWeight:700,color:"#9ca3af"}}>Forum — bientôt</p></div>; }

export default function AniMoodApp() {
  const [session,setSession]         = useState(()=>loadSession());
  const [activeTab,setActiveTab]     = useState("moodboard");
  const [showSettings,setShowSettings] = useState(false);
  const [overlay,setOverlay]         = useState(null);
  const [detailData,setDetailData]   = useState(null);
  const [profileReady,setProfileReady] = useState(false);
  const [me,setMe]                   = useState(DEFAULT_PROFILE);

  useEffect(()=>{
    if(!session) return;
    loadProfile("brice").then(p => { if(p) setMe(p); setProfileReady(true); });
  }, [session]);

  // Persist profile on change
  useEffect(()=>{ if(session && profileReady) saveProfile("brice", me); }, [me]);

  const handleLogin  = (s) => { saveSession(s); setSession(s); };
  const handleLogout = () => { clearSession(); setSession(null); setProfileReady(false); };

  if(!session) return <LoginScreen onLogin={handleLogin}/>;
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

        {/* TOP BAR */}
        <div style={{position:"absolute",top:0,left:0,right:0,zIndex:10,padding:"16px 20px 12px",background:"linear-gradient(180deg,rgba(9,8,15,0.98) 0%,rgba(9,8,15,0) 100%)",display:"flex",alignItems:"center",justifyContent:"space-between",pointerEvents:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
            <span style={{fontSize:"18px"}}>🌀</span>
            <span style={{fontWeight:900,fontSize:"16px",letterSpacing:"-0.5px",background:"linear-gradient(90deg,#c084fc,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>AniMood</span>
          </div>
          <div style={{pointerEvents:"all",cursor:"pointer"}} onClick={()=>setActiveTab("profile")}>
            <span style={{fontSize:"13px",color:"#6b7280"}}>{me.avatar} {me.name}</span>
          </div>
        </div>

        {/* PAGE */}
        <div style={{flex:1,overflowY:"auto",paddingTop:"56px"}}>{pages[activeTab]}</div>

        {/* BOTTOM NAV */}
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

        {/* SETTINGS */}
        {showSettings&&(
          <div style={{position:"absolute",inset:0,zIndex:500,background:"#09080f",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"16px 18px",display:"flex",alignItems:"center",gap:"12px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              <button onClick={()=>setShowSettings(false)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:"20px",padding:0}}>←</button>
              <span style={{fontSize:"16px",fontWeight:800,color:"#f3f4f6"}}>Paramètres</span>
            </div>
            <SettingsPage onLogout={()=>{handleLogout();setShowSettings(false);}}/>
          </div>
        )}

        {/* MOODBOARD RESULTS */}
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

        {/* ANIME DETAIL */}
        {detailData&&<AnimeDetail malId={detailData.mal_id} seedData={detailData.seedData} onClose={closeDetail}/>}
      </div>
    </AppContext.Provider>
  );
}
