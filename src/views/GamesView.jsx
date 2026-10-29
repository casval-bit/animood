import React, { useState, useEffect, useRef } from "react";
import { sb, follows } from "../api/supabase.js";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { WordleGame, PosterGame, OpQuizGame } from "../components/MiniGames.jsx";
import { Matchmaking, ChainGame, TimelineGame, CluescaleMatchmaking, CluescaleGame, UndercoverLobby, UndercoverGame } from "../components/GameSystem.jsx";
import { TierlistStudio } from "../components/Tierlist.jsx";
import { GameModal } from "../components/Modal.jsx";
import { FORUM_I18N } from "../constants/forumI18n.js";
import { isDesktopApp } from "../utils/streamingLinks.js";
import { GamePanelDesktop } from "../components/GamesDesktop.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

// ── GamePanel — grid of game buttons + global leaderboard ────────────────────
function GamePanel({ myUsername, following, onWordle, onPoster, onOpQuiz, onChain, onTimeline, onCluescale, onUndercover, onTierlist, t }) {
  const [elo, setElo]                 = useState(null);
  const [hover, setHover]             = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank]           = useState(null);

  useEffect(() => {
    if(!myUsername) return;
    sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`)
      .then(r => { if(r?.[0]) setElo(r[0]); })
      .catch(()=>{});
  }, [myUsername]);

  useEffect(() => {
    sb.query("game_elo?select=username,elo_chain,elo_timeline,pts_wordle,pts_poster,pts_opquiz,pts_cluescale,pts_undercover&limit=200")
      .then(rows => {
        if(!rows?.length) return;
        const ranked = rows.map(r => ({
          username: r.username,
          total: (r.elo_chain||400)+(r.elo_timeline||400)+(r.pts_wordle||0)+(r.pts_poster||0)+(r.pts_opquiz||0)+(r.pts_cluescale||0)+(r.pts_undercover||0),
        })).sort((a,b)=>b.total-a.total);
        setLeaderboard(ranked.slice(0,20));
        const pos = ranked.findIndex(r => r.username === myUsername);
        setMyRank(pos>=0 ? {rank:pos+1, points_total:ranked[pos].total} : null);
      }).catch(()=>{});
  }, [myUsername]);

  const followingSet = new Set(following||[]);
  function usernameColor(u) {
    if(u===myUsername) return "#c084fc";
    if(followingSet.has(u)) return "#22c55e";
    return "var(--text-2)";
  }

  const GAMES = [
    {id:"wordle",    emoji:"🎯", label:t.wordleLabel,    color:"124,58,237", pts:elo?.pts_wordle||0,     onClick:onWordle,   type:"solo"},
    {id:"poster",    emoji:"🖼", label:t.posterLabel,    color:"236,72,153", pts:elo?.pts_poster||0,     onClick:onPoster,   type:"solo"},
    {id:"opquiz",    emoji:"🎵", label:t.opquizLabel,    color:"56,189,248", pts:elo?.pts_opquiz||0,     onClick:onOpQuiz,   type:"solo"},
    {id:"chain",     emoji:"⛓", label:t.chainLabel,     color:"251,191,36", pts:elo?.elo_chain||400,    onClick:onChain,    type:"vs"},
    {id:"timeline",  emoji:"📅", label:t.timelineLabel,  color:"34,197,94",  pts:elo?.elo_timeline||400, onClick:onTimeline, type:"vs"},
    {id:"cluescale", emoji:"🎭", label:t.cluescaleLabel, color:"251,113,133",pts:elo?.pts_cluescale||0,  onClick:onCluescale,type:"multi"},
    {id:"undercover",emoji:"🕵️", label:t.undercoverLabel,color:"244,114,182",pts:elo?.pts_undercover||0, onClick:onUndercover,type:"multi"},
    {id:"tierlist",  emoji:"📊", label:t.tierlistLabel,  color:"34,211,238", pts:null,                   onClick:onTierlist, type:"tool"},
  ];

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,width:"100%",minWidth:0}}>
        {GAMES.map(g => {
          const isHover = hover===g.id, rgb=g.color;
          return (
            <button key={g.id} onClick={g.onClick}
              onMouseEnter={()=>setHover(g.id)} onMouseLeave={()=>setHover(null)}
              style={{display:"flex",alignItems:"center",gap:7,padding:"7px 9px",borderRadius:10,cursor:"pointer",
                border:`1px solid rgba(${rgb},${isHover?0.45:0.22})`,
                background:isHover?`rgba(${rgb},0.15)`:`rgba(${rgb},0.07)`,
                transition:"all 0.15s",textAlign:"left"}}>
              <span style={{fontSize:16,flexShrink:0,lineHeight:1}}>{g.emoji}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,fontWeight:800,color:`rgb(${rgb})`,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.label}</div>
                <div style={{fontSize:8,color:"var(--text-5)",marginTop:1}}>{g.type==="vs"?"elo":g.type==="multi"?"multi":g.type==="tool"?t.gameTypeTool:"solo · pts"}</div>
              </div>
              {g.pts !== null && (
                <div style={{fontSize:11,fontWeight:900,color:`rgb(${rgb})`,background:`rgba(${rgb},0.12)`,borderRadius:6,padding:"2px 7px",flexShrink:0,minWidth:28,textAlign:"center"}}>
                  {elo?g.pts:"—"}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {elo && (
        <div style={{marginTop:7,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:9,
          background:"linear-gradient(90deg,rgba(124,58,237,0.08),rgba(56,189,248,0.05))",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontSize:9,color:"var(--text-5)",fontWeight:700}}>{t.unlocksFramesLabel}</div>
          <div style={{fontSize:13,fontWeight:900,color:"var(--text-1)"}}>{elo ? (elo.elo_chain||400)+(elo.elo_timeline||400)+(elo.pts_wordle||0)+(elo.pts_poster||0)+(elo.pts_opquiz||0)+(elo.pts_cluescale||0)+(elo.pts_undercover||0)+(elo.pts_undercover||0) : 0}</div>
        </div>
      )}

      {leaderboard.length>0 && (
        <div style={{marginTop:12}}>
          <div style={{fontSize:10,fontWeight:800,color:"var(--text-5)",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{t.leaderboardTitle}</div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {leaderboard.map((r,i) => {
              const isMe=r.username===myUsername, isFriend=followingSet.has(r.username);
              const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
              return (
                <div key={r.username} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,
                  background:isMe?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.02)",
                  border:isMe?"1px solid rgba(124,58,237,0.2)":"1px solid transparent"}}>
                  <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{medal||`${i+1}`}</div>
                  <div style={{flex:1,fontSize:10,fontWeight:isMe||isFriend?800:500,color:usernameColor(r.username),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {r.username}{isMe && <span style={{marginLeft:4,fontSize:9,color:"#c084fc"}}>({t.youLabel})</span>}
                  </div>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{r.total}</div>
                </div>
              );
            })}
            {myRank && myRank.rank>20 && (
              <>
                <div style={{padding:"3px 8px",textAlign:"center",fontSize:9,color:"var(--text-6)"}}>·  ·  ·</div>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)"}}>
                  <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{myRank.rank}</div>
                  <div style={{flex:1,fontSize:10,fontWeight:800,color:"#c084fc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{myUsername}</div>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{myRank.points_total}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TierlistPanel ─────────────────────────────────────────────────────────────
function TierlistPanel() {
  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
      <TierlistStudio/>
    </div>
  );
}

// ── EloLeaderboard — shown inside the LinkUp/Timeline matchmaking modal ───────
function EloLeaderboard({ gameType, myUsername, following }) {
  const { lang } = useLang();
  const t = FORUM_I18N[lang] || FORUM_I18N.fr;
  const [rows, setRows]     = useState([]);
  const [myRank, setMyRank] = useState(null);
  const field = gameType === "chain" ? "elo_chain" : "elo_timeline";
  const followingSet = new Set(following||[]);

  useEffect(() => {
    sb.query(`game_elo?select=username,${field}&order=${field}.desc&limit=200`)
      .then(data => {
        if(!data?.length) return;
        const sorted = [...data].sort((a,b)=>(b[field]||400)-(a[field]||400));
        setRows(sorted.slice(0,20).map((r,i)=>({username:r.username,pts:r[field]||400,rank:i+1})));
        const pos = sorted.findIndex(r=>r.username===myUsername);
        if(pos>=20) setMyRank({rank:pos+1,pts:sorted[pos][field]||400});
      }).catch(()=>{});
  }, [gameType, myUsername]); // eslint-disable-line react-hooks/exhaustive-deps

  if(!rows.length) return null;

  function uColor(u) {
    if(u===myUsername) return "#c084fc";
    if(followingSet.has(u)) return "#22c55e";
    return "var(--text-2)";
  }

  return (
    <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
      <div style={{fontSize:9,fontWeight:800,color:"var(--text-5)",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>
        {t.eloLeaderboardTitle(gameType==="chain" ? t.chainLabel : t.timelineLabel)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {rows.map(r=>{
          const isMe=r.username===myUsername;
          const medal=r.rank===1?"🥇":r.rank===2?"🥈":r.rank===3?"🥉":null;
          return (
            <div key={r.username} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,
              background:isMe?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.02)",
              border:isMe?"1px solid rgba(124,58,237,0.2)":"1px solid transparent"}}>
              <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{medal||r.rank}</div>
              <div style={{flex:1,fontSize:10,fontWeight:isMe||followingSet.has(r.username)?800:500,
                color:uColor(r.username),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {r.username}
              </div>
              <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{r.pts}</div>
            </div>
          );
        })}
        {myRank && (
          <>
            <div style={{padding:"3px 8px",textAlign:"center",fontSize:9,color:"var(--text-6)"}}>· · ·</div>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:7,
              background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)"}}>
              <div style={{fontSize:9,color:"var(--text-5)",width:16,textAlign:"right",flexShrink:0}}>{myRank.rank}</div>
              <div style={{flex:1,fontSize:10,fontWeight:800,color:"#c084fc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{myUsername}</div>
              <div style={{fontSize:10,fontWeight:800,color:"var(--text-2)",flexShrink:0}}>{myRank.pts}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── GamesView ─────────────────────────────────────────────────────────────────
export function GamesView({ pendingJoinGame, onClearPendingJoin }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = FORUM_I18N[lang] || FORUM_I18N.fr;
  const desktop = isDesktopApp();

  const [followingList, setFollowingList] = useState([]);
  useEffect(() => {
    if(!myUsername) return;
    follows.getFollowing(myUsername).then(setFollowingList).catch(()=>{});
  }, [myUsername]);

  const [showWordle, setShowWordle]       = useState(false);
  const [showPoster, setShowPoster]       = useState(false);
  const [showOpQuiz, setShowOpQuiz]       = useState(false);
  const [showCluescale, setShowCluescale] = useState(false);
  const [cluescaleRoom, setCluescaleRoom] = useState(null);
  const [showUndercover, setShowUndercover] = useState(false);
  const [undercoverPlayers, setUndercoverPlayers] = useState(null);
  const [showTierlist, setShowTierlist]   = useState(false);
  const [matchmaking, setMatchmaking]     = useState(null);
  const [activeRoom, setActiveRoom]       = useState(null);
  const [activeGame, setActiveGame]       = useState(null);
  const chainCloseRef    = useRef(null);
  const timelineCloseRef = useRef(null);

  // Auto-join from invite
  useEffect(() => {
    if(!pendingJoinGame) return;
    const { gameType, roomId, privateCode } = pendingJoinGame;
    onClearPendingJoin?.();
    if(gameType === "cluescale") {
      sb.query(`game_rooms?id=eq.${roomId}&limit=1`).then(async rows => {
        const r = rows?.[0];
        if(!r) return;
        const currentPlayers = r.state?.players || [r.player1, r.player2, r.player3, r.player4].filter(Boolean);
        if(currentPlayers.includes(myUsername) || currentPlayers.length >= 4) {
          setCluescaleRoom({...r, players: currentPlayers});
          return;
        }
        const newPlayers = [...currentPlayers, myUsername];
        const playerField = `player${newPlayers.length}`;
        await sb.query(`game_rooms?id=eq.${r.id}`, {
          method: "PATCH", headers: { ...sb.headers, "Prefer": "return=minimal" },
          body: JSON.stringify({ [playerField]: myUsername, state: {...r.state, players: newPlayers} }),
        }).catch(()=>{});
        setCluescaleRoom({...r, [playerField]: myUsername, state: {...r.state, players: newPlayers}, players: newPlayers});
      }).catch(()=>{});
    } else {
      sb.query(`game_rooms?private_code=eq.${encodeURIComponent(privateCode)}&status=eq.waiting&limit=1`).then(async rows => {
        const r = rows?.[0];
        if(!r) return;
        await sb.query(`game_rooms?id=eq.${r.id}`, {
          method: "PATCH", headers: { ...sb.headers, "Prefer": "return=minimal" },
          body: JSON.stringify({ player2: myUsername, elo2: 400, status: "active" }),
        }).catch(()=>{});
        setActiveRoom({...r, player2: myUsername, elo2: 400});
        setActiveGame(gameType);
      }).catch(()=>{});
    }
  }, [pendingJoinGame]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGameClose = async (gameRef) => {
    if(gameRef) {
      const confirmed = window.confirm("Êtes-vous sûr de vouloir quitter ? Cela comptera comme un abandon.");
      if(!confirmed) return;
      await gameRef();
    }
    setActiveRoom(null);
    setActiveGame(null);
  };

  return (
    <div style={desktop ? { maxWidth: 1100, margin: "0 auto", padding: "40px 32px 64px" } : { maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      {desktop ? (
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.8, margin: 0, marginBottom: 6, background: GRADIENT_PRIMARY, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", display: "inline-block" }}>
            {lang === "en" ? "Mini-games" : "Mini-jeux"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-4)", margin: 0 }}>{lang === "en" ? "Take on the AniMood community" : "Affronte la communauté AniMood"}</p>
        </div>
      ) : (
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.5, color: "#f0eaff", margin: 0, marginBottom: 6 }}>⚔ MINI-JEUX</h1>
        <p style={{ fontSize: 12, color: "rgba(100,116,139,0.6)", margin: 0 }}>Affronte la communauté AniMood</p>
      </div>
      )}

      {React.createElement(desktop ? GamePanelDesktop : GamePanel, {
        myUsername,
        following: followingList,
        onWordle: ()=>setShowWordle(true),
        onPoster: ()=>setShowPoster(true),
        onOpQuiz: ()=>setShowOpQuiz(true),
        onChain: ()=>setMatchmaking("chain"),
        onTimeline: ()=>setMatchmaking("timeline"),
        onCluescale: ()=>setShowCluescale(true),
        onUndercover: ()=>setShowUndercover(true),
        onTierlist: ()=>setShowTierlist(true),
        t,
      })}

      {showWordle && (
        <GameModal onClose={()=>setShowWordle(false)} title={`🎯 ${t.wordleLabel}`} maxWidth="680px">
          {() => <WordleGame onClose={()=>setShowWordle(false)}/>}
        </GameModal>
      )}
      {showPoster && (
        <GameModal onClose={()=>setShowPoster(false)} title={`🖼 ${t.posterLabel}`} maxWidth="560px">
          {() => <PosterGame onClose={()=>setShowPoster(false)}/>}
        </GameModal>
      )}
      {showOpQuiz && (
        <GameModal onClose={()=>setShowOpQuiz(false)} title={`🎵 ${t.opquizLabel}`} subtitle={t.opquizSubtitle} maxWidth="680px">
          {() => <OpQuizGame onClose={()=>setShowOpQuiz(false)}/>}
        </GameModal>
      )}
      {matchmaking && !activeRoom && (
        <GameModal onClose={()=>setMatchmaking(null)} title={matchmaking === "chain" ? `⛓ ${t.chainLabel}` : `📅 ${t.timelineLabel}`} maxWidth="400px">
          {() => (
            <div>
              <Matchmaking gameType={matchmaking} onClose={()=>setMatchmaking(null)}
                onMatch={room=>{setActiveRoom(room);setActiveGame(matchmaking);setMatchmaking(null);}}/>
              <div style={{padding:"0 16px 16px"}}>
                <EloLeaderboard gameType={matchmaking} myUsername={myUsername} following={followingList}/>
              </div>
            </div>
          )}
        </GameModal>
      )}
      {activeRoom && activeGame === "chain" && (
        <GameModal onClose={async()=>handleGameClose(chainCloseRef.current)} title={`⛓ ${t.chainLabel}`} maxWidth="896px">
          {() => <ChainGame room={activeRoom}
            onClose={async()=>{ await handleGameClose(chainCloseRef.current); }}
            onReady={(forfaitFn)=>{ chainCloseRef.current = forfaitFn; }}/>}
        </GameModal>
      )}
      {activeRoom && activeGame === "timeline" && (
        <GameModal onClose={async()=>handleGameClose(timelineCloseRef.current)} title={`📅 ${t.timelineLabel}`} maxWidth="1152px">
          {() => <TimelineGame room={activeRoom}
            onClose={async()=>{ await handleGameClose(timelineCloseRef.current); }}
            onReady={(forfaitFn)=>{ timelineCloseRef.current = forfaitFn; }}/>}
        </GameModal>
      )}
      {showCluescale && !cluescaleRoom && (
        <GameModal onClose={()=>setShowCluescale(false)} title={`🎭 ${t.cluescaleLabel}`} maxWidth="400px">
          {() => <CluescaleMatchmaking
            onClose={()=>setShowCluescale(false)}
            onMatch={room=>{setCluescaleRoom(room);setShowCluescale(false);}}/>}
        </GameModal>
      )}
      {cluescaleRoom && (
        <GameModal onClose={()=>setCluescaleRoom(null)} title={`🎭 ${t.cluescaleLabel}`} maxWidth="560px">
          {() => <CluescaleGame room={cluescaleRoom} onClose={()=>setCluescaleRoom(null)}/>}
        </GameModal>
      )}
      {showUndercover && (
        <GameModal onClose={()=>{ setShowUndercover(false); setUndercoverPlayers(null); }} title={`🕵️ ${t.undercoverLabel}`} maxWidth="440px">
          {(close) => undercoverPlayers
            ? <UndercoverGame key={undercoverPlayers.map(p => p.username + (p.isImpostor ? "*" : "")).join("|")}
                players={undercoverPlayers} onClose={close} onReplay={()=>setUndercoverPlayers(null)}/>
            : <UndercoverLobby onStart={setUndercoverPlayers}/>}
        </GameModal>
      )}
      {showTierlist && (
        <GameModal onClose={()=>setShowTierlist(false)} title={`📊 ${t.tierlistLabel}`} maxWidth="1100px" fullHeight>
          {() => <TierlistPanel/>}
        </GameModal>
      )}
    </div>
  );
}
