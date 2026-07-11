import { useState, useEffect } from "react";
import { useApp, STATUS_COLORS } from "../constants.js";
import { sb, follows, loadProfile } from "../api/supabase.js";
import { jikan } from "../api/jikan.js";
import { Spinner } from "../components/ui.jsx";

export function UserProfilePage({ username, onClose }) {
  const { me, myUsername } = useApp();
  const isOwnProfile = myUsername === username.toLowerCase();

  const [profile,      setProfile]      = useState(null);
  const [tab,          setTab]          = useState("profile");
  const [loading,      setLoading]      = useState(true);
  const [isFollowing,  setIsFollowing]  = useState(false);
  const [followLoading,setFollowLoading]= useState(false);
  const [followerCount,setFollowerCount]= useState(0);
  const [followingCount,setFollowingCount]=useState(0);
  const [visible,      setVisible]      = useState(false);
  const [animeCache,   setAnimeCache]   = useState({});

  useEffect(()=>{ requestAnimationFrame(()=>setVisible(true)); },[]);

  useEffect(()=>{
    async function load() {
      setLoading(true);
      try {
        // Try loading profile — search by username field
        let prof = await loadProfile(username);
        // If not found, try querying directly
        if(!prof) {
          const rows = await sb.query(`profiles?username=eq.${encodeURIComponent(username)}&limit=1`);
          if(rows?.[0]) prof = { ...rows[0], hiddenCompleted: rows[0].hidden_completed||[] };
        }
        const [isF, followers, following] = await Promise.all([
          isOwnProfile ? Promise.resolve(false) : follows.isFollowing(myUsername, username),
          follows.getFollowers(username),
          follows.getFollowing(username),
        ]);
        setProfile(prof);
        setIsFollowing(isF);
        setFollowerCount(followers.length);
        setFollowingCount(following.length);
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, [username]);

  useEffect(()=>{
    if(!profile || tab !== "journal") return;
    const ids = (profile.watched||[]).slice(-30).reverse();
    ids.forEach(async id => {
      if(animeCache[id]) return;
      try { const r = await jikan.getAnime(id); setAnimeCache(p=>({...p,[id]:r.data})); } catch {}
    });
  }, [tab, profile]);

  const handleFollow = async () => {
    setFollowLoading(true);
    try {
      if(isFollowing) {
        await follows.unfollow(myUsername, username);
        setIsFollowing(false);
        setFollowerCount(c=>c-1);
      } else {
        await follows.follow(myUsername, username);
        setIsFollowing(true);
        setFollowerCount(c=>c+1);
      }
    } catch(e) { console.error(e); }
    finally { setFollowLoading(false); }
  };

  const close = () => { setVisible(false); setTimeout(onClose, 280); };

  const getAnime = id => animeCache[id] || { mal_id:id, title:`#${id}`, images:{jpg:{}} };
  const rated    = Object.keys(profile?.ratings||{}).map(Number);
  const avgScore = rated.length
    ? (rated.reduce((a,id)=>(a + (profile.ratings[id]?.score||0)),0)/rated.length).toFixed(1)
    : "—";

  const TABS = [{id:"profile",label:"Profil"},{id:"journal",label:"Journal"},{id:"lists",label:"Listes"}];
  const STATUS_PRIORITY = {watching:0,onhold:1,completed:2,watchlist:3,dropped:4};

  return (
    <div onClick={close} style={{position:"absolute",inset:0,zIndex:400,
      background:visible?"rgba(0,0,0,0.7)":"rgba(0,0,0,0)",
      backdropFilter:visible?"blur(4px)":"none",transition:"all 0.28s",
      display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>

      <div onClick={e=>e.stopPropagation()}
        style={{background:"#09080f",borderRadius:"24px 24px 0 0",
          border:"1px solid rgba(255,255,255,0.08)",
          maxHeight:"92vh",display:"flex",flexDirection:"column",
          transform:visible?"translateY(0)":"translateY(100%)",transition:"transform 0.28s cubic-bezier(0.32,0.72,0,1)"}}>

        {/* Drag handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}>
          <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)"}}/>
        </div>

        {loading ? (
          <div style={{padding:"60px 0",display:"flex",justifyContent:"center"}}><Spinner label="Chargement…"/></div>
        ) : !profile ? (
          <div style={{padding:"40px",textAlign:"center",color:"#6b7280"}}>
            <div style={{fontSize:"32px",marginBottom:"8px"}}>😶</div>
            <p>Profil introuvable</p>
          </div>
        ) : (<>

          {/* Header */}
          <div style={{padding:"16px 18px 0",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"14px",marginBottom:"14px"}}>
              {/* Avatar */}
              <div style={{width:"60px",height:"60px",borderRadius:"50%",flexShrink:0,
                background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:"26px",overflow:"hidden",
                boxShadow:"0 0 0 2px rgba(124,58,237,0.3)"}}>
                {profile.avatar && profile.avatar.startsWith("http")
                  ? <img src={profile.avatar} alt={profile.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  : (profile.avatar||"👤")}
              </div>

              {/* Name + bio */}
              <div style={{flex:1}}>
                <div style={{fontSize:"18px",fontWeight:900,color:"#f3f4f6"}}>{profile.name||username}</div>
                <div style={{fontSize:"11px",color:"#6b7280"}}>@{username}</div>
                {profile.bio && <div style={{fontSize:"11px",color:"#9ca3af",marginTop:"3px",fontStyle:"italic"}}>{profile.bio}</div>}
              </div>

              {/* Follow button — hidden on own profile */}
              {!isOwnProfile && (
                <button onClick={handleFollow} disabled={followLoading}
                  style={{padding:"9px 18px",borderRadius:"12px",fontWeight:700,fontSize:"13px",cursor:"pointer",
                    border:isFollowing?"1px solid rgba(255,255,255,0.15)":"none",
                    background:isFollowing?"transparent":"linear-gradient(135deg,#7c3aed,#4f46e5)",
                    color:isFollowing?"#9ca3af":"#fff",transition:"all 0.15s",flexShrink:0}}>
                  {followLoading ? "…" : isFollowing ? "Suivi ✓" : "Suivre"}
                </button>
              )}
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",marginBottom:"14px"}}>
              {[
                {l:"Vus",      v:(profile.watched||[]).length},
                {l:"Notés",    v:rated.length},
                {l:"Abonnés",  v:followerCount},
                {l:"Abonnements", v:followingCount},
              ].map(s=>(
                <div key={s.l} style={{textAlign:"center",background:"rgba(255,255,255,0.03)",borderRadius:"10px",padding:"8px 4px",border:"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{fontSize:"16px",fontWeight:900,color:"#c084fc"}}>{s.v}</div>
                  <div style={{fontSize:"9px",color:"#6b7280",marginTop:"1px"}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              {TABS.map(t=>{
                const active=tab===t.id;
                return <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{flex:1,background:"none",border:"none",cursor:"pointer",
                    padding:"8px 0 12px",textAlign:"center",position:"relative"}}>
                  <span style={{fontSize:"11px",fontWeight:active?700:500,color:active?"#f3f4f6":"#4b5563"}}>{t.label}</span>
                  {active&&<div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:"2px",borderRadius:"2px",background:"linear-gradient(90deg,#7c3aed,#818cf8)"}}/>}
                </button>;
              })}
            </div>
          </div>

          {/* ── PROFIL TAB ── */}
          {tab==="profile" && (
            <div style={{flex:1,overflowY:"auto",padding:"16px 18px"}}>
              {/* Favoris */}
              {(profile.favorites||[]).some(Boolean) && (
                <div style={{marginBottom:"20px"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>❤️ Favoris</div>
                  <div style={{display:"flex",gap:"6px"}}>
                    {(profile.favorites||[null,null,null,null,null]).slice(0,5).map((favId,i)=>{
                      const a = favId ? animeCache[favId] : null;
                      const img = a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;
                      return (
                        <div key={i} style={{flex:1,aspectRatio:"2/3",borderRadius:"8px",overflow:"hidden",maxWidth:"64px",
                          background:"rgba(255,255,255,0.04)",border:favId?"1px solid rgba(255,255,255,0.08)":"2px dashed rgba(255,255,255,0.08)"}}>
                          {img && <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
                          {favId && !img && <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner small/></div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Score distribution */}
              {rated.length > 0 && (
                <div>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>📊 Distribution des notes</div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"50px"}}>
                    {[1,2,3,4,5,6,7,8,9,10].map(score=>{
                      const count=rated.filter(id=>(profile.ratings[id]?.score||0)===score).length;
                      const max=Math.max(...[1,2,3,4,5,6,7,8,9,10].map(s=>rated.filter(id=>(profile.ratings[id]?.score||0)===s).length),1);
                      return (
                        <div key={score} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"}}>
                          <div style={{width:"100%",borderRadius:"3px 3px 0 0",background:"linear-gradient(180deg,#7c3aed,#818cf8)",height:`${(count/max)*40}px`,minHeight:count>0?4:0,transition:"height 0.3s"}}/>
                          <span style={{fontSize:"8px",color:"#4b5563"}}>{score}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── JOURNAL TAB ── */}
          {tab==="journal" && (
            <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {[...(profile.watched||[])]
                  .sort((a,b)=>{
                    const sa=STATUS_PRIORITY[(profile.statuses||{})[a]||"completed"]??5;
                    const sb2=STATUS_PRIORITY[(profile.statuses||{})[b]||"completed"]??5;
                    return sa-sb2;
                  })
                  .slice(0,50)
                  .map(id=>{
                    const status=(profile.statuses||{})[id]||"completed";
                    const sc=STATUS_COLORS[status]||STATUS_COLORS.completed;
                    const a=getAnime(id);
                    const r=profile.ratings?.[id];
                    const img=a?.images?.jpg?.image_url||a?.images?.jpg?.large_image_url;
                    return (
                      <div key={id} style={{display:"flex",gap:"12px",borderRadius:"12px",
                        border:`1px solid ${sc.border}`,background:sc.bg,overflow:"hidden"}}>
                        <div style={{width:"48px",height:"70px",flexShrink:0,background:"rgba(0,0,0,0.2)",position:"relative"}}>
                          {img&&<img src={img} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>}
                          <div style={{position:"absolute",bottom:"3px",left:"3px",width:"6px",height:"6px",borderRadius:"50%",background:sc.dot}}/>
                        </div>
                        <div style={{flex:1,padding:"8px 8px 8px 0",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                          <div style={{fontSize:"12px",fontWeight:800,color:"#f3f4f6",lineHeight:1.3}}>{a.title}</div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:"9px",color:sc.dot,fontWeight:700}}>{sc.label}</span>
                            {r&&<span style={{fontSize:"11px",color:"#fbbf24",fontWeight:800}}>★{r.score}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {(profile.watched||[]).length===0&&(
                  <div style={{textAlign:"center",padding:"40px",color:"#374151"}}>
                    <div style={{fontSize:"32px",marginBottom:"8px"}}>📖</div>
                    <p>Aucun animé dans le journal</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── LISTS TAB ── */}
          {tab==="lists" && (
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"12px",color:"#374151"}}>
              <div style={{fontSize:"40px"}}>📋</div>
              <p style={{fontWeight:700,color:"#4b5563"}}>Listes — bientôt</p>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
