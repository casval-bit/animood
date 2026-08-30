// ─── GAME SYSTEM — Matchmaking + Chain + Timeline ─────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../context/useApp.js";
import { sb, supabase } from "../api/supabase.js";
import { Spinner } from "./Spinner.jsx";
import { useLang } from "../context/useLang.js";
import { GAME_SYSTEM_I18N } from "../constants/gameSystemI18n.js";

const GREEN  = "#22c55e";
const ORANGE = "#f97316";
const RED    = "#ef4444";
const sleep  = ms => new Promise(r => setTimeout(r, ms));

// ─── ELO helpers ──────────────────────────────────────────────────────────────
function calcElo(eloA, eloB, resultA) {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  return Math.round(eloA + K * (resultA - expected));
}

async function getOrCreateElo(username) {
  const rows = await sb.query(`game_elo?username=eq.${encodeURIComponent(username)}&limit=1`).catch(()=>[]);
  if(rows?.[0]) return rows[0];
  await sb.query("game_elo", {
    method: "POST",
    headers: { ...sb.headers, "Prefer": "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ username, elo_chain:400, elo_timeline:400, points_total:0 }),
  }).catch(()=>{});
  return { username, elo_chain:400, elo_timeline:400, points_total:0 };
}

async function updateElo(username, field, newElo, pointsDelta=0) {
  const row = await getOrCreateElo(username);
  await sb.query(`game_elo?username=eq.${encodeURIComponent(username)}`, {
    method: "PATCH",
    headers: { ...sb.headers, "Prefer": "return=minimal" },
    body: JSON.stringify({ [field]: newElo, points_total: (row.points_total||0) + pointsDelta, updated_at: new Date().toISOString() }),
  }).catch(()=>{});
}

// ─── MATCHMAKING ──────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2,7).toUpperCase();
}

