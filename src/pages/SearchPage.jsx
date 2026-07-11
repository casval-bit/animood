import { useState, useEffect, useRef } from "react";
import { useApp, getMoodObj } from "../constants.js";
import { jikan, supabaseRowToAnime } from "../api/jikan.js";
import { sb } from "../api/supabase.js";
import { ptsStore, ptsToPct, topMoods } from "../api/moods.js";
import { Spinner } from "../components/ui.jsx";
import { UserProfilePage } from "./UserProfilePage.jsx";

// ─── SEARCH TAB ICON ──────────────────────────────────────────────────────────
export function SearchTabIcon({active}) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active?"#c084fc":"#4b5563"} strokeWidth="2.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
    </svg>
  );
}

// ─── SEARCH PAGE ──────────────────────────────────────────────────────────────
export function SearchPage({onOpenDetail}) {
  const {me} = useApp();

  const HISTORY_KEY = `animood_search_history_${me?.id || me?.name || "user"}`;
  const loadHistory = () => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]"); } catch { return []; } };
  const saveHistory = (h) => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {} };

  const [query,    setQuery]    = useState("");
  const [tab,      setTab]      = useState("anime"); // anime | studio | members
  const [submitted,setSubmitted]= useState(false);
  const [recent,   setRecent]   = useState(()=>loadHistory());
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [typeFilter,setTypeFilter]=useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const inputRef = useRef(null);

  useEffect(()=>{ const t=setTimeout(()=>inputRef.current?.focus(),150); return()=>clearTimeout(t); },[]);

  // ── Search logic per tab ────────────────────────────────────────────────────
  const doSearch = async q => {
    const t = q.trim(); if(!t) return;
    setQuery(t); setSubmitted(true); setLoading(true); setError(null);
    const updated = [t, ...recent.filter(r=>r.toLowerCase()!==t.toLowerCase())].slice(0,5);
    setRecent(updated); saveHistory(updated);

    try {
      if(tab === "anime") {
        const params = {q:t, limit:24, order_by:"score", sort:"desc", sfw:false};
        if(typeFilter !== "all") params.type = typeFilter;
        const res = await jikan.searchAnime(params);
        const raw = res.data||[];
        const tLow = t.toLowerCase();
        const sorted = [...raw].sort((a,b)=>{
          const aT=(a.title||"").toLowerCase(), bT=(b.title||"").toLowerCase();
          const aE=(a.title_english||"").toLowerCase(), bE=(b.title_english||"").toLowerCase();
          const s=(ti,en)=>(ti===tLow||en===tLow)?3:(ti.startsWith(tLow)||en.startsWith(tLow))?2:(ti.includes(tLow)||en.includes(tLow))?1:0;
          return s(bT,bE)-s(aT,aE);
        });
        setResults(sorted);
      } else if(tab === "studio") {
        // Search studios via Jikan producers endpoint
        const r = await fetch(`https://api.jikan.moe/v4/producers?q=${encodeURIComponent(t)}&order_by=count&sort=desc&limit=20`);
        const d = await r.json();
        setResults(d.data||[]);
      } else if(tab === "members") {
        // Search users in Supabase profiles table
        // Search by name OR username
        const enc = encodeURIComponent(t);
        const rows = await sb.query(
          `profiles?or=(name.ilike.*${enc}*,username.ilike.*${enc}*)&select=username,name,avatar,bio,watched&limit=20`
        );
        setResults(rows||[]);
      }
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const clearSearch = () => { setQuery(""); setSubmitted(false); setResults([]); inputRef.current?.focus(); };

  const TABS = [
    {id:"anime",   label:"Animé",   emoji:"📺"},
    {id:"studio",  label:"Studio",  emoji:"🎬"},
    {id:"members", label:"Membres", emoji:"👥"},
  ];

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",paddingBottom:"80px"}}>

      {/* Search input */}
      <div style={{padding:"16px 14px 10px",flexShrink:0}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)",fontSize:"16px",pointerEvents:"none",color:"#6b7280"}}>🔍</span>
          <input ref={inputRef} value={query}
            onChange={e=>{setQuery(e.target.value); if(submitted&&!e.target.value) clearSearch();}}
            onKeyDown={e=>e.key==="Enter"&&doSearch(query)}
            placeholder={tab==="anime"?"Titre d'animé…":tab==="studio"?"Nom de studio…":"Nom d'utilisateur…"}
            style={{width:"100%",boxSizing:"border-box",padding:"14px 44px 14px 42px",borderRadius:"16px",
              background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.1)",
              color:"#f3f4f6",fontSize:"15px",outline:"none",fontFamily:"inherit",transition:"border-color 0.2s"}}
            onFocus={e=>e.target.style.borderColor="rgba(192,132,252,0.5)"}
            onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.1)"}
          />
          {query && (
            <button onClick={clearSearch} style={{position:"absolute",right:"12px",top:"50%",transform:"translateY(-50%)",
              background:"rgba(255,255,255,0.08)",border:"none",color:"#9ca3af",cursor:"pointer",
              width:"22px",height:"22px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px"}}>✕</button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{padding:"0 14px 10px",flexShrink:0}}>
        <div style={{display:"flex",gap:"6px"}}>
          {TABS.map(t=>{
            const active = tab===t.id;
            return (
              <button key={t.id} onClick={()=>{setTab(t.id);setSubmitted(false);setResults([]);}}
                style={{flex:1,padding:"8px 0",borderRadius:"12px",border:`1.5px solid ${active?"rgba(192,132,252,0.5)":"rgba(255,255,255,0.08)"}`,
                  background:active?"rgba(192,132,252,0.12)":"rgba(255,255,255,0.03)",
                  color:active?"#c084fc":"#6b7280",fontSize:"12px",fontWeight:active?700:500,cursor:"pointer",
                  transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",gap:"5px"}}>
                <span>{t.emoji}</span><span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Type filter for anime tab */}
        {tab==="anime" && (
          <div style={{display:"flex",gap:"4px",marginTop:"8px"}}>
            {[["all","Tout"],["TV","Animé"],["Movie","Film"],["OVA","OAV"]].map(([v,l])=>(
              <button key={v} onClick={()=>setTypeFilter(v)}
                style={{borderRadius:"8px",padding:"4px 10px",
                  border:typeFilter===v?"1px solid #c084fc":"1px solid rgba(255,255,255,0.08)",
                  background:typeFilter===v?"rgba(192,132,252,0.15)":"transparent",
                  color:typeFilter===v?"#c084fc":"#6b7280",fontSize:"10px",fontWeight:700,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Empty state — recent searches */}
      {!submitted && (
        <div style={{flex:1,padding:"4px 16px 0",overflowY:"auto"}}>
          {recent.length > 0 ? <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
              <div style={{fontSize:"10px",fontWeight:700,color:"#4b5563",textTransform:"uppercase",letterSpacing:"1.5px"}}>
                Recherches récentes
              </div>
              <button onClick={()=>{setRecent([]);saveHistory([]);}}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:"10px",color:"#374151",padding:"2px 6px"}}>
                Effacer
              </button>
            </div>
            {recent.map((r,i)=>(
              <div key={i} onClick={()=>doSearch(r)}
                style={{display:"flex",alignItems:"center",gap:"12px",padding:"13px 6px",
                  background:"none",borderBottom:"1px solid rgba(255,255,255,0.04)",
                  width:"100%",textAlign:"left",borderRadius:"8px",transition:"background 0.15s",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                <div style={{width:"30px",height:"30px",borderRadius:"50%",background:"rgba(255,255,255,0.06)",
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:"13px"}}>🕐</div>
                <span style={{fontSize:"14px",color:"#d1d5db",fontWeight:500,flex:1}}>{r}</span>
                <button onClick={e=>{e.stopPropagation();const u=recent.filter((_,j)=>j!==i);setRecent(u);saveHistory(u);}}
                  style={{background:"none",border:"none",cursor:"pointer",color:"#374151",fontSize:"14px",padding:"4px",borderRadius:"4px"}}
                  onMouseEnter={e=>e.currentTarget.style.color="#6b7280"}
                  onMouseLeave={e=>e.currentTarget.style.color="#374151"}>✕</button>
              </div>
            ))}
          </> : (
            <div style={{textAlign:"center",padding:"50px 0",color:"#374151"}}>
              <div style={{fontSize:"32px",marginBottom:"8px"}}>
                {tab==="anime"?"📺":tab==="studio"?"🎬":"👥"}
              </div>
              <p style={{fontSize:"12px",fontWeight:600,color:"#4b5563"}}>
                {tab==="anime"?"Cherche un animé":tab==="studio"?"Cherche un studio":"Cherche un membre"}
              </p>
              <p style={{fontSize:"11px",color:"#374151",marginTop:"4px"}}>Tes 5 dernières recherches apparaîtront ici</p>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {submitted && (
        <div style={{flex:1,overflowY:"auto",padding:"0 14px"}}>
          {/* Count */}
          <div style={{padding:"0 0 8px",fontSize:"10px",color:"#4b5563",fontWeight:600}}>
            {loading ? "Recherche…" : `${results.length} résultat${results.length!==1?"s":""}`}
          </div>

          {loading && <Spinner label="Recherche en cours…"/>}
          {error && <div style={{textAlign:"center",padding:"30px",color:"#ef4444",fontSize:"12px"}}>Erreur: {error}</div>}
          {!loading && results.length===0 && (
            <div style={{textAlign:"center",padding:"50px 0",color:"#374151"}}>
              <div style={{fontSize:"40px",marginBottom:"10px"}}>🔍</div>
              <p style={{fontWeight:700,color:"#4b5563",marginBottom:"4px"}}>Aucun résultat</p>
              <p style={{fontSize:"11px"}}>Essaie un autre terme</p>
            </div>
          )}

          {/* ── ANIME results ── */}
          {!loading && tab==="anime" && (
            <div style={{display:"flex",flexDirection:"column",gap:"9px",paddingBottom:"8px"}}>
              {results.map((a,idx)=>{
                const status=(me.statuses||{})[a.mal_id];
                const isWatched=me.watched.includes(a.mal_id);
                const myR=me.ratings[a.mal_id];
                const statusColors={completed:"#3b82f6",watching:"#22c55e",dropped:"#ef4444",onhold:"#f59e0b",watchlist:"#9ca3af"};
                const statusDot=statusColors[status];
                return (
                  <div key={a.mal_id} onClick={()=>onOpenDetail(a)}
                    style={{display:"flex",gap:"11px",background:"rgba(255,255,255,0.04)",
                      borderRadius:"14px",border:"1px solid rgba(255,255,255,0.07)",
                      overflow:"hidden",cursor:"pointer",
                      animation:`slideUp 0.25s ${idx*0.03}s both`}}>
                    <div style={{width:"64px",flexShrink:0,position:"relative"}}>
                      <img src={a.images?.jpg?.large_image_url||a.images?.jpg?.image_url||a.image_url}
                        alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",minHeight:"96px"}}
                        onError={e=>{e.target.src="https://placehold.co/64x96/1a1a2e/818cf8?text=?";}}/>
                      {isWatched&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px"}}>✓</div>}
                      {a.score&&<div style={{position:"absolute",bottom:"4px",right:"4px",background:"rgba(0,0,0,0.8)",borderRadius:"4px",padding:"1px 4px",fontSize:"9px",fontWeight:800,color:"#fbbf24"}}>★{a.score}</div>}
                      {statusDot&&<div style={{position:"absolute",top:"4px",left:"4px",width:"7px",height:"7px",borderRadius:"50%",background:statusDot,boxShadow:`0 0 4px ${statusDot}`}}/>}
                    </div>
                    <div style={{flex:1,padding:"9px 9px 9px 0",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:"12px",fontWeight:800,color:"#f3f4f6",lineHeight:1.3,marginBottom:"2px"}}>{a.title}</div>
                        <div style={{fontSize:"10px",color:"#6b7280",marginBottom:"4px"}}>{a.year||"?"} · {a.type}{a.episodes?` · ${a.episodes} eps`:""}</div>
                        <div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>
                          {(a.genres||[]).slice(0,2).map(g=>(
                            <span key={g.name||g} style={{fontSize:"9px",background:"rgba(129,140,248,0.12)",color:"#818cf8",borderRadius:"4px",padding:"1px 5px",fontWeight:600}}>{g.name||g}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:"5px",marginTop:"5px"}}>
                        {myR&&<span style={{fontSize:"10px",color:"#a78bfa",fontWeight:700}}>★{myR.score}</span>}
                        <div style={{marginLeft:"auto",display:"flex",gap:"3px"}}>
                          {topMoods(ptsToPct(ptsStore[a.mal_id]||{}),2).map(([mid,val])=>{
                            const m=getMoodObj(mid);
                            return m?<span key={mid} style={{fontSize:"9px",color:m.color,fontWeight:700}}>{m.emoji}{val}%</span>:null;
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── STUDIO results ── */}
          {!loading && tab==="studio" && (
            <div style={{display:"flex",flexDirection:"column",gap:"8px",paddingBottom:"8px"}}>
              {results.map((s,idx)=>(
                <div key={s.mal_id}
                  style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 14px",
                    background:"rgba(255,255,255,0.04)",borderRadius:"14px",
                    border:"1px solid rgba(255,255,255,0.07)",cursor:"pointer",
                    animation:`slideUp 0.25s ${idx*0.03}s both`}}>
                  <div style={{width:"44px",height:"44px",borderRadius:"10px",flexShrink:0,overflow:"hidden",
                    background:"rgba(129,140,248,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {s.images?.jpg?.image_url
                      ? <img src={s.images.jpg.image_url} alt={s.titles?.[0]?.title} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      : <span style={{fontSize:"20px"}}>🎬</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"13px",fontWeight:800,color:"#f3f4f6"}}>{s.titles?.[0]?.title||"Studio"}</div>
                    <div style={{fontSize:"10px",color:"#6b7280",marginTop:"2px"}}>
                      {s.count ? `${s.count} animés` : "Studio d'animation"}
                      {s.established ? ` · Fondé en ${s.established}` : ""}
                    </div>
                  </div>
                  <span style={{fontSize:"18px",color:"#374151"}}>›</span>
                </div>
              ))}
            </div>
          )}

          {/* ── MEMBERS results ── */}
          {!loading && tab==="members" && (
            <div style={{display:"flex",flexDirection:"column",gap:"8px",paddingBottom:"8px"}}>
              {results.map((u,idx)=>(
                <div key={u.username} onClick={()=>setSelectedUser(u.username)}
                  style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 14px",
                    background:"rgba(255,255,255,0.04)",borderRadius:"14px",cursor:"pointer",
                    border:"1px solid rgba(255,255,255,0.07)",
                    animation:`slideUp 0.25s ${idx*0.03}s both`}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
                  <div style={{width:"44px",height:"44px",borderRadius:"50%",flexShrink:0,
                    background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",overflow:"hidden"}}>
                    {u.avatar && u.avatar.startsWith("http")
                      ? <img src={u.avatar} alt={u.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      : (u.avatar||"👤")}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"13px",fontWeight:800,color:"#f3f4f6"}}>{u.name||u.username}</div>
                    <div style={{fontSize:"10px",color:"#6b7280",marginTop:"2px"}}>
                      @{u.username}
                      {u.watched?.length ? ` · ${u.watched.length} animés vus` : ""}
                    </div>
                    {u.bio && <div style={{fontSize:"10px",color:"#9ca3af",marginTop:"3px",fontStyle:"italic"}}>{u.bio}</div>}
                  </div>
                  <span style={{fontSize:"18px",color:"#4b5563"}}>›</span>
                </div>
              ))}
              {results.length===0 && !loading && submitted && (
                <div style={{textAlign:"center",padding:"40px 0",color:"#374151"}}>
                  <div style={{fontSize:"32px",marginBottom:"8px"}}>👥</div>
                  <p style={{fontSize:"12px",fontWeight:600,color:"#4b5563"}}>Aucun membre trouvé</p>
                  <p style={{fontSize:"11px",marginTop:"4px"}}>Les membres doivent avoir un compte AniMood</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* User profile overlay */}
      {selectedUser && (
        <UserProfilePage username={selectedUser} onClose={()=>setSelectedUser(null)}/>
      )}
    </div>
  );
}
