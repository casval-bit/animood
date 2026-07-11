import { useState, useEffect, useRef } from "react";
import { useApp, STATUS_COLORS, AVATAR_EMOJIS, MOOD_KEYS } from "../constants.js";
import { jikan } from "../api/jikan.js";
import { getCombinedPts } from "../api/moods.js";
import { saveProfile } from "../api/supabase.js";
import { Spinner, ScoreChart, MoodOctagon, FavoriteSearchPopup } from "../components/ui.jsx";

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────
// ─── AVATAR EMOJIS ────────────────────────────────────────────────────────────

// ─── PERSONAL MOOD RADAR ──────────────────────────────────────────────────────
function PersonalMoodRadar({ratings, watched}) {
  const [avg, setAvg] = useState(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Use all watched anime (not just rated ones)
  const allIds = watched.length > 0 ? watched : Object.keys(ratings).map(Number);

  useEffect(() => {
    if(allIds.length === 0) { setLoading(false); return; }

    async function loadMoods() {
      setLoading(true);
      const totals = {};
      MOOD_KEYS.forEach(k => { totals[k] = 0; });
      let cnt = 0;

      // Batch fetch mood_pts_v2 in chunks of 100
      const chunks = [];
      for(let i = 0; i < allIds.length; i += 100) chunks.push(allIds.slice(i, i+100));

      for(const chunk of chunks) {
        try {
          const { sb } = await import("../api/supabase.js");
          const rows = await sb.query(`mood_pts_v2?mal_id=in.(${chunk.join(",")})&select=mal_id,emotional,happy,twisted,chill,in_love,hype,dark,thrills`);
          (rows||[]).forEach(row => {
            const hasData = MOOD_KEYS.some(k => (row[k]||0) > 0);
            if(hasData) {
              MOOD_KEYS.forEach(k => { totals[k] += row[k]||0; });
              cnt++;
            }
          });
        } catch {}
      }

      if(cnt > 0) {
        const a = {};
        MOOD_KEYS.forEach(k => { a[k] = Math.round(totals[k] / cnt); });
        setAvg(a);
        setCount(cnt);
      }
      setLoading(false);
    }

    loadMoods();
  }, [allIds.length, watched.length]);

  if(loading) return (
    <div style={{marginBottom:"22px"}}>
      <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>🎭 Ton profil émotionnel</div>
      <Spinner label="Calcul en cours…"/>
    </div>
  );
  if(!avg) return null;

  return (
    <div style={{marginBottom:"22px"}}>
      <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"4px"}}>🎭 Ton profil émotionnel</div>
      <div style={{fontSize:"10px",color:"#4b5563",marginBottom:"8px"}}>Basé sur {count} animés vus sur {allIds.length}</div>
      <MoodOctagon pts={avg}/>
    </div>
  );
}