export function Matchmaking({ gameType, onMatch, onClose }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).matchmaking;
  const tc = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).common;
  const [mode, setMode]           = useState(null); // null | ranked | private-create | private-join
  const [status, setStatus]       = useState("searching");
  const [waitTime, setWaitTime]   = useState(0);
  const [myElo, setMyElo]         = useState(400);
  const [privateCode, setPrivateCode] = useState("");
  const [joinCode, setJoinCode]   = useState("");
  const [joinError, setJoinError] = useState("");
  const roomRef = useRef(null);
  const subRef  = useRef(null);

  const cancelAndClose = () => {
    if(subRef.current) supabase.removeChannel(subRef.current);
    if(roomRef.current) sb.query(`game_rooms?id=eq.${roomRef.current}&status=eq.waiting`,{method:"DELETE"}).catch(()=>{});
    onClose();
  };

  // ── RANKED ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if(mode !== "ranked") return;
    let cancelled = false, interval;
    (async () => {
      const elo = await getOrCreateElo(myUsername);
      const eloField = gameType === "chain" ? "elo_chain" : "elo_timeline";
      const eloVal = elo[eloField] || 400;
      setMyElo(eloVal);
      const findRoom = async (range) => {
        const rooms = await sb.query(`game_rooms?game_type=eq.${gameType}&status=eq.waiting&player1=neq.${encodeURIComponent(myUsername)}&private_code=is.null&limit=10`).catch(()=>[]);
        return (rooms||[]).filter(r=>Math.abs((r.elo1||400)-eloVal)<=range).sort((a,b)=>Math.abs((a.elo1||400)-eloVal)-Math.abs((b.elo1||400)-eloVal))[0]||null;
      };
      const created = await sb.query("game_rooms",{method:"POST",headers:{...sb.headers,"Prefer":"return=representation"},body:JSON.stringify({game_type:gameType,player1:myUsername,elo1:eloVal,status:"waiting",state:{},ranked:true})}).catch(()=>null);
      const myRoom = created?.[0];
      if(!myRoom||cancelled) return;
      roomRef.current = myRoom.id;
      const sub = supabase.channel(`room_${myRoom.id}`)
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_rooms",filter:`id=eq.${myRoom.id}`},
          p=>{const r=p.new;if(r.status==="active"&&r.player2&&!cancelled){setStatus("found");setTimeout(()=>onMatch(r),1000);}})
        .subscribe();
      subRef.current = sub;
      let waited = 0;
      interval = setInterval(async()=>{
        if(cancelled) return;
        waited+=2; setWaitTime(waited);
        const range = Math.min(50+waited*5,400);
        const existing = await findRoom(range);
        if(existing&&!cancelled){
          await sb.query(`game_rooms?id=eq.${existing.id}`,{method:"PATCH",headers:{...sb.headers,"Prefer":"return=minimal"},body:JSON.stringify({player2:myUsername,elo2:eloVal,status:"active",updated_at:new Date().toISOString()})}).catch(()=>{});
          await sb.query(`game_rooms?id=eq.${myRoom.id}`,{method:"DELETE"}).catch(()=>{});
          roomRef.current = existing.id;
        }
      },2000);
    })();
    return ()=>{cancelled=true;clearInterval(interval);if(subRef.current)supabase.removeChannel(subRef.current);if(roomRef.current)sb.query(`game_rooms?id=eq.${roomRef.current}&status=eq.waiting`,{method:"DELETE"}).catch(()=>{});};
  },[mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CREATE PRIVATE ───────────────────────────────────────────────────────────
  const createPrivateRoom = async () => {
    const code = generateCode();
    setPrivateCode(code);
    const created = await sb.query("game_rooms",{method:"POST",headers:{...sb.headers,"Prefer":"return=representation"},body:JSON.stringify({game_type:gameType,player1:myUsername,elo1:400,status:"waiting",state:{},ranked:false,private_code:code})}).catch(()=>null);
    const myRoom = created?.[0]; if(!myRoom) return;
    roomRef.current = myRoom.id;
    const sub = supabase.channel(`room_${myRoom.id}`)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_rooms",filter:`id=eq.${myRoom.id}`},
        p=>{const r=p.new;if(r.status==="active"&&r.player2){setStatus("found");setTimeout(()=>onMatch(r),1000);}})
      .subscribe();
    subRef.current = sub;
    setMode("private-create");
  };

  // ── JOIN PRIVATE ─────────────────────────────────────────────────────────────
  const joinPrivateRoom = async () => {
    setJoinError("");
    const code = joinCode.trim().toUpperCase();
    if(!code) return;
    const rooms = await sb.query(`game_rooms?private_code=eq.${code}&status=eq.waiting&limit=1`).catch(()=>[]);
    const room = rooms?.[0];
    if(!room){setJoinError(t.errInvalidCode);return;}
    if(room.player1===myUsername){setJoinError(t.errOwnRoom);return;}
    await sb.query(`game_rooms?id=eq.${room.id}`,{method:"PATCH",headers:{...sb.headers,"Prefer":"return=minimal"},body:JSON.stringify({player2:myUsername,elo2:400,status:"active",updated_at:new Date().toISOString()})}).catch(()=>{});
    setStatus("found");
    setTimeout(()=>onMatch({...room,player2:myUsername,status:"active"}),1000);
  };

  // ── RENDER ───────────────────────────────────────────────────────────────────
  if(!mode) return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:24,fontWeight:900,color:"var(--text-1)",marginBottom:20}}>
        ⚔️ {t.gameTypeName(gameType)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:240,margin:"0 auto"}}>
        <button onClick={()=>setMode("ranked")} style={{padding:"12px 20px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>
          {t.rankedBtn}
        </button>
        <button onClick={createPrivateRoom} style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"var(--text-2)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          {t.createPrivateBtn}
        </button>
        <button onClick={()=>setMode("private-join")} style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"var(--text-2)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          {t.joinPrivateBtn}
        </button>
        <button onClick={onClose} style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>{tc.cancel}</button>
      </div>
    </div>
  );

  if(mode==="private-create") return (
    <div style={{padding:32,textAlign:"center"}}>
      {status==="found" ? (
        <><div style={{fontSize:48,marginBottom:12}}>⚔️</div><div style={{fontSize:18,fontWeight:900,color:GREEN}}>{t.opponentFound}</div><div style={{fontSize:12,color:"var(--text-4)",marginTop:8}}>{tc.starting}</div></>
      ) : (
        <>
          <div style={{fontSize:24,marginBottom:12}}>{t.privateRoomTitle}</div>
          <div style={{fontSize:12,color:"var(--text-4)",marginBottom:8}}>{t.shareCode}</div>
          <div style={{fontSize:36,fontWeight:900,color:"#c084fc",letterSpacing:8,marginBottom:16,padding:"12px 24px",background:"rgba(124,58,237,0.1)",borderRadius:12,display:"inline-block"}}>{privateCode}</div>
          <div style={{fontSize:11,color:"var(--text-4)",marginBottom:20}}>{t.waitingConnection}</div>
          <button onClick={cancelAndClose} style={{padding:"8px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"var(--text-3)",cursor:"pointer",fontSize:12}}>{tc.cancel}</button>
        </>
      )}
    </div>
  );

  if(mode==="private-join") return (
    <div style={{padding:32,textAlign:"center"}}>
      {status==="found" ? (
        <><div style={{fontSize:48,marginBottom:12}}>⚔️</div><div style={{fontSize:18,fontWeight:900,color:GREEN}}>{t.connected}</div><div style={{fontSize:12,color:"var(--text-4)",marginTop:8}}>{tc.starting}</div></>
      ) : (
        <>
          <div style={{fontSize:24,marginBottom:16}}>{t.joinRoomTitle}</div>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder={t.joinCodePlaceholder} maxLength={6}
            style={{width:"100%",boxSizing:"border-box",padding:"12px 16px",borderRadius:12,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"var(--text-1)",fontSize:18,fontWeight:900,textAlign:"center",letterSpacing:4,outline:"none",marginBottom:8}}/>
          {joinError&&<div style={{fontSize:11,color:RED,marginBottom:8}}>{joinError}</div>}
          <button onClick={joinPrivateRoom} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:8}}>{t.joinBtn}</button>
          <button onClick={onClose} style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>{tc.cancel}</button>
        </>
      )}
    </div>
  );

  return (
    <div style={{padding:32,textAlign:"center"}}>
      {status==="searching" ? (
        <>
          <div style={{fontSize:32,marginBottom:12}}>🔍</div>
          <div style={{fontSize:16,fontWeight:800,color:"var(--text-1)",marginBottom:4}}>{t.searchingOpponent}</div>
          <div style={{fontSize:12,color:"var(--text-4)",marginBottom:16}}>{waitTime>0?t.waitStatus(waitTime, Math.min(50+waitTime*5,400)):t.connecting}</div>
          <div style={{fontSize:11,color:"#c084fc",marginBottom:20}}>{t.myElo(myElo)}</div>
          <button onClick={cancelAndClose} style={{padding:"8px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"var(--text-3)",cursor:"pointer",fontSize:12}}>{tc.cancel}</button>
        </>
      ) : (
        <><div style={{fontSize:48,marginBottom:12}}>⚔️</div><div style={{fontSize:18,fontWeight:900,color:GREEN}}>{t.opponentFound}</div><div style={{fontSize:12,color:"var(--text-4)",marginTop:8}}>{tc.starting}</div></>
      )}
    </div>
  );
}

// ─── CHAIN GAME ───────────────────────────────────────────────────────────────
function seededPick(arr, seed) {
  const s = seed * 2654435761 & 0xffffffff;
  return arr[Math.abs(s) % arr.length];
}

export function ChainGame({ room, onClose }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).chain;
  const tc = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).common;
  const isP1 = room.player1 === myUsername;
  const oppUsername = isP1 ? room.player2 : room.player1;
  const myElo  = isP1 ? (room.elo1||400) : (room.elo2||400);
  const oppElo = isP1 ? (room.elo2||400) : (room.elo1||400);

  const [state, setState] = useState(room.state || {
    round: 1,           // 1 | 2 | 3
    scores: [0, 0],     // [p1wins, p2wins]
    linkType: null,     // 'studio' | 'genre' | null
    currentAnime: null,
    chain: [],
    turn: null,         // username whose turn it is
    chooser: null,      // username who chooses link type this round
    phase: "choose",    // choose | play | roundEnd | gameEnd
    timer: 40,
    roundStart: null,
    times: [0, 0],      // cumulative time each player took (for tiebreak)
    elimTime: null,     // when the losing player ran out of time
  });

  const [query, setQuery]       = useState("");
  const [suggestions, setSugs]  = useState([]);
  const [pool, setPool]         = useState([]);
  const [timerVal, setTimerVal] = useState(40);
  const [msg, setMsg]           = useState("");
  const subRef = useRef(null);
  const timerRef = useRef(null);
  const searchTimer = useRef(null);
  const startTsRef = useRef(null);

  const isMyTurn = state.turn === myUsername;
  const amChooser = state.chooser === myUsername;

  // Load TV pool
  useEffect(() => {
    sb.query("anime_cache?type=eq.TV&score=gte.6.5&scored_by=gte.3000&select=mal_id,title,studios,genres,image_url&order=scored_by.desc&limit=5000")
      .then(r => setPool(r||[])).catch(()=>{});
  }, []);

  // Sync state from Supabase
  useEffect(() => {
    const sub = supabase.channel(`chain_${room.id}`)
      .on("postgres_changes", { event:"UPDATE", schema:"public", table:"game_rooms", filter:`id=eq.${room.id}` },
        p => {
          const newState = p.new.state;
          setState(newState);
          setTimerVal(newState.timer || 40);
          if(p.new.status === "finished") clearInterval(timerRef.current);
        })
      .subscribe();
    subRef.current = sub;
    return () => supabase.removeChannel(sub);
  }, [room.id]);

  // Timer countdown
  useEffect(() => {
    clearInterval(timerRef.current);
    if(state.phase === "play" && state.turn) {
      startTsRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setTimerVal(v => {
          if(v <= 1) {
            clearInterval(timerRef.current);
            if(isMyTurn) handleTimeout();
            return 0;
          }
          return v - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [state.phase, state.turn]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushState = async (newState) => {
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: newState, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  };

  const handleChooseLinkType = async (type) => {
    if(!amChooser || state.phase !== "choose") return;
    // Pick random start anime
    const seed = Date.now();
    const start = seededPick(pool, seed);
    const newState = {
      ...state,
      linkType: type,
      currentAnime: start,
      chain: [start],
      turn: state.chooser, // chooser goes first
      phase: "play",
      timer: 40,
    };
    await pushState(newState);
  };

  const isValidLink = (guess) => {
    const cur = state.currentAnime;
    if(!cur) return false;
    const curStudios = (cur.studios||[]).map(s=>s.name||s);
    const curGenres  = (cur.genres||[]).map(g=>g.name||g);
    const gStudios   = (guess.studios||[]).map(s=>s.name||s);
    const gGenres    = (guess.genres||[]).map(g=>g.name||g);
    if(state.linkType === "studio") {
      const sameStudio = curStudios.some(s => gStudios.includes(s));
      const diffGenre  = !curGenres.every(g => gGenres.includes(g)) || !gGenres.every(g => curGenres.includes(g));
      return sameStudio && diffGenre;
    } else {
      const sameGenre  = curGenres.some(g => gGenres.includes(g));
      const diffStudio = !curStudios.every(s => gStudios.includes(s)) || !gStudios.every(s => curStudios.includes(s));
      return sameGenre && diffStudio;
    }
  };

  const handleGuess = async (anime) => {
    if(!isMyTurn || state.phase !== "play") return;
    // Already used?
    if(state.chain.some(a => a.mal_id === anime.mal_id)) {
      setMsg(t.errAlreadyUsed);
      return;
    }
    if(!isValidLink(anime)) {
      setMsg(t.errInvalidLink);
      return;
    }
    setMsg("");
    setQuery(""); setSugs([]);
    const elapsed = Math.round((Date.now() - (startTsRef.current||Date.now())) / 1000);
    const newTimes = isP1 ? [state.times[0]+elapsed, state.times[1]] : [state.times[0], state.times[1]+elapsed];
    const nextTurn = state.turn === myUsername ? oppUsername : myUsername;
    const newState = { ...state, currentAnime: anime, chain: [...state.chain, anime], turn: nextTurn, timer: 40, times: newTimes };
    await pushState(newState);
  };

  const handleTimeout = async () => {
    // Current player loses the round
    const loser = state.turn;
    const winner = loser === room.player1 ? room.player2 : room.player1;
    const winIdx = winner === room.player1 ? 0 : 1;
    const newScores = [...state.scores];
    newScores[winIdx]++;
    const newRound = state.round + 1;
    const gameOver = newScores[0] >= 2 || newScores[1] >= 2 || newRound > 3;

    if(gameOver) {
      const gameWinner = newScores[0] > newScores[1] ? room.player1 : newScores[1] > newScores[0] ? room.player2 : null;
      await handleGameEnd(gameWinner, newScores);
    } else {
      // Determine next chooser
      const chooser = newRound === 2 ? room.player2
        : myElo !== oppElo ? (myElo > oppElo ? myUsername : oppUsername)
        : null; // tiebreak by times handled separately
      const newState = { ...state, round: newRound, scores: newScores, phase: "roundEnd",
        linkType: null, currentAnime: null, chain: [], turn: null, timer: 40,
        chooser: chooser || room.player1, times: [0,0] };
      await pushState(newState);
      setTimeout(async () => {
        await pushState({ ...newState, phase: "choose" });
      }, 3000);
    }
  };

  const handleGameEnd = async (winner, scores) => {
    const eloField = "elo_chain";
    const p1Won = winner === room.player1;
    const p2Won = winner === room.player2;
    const newElo1 = calcElo(room.elo1||400, room.elo2||400, p1Won ? 1 : p2Won ? 0 : 0.5);
    const newElo2 = calcElo(room.elo2||400, room.elo1||400, p2Won ? 1 : p1Won ? 0 : 0.5);
    await Promise.all([
      updateElo(room.player1, eloField, newElo1, p1Won ? 20 : 5),
      updateElo(room.player2, eloField, newElo2, p2Won ? 20 : 5),
    ]);
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ status: "finished", winner, state: { ...state, phase: "gameEnd", scores } }),
    }).catch(()=>{});
  };

  const search = (q) => {
    setQuery(q);
    clearTimeout(searchTimer.current);
    if(!q.trim()) { setSugs([]); return; }
    searchTimer.current = setTimeout(async () => {
      const rows = await sb.query(`anime_cache?title=ilike.*${encodeURIComponent(q)}*&type=eq.TV&order=score.desc.nullslast&limit=8&select=mal_id,title,studios,genres,image_url`).catch(()=>[]);
      setSugs(rows||[]);
    }, 300);
  };

  const linkLabel = state.linkType === "studio" ? t.linkLabelStudio : state.linkType === "genre" ? t.linkLabelGenre : "";

  return (
    <div style={{padding:16,maxWidth:640,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:"var(--text-2)"}}>
          ⚔️ {myUsername} <span style={{color:"var(--text-4)"}}>vs</span> {oppUsername}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--text-4)"}}>{t.round(state.round)}</span>
          <div style={{display:"flex",gap:4}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{width:10,height:10,borderRadius:"50%",
                background:i<state.scores[isP1?0:1]?GREEN:i<state.scores[isP1?1:0]?RED:"rgba(255,255,255,0.1)"}}/>
            ))}
          </div>
        </div>
      </div>

      {/* Phase: choose link type */}
      {state.phase === "choose" && (
        <div style={{textAlign:"center",padding:24}}>
          {amChooser ? (
            <>
              <div style={{fontSize:15,fontWeight:800,color:"var(--text-1)",marginBottom:8}}>{t.chooseLinkType}</div>
              <div style={{fontSize:11,color:"var(--text-4)",marginBottom:20}}>{t.youStartRound}</div>
              <div style={{display:"flex",gap:12,justifyContent:"center"}}>
                {[{id:"studio",label:t.optSameStudio,sub:t.optSameStudioSub},{id:"genre",label:t.optSameGenre,sub:t.optSameGenreSub}].map(opt=>(
                  <button key={opt.id} onClick={()=>handleChooseLinkType(opt.id)}
                    style={{padding:"14px 20px",borderRadius:14,border:"2px solid rgba(124,58,237,0.4)",
                      background:"rgba(124,58,237,0.1)",cursor:"pointer",textAlign:"center",minWidth:140}}>
                    <div style={{fontSize:15,fontWeight:800,color:"#c084fc",marginBottom:4}}>{opt.label}</div>
                    <div style={{fontSize:10,color:"var(--text-4)"}}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div>
              <div style={{fontSize:15,fontWeight:700,color:"var(--text-2)",marginBottom:8}}>
                {t.opponentChoosing(oppUsername)}
              </div>
              <Spinner/>
            </div>
          )}
        </div>
      )}

      {/* Phase: play */}
      {state.phase === "play" && (
        <>
          {/* Link type + timer */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.2)",
            borderRadius:10,padding:"8px 14px",marginBottom:12}}>
            <span style={{fontSize:11,color:"#c084fc",fontWeight:700}}>{linkLabel}</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:timerVal<=10?RED:"var(--text-3)"}}>
                {isMyTurn?t.yourTurn:t.turnOf(oppUsername)}
              </span>
              <span style={{fontWeight:900,color:timerVal<=10?RED:GREEN,fontSize:14}}>{timerVal}s</span>
            </div>
          </div>

          {/* Current anime */}
          {state.currentAnime && (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
              background:"rgba(255,255,255,0.04)",borderRadius:12,marginBottom:12,
              border:"1px solid rgba(255,255,255,0.08)"}}>
              <img src={state.currentAnime.image_url} alt="" style={{width:36,height:50,objectFit:"cover",borderRadius:6,flexShrink:0}}
                onError={e=>{e.target.style.display="none";}}/>
              <div>
                <div style={{fontSize:10,color:"var(--text-4)",marginBottom:2}}>{t.currentAnime}</div>
                <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)"}}>{state.currentAnime.title}</div>
                <div style={{fontSize:10,color:"var(--text-4)"}}>
                  {(state.currentAnime.studios||[]).map(s=>s.name||s).join(", ")} ·{" "}
                  {(state.currentAnime.genres||[]).map(g=>g.name||g).slice(0,3).join(", ")}
                </div>
              </div>
            </div>
          )}

          {/* Input */}
          {isMyTurn && (
            <div style={{position:"relative",marginBottom:8}}>
              <input value={query} onChange={e=>search(e.target.value)}
                placeholder={t.searchPlaceholder}
                autoFocus
                style={{width:"100%",boxSizing:"border-box",padding:"10px 14px",borderRadius:12,
                  background:"rgba(255,255,255,0.05)",border:`1px solid ${msg?"rgba(239,68,68,0.4)":"rgba(255,255,255,0.1)"}`,
                  color:"var(--text-1)",fontSize:13,outline:"none"}}/>
              {msg && <div style={{fontSize:11,color:RED,marginTop:4}}>{msg}</div>}
              {suggestions.length > 0 && (
                <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:50,
                  background:"#161226",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,
                  boxShadow:"0 8px 32px rgba(0,0,0,0.5)",maxHeight:220,overflowY:"auto"}}>
                  {suggestions.map(a=>(
                    <button key={a.mal_id} onClick={()=>handleGuess(a)}
                      style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 12px",
                        background:"none",border:"none",cursor:"pointer",textAlign:"left"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                      onMouseLeave={e=>e.currentTarget.style.background="none"}>
                      <img src={a.image_url} alt="" style={{width:24,height:34,objectFit:"cover",borderRadius:4}}
                        onError={e=>{e.target.style.display="none";}}/>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:"var(--text-1)"}}>{a.title}</div>
                        <div style={{fontSize:10,color:"var(--text-4)"}}>
                          {(a.studios||[]).map(s=>s.name||s).join(", ")} · {(a.genres||[]).map(g=>g.name||g).slice(0,2).join(", ")}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chain history */}
          <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:200,overflowY:"auto"}}>
            {[...state.chain].reverse().map((a,i)=>(
              <div key={a.mal_id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",
                borderRadius:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)"}}>
                <img src={a.image_url} alt="" style={{width:18,height:26,objectFit:"cover",borderRadius:3}}
                  onError={e=>{e.target.style.display="none";}}/>
                <span style={{fontSize:11,color:"var(--text-3)",fontWeight:600}}>{a.title}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Game End */}
      {state.phase === "gameEnd" && (
        <div style={{textAlign:"center",padding:32}}>
          {(() => {
            const myScore = state.scores[isP1?0:1];
            const oppScore = state.scores[isP1?1:0];
            const won = myScore > oppScore;
            const draw = myScore === oppScore;
            return (
              <>
                <div style={{fontSize:48,marginBottom:12}}>{won?"🏆":draw?"🤝":"😢"}</div>
                <div style={{fontSize:20,fontWeight:900,color:won?GREEN:draw?ORANGE:RED,marginBottom:8}}>
                  {won?tc.victory:draw?tc.draw:won?tc.defeat:tc.defeat}
                </div>
                <div style={{fontSize:14,color:"var(--text-3)",marginBottom:20}}>
                  {myScore} – {oppScore}
                </div>
                <button onClick={onClose}
                  style={{padding:"10px 24px",borderRadius:20,border:"none",
                    background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",
                    fontWeight:800,fontSize:13,cursor:"pointer"}}>
                  {tc.back}
                </button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── TIMELINE GAME ────────────────────────────────────────────────────────────
function getDayIndex() {
  return Math.floor((Date.now() - new Date("2026-01-01").getTime()) / 86400000);
}
function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

export function TimelineGame({ room, onClose }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).timeline;
  const tc = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).common;
  const isP1 = room.player1 === myUsername;
  const oppUsername = isP1 ? room.player2 : room.player1;

  const [state, setState] = useState(room.state || {
    timeline: [],      // [{mal_id,title,year,image_url}] — placed in order
    hand1: [],         // p1's 5 anime to place
    hand2: [],         // p2's 5 anime to place
    placed1: 0,        // how many p1 has placed
    placed2: 0,        // how many p2 has placed
    currentTurn: room.player1, // who goes first (random or p1)
    phase: "play",     // play | gameEnd
    winner: null,
    skipped: null,     // username who lost their turn (for display)
  });

  const [pool, setPool]   = useState([]);
  const [dragging, setDragging] = useState(null); // index in hand
  const [msg, setMsg]     = useState("");
  const subRef = useRef(null);

  const myHand    = isP1 ? state.hand1 : state.hand2;
  const myPlaced  = isP1 ? state.placed1 : state.placed2;
  const isMyTurn  = state.currentTurn === myUsername;
  const myHandLeft = myHand.slice(myPlaced);

  useEffect(() => {
    (async () => {
      const rows = await sb.query("anime_cache?type=eq.TV&score=gte.6&scored_by=gte.2000&select=mal_id,title,year,image_url&order=scored_by.desc&limit=3000").catch(()=>[]);
      setPool(rows||[]);
      // Init hands if not set
      if(room.state && room.state.hand1?.length) return;
      if(!rows?.length) return;
      const rand = seededRand(getDayIndex() * 999 + room.id.charCodeAt(0));
      const shuffled = [...rows].sort(()=>rand()-0.5);
      // 1 start + 5 for p1 + 5 for p2 = 11
      const picks = shuffled.slice(0,11);
      const startAnime = picks[0];
      const hand1 = picks.slice(1,6);
      const hand2 = picks.slice(6,11);
      const init = {
        timeline: [startAnime],
        hand1, hand2,
        placed1:0, placed2:0,
        currentTurn: room.player1,
        phase:"play", winner:null, skipped:null,
      };
      await pushState(init);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sub = supabase.channel(`timeline_${room.id}`)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_rooms",filter:`id=eq.${room.id}`},
        p => setState(p.new.state || state))
      .subscribe();
    subRef.current = sub;
    return () => supabase.removeChannel(sub);
  }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushState = async (newState) => {
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: newState, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  };

  const placeAnime = async (animeIdx, timelinePos) => {
    if(!isMyTurn || state.phase !== "play") return;
    const anime = myHandLeft[animeIdx];
    if(!anime) return;
    // Check if position is correct
    const newTimeline = [...state.timeline];
    newTimeline.splice(timelinePos, 0, anime);
    // Validate: timeline must be sorted by year
    const valid = newTimeline.every((a,i) =>
      i===0 || (a.year||0) >= (newTimeline[i-1].year||0)
    );
    if(!valid) {
      setMsg(t.errWrongPosition);
      // Pass turn
      const next = state.currentTurn === room.player1 ? room.player2 : room.player1;
      const newState = { ...state, currentTurn: next, skipped: myUsername };
      await pushState(newState);
      setTimeout(()=>setMsg(""), 2000);
      return;
    }
    setMsg("");
    // Place succeeded
    const newPlaced1 = isP1 ? state.placed1+1 : state.placed1;
    const newPlaced2 = isP1 ? state.placed2 : state.placed2+1;
    const next = state.currentTurn === room.player1 ? room.player2 : room.player1;
    // Check win: placed all 5
    const iWon = (isP1 ? newPlaced1 : newPlaced2) >= 5;
    // Check if other player also finishes this "turn cycle"
    const newState = {
      ...state,
      timeline: newTimeline,
      placed1: newPlaced1,
      placed2: newPlaced2,
      currentTurn: next,
      skipped: null,
      phase: iWon ? "gameEnd" : "play",
      winner: iWon ? myUsername : null,
    };
    if(iWon) {
      const eloField = "elo_timeline";
      const newElo1 = calcElo(room.elo1||400, room.elo2||400, isP1?1:0);
      const newElo2 = calcElo(room.elo2||400, room.elo1||400, isP1?0:1);
      await Promise.all([
        updateElo(room.player1, eloField, newElo1, isP1?20:5),
        updateElo(room.player2, eloField, newElo2, isP1?5:20),
      ]);
    }
    await pushState(newState);
    setDragging(null);
  };

  const currentAnimeToPlace = myHandLeft[0];

  return (
    <div style={{padding:16,maxWidth:700,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:"var(--text-2)"}}>
          📅 {myUsername} <span style={{color:"var(--text-4)"}}>vs</span> {oppUsername}
        </div>
        <div style={{fontSize:11,color:"var(--text-4)"}}>
          {t.placed(isP1?state.placed1:state.placed2, isP1?state.placed2:state.placed1, oppUsername)}
        </div>
      </div>

      {/* Turn indicator */}
      {state.phase === "play" && (
        <div style={{textAlign:"center",marginBottom:12,padding:"6px 14px",borderRadius:20,display:"inline-block",
          background:isMyTurn?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.04)",
          border:`1px solid ${isMyTurn?"rgba(34,197,94,0.3)":"rgba(255,255,255,0.08)"}`,
          color:isMyTurn?GREEN:"var(--text-4)",fontSize:11,fontWeight:700}}>
          {state.skipped ? t.skippedTurn(state.skipped) : ""}
          {isMyTurn ? t.yourTurn : t.turnOf(oppUsername)}
        </div>
      )}

      {msg && <div style={{textAlign:"center",fontSize:12,color:RED,marginBottom:8,fontWeight:700}}>{msg}</div>}

      {/* Anime to place */}
      {isMyTurn && currentAnimeToPlace && state.phase==="play" && (
        <div style={{marginBottom:12,padding:"10px 14px",borderRadius:12,
          background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.2)"}}>
          <div style={{fontSize:10,color:"var(--text-4)",marginBottom:6}}>{t.placeThisAnime}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <img src={currentAnimeToPlace.image_url} alt="" style={{width:32,height:46,objectFit:"cover",borderRadius:6}}
              onError={e=>{e.target.style.display="none";}}/>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)"}}>{currentAnimeToPlace.title}</div>
              <div style={{fontSize:10,color:"var(--text-4)"}}>???</div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div style={{overflowX:"auto",paddingBottom:8}}>
        <div style={{display:"flex",alignItems:"stretch",gap:0,minWidth:"max-content"}}>
          {/* Drop zone before first */}
          {isMyTurn && state.phase==="play" && (
            <DropZone onDrop={()=>placeAnime(0,0)}/>
          )}
          {state.timeline.map((a,i)=>(
            <div key={a.mal_id} style={{display:"flex",alignItems:"stretch"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:72}}>
                <img src={a.image_url} alt="" style={{width:52,height:72,objectFit:"cover",borderRadius:6,flexShrink:0}}
                  onError={e=>{e.target.style.display="none";}}/>
                <div style={{fontSize:9,color:"#c084fc",fontWeight:800,marginTop:3}}>{a.year||"?"}</div>
                <div style={{fontSize:8,color:"var(--text-4)",textAlign:"center",maxWidth:70,overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div>
              </div>
              {isMyTurn && state.phase==="play" && (
                <DropZone onDrop={()=>placeAnime(0,i+1)}/>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* My remaining hand */}
      {myHandLeft.length > 0 && (
        <div style={{marginTop:12}}>
          <div style={{fontSize:10,color:"var(--text-4)",marginBottom:6}}>
            {t.remainingAnime(myHandLeft.length)}
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {myHandLeft.map((a,i)=>(
              <div key={a.mal_id} style={{opacity:i===0?1:0.35,transition:"opacity 0.2s"}}>
                <img src={a.image_url} alt={a.title} style={{width:38,height:54,objectFit:"cover",borderRadius:6,
                  border:i===0?"2px solid #c084fc":"2px solid transparent"}}
                  onError={e=>{e.target.style.display="none";}}
                  title={a.title}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game End */}
      {state.phase === "gameEnd" && (
        <div style={{textAlign:"center",padding:24,marginTop:16,background:"rgba(255,255,255,0.03)",
          borderRadius:16,border:"1px solid rgba(255,255,255,0.07)"}}>
          <div style={{fontSize:40,marginBottom:8}}>{state.winner===myUsername?"🏆":"😢"}</div>
          <div style={{fontSize:18,fontWeight:900,color:state.winner===myUsername?GREEN:RED,marginBottom:16}}>
            {state.winner===myUsername?tc.victory:tc.defeat}
          </div>
          <div style={{fontSize:12,color:"var(--text-4)",marginBottom:20}}>
            {t.wonFirst(state.winner)}
          </div>
          <button onClick={onClose}
            style={{padding:"10px 24px",borderRadius:20,border:"none",
              background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",
              fontWeight:800,fontSize:13,cursor:"pointer"}}>
            {tc.back}
          </button>
        </div>
      )}
    </div>
  );
}

function DropZone({ onDrop }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onDrop}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{width:hover?28:12,minHeight:72,display:"flex",alignItems:"center",justifyContent:"center",
        cursor:"pointer",transition:"all 0.15s",flexShrink:0,
        background:hover?"rgba(124,58,237,0.15)":"transparent",
        border:hover?"2px dashed rgba(124,58,237,0.5)":"2px dashed transparent",
        borderRadius:6}}>
      {hover&&<span style={{fontSize:14,color:"#c084fc"}}>+</span>}
    </div>
  );
}
