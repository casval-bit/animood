import { useState, useEffect } from "react";
import { useApp, MOODS, DURATIONS, MEDIA_TYPES, COUNTRIES, getMoodObj } from "../constants.js";
import { jikan, supabaseRowToAnime } from "../api/jikan.js";
import { sb } from "../api/supabase.js";
import { getPtsForAnime, ptsToPct, getMoodTags, ptsStore } from "../api/moods.js";
import { Spinner, MoodOctagon } from "../components/ui.jsx";

async function fetchMoodboardCandidates(selectedMoods, duration, mediaTypes, countries, me) {
  const countryFilter = countries.includes("all") ? null : countries;
  const MOOD_THRESHOLD = selectedMoods.length === 1 ? 30 : selectedMoods.length === 2 ? 45 : 55;
  const EXCLUDED_STATUSES = new Set(["completed","watching","dropped"]);
  const excluded = new Set(me.watched);
  Object.entries(me.statuses||{}).forEach(([id,status]) => {
    if(EXCLUDED_STATUSES.has(status)) excluded.add(parseInt(id));
  });
  const perPage = 50;
  const allScores = Object.values(me.ratings).map(r=>r.score);
  const isNiche = allScores.length > 50 && allScores.reduce((a,b)=>a+b,0)/allScores.length >= 8.5;
  const pagesToFetch = isNiche ? [1,2,3] : [1,2];
  const allResults = new Map();
  try {
    const baseUrl = `anime_cache?select=mal_id,title,title_en,synopsis,score,rank,year,episodes,type,source,image_url,large_image,genres,studios,producers`;
    const countryParam = countryFilter ? (countryFilter.includes("JP") ? `&country=eq.JP` : `&country=eq.other`) : "";
    for(const page of pagesToFetch) {
      const rows = await sb.query(`${baseUrl}${countryParam}&order=score.desc.nullslast&limit=${perPage}&offset=${(page-1)*perPage}`);
      if(rows?.length) rows.forEach(row => { if(!allResults.has(row.mal_id)) allResults.set(row.mal_id, supabaseRowToAnime(row)); });
    }
  } catch(e) {
    console.error("Supabase failed, fallback Jikan:", e);
    for(const page of pagesToFetch) {
      try {
        const data = await jikan.searchAnime({order_by:"score",sort:"desc",limit:25,min_score:6.5,sfw:false,page});
        (data.data||[]).forEach(a => { if(!allResults.has(a.mal_id)) allResults.set(a.mal_id, a); });
      } catch {}
    }
  }
  let candidates = [...allResults.values()].filter(a => {
    if(excluded.has(a.mal_id)) return false;
    if(["Special","Music","CM","PV"].includes(a.type)) return false;
    return true;
  });
  const seenTitles = new Map();
  candidates = candidates.filter(a => {
    const root = (a.title||"").split(/[:\-–]/)[0].trim().toLowerCase().slice(0,20);
    if(seenTitles.has(root)) { if((a.score||0) > (seenTitles.get(root).score||0)) seenTitles.set(root, a); return false; }
    seenTitles.set(root, a); return true;
  });
  if(duration !== "all") {
    candidates = candidates.filter(a => {
      const eps = a.episodes || 0;
      if(duration === "short")  return eps > 0 && eps <= 13;
      if(duration === "medium") return eps > 13 && eps <= 50;
      if(duration === "long")   return eps > 50;
      return true;
    });
  }
  const withPts = [];
  const slice = candidates.slice(0, 30);
  for(let i = 0; i < slice.length; i += 3) {
    const batch = slice.slice(i, i+3);
    const res = await Promise.all(batch.map(async a => ({...a, _pts: await getPtsForAnime(a)})));
    withPts.push(...res);
  }
  const filterBy = (thresh) => withPts.filter(a => {
    const pct = ptsToPct(a._pts||{});
    return selectedMoods.reduce((acc,m) => acc+(pct[m]||0), 0) >= thresh;
  });
  let matched = filterBy(MOOD_THRESHOLD);
  if(matched.length < 3) matched = filterBy(Math.round(MOOD_THRESHOLD * 0.75));
  if(matched.length < 3) matched = filterBy(Math.round(MOOD_THRESHOLD * 0.5));
  if(matched.length < 3) matched = withPts;
  return matched.map(a => {
    const pct = ptsToPct(a._pts||{});
    const moodScore = selectedMoods.reduce((acc,m) => acc+(pct[m]||0), 0);
    const rankBonus = a.rank && a.rank <= 500 ? 5 : a.rank && a.rank <= 1000 ? 2 : 0;
    return { ...a, _score: moodScore*2 + (a.score||7)*3 + rankBonus };
  }).sort((a,b) => b._score - a._score);
}

