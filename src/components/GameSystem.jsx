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
// Chain Elo rules:
// Same bracket: +20/-18 for 2-1, +23/-22 for 2-0
// Higher bracket vs lower: higher wins +10/-30, lower wins +30/-10
// Forfait/cheat: cheater -40, victim +5
// Timeline Elo rules:
// Same bracket: +20/-20
// Different bracket: higher wins +15/-25, lower wins +25/-15

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

function getEloBracket(elo, waitTime=0) {
  // Brackets expand with wait time: starts at ±50, grows by 5 per 2s
  const range = Math.min(50 + waitTime * 5, 400);
  return Math.floor(elo / range);
}

async function updateElo(username, field, delta, pointsDelta=0) {
  const row = await getOrCreateElo(username);
  const current = row[field] || 400;
  const newElo = Math.max(0, current + delta); // never below 0
  await sb.query(`game_elo?username=eq.${encodeURIComponent(username)}`, {
    method: "PATCH",
    headers: { ...sb.headers, "Prefer": "return=minimal" },
    body: JSON.stringify({
      [field]: newElo,
      points_total: Math.max(0, (row.points_total||0) + pointsDelta),
      updated_at: new Date().toISOString()
    }),
  }).catch(()=>{});
  return newElo;
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

      // Random delay 0-1s so players don't all create rooms simultaneously
      await new Promise(r => setTimeout(r, Math.random() * 1000));
      if(cancelled) return;

      // First check if there's already a room to join
      const findRoom = async (range) => {
        const twoMinAgo = new Date(Date.now() - 120000).toISOString();
        const rooms = await sb.query(`game_rooms?game_type=eq.${gameType}&status=eq.waiting&player1=neq.${encodeURIComponent(myUsername)}&private_code=is.null&player2=is.null&updated_at=gte.${encodeURIComponent(twoMinAgo)}&limit=10`).catch(()=>[]);
        return (rooms||[]).filter(r=>Math.abs((r.elo1||400)-eloVal)<=range).sort((a,b)=>Math.abs((a.elo1||400)-eloVal)-Math.abs((b.elo1||400)-eloVal))[0]||null;
      };

      // Try joining immediately before creating own room
      const immediate = await findRoom(400);
      if(immediate && !cancelled) {
        if(subRef.current) supabase.removeChannel(subRef.current);
        const joinSub = supabase.channel(`room_${immediate.id}`)
          .on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_rooms",filter:`id=eq.${immediate.id}`},
            p=>{const r=p.new;if(r.status==="active"&&r.player2&&!cancelled){setStatus("found");setTimeout(()=>onMatch(r),500);}})
          .subscribe();
        subRef.current = joinSub;
        roomRef.current = immediate.id;
        const patched = await sb.query(`game_rooms?id=eq.${immediate.id}`,{
          method:"PATCH",
          headers:{...sb.headers,"Prefer":"return=representation"},
          body:JSON.stringify({player2:myUsername,elo2:eloVal,status:"active",updated_at:new Date().toISOString()})
        }).catch(()=>null);
        if(patched?.[0]&&!cancelled){
          setStatus("found");
          setTimeout(()=>onMatch({...immediate,player2:myUsername,elo2:eloVal,status:"active"}),500);
        }
        return;
      }
      // Clean up old phantom waiting rooms from this user
      sb.query(`game_rooms?player1=eq.${encodeURIComponent(myUsername)}&status=eq.waiting&game_type=eq.${gameType}`,
        {method:"DELETE"}).catch(()=>{});

      const created = await sb.query("game_rooms",{method:"POST",headers:{...sb.headers,"Prefer":"return=representation"},body:JSON.stringify({game_type:gameType,player1:myUsername,elo1:eloVal,status:"waiting",state:{},ranked:true,updated_at:new Date().toISOString()})}).catch(()=>null);
      const myRoom = created?.[0];
      if(!myRoom||cancelled) return;
      roomRef.current = myRoom.id;
      const sub = supabase.channel(`room_${myRoom.id}`)
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_rooms",filter:`id=eq.${myRoom.id}`},
          p=>{const r=p.new;if(r.status==="active"&&r.player2&&!cancelled){setStatus("found");setTimeout(()=>onMatch(r),1000);}})
        .subscribe();
      subRef.current = sub;
      let waited = 0;

      // Polling fallback for creator — in case Realtime misses the update
      const creatorPoll = setInterval(async () => {
        if(cancelled) return;
        const rows = await sb.query(`game_rooms?id=eq.${myRoom.id}&limit=1`).catch(()=>[]);
        const r = rows?.[0];
        if(r?.status === "active" && r?.player2 && !cancelled) {
          clearInterval(creatorPoll);
          clearInterval(interval);
          setStatus("found");
          setTimeout(()=>onMatch(r), 500);
        } else if(r?.status === "waiting") {
          // Heartbeat — keep room fresh so other players can find it
          sb.query(`game_rooms?id=eq.${myRoom.id}`,{method:"PATCH",headers:{...sb.headers,"Prefer":"return=minimal"},body:JSON.stringify({updated_at:new Date().toISOString()})}).catch(()=>{});
        }
      }, 2000);

      interval = setInterval(async()=>{
        if(cancelled) return;
        waited+=2; setWaitTime(waited);
        const range = Math.min(50+waited*5,400);
        const existing = await findRoom(range);
        if(existing&&!cancelled){
          clearInterval(interval);
          // Subscribe to the existing room BEFORE patching
          if(subRef.current) supabase.removeChannel(subRef.current);
          const joinSub = supabase.channel(`room_${existing.id}`)
            .on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_rooms",filter:`id=eq.${existing.id}`},
              p=>{const r=p.new;if(r.status==="active"&&r.player2&&!cancelled){setStatus("found");setTimeout(()=>onMatch(r),500);}})
            .subscribe();
          subRef.current = joinSub;
          roomRef.current = existing.id;
          // Delete own waiting room
          await sb.query(`game_rooms?id=eq.${myRoom.id}`,{method:"DELETE"}).catch(()=>{});
          // Patch the existing room to active
          const patched = await sb.query(`game_rooms?id=eq.${existing.id}`,{
            method:"PATCH",
            headers:{...sb.headers,"Prefer":"return=representation"},
            body:JSON.stringify({player2:myUsername,elo2:eloVal,status:"active",updated_at:new Date().toISOString()})
          }).catch(()=>null);
          // Trigger onMatch directly for the joiner since we won't receive our own UPDATE
          if(patched?.[0]&&!cancelled){
            setStatus("found");
            setTimeout(()=>onMatch({...existing,player2:myUsername,elo2:eloVal,status:"active"}),500);
          }
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
        p=>{const r=p.new;if(r.status==="active"&&r.player2){setStatus("found");setTimeout(()=>onMatch(r),500);}})
      .subscribe();
    subRef.current = sub;

    // Polling fallback in case Realtime misses the update
    const pollInterval = setInterval(async () => {
      const rows = await sb.query(`game_rooms?id=eq.${myRoom.id}&limit=1`).catch(()=>[]);
      const r = rows?.[0];
      if(r?.status === "active" && r?.player2) {
        clearInterval(pollInterval);
        setStatus("found");
        setTimeout(()=>onMatch(r), 500);
      }
    }, 2000);
    setMode("private-create");
  };
  const joinPrivateRoom = async () => {
    setJoinError("");
    const code = joinCode.trim().toUpperCase();
    if(!code) return;
    const rooms = await sb.query(`game_rooms?private_code=eq.${code}&status=eq.waiting&limit=1`).catch(()=>[]);
    const room = rooms?.[0];
if(!room){setJoinError(t.errInvalidCode);return;}
    if(room.player1===myUsername){setJoinError(t.errOwnRoom);return;}

    // Subscribe to the room BEFORE patching so both players get the update
    const joinSub = supabase.channel(`room_join_${room.id}`)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"game_rooms",filter:`id=eq.${room.id}`},
        p=>{const r=p.new;if(r.status==="active"&&r.player2){setStatus("found");setTimeout(()=>onMatch(r),500);}})
      .subscribe();
    subRef.current = joinSub;
    roomRef.current = room.id;

    // Patch the room
    const patched = await sb.query(`game_rooms?id=eq.${room.id}`,{
      method:"PATCH",
      headers:{...sb.headers,"Prefer":"return=representation"},
      body:JSON.stringify({player2:myUsername,elo2:400,status:"active",updated_at:new Date().toISOString()})
    }).catch(()=>null);

    if(patched?.[0]){
      setStatus("found");
      setTimeout(()=>onMatch({...room,player2:myUsername,elo2:400,status:"active"}),500);
    }
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
        <button onClick={()=>setMode("vs-ai")} style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(251,191,36,0.4)",background:"rgba(251,191,36,0.08)",color:"#fbbf24",fontWeight:800,fontSize:13,cursor:"pointer"}}>
          🤖 vs IA
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

  if(mode==="vs-ai") return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:24,fontWeight:900,color:"var(--text-1)",marginBottom:8}}>🤖 vs IA</div>
      <div style={{fontSize:12,color:"var(--text-4)",marginBottom:20}}>Choisis la difficulté</div>
      <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:240,margin:"0 auto"}}>
        {[
          {label:"🟢 Facile",diff:"easy",desc:"L'IA rate 30% du temps"},
          {label:"🟡 Moyen",diff:"medium",desc:"L'IA rate 15% du temps"},
          {label:"🔴 Difficile",diff:"hard",desc:"L'IA rate 5% du temps"},
        ].map(({label,diff,desc})=>(
          <button key={diff} onClick={()=>{
            const aiRoom = {
              id:"ai-"+Date.now(),
              game_type:gameType,
              player1:myUsername,
              player2:`🤖 IA (${label.split(" ")[1]})`,
              elo1:400, elo2:400,
              status:"active",
              ranked:false,
              _isAI:true,
              _aiDiff:diff,
            };
            setStatus("found");
            setTimeout(()=>onMatch(aiRoom),600);
          }}
          style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.04)",color:"var(--text-1)",fontWeight:700,fontSize:13,cursor:"pointer",textAlign:"left"}}>
            <div style={{fontWeight:800}}>{label}</div>
            <div style={{fontSize:10,color:"var(--text-4)",marginTop:2}}>{desc}</div>
          </button>
        ))}
        <button onClick={()=>setMode(null)} style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>{tc.cancel}</button>
      </div>
      {status==="found" && <div style={{marginTop:20,fontSize:16,fontWeight:900,color:GREEN}}>Lancement… ⚔️</div>}
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

