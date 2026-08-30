// ─── GAME SYSTEM — Matchmaking + Chain + Timeline ─────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../context/useApp.js";
import { sb, supabase } from "../api/supabase.js";
import { Spinner } from "./Spinner.jsx";

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

function calcChainElo(eloA, eloB, resultA, score) {
  // resultA: 1=win, 0=loss, 0.5=draw
  // score: "2-0" or "2-1"
  const bracketA = Math.floor(eloA / 100);
  const bracketB = Math.floor(eloB / 100);
  const sameBracket = bracketA === bracketB;

  if(resultA === 1) {
    if(sameBracket) return score === "2-0" ? 23 : 20;
    return eloA > eloB ? 10 : 30;
  } else if(resultA === 0) {
    if(sameBracket) return score === "2-0" ? -22 : -18;
    return eloA > eloB ? -30 : -10;
  }
  return 0;
}

function calcTimelineElo(eloA, eloB, resultA) {
  const bracketA = Math.floor(eloA / 100);
  const bracketB = Math.floor(eloB / 100);
  const sameBracket = bracketA === bracketB;
  if(resultA === 1) return sameBracket ? 20 : (eloA > eloB ? 15 : 25);
  if(resultA === 0) return sameBracket ? -20 : (eloA > eloB ? -25 : -15);
  return 0; // draw
}