function ResultsOverlay({results,onClose,onReroll,onOpenDetail,selectedMoods,generating}) {
  const [visible,setVisible]=useState(false);
  useEffect(()=>{requestAnimationFrame(()=>setVisible(true));},[]);
  const close=()=>{setVisible(false);setTimeout(onClose,300);};
  const cards=(results||[]).slice(0,3).map(a=>({anime:a}));

  return (
    <div onClick={close} style={{position:"absolute",inset:0,zIndex:200,background:visible?"rgba(0,0,0,0.78)":"rgba(0,0,0,0)",backdropFilter:visible?"blur(6px)":"none",transition:"all 0.3s",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#13101f 0%,#0d0b18 100%)",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.08)",maxHeight:"88vh",overflowY:"auto",paddingBottom:"28px",transform:visible?"translateY(0)":"translateY(100%)",transition:"transform 0.35s cubic-bezier(0.32,0.72,0,1)"}}>
        <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"12px auto 14px"}}/>
        <div style={{padding:"0 18px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <h3 style={{margin:"0 0 5px",fontSize:"16px",fontWeight:800,color:"#f3f4f6"}}>{generating?"Analyse en cours…":"Sélection pour toi"}</h3>
            <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
              {selectedMoods.map(mid=>{const m=getMoodObj(mid);return m&&<span key={mid} style={{background:`${m.color}22`,border:`1px solid ${m.color}44`,color:m.color,borderRadius:"20px",padding:"2px 8px",fontSize:"10px",fontWeight:700}}>{m.emoji} {m.label}</span>;})}
            </div>
          </div>
          <button onClick={close} style={{background:"rgba(255,255,255,0.07)",border:"none",color:"#9ca3af",borderRadius:"50%",width:"30px",height:"30px",cursor:"pointer",fontSize:"13px"}}>✕</button>
        </div>
        {generating&&<Spinner label="L'IA analyse les moods…"/>}
        {!generating&&<>
          <div style={{padding:"0 14px",display:"flex",flexDirection:"column",gap:"11px"}}>
            {cards.map(({anime},i)=>{
              const malId=anime.mal_id;
              const rawPts = ptsStore[malId] || anime._pts || {}; const pct = ptsToPct(rawPts);
              const img=anime.images?.jpg?.large_image_url||anime.images?.jpg?.image_url||anime.img||"https://placehold.co/72x108/1a1a2e/818cf8?text=?";
              const title = anime.title||"—";
              return (
                <div key={malId||i} onClick={()=>onOpenDetail(anime)} style={{display:"flex",gap:"11px",cursor:"pointer",background:"rgba(255,255,255,0.04)",borderRadius:"15px",border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden",animation:`slideUp 0.4s ${i*0.08}s both`}}>
                  <div style={{width:"72px",flexShrink:0,position:"relative"}}>
                    <img src={img} alt={title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",minHeight:"108px"}} onError={e=>{e.target.src="https://placehold.co/72x108/1a1a2e/818cf8?text=?";}}/>
                    {anime.score&&<div style={{position:"absolute",bottom:"5px",left:"5px",background:"rgba(0,0,0,0.75)",borderRadius:"5px",padding:"1px 5px",fontSize:"10px",fontWeight:800,color:"#fbbf24"}}>★{anime.score}</div>}
                  </div>
                  <div style={{flex:1,padding:"11px 11px 11px 0",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:"13px",fontWeight:800,color:"#f3f4f6",lineHeight:1.3,marginBottom:"2px"}}>{title}</div>
                      <div style={{fontSize:"10px",color:"#6b7280",marginBottom:"6px"}}>{anime.year||anime.aired?.prop?.from?.year||"?"} · {anime.type}</div>
                      <div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>
                        {(anime.genres||[]).slice(0,2).map(g=>{const name=g.name||g;return<span key={name} style={{fontSize:"9px",background:"rgba(129,140,248,0.12)",color:"#818cf8",borderRadius:"4px",padding:"2px 5px",fontWeight:600}}>{name}</span>;})}
                      </div>
                    </div>
                    {/* Top moods ≥17% only — max 3 */}
                    <div style={{display:"flex",gap:"4px",flexWrap:"wrap",marginTop:"7px"}}>
                      {getMoodTags(rawPts).map(mid=>{
                        const m=getMoodObj(mid);
                        const val=pct[mid]||0;
                        return m?<span key={mid} style={{fontSize:"9px",background:`${m.color}18`,color:m.color,border:`1px solid ${m.color}40`,borderRadius:"20px",padding:"2px 7px",fontWeight:700}}>{m.emoji} {val}%</span>:null;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {cards.length===0&&<div style={{textAlign:"center",padding:"30px",color:"#4b5563"}}><div style={{fontSize:"32px",marginBottom:"8px"}}>😶</div><p style={{fontSize:"12px"}}>Aucun animé trouvé</p></div>}
          </div>
          <div style={{padding:"14px 14px 0"}}>
            <button onClick={onReroll} style={{width:"100%",padding:"13px",borderRadius:"13px",border:"2px solid rgba(129,140,248,0.3)",background:"transparent",color:"#818cf8",fontWeight:800,fontSize:"14px",cursor:"pointer"}}>🎲 Autres suggestions</button>
          </div>
        </>}
      </div>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ─── MOODBOARD PAGE ───────────────────────────────────────────────────────────

function MoodboardPage({onShowResults}) {
  const {me}=useApp();
  const [selectedMoods, setSelectedMoods] = useState([]);
  const [showMoodInfo, setShowMoodInfo]   = useState(false);
  const [duration,      setDuration]      = useState("all");
  const [countries,     setCountries]     = useState(["all"]);
  const [mediaTypes,    setMediaTypes]    = useState(["all"]);
  const [friendReco,    setFriendReco]    = useState(false);

  const toggleMood = id => setSelectedMoods(prev =>
    prev.includes(id) ? prev.filter(m=>m!==id) : prev.length<3 ? [...prev,id] : prev
  );

  const toggleMulti = (val, state, setState) => {
    if(val==="all") { setState(["all"]); return; }
    setState(prev => {
      const w = prev.filter(x=>x!=="all");
      if(w.includes(val)) { const n=w.filter(x=>x!==val); return n.length?n:["all"]; }
      return [...w, val];
    });
  };

  const handleGenerate = async () => {
    onShowResults({results:[], selectedMoods, generating:true, onReroll:null});
    try {
      const candidates = await fetchMoodboardCandidates(selectedMoods, duration, mediaTypes, countries, me);
      onShowResults({
        results: candidates.slice(0,3),
        selectedMoods,
        generating: false,
        onReroll: async () => {
          const fresh = await fetchMoodboardCandidates(selectedMoods, duration, mediaTypes, countries, me);
          return { results: [...fresh].sort(()=>Math.random()-0.5).slice(0,3) };
        },
      });
    } catch(e) {
      onShowResults({results:[], selectedMoods, generating:false, onReroll:null});
    }
  };

  const chipStyle = (sel, color="818cf8") => ({
    flexShrink:0,
    border: sel ? `2px solid #${color}` : "2px solid rgba(255,255,255,0.07)",
    borderRadius:"20px", padding:"7px 13px",
    background: sel ? `rgba(${parseInt(color.slice(0,2),16)},${parseInt(color.slice(2,4),16)},${parseInt(color.slice(4,6),16)},0.15)` : "rgba(255,255,255,0.03)",
    cursor:"pointer", color: sel ? `#${color}` : "#9ca3af",
    fontSize:"12px", fontWeight:600, whiteSpace:"nowrap",
    display:"flex", alignItems:"center", gap:"5px", transition:"all 0.15s",
  });

  return (
    <div style={{height:"100%",overflowY:"auto",paddingBottom:"80px"}}>
      <div style={{padding:"24px 20px 10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"3px"}}>
          <span style={{fontSize:"22px"}}>🎭</span>
          <h2 style={{margin:0,fontSize:"20px",fontWeight:800,letterSpacing:"-0.5px",background:"linear-gradient(90deg,#c084fc,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Moodboard</h2>
        </div>
        <p style={{margin:0,fontSize:"12px",color:"#6b7280"}}>Dis-moi ce que tu ressens → l'IA trouve ton anime</p>
      </div>

      {/* MOODS */}
      <div style={{padding:"4px 20px 0"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"11px"}}>
          <p style={{margin:0,fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>
            Mood <span style={{color:"#4b5563",fontWeight:400,textTransform:"none"}}>(max 3)</span>
          </p>
          <button onClick={()=>setShowMoodInfo(true)}
            style={{width:"22px",height:"22px",borderRadius:"50%",border:"1px solid rgba(255,255,255,0.15)",
              background:"rgba(255,255,255,0.06)",color:"#9ca3af",fontSize:"12px",fontWeight:800,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>?</button>
        </div>

        {/* 3x3 grid with ? button in center (position 5 = index 4) */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
          {[...MOODS.slice(0,4),null,...MOODS.slice(4)].map((m,idx)=>{
            if(!m) return (
              <button key="info" onClick={()=>setShowMoodInfo(true)}
                style={{border:"1px dashed rgba(255,255,255,0.1)",borderRadius:"14px",padding:"14px 6px 12px",
                  background:"rgba(255,255,255,0.02)",cursor:"pointer",textAlign:"center",transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}>
                <div style={{fontSize:"22px",marginBottom:"6px",color:"#374151"}}>?</div>
                <div style={{fontSize:"10px",fontWeight:600,color:"#374151"}}>Infos</div>
              </button>
            );
            const sel=selectedMoods.includes(m.id);
            return(
              <button key={m.id} onClick={()=>toggleMood(m.id)}
                style={{border:sel?`2px solid ${m.color}`:"2px solid rgba(255,255,255,0.07)",borderRadius:"14px",padding:"14px 6px 12px",background:sel?`${m.color}18`:"rgba(255,255,255,0.03)",cursor:"pointer",transition:"all 0.18s",textAlign:"center",transform:sel?"scale(1.04)":"scale(1)"}}>
                <div style={{fontSize:"24px",marginBottom:"6px"}}>{m.emoji}</div>
                <div style={{fontSize:"11px",fontWeight:700,color:sel?m.color:"#e5e7eb"}}>{m.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MOOD INFO POPUP */}
      {showMoodInfo&&(
        <div onClick={()=>setShowMoodInfo(false)} style={{position:"absolute",inset:0,zIndex:500,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",backdropFilter:"blur(4px)"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#161226",borderRadius:"20px 20px 0 0",border:"1px solid rgba(255,255,255,0.1)",padding:"20px",width:"100%",maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
              <div style={{fontSize:"15px",fontWeight:900,color:"#f3f4f6"}}>🎭 Les 8 moods</div>
              <button onClick={()=>setShowMoodInfo(false)} style={{background:"rgba(255,255,255,0.08)",border:"none",color:"#9ca3af",cursor:"pointer",borderRadius:"50%",width:"28px",height:"28px",fontSize:"14px"}}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
              {[
                {m:MOODS[0], desc:"Larmes, drama intense, émotions déchirantes. Anime qui touchent profondément."},
                {m:MOODS[1], desc:"Comédie, situations drôles, humour. Anime qui font rire et sourire."},
                {m:MOODS[2], desc:"Action, adrénaline, combats intenses. Anime qui font monter la pression."},
                {m:MOODS[3], desc:"Sombre, mature, violent, désespoir. Anime qui explorent le côté obscur."},
                {m:MOODS[4], desc:"Contemplatif, calme, apaisant. Slice-of-life et anime relaxants."},
                {m:MOODS[5], desc:"Psychologique, mind games, rebondissements. Anime qui font réfléchir."},
                {m:MOODS[6], desc:"Romantique, attachement, amour. Anime qui font battre le cœur."},
                {m:MOODS[7], desc:"Tension narrative, enjeux élevés, frissons. Anime qui tiennent en haleine."},
              ].map(({m,desc})=>(
                <div key={m.id} style={{display:"flex",gap:"12px",alignItems:"flex-start",padding:"10px",borderRadius:"12px",background:`${m.color}08`,border:`1px solid ${m.color}22`}}>
                  <span style={{fontSize:"22px",flexShrink:0}}>{m.emoji}</span>
                  <div>
                    <div style={{fontSize:"12px",fontWeight:800,color:m.color,marginBottom:"3px"}}>{m.label}</div>
                    <div style={{fontSize:"11px",color:"#9ca3af",lineHeight:1.5}}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DURÉE */}
      <div style={{padding:"16px 20px 0"}}>
        <p style={{margin:"0 0 9px",fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>Durée</p>
        <div style={{display:"flex",gap:"7px",overflowX:"auto",paddingBottom:"3px"}}>
          {DURATIONS.map(d=>(
            <button key={d.id} onClick={()=>setDuration(d.id)} style={chipStyle(duration===d.id)}>
              <span>{d.emoji}</span>{d.label}
            </button>
          ))}
        </div>
      </div>

      {/* PAYS D'ORIGINE */}
      <div style={{padding:"12px 20px 0"}}>
        <p style={{margin:"0 0 9px",fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>Pays d'origine</p>
        <div style={{display:"flex",gap:"7px",overflowX:"auto",paddingBottom:"3px"}}>
          {COUNTRIES.map(c=>{
            const sel = countries.includes(c.id);
            return (
              <button key={c.id} onClick={()=>toggleMulti(c.id, countries, setCountries)}
                style={chipStyle(sel,"34D399")}>
                <span>{c.emoji}</span>{c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TYPE */}
      <div style={{padding:"12px 20px 0"}}>
        <p style={{margin:"0 0 9px",fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>Type</p>
        <div style={{display:"flex",gap:"7px",overflowX:"auto",paddingBottom:"3px"}}>
          {MEDIA_TYPES.map(t=>{
            const sel = mediaTypes.includes(t.id);
            return (
              <button key={t.id} onClick={()=>toggleMulti(t.id, mediaTypes, setMediaTypes)}
                style={chipStyle(sel,"c084fc")}>
                <span>{t.emoji}</span>{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* RECO D'AMIS */}
      <div style={{padding:"12px 20px 0"}}>
        <p style={{margin:"0 0 9px",fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px"}}>Recommandations d'amis</p>
        <div style={{display:"flex",gap:"7px"}}>
          <button onClick={()=>setFriendReco(false)} style={chipStyle(!friendReco,"6b7280")}>
            <span>🚫</span>Désactivé
          </button>
          <button onClick={()=>setFriendReco(true)} style={{
            ...chipStyle(friendReco,"c084fc"),
            opacity: 0.45, cursor:"not-allowed",
          }} title="Ajoute des amis d'abord">
            <span>👥</span>Activé <span style={{fontSize:"9px",color:"#4b5563",marginLeft:"2px"}}>— bientôt</span>
          </button>
        </div>
      </div>

      {/* STATUS */}
      <div style={{padding:"12px 20px 0"}}>
        <div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.15)",borderRadius:"10px",padding:"8px 12px",fontSize:"11px",color:"#34D399",display:"flex",alignItems:"center",gap:"6px"}}>
          ✓ {Object.keys(me.statuses||{}).filter(id=>['completed','watching','dropped'].includes((me.statuses||{})[id])).length} animés exclus · 🤖 mood IA activé
        </div>
      </div>

      {/* CTA */}
      <div style={{padding:"18px 20px 0"}}>
        <button onClick={handleGenerate} disabled={selectedMoods.length===0} style={{width:"100%",padding:"16px",borderRadius:"16px",border:"none",background:selectedMoods.length>0?"linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%)":"rgba(255,255,255,0.05)",color:selectedMoods.length>0?"#fff":"#374151",fontWeight:800,fontSize:"15px",cursor:selectedMoods.length>0?"pointer":"not-allowed",boxShadow:selectedMoods.length>0?"0 6px 24px rgba(124,58,237,0.45)":"none"}}>
          {selectedMoods.length>0?"🎬 Générer mes animes":"Choisis un mood d'abord"}
        </button>
      </div>
    </div>
  );
}

export { MoodboardPage, ResultsOverlay };