// ─── TOP GENRES ───────────────────────────────────────────────────────────────
function TopGenres({watched}) {
  const [top5,  setTop5]  = useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    if(watched.length===0){setLoading(false);return;}
    async function load() {
      setLoading(true);
      const genreCount={};
      // Batch fetch genres from anime_cache
      const chunks=[];
      for(let i=0;i<watched.length;i+=100) chunks.push(watched.slice(i,i+100));
      for(const chunk of chunks){
        try{
          const {sb}=await import("../api/supabase.js");
          const rows=await sb.query(`anime_cache?mal_id=in.(${chunk.join(",")})&select=genres`);
          (rows||[]).forEach(row=>{
            (row.genres||[]).forEach(g=>{
              const name=g.name||g;
              genreCount[name]=(genreCount[name]||0)+1;
            });
          });
        }catch{}
      }
      const sorted=Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
      setTop5(sorted);
      setLoading(false);
    }
    load();
  },[watched.length]);

  if(loading) return (
    <div style={{marginBottom:"22px"}}>
      <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>🎌 Genres les plus vus</div>
      <Spinner label="Chargement…"/>
    </div>
  );
  if(top5.length===0) return null;
  const max=top5[0][1];

  return (
    <div style={{marginBottom:"22px"}}>
      <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>🎌 Genres les plus vus</div>
      <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
        {top5.map(([name,count])=>(
          <div key={name}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
              <span style={{fontSize:"11px",color:"#d1d5db",fontWeight:600}}>{name}</span>
              <span style={{fontSize:"10px",color:"#6b7280"}}>{count}</span>
            </div>
            <div style={{height:"5px",borderRadius:"3px",background:"rgba(255,255,255,0.06)",overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:"3px",width:`${(count/max)*100}%`,background:"linear-gradient(90deg,#7c3aed,#818cf8)",transition:"width 0.5s ease"}}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WATCHLIST TAB ────────────────────────────────────────────────────────────
function WatchlistTab({me, setMe, animeCache, onOpenDetail}) {
  const watchlistIds = Object.entries(me.statuses||{})
    .filter(([,s]) => s === "watchlist")
    .map(([id]) => parseInt(id));
  const [isPublic, setIsPublic] = useState(me.watchlistPublic || false);
  const [expanded, setExpanded] = useState(false);

  const togglePublic = (e) => {
    e.stopPropagation();
    const updated = {...me, watchlistPublic: !isPublic};
    setMe(updated); setIsPublic(!isPublic);
    saveProfile(me.id || me.name?.toLowerCase() || "brice", updated);
  };

  const displayIds = expanded ? watchlistIds : watchlistIds.slice(0, 8);

  return (
    <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
      {/* Watchlist card */}
      <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"16px",border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden",marginBottom:"12px"}}>
        {/* Header */}
        <div onClick={()=>setExpanded(e=>!e)}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <span style={{fontSize:"18px"}}>🎯</span>
            <div>
              <div style={{fontSize:"13px",fontWeight:800,color:"#f3f4f6"}}>Watchlist</div>
              <div style={{fontSize:"10px",color:"#6b7280"}}>{watchlistIds.length} animé{watchlistIds.length!==1?"s":""}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <button onClick={togglePublic}
              style={{padding:"4px 10px",borderRadius:"8px",fontSize:"10px",fontWeight:700,cursor:"pointer",
                border:`1px solid ${isPublic?"rgba(192,132,252,0.4)":"rgba(255,255,255,0.1)"}`,
                background:"transparent",color:isPublic?"#c084fc":"#6b7280"}}>
              {isPublic?"🔓":"🔒"}
            </button>
            <span style={{color:"#6b7280",fontSize:"14px"}}>{expanded?"▲":"▼"}</span>
          </div>
        </div>

        {/* Preview grid — always show 4 posters collapsed, full grid expanded */}
        {watchlistIds.length > 0 && (
          <div style={{padding:"0 12px 14px"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"5px"}}>
              {displayIds.map(id => {
                const a = animeCache[id];
                const img = a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url;
                return (
                  <div key={id} onClick={()=>a&&onOpenDetail(a)}
                    style={{aspectRatio:"2/3",borderRadius:"6px",overflow:"hidden",cursor:"pointer",
                      background:"rgba(255,255,255,0.04)",border:"1px solid rgba(156,163,175,0.15)"}}>
                    {img
                      ? <img src={img} alt={a?.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>
                      : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",color:"rgba(255,255,255,0.1)"}}>🎯</div>}
                  </div>
                );
              })}
            </div>
            {watchlistIds.length > 8 && (
              <button onClick={()=>setExpanded(e=>!e)}
                style={{width:"100%",marginTop:"8px",padding:"7px",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.08)",
                  background:"transparent",color:"#6b7280",fontSize:"11px",fontWeight:700,cursor:"pointer"}}>
                {expanded ? "Réduire" : `Voir tout (${watchlistIds.length})`}
              </button>
            )}
          </div>
        )}
        {watchlistIds.length === 0 && (
          <div style={{padding:"20px",textAlign:"center",color:"#374151"}}>
            <p style={{fontSize:"12px"}}>Ajoute des animés via 🎯 sur leur fiche</p>
          </div>
        )}
      </div>

      {/* Placeholder for future custom lists */}
      <div style={{padding:"16px",borderRadius:"12px",border:"1px dashed rgba(255,255,255,0.08)",textAlign:"center",color:"#374151"}}>
        <div style={{fontSize:"20px",marginBottom:"6px"}}>➕</div>
        <p style={{fontSize:"11px",fontWeight:600,color:"#4b5563"}}>Créer une liste personnalisée</p>
        <p style={{fontSize:"10px",color:"#374151",marginTop:"3px"}}>Bientôt disponible</p>
      </div>
    </div>
  );
}

// ─── WATCHLIST TAB inserted above ──────────────────────────────────────────────
function ProfilePage({onOpenDetail, onOpenSettings}) {
  const {me, setMe}             = useApp();
  const [tab, setTab]           = useState("profile");
  const [journalFilter, setJournalFilter] = useState(null);
  const [journalGrid, setJournalGrid]     = useState(false);
  const [animeCache, setAnimeCache]       = useState({});
  const [favPopup, setFavPopup]           = useState(null);
  const [holdTimer, setHoldTimer]         = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [editingBio, setEditingBio]       = useState(false);
  const [bioInput, setBioInput]           = useState(me.bio||"");
  const [dragOver, setDragOver]           = useState(null);
  const [dragging, setDragging]           = useState(null);
  const [editingFavs, setEditingFavs]     = useState(false);

  const fetchAnime = async (id) => {
    if(!id || animeCache[id]) return;
    try { const r = await jikan.getAnime(id); setAnimeCache(p=>({...p,[id]:r.data})); } catch {}
  };

  useEffect(()=>{
    const priority = [
      ...(me.favorites||[]).filter(Boolean).slice(0,5),
      ...Object.keys(me.statuses||{})
        .filter(id=>(me.statuses||{})[id]==="completed")
        .map(Number).filter(id=>!(me.hiddenCompleted||[]).includes(id))
        .slice(-5).reverse(),
    ];
    priority.forEach(id => fetchAnime(id));
  }, []);

  useEffect(()=>{
    if(tab !== "journal") return;
    const watchlistIds = Object.entries(me.statuses||{}).filter(([,s])=>s==="watchlist").map(([id])=>parseInt(id));
    const ids = [...new Set([...me.watched, ...watchlistIds])].reverse().slice(0, 80);
    ids.forEach(id => fetchAnime(id));
  }, [tab]);

  useEffect(()=>{
    if(tab !== "lists") return;
    const watchlistIds = Object.entries(me.statuses||{})
      .filter(([,s])=>s==="watchlist").map(([id])=>parseInt(id)).slice(0,40);
    watchlistIds.forEach(id => fetchAnime(id));
  }, [tab]);

  const getAnime = id => animeCache[id] || {mal_id:id, title:`MAL #${id}`, images:{jpg:{}}};
  const rated    = Object.keys(me.ratings).map(Number);
  const avgScore = rated.length?(rated.reduce((a,id)=>a+me.ratings[id].score,0)/rated.length).toFixed(1):"—";
  const hidden   = me.hiddenCompleted || [];
  const completed = Object.entries(me.statuses||{})
    .filter(([,s])=>s==="completed").map(([id])=>Number(id))
    .filter(id=>!hidden.includes(id)).slice(-5).reverse();

  const startHold = (type,payload) => {
    const t = setTimeout(()=>setConfirmRemove({type,payload}), 600);
    setHoldTimer(t);
  };
  const cancelHold = () => { if(holdTimer){clearTimeout(holdTimer);setHoldTimer(null);} };

  // Drag & drop for favorites
  const handleDragStart = (idx) => setDragging(idx);
  const handleDragOver  = (e,idx) => { e.preventDefault(); setDragOver(idx); };
  const handleDrop      = (idx) => {
    if(dragging === null || dragging === idx) { setDragging(null); setDragOver(null); return; }
    const favs = [...(me.favorites||[null,null,null,null,null])];
    const tmp = favs[dragging]; favs[dragging] = favs[idx]; favs[idx] = tmp;
    const updated = {...me, favorites:favs};
    setMe(updated); saveProfile("brice",updated);
    setDragging(null); setDragOver(null);
  };

  // Journal = watched + watchlist (all tracked anime)
  const STATUS_PRIORITY = {watching:0, onhold:1, completed:2, watchlist:3, dropped:4};
  const allTrackedIds = [
    ...new Set([
      ...me.watched,
      ...Object.entries(me.statuses||{}).filter(([,s])=>s==="watchlist").map(([id])=>parseInt(id)),
    ])
  ];
  const journalEntries = allTrackedIds
    .filter(id => !journalFilter || ((me.statuses||{})[id]||"completed") === journalFilter)
    .sort((a,b) => {
      const sa = STATUS_PRIORITY[(me.statuses||{})[a]||"completed"] ?? 5;
      const sb2 = STATUS_PRIORITY[(me.statuses||{})[b]||"completed"] ?? 5;
      return sa - sb2;
    });

  const TABS = [{id:"profile",label:"Profil"},{id:"journal",label:"Journal"},{id:"lists",label:"Listes"},{id:"posts",label:"Mes Posts"}];

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",paddingBottom:"80px",position:"relative"}}>

      {/* Header */}
      <div style={{padding:"16px 18px 0",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:"22px",fontWeight:900,color:"#f3f4f6",letterSpacing:"-0.5px"}}>{me.name}</div>
          {me.bio
            ? <div style={{fontSize:"12px",color:"#9ca3af",marginTop:"2px",fontStyle:"italic"}}>{me.bio}</div>
            : <div style={{fontSize:"11px",color:"#374151",marginTop:"1px"}}>@{me.name.toLowerCase()} · AniMood</div>}
        </div>
        <button onClick={onOpenSettings} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"10px",padding:"8px 12px",color:"#9ca3af",fontSize:"12px",fontWeight:700,cursor:"pointer"}}>⚙️</button>
      </div>

      {/* Tabs */}
      <div style={{padding:"14px 18px 0",flexShrink:0,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{display:"flex"}}>
          {TABS.map(t=>{
            const active=tab===t.id;
            return <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",padding:"8px 0 12px",textAlign:"center",position:"relative"}}>
              <span style={{fontSize:"11px",fontWeight:active?700:500,color:active?"#f3f4f6":"#4b5563"}}>{t.label}</span>
              {active&&<div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:"2px",borderRadius:"2px",background:"linear-gradient(90deg,#7c3aed,#818cf8)"}}/>}
            </button>;
          })}
        </div>
      </div>

      {/* ── PROFIL ── */}
      {tab==="profile"&&(
        <div style={{flex:1,overflowY:"auto",padding:"18px 18px 0"}}>

          {/* Avatar + stats */}
          <div style={{display:"flex",alignItems:"center",gap:"16px",marginBottom:"16px"}}>
            <div style={{position:"relative"}}>
              <div onClick={()=>setShowAvatarPicker(true)}
                style={{width:"72px",height:"72px",borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:"32px",flexShrink:0,
                  boxShadow:"0 0 0 3px rgba(124,58,237,0.3)",cursor:"pointer",transition:"transform 0.15s",overflow:"hidden"}}
                onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"}
                onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                {me.avatar && me.avatar.startsWith("http")
                  ? <img src={me.avatar} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  : me.avatar}
              </div>
              <div style={{position:"absolute",bottom:0,right:0,width:"20px",height:"20px",borderRadius:"50%",
                background:"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",
                border:"2px solid #09080f",cursor:"pointer"}} onClick={()=>setShowAvatarPicker(true)}>✏️</div>
            </div>
            <div style={{flex:1}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
                {[{l:"Vus",v:me.watched.length},{l:"Notés",v:rated.length},{l:"Moy.",v:avgScore}].map(s=>(
                  <div key={s.l} style={{textAlign:"center"}}>
                    <div style={{fontSize:"18px",fontWeight:900,color:"#c084fc"}}>{s.v}</div>
                    <div style={{fontSize:"9px",color:"#6b7280",marginTop:"1px"}}>{s.l}</div>
                  </div>
                ))}
              </div>
              {/* Bio éditable */}
              <div style={{marginTop:"8px"}}>
                {editingBio
                  ? <div style={{display:"flex",gap:"6px"}}>
                      <input value={bioInput} onChange={e=>setBioInput(e.target.value)} maxLength={60}
                        placeholder="Ton style d'anime…"
                        style={{flex:1,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(124,58,237,0.4)",
                          borderRadius:"8px",padding:"5px 8px",color:"#f3f4f6",fontSize:"11px",outline:"none"}}
                        onKeyDown={e=>{if(e.key==="Enter"){const u={...me,bio:bioInput};setMe(u);saveProfile("brice",u);setEditingBio(false);}
                                       if(e.key==="Escape")setEditingBio(false);}}/>
                      <button onClick={()=>{const u={...me,bio:bioInput};setMe(u);saveProfile("brice",u);setEditingBio(false);}}
                        style={{background:"#7c3aed",border:"none",borderRadius:"8px",padding:"5px 10px",color:"#fff",fontSize:"11px",fontWeight:700,cursor:"pointer"}}>✓</button>
                    </div>
                  : <button onClick={()=>{setBioInput(me.bio||"");setEditingBio(true);}}
                      style={{background:"none",border:"1px dashed rgba(255,255,255,0.1)",borderRadius:"8px",
                        padding:"4px 8px",color:"#4b5563",fontSize:"10px",cursor:"pointer",width:"100%",textAlign:"left"}}>
                      {me.bio || "✏️ Ajoute une bio…"}
                    </button>}
              </div>
            </div>
          </div>

          {/* Favoris — mobile style */}
          <div style={{marginBottom:"22px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>❤️ Favoris</div>
              {editingFavs
                ? <button onClick={()=>setEditingFavs(false)} style={{fontSize:"11px",fontWeight:700,color:"#c084fc",background:"none",border:"none",cursor:"pointer"}}>Terminé</button>
                : <button onClick={()=>setEditingFavs(true)} style={{fontSize:"11px",fontWeight:600,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>Modifier</button>}
            </div>
            <div style={{display:"flex",gap:"6px"}}>
              {(me.favorites||[null,null,null,null,null]).slice(0,5).map((favId,slotIdx)=>{
                const a = favId ? getAnime(favId) : null;
                const img = a?.images?.jpg?.large_image_url || a?.images?.jpg?.image_url;
                const isDragOver = dragOver === slotIdx;
                const isBeingDragged = dragging === slotIdx;
                return (
                  <div key={slotIdx} style={{flex:1,maxWidth:"64px",position:"relative",
                    animation: editingFavs && a ? "wiggle 0.3s ease infinite alternate" : "none"}}>

                    {/* Main poster */}
                    <div
                      draggable={editingFavs && !!a}
                      onDragStart={()=>editingFavs&&handleDragStart(slotIdx)}
                      onDragOver={e=>editingFavs&&handleDragOver(e,slotIdx)}
                      onDrop={()=>editingFavs&&handleDrop(slotIdx)}
                      onDragEnd={()=>{setDragging(null);setDragOver(null);}}
                      onClick={()=>{ if(editingFavs) return; if(!a) setFavPopup(slotIdx); else onOpenDetail(a); }}
                      style={{aspectRatio:"2/3",borderRadius:"8px",overflow:"hidden",
                        background:a?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.03)",
                        border:isDragOver?"2px solid #7c3aed":editingFavs&&a?"2px solid rgba(124,58,237,0.5)":a?"1px solid rgba(255,255,255,0.08)":"2px dashed rgba(255,255,255,0.1)",
                        cursor:editingFavs?(a?"grab":"default"):"pointer",
                        opacity:isBeingDragged?0.4:1,
                        transform:isDragOver?"scale(1.05)":"scale(1)",
                        transition:"transform 0.15s,border 0.15s"}}>
                      {a&&img
                        ? <img src={img} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/64x96/1a1a2e/818cf8?text=?";}}/>
                        : a
                          ? <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner small/></div>
                          : editingFavs
                            ? <div onClick={()=>setFavPopup(slotIdx)} style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",color:"rgba(255,255,255,0.2)",cursor:"pointer"}}>+</div>
                            : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",color:"rgba(255,255,255,0.2)"}}>+</div>}
                    </div>

                    {/* Edit mode overlays */}
                    {editingFavs && a && (<>
                      {/* Move icon — top left */}
                      <div style={{position:"absolute",top:"-6px",left:"-6px",width:"20px",height:"20px",
                        borderRadius:"50%",background:"rgba(30,20,50,0.95)",border:"1px solid rgba(255,255,255,0.2)",
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",
                        cursor:"grab",zIndex:10}}>⤢</div>
                      {/* Delete icon — top right */}
                      <div onClick={()=>{
                          const newFavs=[...(me.favorites||[null,null,null,null,null])];
                          newFavs[slotIdx]=null;
                          const updated={...me,favorites:newFavs};
                          setMe(updated);saveProfile("brice",updated);
                        }}
                        style={{position:"absolute",top:"-6px",right:"-6px",width:"20px",height:"20px",
                          borderRadius:"50%",background:"#ef4444",border:"2px solid #09080f",
                          display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",
                          cursor:"pointer",zIndex:10,color:"#fff",fontWeight:900}}>✕</div>
                    </>)}

                    {/* Add button in edit mode on empty slot */}
                    {editingFavs && !a && (
                      <div onClick={()=>setFavPopup(slotIdx)}
                        style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
                          justifyContent:"center",cursor:"pointer"}}/>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:"9px",color:"#374151",marginTop:"6px",textAlign:"center"}}>
              {editingFavs ? "Glisse pour réordonner · ✕ pour supprimer" : "Appuie sur Modifier pour changer tes favoris"}
            </div>
          </div>
          <style>{`@keyframes wiggle{from{transform:rotate(-1.5deg)}to{transform:rotate(1.5deg)}}`}</style>

          {/* Derniers complétés */}
          <div style={{marginBottom:"22px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>✅ Derniers complétés</div>
            <div style={{display:"flex",gap:"6px"}}>
              {completed.slice(0,5).map(id=>{
                const a=getAnime(id);
                const img=a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;
                return (
                  <div key={id}
                    style={{flex:1,aspectRatio:"2/3",borderRadius:"8px",overflow:"hidden",maxWidth:"64px",cursor:"pointer",background:"rgba(255,255,255,0.04)",border:"1px solid #1e3a5f"}}
                    onClick={()=>onOpenDetail(a)}
                    onMouseDown={()=>startHold("completed",id)}
                    onMouseUp={cancelHold} onMouseLeave={cancelHold}
                    onTouchStart={()=>startHold("completed",id)} onTouchEnd={cancelHold}>
                    {img?<img src={img} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/64x96/1a1a2e/818cf8?text=?";}}/>
                       :<div style={{width:"100%",height:"100%",background:"rgba(30,58,95,0.3)",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner small/></div>}
                  </div>
                );
              })}
              {Array.from({length:Math.max(0,5-completed.length)}).map((_,i)=>(
                <div key={i} style={{flex:1,aspectRatio:"2/3",borderRadius:"8px",background:"rgba(255,255,255,0.03)",border:"2px dashed rgba(255,255,255,0.06)",maxWidth:"64px"}}/>
              ))}
            </div>
          </div>

          {/* Mood radar personnel */}
          <PersonalMoodRadar ratings={me.ratings} watched={me.watched}/>

          {/* Top genres */}
          <TopGenres watched={me.watched}/>

          {/* Distribution notes */}
          <div style={{marginBottom:"22px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>📊 Distribution des notes</div>
            <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"12px",padding:"14px",border:"1px solid rgba(255,255,255,0.06)"}}>
              {rated.length>0?<ScoreChart ratings={me.ratings}/>:<p style={{fontSize:"11px",color:"#4b5563",textAlign:"center",margin:0}}>Note des animés pour voir ta distribution</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── JOURNAL ── */}
      {tab==="journal"&&(
        <div style={{flex:1,overflowY:"auto",padding:"14px 18px 0"}}>
          {/* Contrôles */}
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"10px",alignItems:"center"}}>
            <div style={{display:"flex",gap:"5px",flex:1,flexWrap:"wrap"}}>
              {Object.entries(STATUS_COLORS).map(([k,v])=>{
                const active = journalFilter === k;
                return (
                  <button key={k} onClick={()=>setJournalFilter(active ? null : k)}
                    style={{display:"flex",alignItems:"center",gap:"4px",padding:"5px 9px",borderRadius:"20px",
                      border:`1px solid ${active?v.dot:"rgba(255,255,255,0.08)"}`,
                      background:active?`${v.dot}22`:"rgba(255,255,255,0.03)",cursor:"pointer",transition:"all 0.15s"}}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:v.dot,flexShrink:0}}/>
                    <span style={{fontSize:"10px",color:active?v.dot:"#6b7280",fontWeight:active?700:500}}>{v.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Grid/List toggle */}
            <button onClick={()=>setJournalGrid(g=>!g)}
              style={{padding:"6px 10px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.1)",
                background:journalGrid?"rgba(129,140,248,0.15)":"rgba(255,255,255,0.04)",
                color:journalGrid?"#818cf8":"#6b7280",cursor:"pointer",fontSize:"14px",flexShrink:0}}>
              {journalGrid?"☰":"⊞"}
            </button>
          </div>

          {journalEntries.length === 0 && (
            <div style={{textAlign:"center",padding:"40px",color:"#374151"}}>
              <div style={{fontSize:"34px",marginBottom:"8px"}}>📖</div>
              <p>Ton journal est vide</p>
            </div>
          )}

          {/* GRID VIEW */}
          {journalGrid && journalEntries.length > 0 && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",paddingBottom:"8px"}}>
              {journalEntries.map(id=>{
                const status=(me.statuses||{})[id]||"completed";
                const sc=STATUS_COLORS[status]||STATUS_COLORS.completed;
                const a=getAnime(id);
                const img=a?.images?.jpg?.large_image_url||a?.images?.jpg?.image_url;
                return (
                  <div key={id} onClick={()=>onOpenDetail(a)}
                    style={{aspectRatio:"2/3",borderRadius:"8px",overflow:"hidden",cursor:"pointer",
                      position:"relative",background:"rgba(255,255,255,0.04)",
                      border:`1px solid ${sc.border}`}}>
                    {img&&<img src={img} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>}
                    <div style={{position:"absolute",bottom:"3px",left:"3px",width:"6px",height:"6px",borderRadius:"50%",background:sc.dot,boxShadow:`0 0 4px ${sc.dot}`}}/>
                  </div>
                );
              })}
            </div>
          )}

          {/* LIST VIEW */}
          {!journalGrid && (
            <div style={{display:"flex",flexDirection:"column",gap:"8px",paddingBottom:"8px"}}>
              {journalEntries.map(id=>{
                const status=(me.statuses||{})[id]||"completed";
                const sc=STATUS_COLORS[status]||STATUS_COLORS.completed;
                const a=getAnime(id); const r=me.ratings[id];
                const img=a?.images?.jpg?.image_url||a?.images?.jpg?.large_image_url;
                return (
                  <div key={id} onClick={()=>onOpenDetail(a)}
                    style={{display:"flex",gap:"12px",borderRadius:"12px",border:`1px solid ${sc.border}`,background:sc.bg,overflow:"hidden",cursor:"pointer"}}>
                    <div style={{width:"52px",height:"76px",flexShrink:0,background:"rgba(0,0,0,0.2)",position:"relative"}}>
                      {img&&<img src={img} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>}
                      <div style={{position:"absolute",bottom:"3px",left:"3px",width:"6px",height:"6px",borderRadius:"50%",background:sc.dot}}/>
                    </div>
                    <div style={{flex:1,padding:"9px 9px 9px 0",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:"12px",fontWeight:800,color:"#f3f4f6",lineHeight:1.3}}>{a.title}</div>
                        <div style={{fontSize:"9px",color:sc.dot,fontWeight:700,marginTop:"2px"}}>{sc.label}</div>
                      </div>
                      {r?<span style={{fontSize:"12px",color:"#fbbf24",fontWeight:800}}>★ {r.score}/10</span>
                        :<span style={{fontSize:"10px",color:"#374151"}}>Non noté</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── LISTES ── */}
      {tab==="lists"&&(
        <WatchlistTab me={me} setMe={setMe} animeCache={animeCache} onOpenDetail={onOpenDetail}/>
      )}

      {/* ── MES POSTS ── */}
      {tab==="posts"&&(
        <div style={{flex:1,overflowY:"auto",padding:"18px"}}>
          {(me.posts||[]).length===0
            ?<div style={{textAlign:"center",padding:"40px",color:"#374151"}}>
               <div style={{fontSize:"40px",marginBottom:"12px"}}>✍️</div>
               <p style={{fontWeight:700,color:"#4b5563"}}>Aucun post pour l'instant</p>
             </div>
            :<div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
               {(me.posts||[]).map((post,i)=>(
                 <div key={i} style={{background:"rgba(255,255,255,0.04)",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.07)",padding:"12px 14px"}}>
                   <div style={{fontSize:"10px",color:"#4b5563",marginBottom:"6px"}}>{post.source} · {post.date}</div>
                   <div style={{fontSize:"13px",color:"#e5e7eb"}}>{post.content}</div>
                 </div>
               ))}
             </div>}
        </div>
      )}

      {/* Avatar picker */}
      {showAvatarPicker&&(
        <div onClick={()=>setShowAvatarPicker(false)} style={{position:"absolute",inset:0,zIndex:600,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#161226",borderRadius:"20px 20px 0 0",border:"1px solid rgba(255,255,255,0.1)",padding:"24px",width:"100%"}}>
            <div style={{fontSize:"14px",fontWeight:800,color:"#f3f4f6",marginBottom:"16px",textAlign:"center"}}>Choisir un avatar</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"10px",justifyContent:"center"}}>
              {AVATAR_EMOJIS.map(e=>(
                <button key={e} onClick={()=>{const u={...me,avatar:e};setMe(u);saveProfile("brice",u);setShowAvatarPicker(false);}}
                  style={{fontSize:"28px",background:me.avatar===e?"rgba(124,58,237,0.3)":"rgba(255,255,255,0.05)",
                    border:me.avatar===e?"2px solid #7c3aed":"2px solid transparent",
                    borderRadius:"12px",padding:"8px",cursor:"pointer",width:"50px",height:"50px",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Favorite search popup */}
      {favPopup!==null&&(
        <FavoriteSearchPopup
          onSelect={a=>{
            const newFavs=[...(me.favorites||[null,null,null,null,null])];
            newFavs[favPopup]=a.mal_id;
            const updated={...me,favorites:newFavs};
            setMe(updated); saveProfile("brice",updated);
            setAnimeCache(p=>({...p,[a.mal_id]:a}));
            setFavPopup(null);
          }}
          onClose={()=>setFavPopup(null)}
        />
      )}

      {/* Confirm remove */}
      {confirmRemove&&(
        <div onClick={()=>setConfirmRemove(null)} style={{position:"absolute",inset:0,zIndex:600,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#161226",borderRadius:"20px",border:"1px solid rgba(255,255,255,0.1)",padding:"24px",width:"100%",maxWidth:"300px"}}>
            <div style={{fontSize:"15px",fontWeight:800,color:"#f3f4f6",marginBottom:"8px"}}>
              {confirmRemove.type==="fav"?"Retirer des favoris ?":"Ne pas afficher ?"}
            </div>
            <p style={{fontSize:"12px",color:"#6b7280",marginBottom:"20px",lineHeight:1.5}}>
              {confirmRemove.type==="fav"?"Ce slot deviendra vide.":"Cet animé sera masqué de tes derniers complétés."}
            </p>
            <div style={{display:"flex",gap:"10px"}}>
              <button onClick={()=>setConfirmRemove(null)} style={{flex:1,padding:"11px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"#9ca3af",fontWeight:700,fontSize:"13px",cursor:"pointer"}}>Annuler</button>
              <button onClick={()=>{
                if(confirmRemove.type==="fav"){
                  const newFavs=[...(me.favorites||[null,null,null,null,null])];
                  newFavs[confirmRemove.payload]=null;
                  const updated={...me,favorites:newFavs};
                  setMe(updated); saveProfile("brice",updated);
                } else {
                  const updated={...me,hiddenCompleted:[...(me.hiddenCompleted||[]),confirmRemove.payload]};
                  setMe(updated); saveProfile("brice",updated);
                }
                setConfirmRemove(null);
              }} style={{flex:1,padding:"11px",borderRadius:"10px",border:"none",background:"rgba(239,68,68,0.2)",color:"#ef4444",fontWeight:700,fontSize:"13px",cursor:"pointer"}}>
                {confirmRemove.type==="fav"?"Retirer":"Ne pas afficher"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export { ProfilePage, PersonalMoodRadar, TopGenres };
