import React, { useState, useEffect, useRef } from "react";
import { sb, follows } from "../api/supabase.js";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { WordleGame, PosterGame, OpQuizGame } from "../components/MiniGames.jsx";
import { Matchmaking, ChainGame, TimelineGame, CluescaleMatchmaking, CluescaleGame, UndercoverLobby, UndercoverGame } from "../components/GameSystem.jsx";
import { joinFromInvite, joinErrorText } from "../utils/gameRooms.js";
import { canLeaveGame } from "../utils/gameClose.js";
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
          <div style={{fontSize:13,fontWeight:900,color:"var(--text-1)"}}>{elo ? (elo.elo_chain||400)+(elo.elo_timeline||400)+(elo.pts_wordle||0)+(elo.pts_poster||0)+(elo.pts_opquiz||0)+(elo.pts_cluescale||0)+(elo.pts_undercover||0) : 0}</div>
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

// ── EloLeaderboard — affiché sous les modes de jeu dans le salon LinkUp / Timeline ─────────────────────────────
// Dix premiers sur deux colonnes ; si je n'y suis pas, ma ligne est ajoutée en dessous.
const TOP_ELO = 10;
function EloRow({ rank, name, pts, me, friend }) {
  const medal = rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":null;
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",borderRadius:10,breakInside:"avoid",marginBottom:3,
      background:me?"rgba(139,92,246,0.14)":"rgba(var(--fg-rgb),0.035)",
      border:me?"1px solid rgba(139,92,246,0.4)":"1px solid transparent"}}>
      <div style={{fontSize:12,fontWeight:800,color:"var(--text-3)",width:22,textAlign:"center",flexShrink:0}}>{medal||rank}</div>
      <div style={{flex:1,minWidth:0,fontSize:13,fontWeight:me||friend?800:600,color:me?"#c084fc":friend?"#22c55e":"var(--text-1)",
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
      <div style={{fontSize:13,fontWeight:900,color:"var(--text-1)",flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{pts}</div>
    </div>
  );
}
function EloLeaderboard({ gameType, myUsername, following }) {
  const { lang } = useLang();
  const t = FORUM_I18N[lang] || FORUM_I18N.fr;
  const [rows, setRows]     = useState([]);
  const [myRank, setMyRank] = useState(null);
  const field = gameType === "chain" ? "elo_chain" : "elo_timeline";
  const followingSet = new Set(following||[]);

  useEffect(() => {
    let alive = true;
    sb.query(`game_elo?select=username,${field}&order=${field}.desc&limit=200`)
      .then(data => {
        if(!alive || !data?.length) return;
        const sorted = [...data].sort((a,b)=>(b[field]||400)-(a[field]||400));
        setRows(sorted.slice(0,TOP_ELO).map((r,i)=>({username:r.username,pts:r[field]||400,rank:i+1})));
        const pos = sorted.findIndex(r=>r.username===myUsername);
        setMyRank(pos>=TOP_ELO ? {rank:pos+1,pts:sorted[pos][field]||400} : null);
      }).catch(()=>{});
    return () => { alive = false; };
  }, [field, myUsername]);

  if(!rows.length) return null;

  return (
    <div className="gm-card" style={{padding:"14px 14px 11px"}}>
      <div className="gm-eyebrow" style={{marginBottom:10}}>
        {t.eloLeaderboardTitle(gameType==="chain" ? t.chainLabel : t.timelineLabel)}
      </div>
      <div style={{columns:"2 240px",columnGap:14}}>
        {rows.map(r => <EloRow key={r.username} rank={r.rank} name={r.username} pts={r.pts} me={r.username===myUsername} friend={followingSet.has(r.username)} />)}
      </div>
      {myRank && (
        <div style={{marginTop:6}}>
          <div style={{textAlign:"center",fontSize:11,color:"var(--text-4)",lineHeight:1,marginBottom:4}}>· · ·</div>
          <EloRow rank={myRank.rank} name={myUsername} pts={myRank.pts} me />
        </div>
      )}
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
  const [undercoverPlayers, setUndercoverPlayers] = useState(null);   // partie locale (un seul écran)
  const [undercoverRoom, setUndercoverRoom]       = useState(null);   // partie en ligne en cours
  const [undercoverInvite, setUndercoverInvite]   = useState(null);   // salon d'attente rejoint par invitation
  const [undercoverNames, setUndercoverNames]     = useState(null);   // pseudos de la dernière partie locale (pour « Rejouer »)
  const [showTierlist, setShowTierlist]   = useState(false);
  const [matchmaking, setMatchmaking]     = useState(null);
  const [activeRoom, setActiveRoom]       = useState(null);
  const [activeGame, setActiveGame]       = useState(null);
  // Fonction donnée par chaque jeu (onReady) : sert à savoir si la partie est finie et à ouvrir sa fenêtre « Abandonner ? »
  const chainCloseRef     = useRef(null);
  const timelineCloseRef  = useRef(null);
  const cluescaleCloseRef = useRef(null);
  const undercoverCloseRef = useRef(null);

  // Une partie vient de se terminer : on relit l'ELO et le classement (une 2e fois un peu plus tard, le temps que l'ELO s'enregistre)
  const [statsKey, setStatsKey] = useState(0);
  const statsTimer = useRef(null);
  useEffect(() => () => clearTimeout(statsTimer.current), []);
  const refreshStats = () => {
    setStatsKey(k => k + 1);
    clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(() => setStatsKey(k => k + 1), 2500);
  };

  // Rejoindre une partie après avoir accepté une invitation dans la cloche : prise de place atomique (gameRooms.js),
  // et un message clair si la partie n'existe plus, est déjà prise ou déjà commencée.
  const [joinNotice, setJoinNotice] = useState("");
  const [cluescaleInvite, setCluescaleInvite] = useState(null);
  useEffect(() => {
    if(!joinNotice) return;
    const id = setTimeout(() => setJoinNotice(""), 6000);
    return () => clearTimeout(id);
  }, [joinNotice]);

  const gameInProgress = () =>
    [chainCloseRef, timelineCloseRef, cluescaleCloseRef, undercoverCloseRef].some(r => r.current && !r.current.isOver?.());
  // Ferme tout (salons d'attente et parties terminées) avant d'ouvrir la partie d'une invitation
  const closeEverything = () => {
    chainCloseRef.current = timelineCloseRef.current = cluescaleCloseRef.current = undercoverCloseRef.current = null;
    setMatchmaking(null); setActiveRoom(null); setActiveGame(null);
    setShowCluescale(false); setCluescaleRoom(null); setCluescaleInvite(null);
    setShowUndercover(false); setUndercoverPlayers(null); setUndercoverRoom(null); setUndercoverInvite(null); setUndercoverNames(null);
  };
  useEffect(() => {
    if(!pendingJoinGame) return;
    const { gameType, roomId, privateCode } = pendingJoinGame;
    onClearPendingJoin?.();
    // Déjà en pleine partie : on ne prend pas de place dans une autre (l'adversaire attendrait pour rien)
    const attempt = gameInProgress()
      ? Promise.resolve({ ok: false, reason: "inGame" })
      : joinFromInvite({ gameType, roomId, privateCode, me: myUsername });
    attempt.then(res => {
      if(!res.ok) { setJoinNotice(joinErrorText(res.reason, lang)); return; }
      closeEverything();
      if(gameType === "cluescale") {
        if(res.room.status === "active") setCluescaleRoom(res.room);
        else { setCluescaleInvite(res.room); setShowCluescale(true); }
      } else if(gameType === "undercover") {
        setShowUndercover(true);
        if(res.room.status === "active") setUndercoverRoom(res.room);
        else setUndercoverInvite(res.room);
      } else {
        setActiveRoom(res.room);
        setActiveGame(gameType);
      }
    }).catch(() => setJoinNotice(joinErrorText("invalid", lang)));
  }, [pendingJoinGame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fermetures « pour de bon » : appelées par la fenêtre une fois la fermeture acceptée (partie finie, ou abandon confirmé dans le jeu).
  const closeDuel = () => {
    chainCloseRef.current = null;
    timelineCloseRef.current = null;
    setActiveRoom(null);
    setActiveGame(null);
    refreshStats();
  };
  const closeCluescaleLobby = () => { setShowCluescale(false); setCluescaleInvite(null); };
  const closeCluescaleGame  = () => { cluescaleCloseRef.current = null; setCluescaleRoom(null); refreshStats(); };
  const closeUndercover = () => {
    undercoverCloseRef.current = null;
    setShowUndercover(false); setUndercoverPlayers(null); setUndercoverRoom(null); setUndercoverInvite(null); setUndercoverNames(null);
    refreshStats();
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
        refreshKey: statsKey,
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
      {/* Salon LinkUp / Timeline : 3 modes (classé, entre amis, IA) + classement. Fenêtre large pour que les cartes respirent. */}
      {matchmaking && !activeRoom && (
        <GameModal onClose={()=>setMatchmaking(null)} title={matchmaking === "chain" ? `⛓ ${t.chainLabel}` : `📅 ${t.timelineLabel}`} maxWidth="780px">
          {() => (
            <Matchmaking gameType={matchmaking}
              onMatch={room=>{setActiveRoom(room);setActiveGame(matchmaking);setMatchmaking(null);}}
              footer={<EloLeaderboard gameType={matchmaking} myUsername={myUsername} following={followingList}/>}/>
          )}
        </GameModal>
      )}
      {/* Partie en cours : la croix / le fond / « retour » ouvrent la fenêtre « Abandonner ? » du jeu (canClose refuse la fermeture) ;
          une fois la partie finie (ou l'abandon confirmé dans le jeu), le bouton du jeu ferme pour de bon (closeNow). */}
      {activeRoom && activeGame === "chain" && (
        <GameModal onClose={closeDuel} canClose={()=>canLeaveGame(chainCloseRef.current)} title={`⛓ ${t.chainLabel}`} maxWidth="900px">
          {(_close, closeNow) => <ChainGame room={activeRoom} onClose={closeNow}
            onReady={(fn)=>{ chainCloseRef.current = fn; }}/>}
        </GameModal>
      )}
      {activeRoom && activeGame === "timeline" && (
        <GameModal onClose={closeDuel} canClose={()=>canLeaveGame(timelineCloseRef.current)} title={`📅 ${t.timelineLabel}`} maxWidth="1120px">
          {(_close, closeNow) => <TimelineGame room={activeRoom} onClose={closeNow}
            onReady={(fn)=>{ timelineCloseRef.current = fn; }}/>}
        </GameModal>
      )}
      {joinNotice && (
        <div onClick={()=>setJoinNotice("")} role="alert"
          style={{position:"fixed",top:76,left:"50%",transform:"translateX(-50%)",zIndex:3000,maxWidth:"90vw",
            padding:"10px 18px",borderRadius:12,background:"rgba(15,12,30,0.96)",border:"1px solid rgba(251,191,36,0.4)",
            color:"#fbbf24",fontSize:13,fontWeight:700,boxShadow:"0 8px 30px rgba(0,0,0,0.5)",cursor:"pointer"}}>
          {joinNotice}
        </div>
      )}
      {showCluescale && !cluescaleRoom && (
        <GameModal onClose={closeCluescaleLobby} title={`🎭 ${t.cluescaleLabel}`} maxWidth="680px">
          {(close) => <CluescaleMatchmaking initialRoom={cluescaleInvite} onClose={close}
            onMatch={room=>{setCluescaleRoom(room);setShowCluescale(false);setCluescaleInvite(null);}}/>}
        </GameModal>
      )}
      {cluescaleRoom && (
        <GameModal onClose={closeCluescaleGame} canClose={()=>canLeaveGame(cluescaleCloseRef.current)} title={`🎭 ${t.cluescaleLabel}`} maxWidth="680px">
          {(_close, closeNow) => <CluescaleGame room={cluescaleRoom} onClose={closeNow}
            onReady={(fn)=>{ cluescaleCloseRef.current = fn; }}/>}
        </GameModal>
      )}
      {/* Imposteur : une seule fenêtre pour le salon, la partie locale (un seul écran) et la partie en ligne (desktop) */}
      {showUndercover && (
        <GameModal onClose={closeUndercover} canClose={(undercoverPlayers || undercoverRoom) ? ()=>canLeaveGame(undercoverCloseRef.current) : undefined}
          title={`🕵️ ${t.undercoverLabel}`} maxWidth="700px">
          {(close, closeNow) => undercoverRoom
            ? <UndercoverGame key={undercoverRoom.id} room={undercoverRoom} players={undercoverRoom.players} onClose={closeNow}
                onReady={(fn)=>{ undercoverCloseRef.current = fn; }}/>
            : undercoverPlayers
              ? <UndercoverGame key={undercoverPlayers.map(p => p.username + (p.isImpostor ? "*" : "")).join("|")}
                  players={undercoverPlayers} onClose={closeNow}
                  onReplay={()=>{ undercoverCloseRef.current = null; setUndercoverNames(undercoverPlayers.map(p => p.username)); setUndercoverPlayers(null); }}
                  onReady={(fn)=>{ undercoverCloseRef.current = fn; }}/>
              : <UndercoverLobby onStart={setUndercoverPlayers} initialRoom={undercoverInvite} localPlayers={undercoverNames} onClose={close}
                  onStartOnline={room=>{ setUndercoverInvite(null); setUndercoverRoom(room); }}/>}
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
