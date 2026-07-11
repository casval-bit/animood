import { useState, useEffect, useRef } from "react";
import { MOODS, MOOD_KEYS, AppContext, useApp, getMoodObj } from "../constants.js";
import { jikan } from "../api/jikan.js";
import { ptsStore, ptsToPct, topMoods } from "../api/moods.js";

function MoodOctagon({pts}) {
  const KEYS = ["emotional","happy","hype","dark","chill","twisted","in_love","thrills"];
  const size = 300, center = 150, levels = [25,50,75,100];

  const MOOD_META = {
    emotional:{emoji:"💔",color:"#A78BFA"},
    happy:    {emoji:"✨",color:"#FFD93D"},
    hype:     {emoji:"⚡",color:"#F97316"},
    dark:     {emoji:"🩸",color:"#EF4444"},
    chill:    {emoji:"🌿",color:"#34D399"},
    twisted:  {emoji:"🌀",color:"#06B6D4"},
    in_love:  {emoji:"🌸",color:"#F9A8D4"},
    thrills:  {emoji:"🎢",color:"#FB923C"},
  };

  // For thrills (0-33 scale) normalize to 0-100 for display only
  const displayPts = {...(pts||{})};
  if(displayPts.thrills !== undefined) {
    displayPts.thrills = Math.round((displayPts.thrills / 33) * 100);
  }

  // Find max value for scaling (use 100 as reference)
  const maxRef = 100;

  const ptsList = KEYS.map((k,i) => {
    const angle = (Math.PI*2*i/KEYS.length) - Math.PI/2;
    const maxR  = 108;  // bigger colored area
    const v     = Math.min(displayPts[k] || 0, 100);
    const r     = (v/maxRef)*maxR;
    return {
      key:k,
      rawPts: pts?.[k] || 0,
      x:  center + Math.cos(angle)*r,
      y:  center + Math.sin(angle)*r,
      lx: center + Math.cos(angle)*(maxR+30),
      ly: center + Math.sin(angle)*(maxR+30),
      meta: MOOD_META[k] || {emoji:"?",color:"#818cf8"},
    };
  });

  const gridMaxR = 108;
  const polygon  = ptsList.map(p=>`${p.x},${p.y}`).join(" ");
  const dominant = Object.entries(pts||{}).filter(([k])=>k!=="thrills").sort((a,b)=>b[1]-a[1])[0]?.[0] || "hype";
  const fillColor = MOOD_META[dominant]?.color || "#818cf8";

  return (
    <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"16px",border:"1px solid rgba(255,255,255,0.08)",padding:"14px",marginBottom:"14px"}}>
      <div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"4px",textAlign:"center"}}>
        Profil émotionnel
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} style={{width:"100%",maxWidth:"300px",display:"block",margin:"0 auto"}}>
        {/* Grid */}
        {levels.map(lvl => {
          const gPts = KEYS.map((_,i) => {
            const a=(Math.PI*2*i/KEYS.length)-Math.PI/2;
            return `${center+Math.cos(a)*(lvl/100)*gridMaxR},${center+Math.sin(a)*(lvl/100)*gridMaxR}`;
          }).join(" ");
          return <polygon key={lvl} points={gPts} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>;
        })}
        {/* Axes */}
        {KEYS.map((_,i) => {
          const a=(Math.PI*2*i/KEYS.length)-Math.PI/2;
          return <line key={i} x1={center} y1={center} x2={center+Math.cos(a)*gridMaxR} y2={center+Math.sin(a)*gridMaxR} stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>;
        })}
        {/* Shape */}
        <polygon points={polygon} fill={`${fillColor}28`} stroke={fillColor} strokeWidth="2.5" strokeLinejoin="round"/>
        {/* Emoji labels only */}
        {ptsList.map(p=>(
          <g key={p.key}>
            <text x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle" fontSize="16">{p.meta.emoji}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}


function Spinner({small,label}) {
  const size=small?18:28, border=small?2:3;
  return (
    <div style={{display:"flex",justifyContent:"center",padding:small?"8px":"40px",alignItems:"center",gap:"8px"}}>
      <div style={{width:`${size}px`,height:`${size}px`,border:`${border}px solid rgba(255,255,255,0.1)`,borderTop:`${border}px solid #818cf8`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      {label&&<span style={{fontSize:"12px",color:"#4b5563"}}>{label}</span>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function StarRating({value,onChange}) {
  const [hov,setHov]=useState(null);
  return (
    <div style={{display:"flex",gap:"3px"}}>
      {[1,2,3,4,5,6,7,8,9,10].map(n=>(
        <span key={n} onMouseEnter={()=>setHov(n)} onMouseLeave={()=>setHov(null)} onClick={()=>onChange(n)}
          style={{cursor:"pointer",fontSize:"15px",color:n<=(hov??value??0)?"#fbbf24":"#374151",transition:"color 0.1s"}}>★</span>
      ))}
    </div>
  );
}


function ScoreChart({ratings}) {
  const [tooltip, setTooltip] = useState(null);
  const counts = Array(10).fill(0);
  Object.values(ratings).forEach(r=>{ if(r.score>=1&&r.score<=10) counts[r.score-1]++; });
  const max = Math.max(...counts,1);
  return (
    <div style={{position:"relative"}}>
      <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"52px"}}>
        {counts.map((c,i)=>(
          <div key={i}
            onMouseEnter={()=>setTooltip(i)} onMouseLeave={()=>setTooltip(null)}
            onTouchStart={()=>setTooltip(tooltip===i?null:i)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"2px",cursor:"pointer",position:"relative"}}>
            {tooltip===i&&c>0&&(
              <div style={{position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.9)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:"6px",padding:"4px 8px",fontSize:"11px",fontWeight:800,color:"#f3f4f6",whiteSpace:"nowrap",marginBottom:"4px",zIndex:10}}>
                {c} animé{c>1?"s":""}
              </div>
            )}
            <div style={{width:"100%",borderRadius:"3px 3px 0 0",background:c>0?"linear-gradient(180deg,#c084fc,#818cf8)":"rgba(255,255,255,0.06)",height:`${Math.max((c/max)*42,c>0?4:2)}px`,transition:"height 0.3s"}}/>
            <span style={{fontSize:"7px",color:"#4b5563"}}>{i+1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FAVORITE SEARCH POPUP ────────────────────────────────────────────────────
function FavoriteSearchPopup({onSelect, onClose}) {
  const [q, setQ]             = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  useEffect(()=>{ setTimeout(()=>inputRef.current?.focus(),100); },[]);
  const search = async (val) => {
    setQ(val);
    if(!val.trim()) { setResults([]); return; }
    setLoading(true);
    try { const d=await jikan.searchAnime({q:val,limit:8,order_by:"score",sort:"desc"}); setResults(d.data||[]); }
    catch {}
    setLoading(false);
  };
  return (
    <div onClick={onClose} style={{position:"absolute",inset:0,zIndex:500,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0d0b18",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.09)",padding:"16px 16px 40px",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"0 auto 16px"}}/>
        <div style={{fontSize:"14px",fontWeight:800,color:"#f3f4f6",marginBottom:"12px"}}>Ajouter un favori</div>
        <div style={{position:"relative",marginBottom:"14px"}}>
          <span style={{position:"absolute",left:"11px",top:"50%",transform:"translateY(-50%)",color:"#6b7280",fontSize:"14px",pointerEvents:"none"}}>🔍</span>
          <input ref={inputRef} value={q} onChange={e=>search(e.target.value)} placeholder="Rechercher un animé…"
            style={{width:"100%",boxSizing:"border-box",padding:"11px 11px 11px 34px",borderRadius:"12px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",color:"#f3f4f6",fontSize:"14px",outline:"none"}}/>
        </div>
        {loading&&<Spinner small/>}
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {results.map(a=>(
            <button key={a.mal_id} onClick={()=>onSelect(a)} style={{display:"flex",gap:"10px",alignItems:"center",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:"12px",overflow:"hidden",cursor:"pointer",padding:0,textAlign:"left",width:"100%"}}>
              <img src={a.images?.jpg?.image_url} alt={a.title} style={{width:"44px",height:"62px",objectFit:"cover",flexShrink:0}} onError={e=>{e.target.src="https://placehold.co/44x62/1a1a2e/818cf8?text=?";}}/>
              <div style={{flex:1,padding:"8px 10px 8px 0"}}>
                <div style={{fontSize:"12px",fontWeight:700,color:"#f3f4f6",lineHeight:1.3}}>{a.title}</div>
                <div style={{fontSize:"10px",color:"#6b7280",marginTop:"2px"}}>{a.year||"?"} · {a.type}{a.score?` · ★${a.score}`:""}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


export { Spinner, StarRating, ScoreChart, FavoriteSearchPopup, MoodOctagon };
