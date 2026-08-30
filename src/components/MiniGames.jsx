import { useState, useEffect, useRef } from "react";
import { sb } from "../api/supabase.js";
import { useApp } from "../context/useApp.js";
import { MOOD_KEYS } from "../constants/moods.js";
import { awardSoloPoints } from "../utils/awardSoloPoints.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDayIndex() {
  const start = new Date("2026-01-01").getTime();
  return Math.floor((Date.now() - start) / 86400000);
}

function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function pickAnimeOfDay(pool, dayOffset = 0) {
  const day = getDayIndex() + dayOffset;
  const rand = seededRand(day * 2654435761);
  const idx = Math.floor(rand() * pool.length);
  return pool[idx];
}

const MOOD_META = {
  emotional:{emoji:"💔",label:"Emotional"},
  happy:    {emoji:"✨",label:"Happy"},
  hype:     {emoji:"⚡",label:"Hype"},
  dark:     {emoji:"🩸",label:"Dark"},
  chill:    {emoji:"🌿",label:"Chill"},
  twisted:  {emoji:"🌀",label:"Twisted"},
  in_love:  {emoji:"🌸",label:"In Love"},
  thrills:  {emoji:"🎢",label:"Thrills"},
};

// Color helpers
const GREEN  = "#22c55e";
const ORANGE = "#f97316";
const RED    = "#ef4444";

function CellResult({ label, status, hint }) {
  const bg = status === "correct" ? "rgba(34,197,94,0.15)" : status === "close" ? "rgba(249,115,22,0.15)" : "rgba(239,68,68,0.1)";
  const border = status === "correct" ? GREEN : status === "close" ? ORANGE : RED;
  const color  = status === "correct" ? GREEN : status === "close" ? ORANGE : RED;
  return (
    <div style={{background:bg, border:`1.5px solid ${border}`, borderRadius:8, padding:"4px 8px",
      textAlign:"center", minWidth:60, fontSize:11, fontWeight:700, color, display:"flex",
      flexDirection:"column", alignItems:"center", gap:2}}>
      <span style={{fontSize:9, opacity:0.7, fontWeight:600}}>{label}</span>
      <span>{hint}</span>
    </div>
  );
}