async function updateElo(username, field, delta, pointsDelta=0) {
  const row = await getOrCreateElo(username);
  const current = row[field] || 400;
  const newElo = Math.max(0, current + delta);
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
        const rooms = await sb.query(`game_rooms?game_type=eq.${gameType}&status=eq.waiting&player1=neq.${encodeURIComponent(myUsername)}&private_code=is.null&limit=10`).catch(()=>[]);
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
    if(!room){setJoinError("Code invalide ou room introuvable.");return;}
    if(room.player1===myUsername){setJoinError("Tu ne peux pas rejoindre ta propre room.");return;}

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

    // Trigger onMatch for the joiner directly (they won't receive their own UPDATE)
    if(patched?.[0]){
      setStatus("found");
      setTimeout(()=>onMatch({...room,player2:myUsername,elo2:400,status:"active"}),500);
    }
  };

  // ── RENDER ───────────────────────────────────────────────────────────────────
  if(!mode) return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:24,fontWeight:900,color:"var(--text-1)",marginBottom:20}}>
        ⚔️ {gameType==="chain"?"Chaîne Animé":"Timeline"}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:240,margin:"0 auto"}}>
        <button onClick={()=>setMode("ranked")} style={{padding:"12px 20px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>
          🏆 Multijoueur MMR
        </button>
        <button onClick={createPrivateRoom} style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"var(--text-2)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          🔒 Créer une room privée
        </button>
        <button onClick={()=>setMode("private-join")} style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"var(--text-2)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          🔑 Rejoindre avec un code
        </button>
        <button onClick={onClose} style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>Annuler</button>
      </div>
    </div>
  );

  if(mode==="private-create") return (
    <div style={{padding:32,textAlign:"center"}}>
      {status==="found" ? (
        <><div style={{fontSize:48,marginBottom:12}}>⚔️</div><div style={{fontSize:18,fontWeight:900,color:GREEN}}>Adversaire trouvé !</div><div style={{fontSize:12,color:"var(--text-4)",marginTop:8}}>Démarrage…</div></>
      ) : (
        <>
          <div style={{fontSize:24,marginBottom:12}}>🔒 Room privée</div>
          <div style={{fontSize:12,color:"var(--text-4)",marginBottom:8}}>Partage ce code à ton ami :</div>
          <div style={{fontSize:36,fontWeight:900,color:"#c084fc",letterSpacing:8,marginBottom:16,padding:"12px 24px",background:"rgba(124,58,237,0.1)",borderRadius:12,display:"inline-block"}}>{privateCode}</div>
          <div style={{fontSize:11,color:"var(--text-4)",marginBottom:20}}>En attente de connexion…</div>
          <button onClick={cancelAndClose} style={{padding:"8px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"var(--text-3)",cursor:"pointer",fontSize:12}}>Annuler</button>
        </>
      )}
    </div>
  );

  if(mode==="private-join") return (
    <div style={{padding:32,textAlign:"center"}}>
      {status==="found" ? (
        <><div style={{fontSize:48,marginBottom:12}}>⚔️</div><div style={{fontSize:18,fontWeight:900,color:GREEN}}>Connecté !</div><div style={{fontSize:12,color:"var(--text-4)",marginTop:8}}>Démarrage…</div></>
      ) : (
        <>
          <div style={{fontSize:24,marginBottom:16}}>🔑 Rejoindre une room</div>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="Code (ex: AB3XY)" maxLength={6}
            style={{width:"100%",boxSizing:"border-box",padding:"12px 16px",borderRadius:12,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"var(--text-1)",fontSize:18,fontWeight:900,textAlign:"center",letterSpacing:4,outline:"none",marginBottom:8}}/>
          {joinError&&<div style={{fontSize:11,color:RED,marginBottom:8}}>{joinError}</div>}
          <button onClick={joinPrivateRoom} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:8}}>Rejoindre</button>
          <button onClick={onClose} style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>Annuler</button>
        </>
      )}
    </div>
  );

  return (
    <div style={{padding:32,textAlign:"center"}}>
      {status==="searching" ? (
        <>
          <div style={{fontSize:32,marginBottom:12}}>🔍</div>
          <div style={{fontSize:16,fontWeight:800,color:"var(--text-1)",marginBottom:4}}>Recherche d'adversaire…</div>
          <div style={{fontSize:12,color:"var(--text-4)",marginBottom:16}}>{waitTime>0?`Attente : ${waitTime}s · Plage Elo : ±${Math.min(50+waitTime*5,400)}`:"Connexion…"}</div>
          <div style={{fontSize:11,color:"#c084fc",marginBottom:20}}>Ton Elo : {myElo}</div>
          <button onClick={cancelAndClose} style={{padding:"8px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"var(--text-3)",cursor:"pointer",fontSize:12}}>Annuler</button>
        </>
      ) : (
        <><div style={{fontSize:48,marginBottom:12}}>⚔️</div><div style={{fontSize:18,fontWeight:900,color:GREEN}}>Adversaire trouvé !</div><div style={{fontSize:12,color:"var(--text-4)",marginTop:8}}>Démarrage…</div></>
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
        const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status&limit=1`);
        const r = rows?.[0];
        if(!r) return;
        // Check if opponent left
        if(r.status === "waiting") {
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
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: newState, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  };

  const handleForfait = async () => {
    if(state.phase !== "gameEnd" && room.ranked) {
      const victim = myUsername === room.player1 ? room.player2 : room.player1;
      await Promise.all([
        updateElo(myUsername, "elo_chain", -40, 0),   // cheater/quitter -40
        updateElo(victim, "elo_chain", 5, 5),          // victim +5 elo +5 pts
      ]);
    }
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ status: "waiting", updated_at: new Date().toISOString() }),
    }).catch(()=>{});
    onClose();
  };

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
      setMsg("❌ Cet animé a déjà été utilisé !");
      setLastGuess(null);
      return;
    }
    const valid = isValidLink(anime);
    setLastGuess({ anime, valid, linkUsed: currentLinkType });
    setQuery(""); setSugs([]);
    if(!valid) {
      setMsg("❌ Lien invalide — réessaie !");
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
    const maxScore = Math.max(scores[0], scores[1]);
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

  const linkLabel = currentLinkType === "studio" ? "🏢 Même studio, genre différent" : currentLinkType === "genre" ? "🎌 Même genre, studio différent" : "";

  return (
    <div style={{padding:16,maxWidth:640,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:"var(--text-2)"}}>
          ⚔️ {myUsername} <span style={{color:"var(--text-4)"}}>vs</span> {oppUsername}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--text-4)"}}>Manche {state.round}/3</span>
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
              <div style={{fontSize:15,fontWeight:800,color:"var(--text-1)",marginBottom:8}}>Choisis le type de lien</div>
              <div style={{fontSize:11,color:"var(--text-4)",marginBottom:20}}>Tu commences la manche</div>
              {pool.length === 0 ? (
                <div style={{color:"var(--text-4)",fontSize:12}}>⏳ Chargement des animés…</div>
              ) : (
              <div style={{display:"flex",gap:12,justifyContent:"center"}}>
                {[{id:"studio",label:"🏢 Même studio",sub:"genres différents"},{id:"genre",label:"🎌 Même genre",sub:"studio différent"}].map(opt=>(
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
                ⏳ {oppUsername} choisit le type de lien…
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
                {isMyTurn?"⏱ Ton tour":"⏳ Tour de "+oppUsername}
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
                <div style={{fontSize:10,color:"var(--text-4)",marginBottom:2}}>Animé actuel</div>
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
                placeholder="Tape un animé TV et appuie sur Entrée…"
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
                  {state.opponentLeft?"Adversaire déconnecté — Victoire !":won?"Victoire !":draw?"Égalité":"Défaite"}
                </div>
                <div style={{fontSize:14,color:"var(--text-3)",marginBottom:20}}>
                  {myScore} – {oppScore}
                </div>
                <button onClick={handleForfait}
                  style={{padding:"10px 24px",borderRadius:20,border:"none",
                    background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",
                    fontWeight:800,fontSize:13,cursor:"pointer"}}>
                  Retour
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
        const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status&limit=1`);
        const r = rows?.[0];
        if(!r) return;
        if(r.status === "waiting") {
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
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: newState, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  };

  const placeAnime = async (handIdx, timelinePos) => {
    if(!isMyTurn || state.phase !== "play") return;
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
      setMsg("❌ Mauvaise position !");
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


  const handleForfaitTL = async () => {
    if(state.phase !== "gameEnd" && room.ranked) {
      const victim = myUsername === room.player1 ? room.player2 : room.player1;
      await Promise.all([
        updateElo(myUsername, "elo_timeline", -40, 0),
        updateElo(victim, "elo_timeline", 5, 5),
      ]);
    }
    await sb.query(`game_rooms?id=eq.${room.id}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ status: "waiting", updated_at: new Date().toISOString() }),
    }).catch(()=>{});
    onClose();
  };

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
            Placés : toi {isP1?state.placed1:state.placed2}/5 · {oppUsername} {isP1?state.placed2:state.placed1}/5
          </div>
          <button onClick={handleForfaitTL}
            style={{fontSize:9,padding:"3px 8px",borderRadius:8,border:"1px solid rgba(239,68,68,0.3)",
              background:"rgba(239,68,68,0.08)",color:"#ef4444",cursor:"pointer"}}>
            Abandonner
          </button>
        </div>
      </div>

      {/* Turn indicator */}
      {state.phase === "play" && (
        <div style={{textAlign:"center",marginBottom:12,padding:"6px 14px",borderRadius:20,display:"inline-block",
          background:isMyTurn?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.04)",
          border:`1px solid ${isMyTurn?"rgba(34,197,94,0.3)":"rgba(255,255,255,0.08)"}`,
          color:isMyTurn?GREEN:"var(--text-4)",fontSize:11,fontWeight:700}}>
          {state.skipped ? `⏩ ${state.skipped} a raté — ` : ""}
          {isMyTurn ? "🎯 Ton tour — clique sur une carte puis sur une position" : `⏳ Tour de ${oppUsername}`}
        </div>
      )}

      {msg && <div style={{textAlign:"center",fontSize:12,color:RED,marginBottom:8,fontWeight:700}}>{msg}</div>}

      {/* My hand — selectable */}
      {myHandLeft.length > 0 && state.phase==="play" && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"var(--text-4)",marginBottom:8}}>
            {isMyTurn ? "Sélectionne une carte à placer :" : "Tes animés restants :"}
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
                    <div style={{fontSize:8,color:"#c084fc",fontWeight:800}}>▼ Sélectionné</div>
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
          <img src={currentAnimeToPlace.image_url} alt="" style={{width:28,height:40,objectFit:"cover",borderRadius:5}}
            onError={e=>{e.target.style.display="none";}}/>
          <div>
            <div style={{fontSize:11,fontWeight:800,color:"var(--text-1)"}}>{currentAnimeToPlace.title}</div>
            <div style={{fontSize:9,color:"var(--text-4)"}}>Clique sur une position ↓ pour placer</div>
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
            color:state.opponentLeft||state.winner===myUsername?"#22c55e":state.isDraw?ORANGE:"#ef4444"}}>
            {state.opponentLeft?"Adversaire déconnecté — Victoire !":state.isDraw?"Égalité !":state.winner===myUsername?"Victoire !":"Défaite"}
          </div>
          <div style={{fontSize:12,color:"var(--text-4)",marginBottom:20}}>
            {state.opponentLeft?"":state.winner+" a placé tous ses animés en premier"}
          </div>
          <button onClick={async()=>{
              if(state.phase!=="gameEnd"){
                await sb.query(`game_rooms?id=eq.${room.id}`,{method:"PATCH",headers:{...sb.headers,"Prefer":"return=minimal"},body:JSON.stringify({status:"waiting",updated_at:new Date().toISOString()})}).catch(()=>{});
              }
              onClose();
            }}
            style={{padding:"10px 24px",borderRadius:20,border:"none",
              background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",
              fontWeight:800,fontSize:13,cursor:"pointer"}}>
            Retour
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