export function ChainGame({ room, onClose, onReady }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).chain;
  const tc = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).common;
  const isAI = !!room._isAI;
  const aiDiff = room._aiDiff || "medium";
  const aiFailRate = aiDiff === "easy" ? 0.30 : aiDiff === "medium" ? 0.15 : 0.05;
  const aiDelay   = aiDiff === "easy" ? 3500 : aiDiff === "medium" ? 2000 : 1000;
  const isP1 = room.player1 === myUsername;
  const oppUsername = isP1 ? room.player2 : room.player1;
  const myElo  = isP1 ? (room.elo1||400) : (room.elo2||400);
  const oppElo = isP1 ? (room.elo2||400) : (room.elo1||400);

  const defaultState = {
    round: 1,
    scores: [0, 0],
    linkType: null,
    currentAnime: null,
    chain: [],
    turn: null,
    chooser: room.player1,
    phase: "choose",
    timer: 40,
    roundStart: null,
    times: [0, 0],
  };
  const [state, setState] = useState(
    (room.state && room.state.scores) ? room.state : defaultState
  );

  const [query, setQuery]       = useState("");
  const [suggestions, setSugs]  = useState([]);
  const [pool, setPool]         = useState([]);
  const [timerVal, setTimerVal] = useState(40);
  const [msg, setMsg]           = useState("");
  const subRef = useRef(null);
  const timerRef = useRef(null);
  const searchTimer = useRef(null);
  const startTsRef = useRef(null);

  const isRanked = room.ranked !== false;

  // Anti-cheat: if ranked, forfait when tab becomes hidden
  useEffect(() => {
    if(!isRanked) return;
    const handleVisibility = async () => {
      if(document.hidden && state.phase === "play") {
        await sb.query(`game_rooms?id=eq.${room.id}`, {
          method: "PATCH",
          headers: { ...sb.headers, "Prefer": "return=minimal" },
          body: JSON.stringify({ status: "waiting", updated_at: new Date().toISOString() }),
        }).catch(()=>{});
        onClose();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [state.phase, isRanked]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMyTurn = state.turn === myUsername;
  const amChooser = state.chooser === myUsername;

  // Load TV pool
  useEffect(() => {
    sb.query("anime_cache?type=eq.TV&score=gte.6.5&scored_by=gte.3000&select=mal_id,title,studios,genres,image_url&order=scored_by.desc&limit=5000")
      .then(r => setPool(r||[])).catch(()=>{});
  }, []);

  // Sync state from Supabase via polling (more reliable than Realtime)
  const lastStateRef = useRef(JSON.stringify(state));
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status,winner&limit=1`);
        const r = rows?.[0];
        if(!r) return;
        // Check if opponent left
        const opponentForfait = r.status === "finished" && r.winner === myUsername;
        const opponentLeft = r.status === "waiting" || opponentForfait;
        if(opponentLeft) {
          clearInterval(poll);
          setState(s => ({...s, phase:"gameEnd", winner: myUsername, opponentLeft: true}));
          return;
        }
        const newState = r.state;
        if(!newState?.scores) return;
        const str = JSON.stringify(newState);
        if(str !== lastStateRef.current) {
          lastStateRef.current = str;
          setState(newState);
          setTimerVal(newState.timer || 40);
        }
      } catch {}
    }, 1500);
    return () => clearInterval(poll);
  }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if(isAI) return; // AI mode: no DB sync needed
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: newState, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  };

  // AI turn logic
  const aiTurnRef = useRef(false);
  useEffect(() => {
    if(!isAI || state.phase !== "play" || state.turn === myUsername || aiTurnRef.current) return;
    aiTurnRef.current = true;
    const doAITurn = async () => {
      await sleep(aiDelay + Math.random() * 800);
      if(pool.length === 0) { aiTurnRef.current = false; return; }
      // Fail check — IA loses the round (no "pass" mechanic)
      if(Math.random() < aiFailRate) {
        // AI times out = loses current round
        const newScores = isP1 ? [state.scores[0]+1, state.scores[1]] : [state.scores[0], state.scores[1]+1];
        const over = newScores[0]>=2 || newScores[1]>=2;
        setState(s => ({...s, scores:newScores, phase:over?"gameEnd":"choose",
          turn:null, chooser:myUsername, linkType:null, currentAnime:null, chain:[]}));
        aiTurnRef.current = false;
        return;
      }
      // Pick valid anime
      const cur = state.currentAnime;
      const curStudios = (cur.studios||[]).map(s=>s.name||s);
      const curGenres  = (cur.genres||[]).map(g=>g.name||g);
      const usedIds    = new Set(state.chain.map(a=>a.mal_id));
      const linkType   = currentLinkType === "studio" ? "studio" : "genre";
      const candidates = pool.filter(a => {
        if(usedIds.has(a.mal_id)) return false;
        const s = (a.studios||[]).map(x=>x.name||x);
        const g = (a.genres||[]).map(x=>x.name||x);
        return linkType === "studio"
          ? s.some(x=>curStudios.includes(x)) && !g.every(x=>curGenres.includes(x))
          : g.some(x=>curGenres.includes(x)) && !s.every(x=>curStudios.includes(x));
      });
      if(candidates.length === 0) {
        // No valid move — AI loses the round
        const newScores = isP1 ? [state.scores[0]+1, state.scores[1]] : [state.scores[0], state.scores[1]+1];
        const over = newScores[0]>=2 || newScores[1]>=2;
        setState(s => ({...s, scores:newScores, phase:over?"gameEnd":"choose",
          turn:null, chooser:myUsername, linkType:null, currentAnime:null, chain:[]}));
        aiTurnRef.current = false;
        return;
      }
      const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 20))];
      setState(s => ({...s, currentAnime:pick, chain:[...s.chain, pick], turn:myUsername, timer:40}));
      aiTurnRef.current = false;
    };
    doAITurn();
  }, [state.turn, state.phase, isAI]); // eslint-disable-line react-hooks/exhaustive-deps
  const doForfait = async () => {
    if(state.phase !== "gameEnd") {
      if(room.ranked) {
        const victim = myUsername === room.player1 ? room.player2 : room.player1;
        await Promise.all([
          updateElo(myUsername, "elo_chain", -40, 0),
          updateElo(victim, "elo_chain", 5, 5),
        ]);
      }
      await sb.query(`game_rooms?id=eq.${room.id}`, {
        method: "PATCH",
        headers: { ...sb.headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ status: "finished", winner: myUsername === room.player1 ? room.player2 : room.player1, updated_at: new Date().toISOString() }),
      }).catch(()=>{});
    }
  };

  // Expose forfait so ForumView can call it before closing
  if(typeof onClose._chainRef === "undefined") onClose._chainRef = doForfait;
  useEffect(() => { onReady?.(doForfait); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleChooseLinkType = async (type) => {
    if(!amChooser || state.phase !== "choose") return;
    const seed = Date.now();
    const start = seededPick(pool, seed);
    const newState = {
      ...state,
      linkType: type,
      currentAnime: start,
      chain: [start],
      turn: state.chooser,
      phase: "play",
      timer: 40,
    };
    setState(newState);
    await pushState(newState);
  };

  const [lastGuess, setLastGuess] = useState(null); // {anime, valid, linkUsed}

  // ABBA pattern: chooser always plays their chosen type, opponent always plays the opposite
  // e.g. chooser picked "studio" → chooser plays studio, opponent plays genre, always
  const currentLinkType = state.linkType
    ? (state.turn === state.chooser
        ? state.linkType
        : state.linkType === "studio" ? "genre" : "studio")
    : null;

  const isValidLink = (guess) => {
    const cur = state.currentAnime;
    if(!cur || !currentLinkType) return false;
    const curStudios = (cur.studios||[]).map(s=>s.name||s);
    const curGenres  = (cur.genres||[]).map(g=>g.name||g);
    const gStudios   = (guess.studios||[]).map(s=>s.name||s);
    const gGenres    = (guess.genres||[]).map(g=>g.name||g);
    if(currentLinkType === "studio") {
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
    if(state.chain.some(a => a.mal_id === anime.mal_id)) {
setMsg(t.errAlreadyUsed);
      setLastGuess(null);
      return;
    }
    const valid = isValidLink(anime);
    setLastGuess({ anime, valid, linkUsed: currentLinkType });
    setQuery(""); setSugs([]);
    if(!valid) {
setMsg(t.errInvalidLink);
      return;
    }
    setMsg("");
    const elapsed = Math.round((Date.now() - (startTsRef.current||Date.now())) / 1000);
    const newTimes = isP1 ? [state.times[0]+elapsed, state.times[1]] : [state.times[0], state.times[1]+elapsed];
    const nextTurn = state.turn === myUsername ? oppUsername : myUsername;
    const newState = { ...state, currentAnime: anime, chain: [...state.chain, anime], turn: nextTurn, timer: 40, times: newTimes };
    setState(newState);
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
      setState(newState);
      await pushState(newState);
      setTimeout(async () => {
        const chooseState = { ...newState, phase: "choose" };
        setState(chooseState);
        await pushState(chooseState);
      }, 3000);
    }
  };

  const handleGameEnd = async (winner, scores) => {
    if(!room.ranked) {
      // Private room — no Elo change
      await sb.query(`game_rooms?id=eq.${room.id}`, {
        method: "PATCH",
        headers: { ...sb.headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ status: "finished", winner, state: { ...state, phase: "gameEnd", scores } }),
      }).catch(()=>{});
      return;
    }
    const elo1 = room.elo1||400, elo2 = room.elo2||400;
    const p1Won = winner === room.player1;
    const p2Won = winner === room.player2;
    // Determine score string (2-0 or 2-1)
    const minScore = Math.min(scores[0], scores[1]);
    const scoreStr = minScore === 0 ? "2-0" : "2-1";
    const delta1 = calcChainElo(elo1, elo2, p1Won?1:p2Won?0:0.5, scoreStr);
    const delta2 = calcChainElo(elo2, elo1, p2Won?1:p1Won?0:0.5, scoreStr);
    await Promise.all([
      updateElo(room.player1, "elo_chain", delta1, p1Won?20:5),
      updateElo(room.player2, "elo_chain", delta2, p2Won?20:5),
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

  const linkLabel = currentLinkType === "studio" ? (t.linkLabelStudio||"🏢 Même studio, genre différent") : currentLinkType === "genre" ? (t.linkLabelGenre||"🎌 Même genre, studio différent") : "";

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
              {pool.length === 0 ? (
                <Spinner/>
              ) : (
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
              )}
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
onKeyDown={e=>{if(e.key==="Enter"&&suggestions.length>0)handleGuess(suggestions[0]);}}
                placeholder={t.searchPlaceholder}
                autoFocus
                style={{width:"100%",boxSizing:"border-box",padding:"10px 14px",borderRadius:12,
                  background:"rgba(255,255,255,0.05)",border:`1px solid ${msg.startsWith("❌")?"rgba(239,68,68,0.4)":"rgba(255,255,255,0.1)"}`,
                  color:"var(--text-1)",fontSize:13,outline:"none"}}/>
              {/* Last guess result — shows studio/genre after attempt */}
              {lastGuess && (
                <div style={{marginTop:6,padding:"8px 12px",borderRadius:10,display:"flex",alignItems:"center",gap:8,
                  background:lastGuess.valid?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",
                  border:`1px solid ${lastGuess.valid?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.2)"}`}}>
                  <img src={lastGuess.anime.image_url} alt="" style={{width:24,height:34,objectFit:"cover",borderRadius:4}}
                    onError={e=>{e.target.style.display="none";}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:800,color:"var(--text-1)"}}>{lastGuess.anime.title}</div>
                    <div style={{fontSize:10,color:lastGuess.valid?"#22c55e":"#ef4444"}}>
{lastGuess.valid?"✅ Valide":"❌ Invalide"} · Studio: {(lastGuess.anime.studios||[]).map(s=>s.name||s).join(", ")||"?"} · Genres: {(lastGuess.anime.genres||[]).map(g=>g.name||g).join(", ")||"?"}
                    </div>
                  </div>
                </div>
              )}
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
                      {/* Only title — no studio/genre visible */}
                      <div style={{fontSize:12,fontWeight:700,color:"var(--text-1)"}}>{a.title}</div>
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
            const won = state.winner === myUsername || myScore > oppScore;
            const draw = !state.winner && myScore === oppScore;
            return (
              <>
<div style={{fontSize:48,marginBottom:12}}>{state.opponentLeft?"🏃":won?"🏆":draw?"🤝":"😢"}</div>
                <div style={{fontSize:20,fontWeight:900,color:state.opponentLeft||won?"#22c55e":draw?ORANGE:RED,marginBottom:8}}>
                  {state.opponentLeft?"Adversaire déconnecté — Victoire !":(won?(tc?.victory||"Victoire !"):(draw?(tc?.draw||"Égalité"):(tc?.defeat||"Défaite")))}
                </div>
                <div style={{fontSize:14,color:"var(--text-3)",marginBottom:20}}>
                  {myScore} – {oppScore}
                </div>
                <button onClick={handleForfait}
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

export function TimelineGame({ room, onClose, onReady }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).timeline;
  const tc = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).common;
  const isAI = !!room._isAI;
  const aiDiff = room._aiDiff || "medium";
  const aiFailRate = aiDiff === "easy" ? 0.30 : aiDiff === "medium" ? 0.15 : 0.05;
  const aiDelay   = aiDiff === "easy" ? 3000 : aiDiff === "medium" ? 1800 : 900;
  const isP1 = room.player1 === myUsername;
  const oppUsername = isP1 ? room.player2 : room.player1;

  const defaultTimelineState = {
    timeline: [],
    hand1: [], hand2: [],
    placed1: 0, placed2: 0,
    currentTurn: room.player1,
    phase: "play", winner: null, skipped: null,
  };
  const [state, setState] = useState(
    (room.state && room.state.hand1?.length) ? room.state : defaultTimelineState
  );

  const [pool, setPool]   = useState([]);
  const [dragging, setDragging] = useState(null);
  const [selectedCard, setSelectedCard] = useState(0); // index in hand
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
      // Only P1 initializes the game state
      if(!isP1) return;
      if(room.state && room.state.hand1?.length) return;
      if(!rows?.length) return;
      const rand = seededRand(getDayIndex() * 999 + room.id.charCodeAt(0));
      const shuffled = [...rows].sort(()=>rand()-0.5);
      const picks = shuffled.slice(0,11);
      const init = {
        timeline: [picks[0]],
        hand1: picks.slice(1,6),
        hand2: picks.slice(6,11),
        placed1:0, placed2:0,
        currentTurn: room.player1,
        phase:"play", winner:null, skipped:null,
      };
      setState(init);
      await pushState(init);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling sync
  const lastTLStateRef = useRef(JSON.stringify(state));
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status,winner&limit=1`);
        const r = rows?.[0];
        if(!r) return;
        const opponentForfaitTL = r.status === "finished" && r.winner === myUsername;
        if(r.status === "waiting" || opponentForfaitTL) {
          clearInterval(poll);
          setState(s => ({...s, phase:"gameEnd", winner: myUsername, opponentLeft: true}));
          return;
        }
        const newState = r.state;
        if(!newState?.hand1) return;
        const str = JSON.stringify(newState);
        if(str !== lastTLStateRef.current) {
          lastTLStateRef.current = str;
          setState(newState);
        }
      } catch {}
    }, 1500);
    return () => clearInterval(poll);
  }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushState = async (newState) => {
    if(isAI) return;
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: newState, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  };

  // AI turn for Timeline
  const aiTLRef = useRef(false);
  useEffect(() => {
    if(!isAI || state.phase !== "play" || state.currentTurn === myUsername || aiTLRef.current) return;
    aiTLRef.current = true;
    const doAITurn = async () => {
      await sleep(aiDelay + Math.random() * 800);
      // AI hand = opponent hand
      const aiHandAll  = isP1 ? state.hand2 : state.hand1;
      const aiPlaced   = isP1 ? state.placed2 : state.placed1;
      const aiHandLeft = aiHandAll.slice(aiPlaced);
      if(aiHandLeft.length === 0) { aiTLRef.current = false; return; }

      const cardIdx = 0; // AI always plays first card in hand
      const anime   = aiHandLeft[cardIdx];
      const fails   = Math.random() < aiFailRate;

      if(fails) {
        // AI places wrong (pass turn)
        const next = isP1 ? myUsername : room.player1;
        setState(s => ({...s, currentTurn:myUsername, skipped:oppUsername}));
        aiTLRef.current = false;
        return;
      }

      // Find correct position
      const tl = state.timeline;
      let bestPos = tl.length;
      for(let i = 0; i <= tl.length; i++) {
        const test = [...tl]; test.splice(i, 0, anime);
        if(test.every((a,j) => j===0 || (a.year||0) >= (test[j-1].year||0))) {
          bestPos = i; break;
        }
      }

      const newTimeline = [...tl]; newTimeline.splice(bestPos, 0, anime);
      const newPlaced1 = isP1 ? state.placed1 : state.placed1;
      const newPlaced2 = isP1 ? state.placed2+1 : state.placed2;
      // Actually fix: AI is always opponent
      const aiNewPlaced = (isP1 ? state.placed2 : state.placed1) + 1;
      const myNewPlaced = isP1 ? state.placed1 : state.placed2;

      const np1 = isP1 ? state.placed1 : aiNewPlaced;
      const np2 = isP1 ? aiNewPlaced : state.placed2;
      const newHand1 = isP1 ? state.hand1 : state.hand1.filter(a=>a.mal_id!==anime.mal_id);
      const newHand2 = isP1 ? state.hand2.filter(a=>a.mal_id!==anime.mal_id) : state.hand2;

      const gameOver = aiNewPlaced >= 5;
      const newState = {
        ...state,
        timeline: newTimeline,
        hand1: newHand1, hand2: newHand2,
        placed1: np1, placed2: np2,
        currentTurn: myUsername,
        skipped: null,
        phase: gameOver ? "gameEnd" : "play",
        winner: gameOver ? oppUsername : null,
      };
      setState(newState);
      aiTLRef.current = false;
    };
    doAITurn();
  }, [state.currentTurn, state.phase, isAI]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeAnime = async (handIdx, timelinePos) => {
    const anime = myHandLeft[handIdx];
    if(!anime) return;
    // Check if position is correct
    const newTimeline = [...state.timeline];
    newTimeline.splice(timelinePos, 0, anime);
    // Validate: timeline must be sorted by year
    const valid = newTimeline.every((a,i) =>
      i===0 || (a.year||0) >= (newTimeline[i-1].year||0)
    );
    if(!valid) {
setMsg(t.errWrongPosition||"❌ Mauvaise position !");
      const next = state.currentTurn === room.player1 ? room.player2 : room.player1;
      const newState = { ...state, currentTurn: next, skipped: myUsername };
      setState(newState);
      await pushState(newState);
      setTimeout(()=>setMsg(""), 2000);
      return;
    }
    setMsg("");
    const newPlaced1 = isP1 ? state.placed1+1 : state.placed1;
    const newPlaced2 = isP1 ? state.placed2 : state.placed2+1;
    const next = state.currentTurn === room.player1 ? room.player2 : room.player1;

    // Win condition: placed all 5 cards
    // If P1 finishes first, P2 gets one more turn to equalize
    // If P2 finishes, game ends immediately
    const myNewPlaced = isP1 ? newPlaced1 : newPlaced2;
    const oppNewPlaced = isP1 ? newPlaced2 : newPlaced1;
    
    let iWon = false;
    let isDraw = false;
    
    if(myNewPlaced >= 5) {
      if(isP1) {
        // P1 finished — P2 gets one more turn (don't end yet, pass turn)
        // But if P2 also has 5, it's a draw
        if(oppNewPlaced >= 5) isDraw = true;
        // else just pass turn, P2 will get their last chance
      } else {
        // P2 finished — game ends now
        iWon = true;
      }
    }
    // Special: if we're P2 and P1 already finished (placed1 >= 5)
    if(!isP1 && state.placed1 >= 5 && myNewPlaced >= 5) {
      isDraw = newPlaced1 === newPlaced2;
      iWon = !isDraw;
    }
    // If P1 finished last turn and now P2 finishes too
    if(isP1 && newPlaced1 >= 5 && newPlaced2 >= 5) isDraw = true;

    const gameOver = iWon || isDraw || (newPlaced1 >= 5 && !isP1);
    const winner = isDraw ? null : iWon ? myUsername : (newPlaced1 >= 5 && !isP1 ? room.player1 : null);

    // Remove the specific card from the hand
    const newHand1 = isP1 ? [...state.hand1.filter(a=>a.mal_id!==anime.mal_id)] : state.hand1;
    const newHand2 = isP1 ? state.hand2 : [...state.hand2.filter(a=>a.mal_id!==anime.mal_id)];

    const newState = {
      ...state,
      timeline: newTimeline,
      hand1: newHand1,
      hand2: newHand2,
      placed1: newPlaced1,
      placed2: newPlaced2,
      currentTurn: next,
      skipped: null,
      phase: gameOver ? "gameEnd" : "play",
      winner,
      isDraw,
    };
    setState(newState);
    setSelectedCard(0);
    if(gameOver && room.ranked) {
      const p1Won = winner === room.player1;
      const p2Won = winner === room.player2;
      const delta1 = calcTimelineElo(room.elo1||400, room.elo2||400, p1Won?1:isDraw?0.5:0);
      const delta2 = calcTimelineElo(room.elo2||400, room.elo1||400, p2Won?1:isDraw?0.5:0);
      await Promise.all([
        updateElo(room.player1, "elo_timeline", delta1, p1Won?20:isDraw?10:5),
        updateElo(room.player2, "elo_timeline", delta2, p2Won?20:isDraw?10:5),
      ]);
    }
    await pushState(newState);
    setDragging(null);
  };

  const doForfaitTL = async () => {
    if(state.phase !== "gameEnd") {
      if(room.ranked) {
        const victim = myUsername === room.player1 ? room.player2 : room.player1;
        await Promise.all([
          updateElo(myUsername, "elo_timeline", -40, 0),
          updateElo(victim, "elo_timeline", 5, 5),
        ]);
      }
      await sb.query(`game_rooms?id=eq.${room.id}`, {
        method: "PATCH",
        headers: { ...sb.headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ status: "finished", winner: myUsername === room.player1 ? room.player2 : room.player1, updated_at: new Date().toISOString() }),
      }).catch(()=>{});
    }
  };
  if(typeof onClose._timelineRef === "undefined") onClose._timelineRef = doForfaitTL;
  useEffect(() => { onReady?.(doForfaitTL); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentAnimeToPlace = myHandLeft[selectedCard] || myHandLeft[0];

  return (
    <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:"var(--text-2)"}}>
          📅 {myUsername} <span style={{color:"var(--text-4)"}}>vs</span> {oppUsername}
        </div>
<div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:11,color:"var(--text-4)"}}>
            {t.placed(isP1?state.placed1:state.placed2, isP1?state.placed2:state.placed1, oppUsername)}
          </div>
          <button onClick={doForfaitTL}
            style={{fontSize:9,padding:"3px 8px",borderRadius:8,border:"1px solid rgba(239,68,68,0.3)",
              background:"rgba(239,68,68,0.08)",color:"#ef4444",cursor:"pointer"}}>
            {t.forfeitBtn}
          </button>
        </div>
      </div>

      {/* Turn indicator */}
      {state.phase === "play" && (
        <div style={{textAlign:"center",marginBottom:12,padding:"6px 14px",borderRadius:20,display:"inline-block",
          background:isMyTurn?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.04)",
          border:`1px solid ${isMyTurn?"rgba(34,197,94,0.3)":"rgba(255,255,255,0.08)"}`,
          color:isMyTurn?GREEN:"var(--text-4)",fontSize:11,fontWeight:700}}>
{state.skipped ? (t.skippedTurn?t.skippedTurn(state.skipped):`⏩ ${state.skipped} a raté — `) : ""}
          {isMyTurn ? (t.yourTurn||"🎯 Ton tour — clique sur une carte puis sur une position") : (t.turnOf?t.turnOf(oppUsername):`⏳ Tour de ${oppUsername}`)}
        </div>
      )}

      {msg && <div style={{textAlign:"center",fontSize:12,color:RED,marginBottom:8,fontWeight:700}}>{msg}</div>}

      {/* My hand — selectable */}
      {myHandLeft.length > 0 && state.phase==="play" && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"var(--text-4)",marginBottom:8}}>
{isMyTurn ? t.selectCardPrompt : t.remainingAnimeLabel}
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {myHandLeft.map((a,i)=>{
              const selected = i === selectedCard;
              return (
                <div key={a.mal_id}
                  onClick={()=>isMyTurn && setSelectedCard(i)}
                  style={{cursor:isMyTurn?"pointer":"default",
                    display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                    padding:6,borderRadius:10,transition:"all 0.15s",
                    background:selected&&isMyTurn?"rgba(124,58,237,0.15)":"transparent",
                    border:selected&&isMyTurn?"2px solid #c084fc":"2px solid transparent",
                    transform:selected&&isMyTurn?"translateY(-4px)":"none"}}>
                  <img src={a.image_url} alt={a.title}
                    style={{width:54,height:76,objectFit:"cover",borderRadius:8}}
                    onError={e=>{e.target.style.display="none";}}
                    title={a.title}/>
                  <div style={{fontSize:8,color:selected&&isMyTurn?"#c084fc":"var(--text-4)",
                    maxWidth:60,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {a.title}
                  </div>
                  {selected && isMyTurn && (
<div style={{fontSize:8,color:"#c084fc",fontWeight:800}}>▼ {t.selectedLabel}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Card to place preview */}
      {isMyTurn && currentAnimeToPlace && state.phase==="play" && (
        <div style={{marginBottom:12,padding:"8px 14px",borderRadius:12,display:"flex",alignItems:"center",gap:10,
          background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.2)"}}>
<div style={{fontSize:10,color:"var(--text-4)",marginBottom:6}}>{t.placeThisAnime}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <img src={currentAnimeToPlace.image_url} alt="" style={{width:32,height:46,objectFit:"cover",borderRadius:6}}
              onError={e=>{e.target.style.display="none";}}/>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:"var(--text-1)"}}>{currentAnimeToPlace.title}</div>
              <div style={{fontSize:10,color:"var(--text-4)"}}>{t.placeHint}</div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div style={{overflowX:"auto",paddingBottom:8}}>
        <div style={{display:"flex",alignItems:"stretch",gap:0,minWidth:"max-content"}}>
          {isMyTurn && state.phase==="play" && (
            <DropZone onDrop={()=>placeAnime(selectedCard, 0)}/>
          )}
          {state.timeline.map((a,i)=>(
            <div key={a.mal_id} style={{display:"flex",alignItems:"stretch"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:90}}>
                <img src={a.image_url} alt="" style={{width:68,height:96,objectFit:"cover",borderRadius:8,flexShrink:0}}
                  onError={e=>{e.target.style.display="none";}}/>
                <div style={{fontSize:10,color:"#c084fc",fontWeight:800,marginTop:4}}>{a.year||"?"}</div>
                <div style={{fontSize:8,color:"var(--text-4)",textAlign:"center",maxWidth:86,overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div>
              </div>
              {isMyTurn && state.phase==="play" && (
                <DropZone onDrop={()=>placeAnime(selectedCard, i+1)}/>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Game End */}
      {state.phase === "gameEnd" && (
        <div style={{textAlign:"center",padding:24,marginTop:16,background:"rgba(255,255,255,0.03)",
          borderRadius:16,border:"1px solid rgba(255,255,255,0.07)"}}>
          <div style={{fontSize:40,marginBottom:8}}>
            {state.opponentLeft?"🏃":state.isDraw?"🤝":state.winner===myUsername?"🏆":"😢"}
          </div>
          <div style={{fontSize:18,fontWeight:900,marginBottom:16,
            color:state.opponentLeft||state.winner===myUsername?GREEN:state.isDraw?ORANGE:RED}}>
            {state.opponentLeft?(tc?.opponentLeftVictory||"Adversaire déconnecté — Victoire !"):state.isDraw?(tc?.draw||"Égalité !"):(state.winner===myUsername?(tc?.victory||"Victoire !"):(tc?.defeat||"Défaite"))}
          </div>
          <div style={{fontSize:12,color:"var(--text-4)",marginBottom:20}}>
            {state.opponentLeft||state.isDraw?"":t.wonFirst?t.wonFirst(state.winner):(state.winner+" a placé tous ses animés en premier")}
          </div>
          <button onClick={async()=>{
              if(state.phase!=="gameEnd"){
                // game already finished — no need to patch
              }
              onClose();
            }}
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

// ─── CLUESCALE ────────────────────────────────────────────────────────────────
// 2-4 players. Each player is judge twice. Judge gets a theme + random 1-20 score,
// gives a clue. Jury guesses the score. Points: exact=+3, ±1=+1, else=+0. Judge: +2 if someone guesses exact, else 0.

const CLUESCALE_THEMES = [
  "Art manga 🎨", "Combat mythique ⚔️", "OST iconique 🎵", "Premier arc 📖",
  "Transformation de perso ✨", "Entrée d'un perso 🚪", "Studio d'animation 🏢",
  "Webtoon 📱", "Opening mémorable 🎤", "Antagoniste charismatique 😈",
  "Scène de fin d'arc 🌅", "Pouvoir unique 💫", "Duo de persos 👥",
  "Arme signature 🗡️", "Monde/univers 🌍", "Histoire d'amour 💕",
  "Révélation choc 😱", "Sacrifice héroïque 💀", "Humour décalé 😂",
  "Dessin de couverture 📚",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function CluescaleGame({ room, onClose }) {
  const { myUsername } = useApp();
  const players = room.players || [room.player1, room.player2, room.player3, room.player4].filter(Boolean);
  const isHost  = myUsername === players[0];

  const [state, setState] = useState(room.state || null);
  const [clue, setClue]   = useState("");
  const [guess, setGuess] = useState(10);
  const [hasGuessed, setHasGuessed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lastStateRef = useRef("");

  // Poll for state updates
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status&limit=1`);
        const r = rows?.[0];
        if(!r?.state) return;
        const str = JSON.stringify(r.state);
        if(str !== lastStateRef.current) {
          lastStateRef.current = str;
          setState(r.state);
          setHasGuessed(false);
          setClue("");
          setGuess(10);
        }
      } catch {}
    }, 1500);
    return () => clearInterval(poll);
  }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushState = async (newState) => {
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: newState, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  };

  function buildNextTurn(prev, players) {
    const totalTurns = players.length * 2;
    const judgeRound = (prev.judgeRound || 0);
    if(judgeRound >= totalTurns) {
      return { ...prev, phase: "gameEnd" };
    }
    const judgeIdx = judgeRound % players.length;
    return {
      ...prev,
      phase: "clue",
      judgeRound: judgeRound + 1,
      judge: players[judgeIdx],
      theme: pickRandom(CLUESCALE_THEMES),
      score: Math.floor(Math.random() * 20) + 1,
      clue: null,
      guesses: {},
    };
  }

  const submitClue = async () => {
    if(!clue.trim() || submitting) return;
    setSubmitting(true);
    const newState = { ...state, phase: "vote", clue: clue.trim() };
    await pushState(newState);
    setState(newState);
    setSubmitting(false);
  };

  const submitGuess = async () => {
    if(hasGuessed || submitting) return;
    setSubmitting(true);
    setHasGuessed(true);
    const newGuesses = { ...state.guesses, [myUsername]: Number(guess) };
    const allVoted = players.filter(p => p !== state.judge).every(p => newGuesses[p] !== undefined);

    let newState;
    if(allVoted) {
      // Calculate points
      const newScores = { ...state.scores };
      let judgeGetsPoints = false;
      players.filter(p => p !== state.judge).forEach(p => {
        const g = newGuesses[p];
        const diff = Math.abs(g - state.score);
        if(diff === 0) { newScores[p] = (newScores[p]||0) + 3; judgeGetsPoints = true; }
        else if(diff === 1) { newScores[p] = (newScores[p]||0) + 1; judgeGetsPoints = true; }
      });
      if(judgeGetsPoints) newScores[state.judge] = (newScores[state.judge]||0) + 2;

      // Check if game over
      const totalTurns = players.length * 2;
      if((state.judgeRound || 0) >= totalTurns) {
        newState = { ...state, guesses: newGuesses, scores: newScores, phase: "reveal", nextPhase: "gameEnd" };
      } else {
        newState = { ...state, guesses: newGuesses, scores: newScores, phase: "reveal", nextPhase: "next" };
      }
    } else {
      newState = { ...state, guesses: newGuesses };
    }
    await pushState(newState);
    setState(newState);
    setSubmitting(false);
  };

  const nextTurn = async () => {
    if(!isHost) return;
    if(state.nextPhase === "gameEnd") {
      await pushState({ ...state, phase: "gameEnd" });
      setState(s => ({...s, phase:"gameEnd"}));
    } else {
      const next = buildNextTurn(state, players);
      await pushState(next);
      setState(next);
    }
  };

  if(!state) return <div style={{padding:32,textAlign:"center"}}><div style={{fontSize:32}}>⏳</div><div style={{color:"var(--text-4)",fontSize:13,marginTop:8}}>Initialisation…</div></div>;

  const isJudge = state.judge === myUsername;
  const otherPlayers = players.filter(p => p !== state.judge);

  // ── GAME END ──
  if(state.phase === "gameEnd") {
    const sorted = Object.entries(state.scores||{}).sort((a,b)=>b[1]-a[1]);
    const winner = sorted[0]?.[0];
    return (
      <div style={{padding:32,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>🏆</div>
        <div style={{fontSize:20,fontWeight:900,color:"#22c55e",marginBottom:20}}>Fin de partie !</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:280,margin:"0 auto 24px"}}>
          {sorted.map(([p,s],i)=>(
            <div key={p} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"10px 16px",borderRadius:10,
              background: i===0?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.03)",
              border:`1px solid ${i===0?"rgba(34,197,94,0.3)":"rgba(255,255,255,0.06)"}`}}>
              <span style={{fontWeight:800,color:i===0?"#22c55e":"var(--text-1)"}}>
                {i===0?"🥇":i===1?"🥈":"🥉"} {p}
              </span>
              <span style={{fontWeight:900,color:i===0?"#22c55e":"var(--text-2)"}}>{s} pts</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{padding:"10px 28px",borderRadius:20,border:"none",
          background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,cursor:"pointer"}}>
          Retour
        </button>
      </div>
    );
  }

  // ── REVEAL ──
  if(state.phase === "reveal") {
    return (
      <div style={{padding:24,maxWidth:500,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:11,color:"var(--text-4)",marginBottom:4}}>Thème : {state.theme}</div>
          <div style={{fontSize:32,fontWeight:900,color:"#c084fc",marginBottom:4}}>La note était… {state.score}/20</div>
          <div style={{fontSize:13,color:"var(--text-2)"}}>Indice donné par {state.judge} : <strong>"{state.clue}"</strong></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {otherPlayers.map(p=>{
            const g = state.guesses?.[p];
            const diff = g !== undefined ? Math.abs(g - state.score) : null;
            const pts = diff === 0 ? "+3" : diff === 1 ? "+1" : "+0";
            const color = diff === 0 ? "#22c55e" : diff === 1 ? "#fbbf24" : "var(--text-4)";
            return (
              <div key={p} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"10px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",
                border:"1px solid rgba(255,255,255,0.07)"}}>
                <span style={{fontWeight:700,color:"var(--text-1)"}}>{p}</span>
                <span style={{fontSize:13}}>
                  <span style={{color:"var(--text-4)",marginRight:8}}>a dit {g ?? "—"}/20</span>
                  <span style={{fontWeight:900,color}}>{pts}</span>
                </span>
              </div>
            );
          })}
          {/* Judge points */}
          {Object.values(state.guesses||{}).some(g=>g===state.score) && (
            <div style={{padding:"8px 14px",borderRadius:10,background:"rgba(34,197,94,0.08)",
              border:"1px solid rgba(34,197,94,0.2)",fontSize:12,color:"#22c55e",textAlign:"center"}}>
              🎯 {state.judge} (juge) +2 pts — quelqu'un a trouvé exactement !
            </div>
          )}
        </div>
        {isHost && (
          <button onClick={nextTurn} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",
            background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,cursor:"pointer"}}>
            {state.nextPhase==="gameEnd"?"Voir les résultats 🏆":"Tour suivant →"}
          </button>
        )}
        {!isHost && <div style={{textAlign:"center",fontSize:11,color:"var(--text-4)"}}>En attente de {players[0]} pour continuer…</div>}
      </div>
    );
  }

  // ── VOTE phase ──
  if(state.phase === "vote") {
    const myGuess = state.guesses?.[myUsername];
    const votedCount = Object.keys(state.guesses||{}).length;
    return (
      <div style={{padding:24,maxWidth:500,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:11,color:"#c084fc",fontWeight:700,marginBottom:4}}>THÈME</div>
          <div style={{fontSize:18,fontWeight:900,color:"var(--text-1)",marginBottom:12}}>{state.theme}</div>
          <div style={{padding:"12px 20px",borderRadius:12,background:"rgba(124,58,237,0.08)",
            border:"1px solid rgba(124,58,237,0.2)",fontSize:15,color:"var(--text-1)",marginBottom:4}}>
            💬 "{state.clue}"
          </div>
          <div style={{fontSize:10,color:"var(--text-4)"}}>Indice de {state.judge}</div>
        </div>

        {isJudge ? (
          <div style={{textAlign:"center",padding:24,background:"rgba(255,255,255,0.03)",borderRadius:12}}>
            <div style={{fontSize:32,marginBottom:8}}>⏳</div>
            <div style={{fontSize:13,color:"var(--text-4)"}}>Le jury vote… {votedCount}/{otherPlayers.length}</div>
            <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12,flexWrap:"wrap"}}>
              {otherPlayers.map(p=>(
                <div key={p} style={{padding:"4px 10px",borderRadius:8,fontSize:10,fontWeight:700,
                  background:state.guesses?.[p]!==undefined?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.05)",
                  color:state.guesses?.[p]!==undefined?"#22c55e":"var(--text-4)"}}>
                  {p} {state.guesses?.[p]!==undefined?"✓":"⏳"}
                </div>
              ))}
            </div>
          </div>
        ) : myGuess !== undefined ? (
          <div style={{textAlign:"center",padding:24}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            <div style={{fontSize:13,color:"var(--text-4)"}}>Ta réponse : <strong style={{color:"#c084fc"}}>{myGuess}/20</strong></div>
            <div style={{fontSize:11,color:"var(--text-5)",marginTop:8}}>{votedCount}/{otherPlayers.length} ont voté</div>
          </div>
        ) : (
          <div>
            <div style={{fontSize:12,color:"var(--text-3)",textAlign:"center",marginBottom:12}}>
              Quelle note avait {state.judge} pour ce thème ?
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <span style={{fontSize:11,color:"var(--text-4)"}}>1</span>
              <input type="range" min={1} max={20} value={guess}
                onChange={e=>setGuess(Number(e.target.value))}
                style={{flex:1,accentColor:"#c084fc"}}/>
              <span style={{fontSize:11,color:"var(--text-4)"}}>20</span>
              <div style={{minWidth:36,textAlign:"center",fontSize:20,fontWeight:900,color:"#c084fc"}}>{guess}</div>
            </div>
            <button onClick={submitGuess} disabled={submitting}
              style={{width:"100%",padding:"12px",borderRadius:12,border:"none",
                background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",
                fontWeight:800,fontSize:13,cursor:"pointer",opacity:submitting?0.6:1}}>
              Voter {guess}/20
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── CLUE phase ──
  return (
    <div style={{padding:24,maxWidth:500,margin:"0 auto"}}>
      {/* Scores */}
      <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:16}}>
        {players.map(p=>(
          <div key={p} style={{padding:"4px 10px",borderRadius:8,fontSize:10,fontWeight:700,
            background:p===state.judge?"rgba(124,58,237,0.2)":"rgba(255,255,255,0.05)",
            color:p===state.judge?"#c084fc":"var(--text-2)"}}>
            {p}{p===state.judge?" 👨‍⚖️":""} · {state.scores?.[p]||0} pts
          </div>
        ))}
      </div>

      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:11,color:"var(--text-4)",marginBottom:4}}>
          Tour {state.judgeRound}/{players.length*2} · Juge : <strong style={{color:"#c084fc"}}>{state.judge}</strong>
        </div>
        <div style={{fontSize:18,fontWeight:900,color:"var(--text-1)",marginBottom:8}}>{state.theme}</div>
      </div>

      {isJudge ? (
        <div>
          <div style={{textAlign:"center",marginBottom:16,padding:"16px 20px",borderRadius:14,
            background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)"}}>
            <div style={{fontSize:11,color:"var(--text-4)",marginBottom:4}}>Ta note secrète</div>
            <div style={{fontSize:48,fontWeight:900,color:"#c084fc"}}>{state.score}<span style={{fontSize:20}}>/20</span></div>
          </div>
          <div style={{fontSize:12,color:"var(--text-3)",marginBottom:10,textAlign:"center"}}>
            Donne un indice qui correspond à cette note pour ce thème
          </div>
          <input value={clue} onChange={e=>setClue(e.target.value)}
            placeholder={`Ex: pour ${state.score}/20 sur "${state.theme}"…`}
            maxLength={80}
            style={{width:"100%",boxSizing:"border-box",padding:"12px 14px",borderRadius:12,
              background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
              color:"var(--text-1)",fontSize:13,outline:"none",marginBottom:10}}/>
          <button onClick={submitClue} disabled={!clue.trim()||submitting}
            style={{width:"100%",padding:"12px",borderRadius:12,border:"none",
              background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",
              fontWeight:800,fontSize:13,cursor:"pointer",opacity:!clue.trim()||submitting?0.5:1}}>
            Donner l'indice
          </button>
        </div>
      ) : (
        <div style={{textAlign:"center",padding:32,background:"rgba(255,255,255,0.03)",borderRadius:12}}>
          <div style={{fontSize:32,marginBottom:8}}>⏳</div>
          <div style={{fontSize:13,color:"var(--text-4)"}}>
            En attente de l'indice de {state.judge}…
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CLUESCALE MATCHMAKING ────────────────────────────────────────────────────
export function CluescaleMatchmaking({ onMatch, onClose }) {
  const { myUsername } = useApp();
  const [mode, setMode]       = useState(null); // null | create | join
  const [code, setCode]       = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [room, setRoom]       = useState(null);
  const [players, setPlayers] = useState([]);
  const roomRef = useRef(null);

  const createRoom = async () => {
    const c = generateCode();
    setCode(c);
    const created = await sb.query("game_rooms", {
      method:"POST",
      headers:{...sb.headers,"Prefer":"return=representation"},
      body:JSON.stringify({
        game_type:"cluescale",
        player1:myUsername,
        status:"waiting",
        ranked:false,
        private_code:c,
        state:{players:[myUsername]},
      }),
    }).catch(()=>null);
    if(created?.[0]) {
      roomRef.current = created[0].id;
      setRoom(created[0]);
      setPlayers([myUsername]);
      setMode("create");
    }
  };

  const joinRoom = async () => {
    const rooms = await sb.query(`game_rooms?private_code=eq.${joinCode}&status=eq.waiting&game_type=eq.cluescale&limit=1`).catch(()=>[]);
    const r = rooms?.[0];
    if(!r) { setJoinError("Code invalide."); return; }
    const currentPlayers = r.state?.players || [r.player1];
    if(currentPlayers.includes(myUsername)) { setJoinError("Tu es déjà dans cette room."); return; }
    if(currentPlayers.length >= 4) { setJoinError("Room complète (4 joueurs max)."); return; }
    const newPlayers = [...currentPlayers, myUsername];
    const playerField = `player${newPlayers.length}`;
    await sb.query(`game_rooms?id=eq.${r.id}`, {
      method:"PATCH",
      headers:{...sb.headers,"Prefer":"return=minimal"},
      body:JSON.stringify({[playerField]:myUsername, state:{...r.state, players:newPlayers}}),
    }).catch(()=>{});
    roomRef.current = r.id;
    setRoom({...r, state:{...r.state,players:newPlayers}});
    setPlayers(newPlayers);
    setMode("create"); // reuse lobby UI
    setCode(joinCode);
  };

  // Poll for players joining / host starting
  useEffect(() => {
    if(!roomRef.current) return;
    const poll = setInterval(async () => {
      const rows = await sb.query(`game_rooms?id=eq.${roomRef.current}&limit=1`).catch(()=>[]);
      const r = rows?.[0];
      if(!r) return;
      const pl = r.state?.players || [];
      setPlayers(pl);
      if(r.status === "active") {
        clearInterval(poll);
        onMatch({...r, players:pl});
      }
    }, 1500);
    return () => clearInterval(poll);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = async () => {
    if(players.length < 2) return;
    // Build initial game state here so it's written to DB atomically with status:active
    const initState = {
      phase: "clue",
      judgeRound: 1,
      judge: players[0],
      theme: CLUESCALE_THEMES[Math.floor(Math.random() * CLUESCALE_THEMES.length)],
      score: Math.floor(Math.random() * 20) + 1,
      clue: null,
      guesses: {},
      scores: Object.fromEntries(players.map(p=>[p,0])),
      history: [],
      players,
    };
    await sb.query(`game_rooms?id=eq.${roomRef.current}`, {
      method:"PATCH",
      headers:{...sb.headers,"Prefer":"return=minimal"},
      body:JSON.stringify({
        status:"active",
        player1:players[0], player2:players[1],
        player3:players[2]||null, player4:players[3]||null,
        state: initState,
      }),
    }).catch(()=>{});
  };

  if(!mode) return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:24,fontWeight:900,color:"var(--text-1)",marginBottom:8}}>🎭 Cluescale</div>
      <div style={{fontSize:12,color:"var(--text-4)",marginBottom:20}}>2 à 4 joueurs · Juge & Jury</div>
      <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:240,margin:"0 auto"}}>
        <button onClick={createRoom}
          style={{padding:"12px 20px",borderRadius:12,border:"none",
            background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>
          Créer une room
        </button>
        <button onClick={()=>setMode("join")}
          style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.04)",color:"var(--text-2)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          Rejoindre avec un code
        </button>
        <button onClick={onClose}
          style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>
          Annuler
        </button>
      </div>
    </div>
  );

  if(mode === "join") return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:20,fontWeight:900,color:"var(--text-1)",marginBottom:16}}>Rejoindre une room</div>
      <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())}
        placeholder="CODE" maxLength={6}
        style={{width:"100%",boxSizing:"border-box",padding:"12px 16px",borderRadius:12,
          background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",
          color:"var(--text-1)",fontSize:22,fontWeight:900,textAlign:"center",letterSpacing:6,
          outline:"none",marginBottom:8}}/>
      {joinError && <div style={{fontSize:11,color:"#ef4444",marginBottom:8}}>{joinError}</div>}
      <button onClick={joinRoom}
        style={{width:"100%",padding:"12px",borderRadius:12,border:"none",
          background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:8}}>
        Rejoindre
      </button>
      <button onClick={()=>setMode(null)}
        style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>
        Retour
      </button>
    </div>
  );

  // Lobby
  const isHost = myUsername === players[0];
  return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:18,fontWeight:900,color:"var(--text-1)",marginBottom:4}}>🎭 Salle d'attente</div>
      <div style={{fontSize:12,color:"var(--text-4)",marginBottom:16}}>Partage ce code :</div>
      <div style={{fontSize:36,fontWeight:900,color:"#c084fc",letterSpacing:8,marginBottom:20,
        padding:"12px 24px",background:"rgba(124,58,237,0.1)",borderRadius:12,display:"inline-block"}}>
        {code}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
        {players.map((p,i)=>(
          <div key={p} style={{padding:"8px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>{["👑","🎭","🎪","🎨"][i]}</span>
            <span style={{fontWeight:700,color:"var(--text-1)"}}>{p}</span>
            {i===0&&<span style={{fontSize:9,color:"#fbbf24",marginLeft:"auto"}}>Hôte</span>}
          </div>
        ))}
        {players.length < 4 && (
          <div style={{padding:"8px 14px",borderRadius:10,border:"1px dashed rgba(255,255,255,0.08)",
            fontSize:11,color:"var(--text-5)"}}>
            En attente… ({players.length}/4)
          </div>
        )}
      </div>
      {isHost ? (
        <button onClick={startGame} disabled={players.length < 2}
          style={{width:"100%",padding:"12px",borderRadius:12,border:"none",
            background:players.length<2?"rgba(255,255,255,0.06)":"linear-gradient(135deg,#7c3aed,#4f46e5)",
            color:players.length<2?"var(--text-4)":"#fff",fontWeight:800,fontSize:13,
            cursor:players.length<2?"not-allowed":"pointer"}}>
          {players.length<2?"Attends encore un joueur…":"Lancer la partie 🚀"}
        </button>
      ) : (
        <div style={{fontSize:11,color:"var(--text-4)"}}>En attente que {players[0]} lance la partie…</div>
      )}
    </div>
  );
}