// ─── GAME 1 — Wordle Animé ─────────────────────────────────────────────────
export function WordleGame({ onClose }) {
  const { myUsername } = useApp();
  const MAX_TRIES = 10;
  const [pool, setPool]         = useState([]);
  const [target, setTarget]     = useState(null);
  const [targetMoods, setTargetMoods] = useState(null);
  const [query, setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [guesses, setGuesses]   = useState([]);
  const [status, setStatus]     = useState("playing"); // playing | won | lost
  const [loading, setLoading]   = useState(true);
  const timer = useRef(null);

  // Load saved state from localStorage
  useEffect(() => {
    const key = `animood_wordle_${getDayIndex()}`;
    const saved = JSON.parse(localStorage.getItem(key)||"null");
    if(saved) {
      setGuesses(saved.guesses||[]);
      setStatus(saved.status||"playing");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Pool: TV anime with score >= 7 and enough scored_by
        const rows = await sb.query("anime_cache?type=eq.TV&score=gte.7&scored_by=gte.5000&select=mal_id,title,year,studios,genres,source,score,scored_by,image_url&order=scored_by.desc&limit=2000");
        setPool(rows||[]);
        const t = pickAnimeOfDay(rows||[], 0);
        setTarget(t);
        // Fetch moods
        if(t) {
          const moodRow = await sb.query(`mood_pts_v4?mal_id=eq.${t.mal_id}&limit=1`);
          setTargetMoods(moodRow?.[0] || null);
        }
      } catch(e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const saveState = (g, s) => {
    const key = `animood_wordle_${getDayIndex()}`;
    localStorage.setItem(key, JSON.stringify({guesses:g, status:s}));
  };

  const search = (q) => {
    setQuery(q);
    clearTimeout(timer.current);
    if(!q.trim()) { setSuggestions([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const rows = await sb.query(`anime_cache?title=ilike.*${encodeURIComponent(q)}*&type=eq.TV&order=score.desc.nullslast&limit=8&select=mal_id,title,year,studios,genres,source,score,scored_by,image_url`);
        setSuggestions(rows||[]);
      } catch {}
    }, 300);
  };

  const getMoodRank = (moodRow) => {
    if(!moodRow) return [];
    return MOOD_KEYS
      .map(k => ({key:k, val:moodRow[k]||0}))
      .sort((a,b)=>b.val-a.val)
      .map((m,i) => ({...m, rank:i}));
  };

  const evaluateGuess = async (anime) => {
    if(!target) return;
    // Fetch guess moods
    let guessMoods = null;
    try {
      const r = await sb.query(`mood_pts_v4?mal_id=eq.${anime.mal_id}&limit=1`);
      guessMoods = r?.[0] || null;
    } catch {}

    const tMoodRanks = getMoodRank(targetMoods);
    const gMoodRanks = getMoodRank(guessMoods);

    // Studios
    const tStudios = (target.studios||[]).map(s=>s.name||s);
    const gStudios = (anime.studios||[]).map(s=>s.name||s);
    const studioMatch = gStudios.some(s => tStudios.includes(s)) ? "correct" : "wrong";

    // Genres
    const tGenres = (target.genres||[]).map(g=>g.name||g);
    const gGenres = (anime.genres||[]).map(g=>g.name||g);
    const matchingGenres = gGenres.filter(g => tGenres.includes(g));
    const genreStatus = matchingGenres.length === tGenres.length && gGenres.length === tGenres.length ? "correct"
      : matchingGenres.length > 0 ? "close" : "wrong";

    // Year
    const yearDiff = Math.abs((anime.year||0) - (target.year||0));
    const yearStatus = yearDiff === 0 ? "correct" : yearDiff <= 3 ? "close" : "wrong";
    const yearHint = yearDiff === 0 ? anime.year
      : (anime.year||0) < (target.year||0) ? `${anime.year} ↑` : `${anime.year} ↓`;

    // Score
    const scoreDiff = Math.abs((anime.score||0) - (target.score||0));
    const scoreStatus = scoreDiff === 0 ? "correct" : scoreDiff <= 0.5 ? "close" : "wrong";
    const scoreHint = scoreDiff === 0 ? anime.score?.toFixed(2)
      : (anime.score||0) < (target.score||0) ? `${anime.score?.toFixed(2)} ↑` : `${anime.score?.toFixed(2)} ↓`;

    // Source
    const sourceStatus = anime.source === target.source ? "correct" : "wrong";

    // Moods — compare top mood ranks
    const tTop1 = tMoodRanks[0]?.key;
    const tTop3 = tMoodRanks.slice(0,3).map(m=>m.key);
    const gTop1 = gMoodRanks[0]?.key;
    const gTop3 = gMoodRanks.slice(0,3).map(m=>m.key);
    let moodStatus = "wrong";
    if(gTop1 === tTop1) moodStatus = "correct";
    else if(tTop3.includes(gTop1) || gTop3.includes(tTop1)) moodStatus = "close";
    const moodHint = gMoodRanks[0] ? `${MOOD_META[gMoodRanks[0].key]?.emoji} ${MOOD_META[gMoodRanks[0].key]?.label}` : "?";

    const guess = {
      anime,
      cells: [
        { label:"Studio",  status:studioMatch,  hint:gStudios[0]||"?" },
        { label:"Genres",  status:genreStatus,  hint:gGenres.slice(0,2).join(", ")||"?" },
        { label:"Année",   status:yearStatus,   hint:yearHint },
        { label:"Score",   status:scoreStatus,  hint:scoreHint },
        { label:"Source",  status:sourceStatus, hint:anime.source||"?" },
        { label:"Mood #1", status:moodStatus,   hint:moodHint },
      ],
      correct: anime.mal_id === target.mal_id,
    };

    const newGuesses = [...guesses, guess];
    setGuesses(newGuesses);
    setQuery(""); setSuggestions([]);

    const newStatus = guess.correct ? "won" : newGuesses.length >= MAX_TRIES ? "lost" : "playing";
    setStatus(newStatus);
    saveState(newGuesses, newStatus);
    if(newStatus === "won") {
      awardSoloPoints(myUsername, "wordle", newGuesses.length, true).catch(()=>{});
    }
  };

  const tryGuess = async (anime) => {
    if(status !== "playing") return;
    if(guesses.some(g=>g.anime.mal_id===anime.mal_id)) return;
    await evaluateGuess(anime);
  };

  if(loading) return (
    <div style={{padding:32,textAlign:"center",color:"var(--text-3)"}}>
      <div style={{fontSize:32,marginBottom:8}}>🎮</div>
      <p>Chargement du jeu…</p>
    </div>
  );

  return (
    <div style={{padding:20,maxWidth:640,margin:"0 auto"}}>
      <div style={{textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:24,marginBottom:4}}>🎯 Wordle Animé</div>
        <div style={{fontSize:11,color:"var(--text-4)"}}>Devine l'animé du jour · {guesses.length}/{MAX_TRIES} essais</div>
      </div>

      {/* Result */}
      {status === "won" && (
        <div style={{textAlign:"center",padding:16,marginBottom:16,background:"rgba(34,197,94,0.1)",
          border:"1px solid rgba(34,197,94,0.3)",borderRadius:12}}>
          <div style={{fontSize:20,marginBottom:4}}>🎉 Bravo !</div>
          <div style={{fontSize:13,color:GREEN,fontWeight:700}}>{target?.title}</div>
          <div style={{fontSize:11,color:"var(--text-4)",marginTop:4}}>Trouvé en {guesses.length} essai{guesses.length>1?"s":""}</div>
        </div>
      )}
      {status === "lost" && (
        <div style={{textAlign:"center",padding:16,marginBottom:16,background:"rgba(239,68,68,0.1)",
          border:"1px solid rgba(239,68,68,0.3)",borderRadius:12}}>
          <div style={{fontSize:16,marginBottom:4,color:RED}}>😢 Perdu</div>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text-1)"}}>{target?.title}</div>
          <div style={{fontSize:11,color:"var(--text-4)",marginTop:4}}>{target?.year} · {(target?.studios||[]).map(s=>s.name||s).join(", ")}</div>
        </div>
      )}

      {/* Search */}
      {status === "playing" && (
        <div style={{position:"relative",marginBottom:16}}>
          <input value={query} onChange={e=>search(e.target.value)}
            placeholder="Tape le nom d'un animé TV…"
            style={{width:"100%",boxSizing:"border-box",padding:"10px 14px",borderRadius:12,
              background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
              color:"var(--text-1)",fontSize:13,outline:"none"}}/>
          {suggestions.length > 0 && (
            <div style={{position:"absolute",top:"calc(100%+4px)",left:0,right:0,zIndex:50,
              background:"#161226",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,
              boxShadow:"0 8px 32px rgba(0,0,0,0.5)",maxHeight:240,overflowY:"auto"}}>
              {suggestions.map(a=>(
                <button key={a.mal_id} onClick={()=>tryGuess(a)}
                  disabled={guesses.some(g=>g.anime.mal_id===a.mal_id)}
                  style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 12px",
                    background:"none",border:"none",cursor:"pointer",textAlign:"left",
                    opacity:guesses.some(g=>g.anime.mal_id===a.mal_id)?0.4:1}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                  onMouseLeave={e=>e.currentTarget.style.background="none"}>
                  <img src={a.image_url} alt="" style={{width:28,height:40,objectFit:"cover",borderRadius:4,flexShrink:0}}
                    onError={e=>{e.target.style.display="none";}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"var(--text-1)"}}>{a.title}</div>
                    <div style={{fontSize:10,color:"var(--text-4)"}}>{a.year} · {(a.studios||[]).map(s=>s.name||s).join(", ")}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Column headers */}
      {guesses.length > 0 && (
        <div style={{display:"flex",gap:4,marginBottom:6,paddingLeft:144}}>
          {["Studio","Genres","Année","Score","Source","Mood #1"].map(h=>(
            <div key={h} style={{fontSize:8,color:"var(--text-4)",fontWeight:700,minWidth:60,textAlign:"center"}}>{h}</div>
          ))}
        </div>
      )}

      {/* Guesses */}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {guesses.map((g,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
            {/* Anime info */}
            <div style={{display:"flex",alignItems:"center",gap:8,width:140,flexShrink:0}}>
              <img src={g.anime.image_url} alt="" style={{width:28,height:40,objectFit:"cover",borderRadius:4,flexShrink:0}}
                onError={e=>{e.target.style.display="none";}}/>
              <div style={{fontSize:10,fontWeight:700,color:"var(--text-2)",lineHeight:1.3,overflow:"hidden"}}>
                <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:100}}>{g.anime.title}</div>
              </div>
            </div>
            {/* Cells */}
            {g.cells.map((cell,j)=>(
              <CellResult key={j} label={cell.label} status={cell.status} hint={cell.hint}/>
            ))}
            {g.correct && <span style={{fontSize:16}}>✅</span>}
          </div>
        ))}
      </div>

      {/* Empty slots */}
      {status === "playing" && Array.from({length: MAX_TRIES - guesses.length}).map((_,i)=>(
        <div key={i} style={{height:48,borderRadius:8,background:"rgba(255,255,255,0.02)",
          border:"1px dashed rgba(255,255,255,0.05)",marginTop:6}}/>
      ))}
    </div>
  );
}

// ─── GAME 2 — Poster Pixelisé ─────────────────────────────────────────────
const PIXEL_LEVELS = [32, 24, 16, 12, 8, 6, 4, 2]; // pixel size at each step (big=pixelated)

function PixelatedImage({ src, pixelSize }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if(!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      render();
    };
    img.src = src;
  }, [src]);

  useEffect(() => { render(); }, [pixelSize]);

  const render = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if(!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const ps = pixelSize;
    // Draw small then scale up = pixelated effect
    ctx.imageSmoothingEnabled = false;
    const sw = Math.ceil(W/ps), sh = Math.ceil(H/ps);
    const off = document.createElement("canvas");
    off.width = sw; off.height = sh;
    const octx = off.getContext("2d");
    octx.drawImage(img, 0, 0, sw, sh);
    ctx.clearRect(0,0,W,H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, W, H);
  };

  return <canvas ref={canvasRef} width={280} height={400}
    style={{borderRadius:12,display:"block",margin:"0 auto",maxWidth:"100%"}}/>;
}

export function PosterGame({ onClose }) {
  const { myUsername } = useApp();
  const MAX_TRIES = 8;
  const [pool, setPool]       = useState([]);
  const [target, setTarget]   = useState(null);
  const [query, setQuery]     = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [guesses, setGuesses] = useState([]);
  const [status, setStatus]   = useState("playing");
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);
  const step = Math.min(guesses.length, PIXEL_LEVELS.length - 1);
  const pixelSize = PIXEL_LEVELS[step];

  useEffect(() => {
    const key = `animood_poster_${getDayIndex()}`;
    const saved = JSON.parse(localStorage.getItem(key)||"null");
    if(saved) { setGuesses(saved.guesses||[]); setStatus(saved.status||"playing"); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const rows = await sb.query("anime_cache?type=eq.TV&score=gte.7.5&scored_by=gte.10000&select=mal_id,title,year,studios,image_url&order=scored_by.desc&limit=2000");
        setPool(rows||[]);
        // Game 2 uses dayOffset=1 so it's a different anime than game 1
        setTarget(pickAnimeOfDay(rows||[], 1));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const saveState = (g,s) => {
    localStorage.setItem(`animood_poster_${getDayIndex()}`, JSON.stringify({guesses:g,status:s}));
  };

  const search = (q) => {
    setQuery(q);
    clearTimeout(timer.current);
    if(!q.trim()) { setSuggestions([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const rows = await sb.query(`anime_cache?title=ilike.*${encodeURIComponent(q)}*&type=eq.TV&order=score.desc.nullslast&limit=8&select=mal_id,title,year,studios,image_url`);
        setSuggestions(rows||[]);
      } catch {}
    }, 300);
  };

  const tryGuess = async (anime) => {
    if(status !== "playing") return;
    if(guesses.some(g=>g.mal_id===anime.mal_id)) return;
    const correct = anime.mal_id === target?.mal_id;
    const newGuesses = [...guesses, {...anime, correct}];
    setGuesses(newGuesses);
    setQuery(""); setSuggestions([]);
    const newStatus = correct ? "won" : newGuesses.length >= MAX_TRIES ? "lost" : "playing";
    setStatus(newStatus);
    saveState(newGuesses, newStatus);
    if(newStatus === "won") {
      awardSoloPoints(myUsername, "poster", newGuesses.length, true).catch(()=>{});
    }
  };

  if(loading) return (
    <div style={{padding:32,textAlign:"center",color:"var(--text-3)"}}>
      <div style={{fontSize:32,marginBottom:8}}>🖼</div><p>Chargement…</p>
    </div>
  );

  return (
    <div style={{padding:20,maxWidth:500,margin:"0 auto"}}>
      <div style={{textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:24,marginBottom:4}}>🖼 Poster mystère</div>
        <div style={{fontSize:11,color:"var(--text-4)"}}>
          {status==="playing"
            ? `Essai ${guesses.length+1}/${MAX_TRIES} — Pixel: ${pixelSize}px`
            : status==="won" ? "🎉 Bravo !" : "😢 Perdu"}
        </div>
      </div>

      {/* Pixelated poster */}
      <div style={{marginBottom:16,position:"relative"}}>
        {target?.image_url && (
          <PixelatedImage
            src={target.image_url}
            pixelSize={status==="playing" ? pixelSize : 1}
          />
        )}
        {/* Pixel level indicator */}
        <div style={{display:"flex",gap:3,justifyContent:"center",marginTop:8}}>
          {PIXEL_LEVELS.map((_, i) => (
            <div key={i} style={{width:20,height:4,borderRadius:2,
              background: i < guesses.length ? (guesses[i]?.correct ? GREEN : RED)
                : i === guesses.length ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"}}/>
          ))}
        </div>
      </div>

      {/* Result */}
      {status !== "playing" && (
        <div style={{textAlign:"center",padding:12,marginBottom:12,borderRadius:12,
          background:status==="won"?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)",
          border:`1px solid ${status==="won"?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`}}>
          <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)"}}>{target?.title}</div>
          <div style={{fontSize:11,color:"var(--text-4)",marginTop:4}}>
            {target?.year} · {(target?.studios||[]).map(s=>s.name||s).join(", ")}
          </div>
        </div>
      )}

      {/* Search */}
      {status === "playing" && (
        <div style={{position:"relative",marginBottom:12}}>
          <input value={query} onChange={e=>search(e.target.value)}
            placeholder="Tape le nom d'un animé TV…"
            style={{width:"100%",boxSizing:"border-box",padding:"10px 14px",borderRadius:12,
              background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
              color:"var(--text-1)",fontSize:13,outline:"none"}}/>
          {suggestions.length > 0 && (
            <div style={{position:"absolute",top:"calc(100%+4px)",left:0,right:0,zIndex:50,
              background:"#161226",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,
              boxShadow:"0 8px 32px rgba(0,0,0,0.5)",maxHeight:200,overflowY:"auto"}}>
              {suggestions.map(a=>(
                <button key={a.mal_id} onClick={()=>tryGuess(a)}
                  disabled={guesses.some(g=>g.mal_id===a.mal_id)}
                  style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 12px",
                    background:"none",border:"none",cursor:"pointer",textAlign:"left",
                    opacity:guesses.some(g=>g.mal_id===a.mal_id)?0.4:1}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                  onMouseLeave={e=>e.currentTarget.style.background="none"}>
                  <img src={a.image_url} alt="" style={{width:28,height:40,objectFit:"cover",borderRadius:4}}
                    onError={e=>{e.target.style.display="none";}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"var(--text-1)"}}>{a.title}</div>
                    <div style={{fontSize:10,color:"var(--text-4)"}}>{a.year}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Guesses history */}
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {guesses.map((g,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",
            borderRadius:8,background:g.correct?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.06)",
            border:`1px solid ${g.correct?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.15)"}`}}>
            <span style={{fontSize:12}}>{g.correct?"✅":"❌"}</span>
            <img src={g.image_url} alt="" style={{width:20,height:28,objectFit:"cover",borderRadius:3}}
              onError={e=>{e.target.style.display="none";}}/>
            <span style={{fontSize:11,fontWeight:700,color:"var(--text-2)"}}>{g.title}</span>
            <span style={{fontSize:10,color:"var(--text-4)",marginLeft:"auto"}}>{g.year}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
