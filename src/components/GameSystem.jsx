// ─── GAME SYSTEM — Matchmaking + Chain + Timeline + Cluescale + Undercover ───────
import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../context/useApp.js";
import { sb, supabase, gameInvites } from "../api/supabase.js";
import { Spinner } from "./Spinner.jsx";
import { useLang } from "../context/useLang.js";
import { GAME_SYSTEM_I18N } from "../constants/gameSystemI18n.js";
import {
  FORFEIT_PENALTY, FORFEIT_BONUS, isRankedRoom, chainGameOutcome, timelineGameOutcome,
  chainAfterRoundLoss, chainAiPick, chainLinkForTurn, isChainLinkValid, dealTimeline, timelineMove, timelineAiMove,
  cluescaleScoreRound, cluescaleWinnerPoints,
} from "../utils/gameRules.js";
import { UNDERCOVER_WORDS } from "../constants/undercoverWords.js";
import { isGuessCorrect, isClueForbidden, pickEntry, undercoverPoints, tallyVotes } from "../utils/undercoverRules.js";
import {
  RANKED_FRESH_MS, HEARTBEAT_PRIVATE_MS, agoIso, claimSeat, heartbeatRoom,
  deleteWaitingRoom, deleteMyWaitingRooms, getOrCreateElo, updateElo, claimFinish, newRoomCode, cleanRoomCode,
  joinPrivateRoom, joinCluescaleRoom, joinErrorText, roomPlayers,
} from "../utils/gameRooms.js";

const GREEN  = "#22c55e";
const ORANGE = "#f97316";
const RED    = "#ef4444";
const sleep  = ms => new Promise(r => setTimeout(r, ms));
const aiRoomId = () => "ai-" + Date.now();   // identifiant d'une partie contre l'IA (jamais envoyée à la base)

// Les règles (ELO, manches, cartes, IA) sont dans src/utils/gameRules.js ; l'accès aux salles dans src/utils/gameRooms.js.


// ─── FRIEND INVITE LIST — invite a follower/following into a private room ─────
function FriendInviteList({ myUsername, gameType, roomId, privateCode }) {
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).friendInvite;
  const [friends, setFriends] = useState([]);
  const [sent, setSent]       = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if(!myUsername) return;
    // Load both followers and following, merge as "friends" — mutuals first.
    Promise.all([
      sb.query(`follows?follower=eq.${encodeURIComponent(myUsername)}&select=following`).catch(()=>[]),
      sb.query(`follows?following=eq.${encodeURIComponent(myUsername)}&select=follower`).catch(()=>[]),
    ]).then(([following, followers]) => {
      const followingSet = new Set((following||[]).map(r=>r.following));
      const followerSet  = new Set((followers||[]).map(r=>r.follower));
      const all = [...new Set([...followingSet, ...followerSet])].filter(u=>u!==myUsername);
      const sorted = all.sort((a,b) => {
        const aM = followingSet.has(a) && followerSet.has(a);
        const bM = followingSet.has(b) && followerSet.has(b);
        return bM - aM;
      });
      setFriends(sorted);
      setLoading(false);
    });
  }, [myUsername]);

  const invite = async (toUser) => {
    setSent(s => new Set([...s, toUser]));
    await gameInvites.send(myUsername, toUser, gameType, roomId, privateCode).catch(()=>{});
  };

  if(loading) return <div style={{textAlign:"center",fontSize:11,color:"var(--text-5)",padding:8}}>{t.loading}</div>;
  if(!friends.length) return <div style={{textAlign:"center",fontSize:11,color:"var(--text-5)",padding:8}}>{t.noFriends}</div>;

  return (
    <div>
      <div style={{fontSize:10,fontWeight:800,color:"var(--text-5)",letterSpacing:1,
        textTransform:"uppercase",marginBottom:8}}>
        {t.title}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:200,overflowY:"auto"}}>
        {friends.map(u => {
          const isSent = sent.has(u);
          return (
            <div key={u} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"7px 10px",borderRadius:10,
              background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
              <span style={{fontSize:11,fontWeight:700,color:"var(--text-1)"}}>@{u}</span>
              <button onClick={()=>!isSent&&invite(u)}
                disabled={isSent}
                style={{padding:"4px 12px",borderRadius:8,border:"none",cursor:isSent?"default":"pointer",
                  fontSize:10,fontWeight:800,transition:"all 0.15s",
                  background: isSent ? "rgba(34,197,94,0.15)" : "rgba(124,58,237,0.2)",
                  color: isSent ? "#22c55e" : "#c084fc",
                  opacity: isSent ? 0.8 : 1}}>
                {isSent ? t.sent : t.invite}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── MATCHMAKING ──────────────────────────────────────────────────────────────
// Garanties (voir src/utils/gameRooms.js) : une place ne se prend qu'une fois (prise atomique côté base), une salle qui
// attend est « réveillée » en continu (une salle sans réveil depuis 25 s est ignorée), et ce client ne supprime que SA
// salle en attente — jamais celle d'un autre.
const BTN_PRIMARY = { padding:"12px 20px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer" };

// Textes ajoutés pour la fiabilité des parties (FR / EN)
const GS_EXTRA = {
  fr: {
    aiPickLevel: "Choisis la difficulté", aiEasy: "🟢 Facile", aiMedium: "🟡 Moyen", aiHard: "🔴 Difficile", aiName: "IA",
    aiEasyDesc: "L'IA rate 30% du temps", aiMediumDesc: "L'IA rate 15% du temps", aiHardDesc: "L'IA rate 5% du temps",
    launching: "Lancement… ⚔️", netError: "Connexion impossible — réessaie dans un instant.", retry: "Réessayer",
    roomGone: "La salle n'existe plus.",
    youForfeited: "Partie abandonnée — défaite", opponentGone: "Adversaire parti — Victoire !",
    confirmForfeit: "Abandonner la partie ? Ça comptera comme une défaite.",
    idleWarnMe: (s) => `⏳ Joue vite : abandon automatique dans ${s} s`,
    idleWarnOpp: (s) => `L'adversaire semble parti — victoire automatique dans ${s} s`,
    dealing: "Distribution des cartes…", dealFail: "La partie n'a pas pu démarrer (cartes introuvables). Aucun ELO n'est modifié.",
    dealWait: "En attente de la distribution…", leave: "Quitter",
    cluIdle: "Un joueur semble absent (aucune action depuis 1 min 30).", cluReveal: "Révéler avec les votes reçus", cluEnd: "Terminer la partie",
    cluNext: "Tour suivant →", cluRoomGone: "La salle n'existe plus (l'hôte est parti).", cluLeave: "Quitter la salle",
    ucForbidden: "Tu ne peux pas écrire le mot secret : trouve un autre indice.",
  },
  en: {
    aiPickLevel: "Pick a difficulty", aiEasy: "🟢 Easy", aiMedium: "🟡 Medium", aiHard: "🔴 Hard", aiName: "AI",
    aiEasyDesc: "The AI misses 30% of the time", aiMediumDesc: "The AI misses 15% of the time", aiHardDesc: "The AI misses 5% of the time",
    launching: "Launching… ⚔️", netError: "Connection failed — try again in a moment.", retry: "Retry",
    roomGone: "The room no longer exists.",
    youForfeited: "Game forfeited — defeat", opponentGone: "Opponent left — Victory!",
    confirmForfeit: "Forfeit the game? It will count as a loss.",
    idleWarnMe: (s) => `⏳ Play fast: automatic forfeit in ${s}s`,
    idleWarnOpp: (s) => `Your opponent seems gone — automatic win in ${s}s`,
    dealing: "Dealing the cards…", dealFail: "The game couldn't start (no cards found). No ELO was changed.",
    dealWait: "Waiting for the deal…", leave: "Leave",
    cluIdle: "A player seems to be away (no action for 1 min 30).", cluReveal: "Reveal with the votes received", cluEnd: "End the game",
    cluNext: "Next turn →", cluRoomGone: "The room no longer exists (the host left).", cluLeave: "Leave the room",
    ucForbidden: "You can't write the secret word: find another clue.",
  },
};

export function Matchmaking({ gameType, onMatch, onClose }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).matchmaking;
  const tc = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).common;
  const x = GS_EXTRA[lang] || GS_EXTRA.fr;
  const eloField = gameType === "chain" ? "elo_chain" : "elo_timeline";
  const [mode, setMode]           = useState(null); // null | ranked | vs-ai | private-create | private-join
  const [status, setStatus]       = useState("searching"); // searching | found | error
  const [waitTime, setWaitTime]   = useState(0);
  const [myElo, setMyElo]         = useState(400);
  const [privateCode, setPrivateCode] = useState("");
  const [myRoomId, setMyRoomId]   = useState(null);
  const [joinCode, setJoinCode]   = useState("");
  const [joinError, setJoinError] = useState("");
  const [retryKey, setRetryKey]   = useState(0);
  const ownRoomRef = useRef(null);   // ma salle qui attend un adversaire (à supprimer si je pars)
  const subsRef    = useRef([]);     // canaux temps réel ouverts
  const timersRef  = useRef([]);     // délais en cours (ouverture de la partie)
  const matchedRef = useRef(false);

  const stopSubs = () => { subsRef.current.forEach(c => supabase.removeChannel(c)); subsRef.current = []; };
  const leave = () => {
    stopSubs();
    timersRef.current.forEach(clearTimeout); timersRef.current = [];
    const id = ownRoomRef.current; ownRoomRef.current = null;
    if(id && !matchedRef.current) deleteWaitingRoom(id);
  };
  const matched = (room, delay = 500) => {
    if(matchedRef.current) return;
    matchedRef.current = true;
    ownRoomRef.current = null;
    stopSubs();
    setStatus("found");
    timersRef.current.push(setTimeout(() => onMatch(room), delay));
  };
  const cancelAndClose = () => { leave(); onClose(); };
  // Fermeture de la fenêtre sans passer par « Annuler » : on retire quand même ma salle
  useEffect(() => leave, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── RANKED ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if(mode !== "ranked") return;
    let cancelled = false, busy = false, waited = 0, myRoom = null, myEloVal = 400;
    const ids = [];
    const stopLocal = () => { ids.forEach(clearInterval); ids.length = 0; };

    // Salles en attente compatibles. Quand j'attends moi-même, je ne rejoins que les salles créées AVANT la mienne :
    // sinon deux joueurs qui se trouvent en même temps rejoindraient chacun la salle de l'autre (deux parties fantômes).
    const findCandidates = async (range) => {
      const rows = await sb.query(
        `game_rooms?game_type=eq.${gameType}&status=eq.waiting&player1=neq.${encodeURIComponent(myUsername)}&private_code=is.null&player2=is.null` +
        `&updated_at=gte.${encodeURIComponent(agoIso(RANKED_FRESH_MS))}&order=created_at.asc&limit=10`
      ).catch(() => []);
      return (rows || [])
        .filter(r => Math.abs((r.elo1 || 400) - myEloVal) <= range)
        .filter(r => !myRoom || r.created_at < myRoom.created_at || (r.created_at === myRoom.created_at && String(r.id) < String(myRoom.id)))
        .sort((a, b) => Math.abs((a.elo1 || 400) - myEloVal) - Math.abs((b.elo1 || 400) - myEloVal));
    };
    const tryClaim = async (range) => {
      for(const cand of await findCandidates(range)) {
        const claimed = await claimSeat(cand.id, { player2: myUsername, elo2: myEloVal, status: "active" });
        if(claimed) return claimed;
      }
      return null;
    };

    const host = async () => {
      if(cancelled) return;
      const created = await sb.query("game_rooms", {
        method: "POST", headers: { ...sb.headers, Prefer: "return=representation" },
        body: JSON.stringify({ game_type: gameType, player1: myUsername, elo1: myEloVal, status: "waiting", state: {}, ranked: true, updated_at: new Date().toISOString() }),
      }).catch(() => null);
      myRoom = created?.[0];
      if(!myRoom) { if(!cancelled) setStatus("error"); return; }
      if(cancelled) { deleteWaitingRoom(myRoom.id); return; }
      ownRoomRef.current = myRoom.id;
      const roomId = myRoom.id;
      // Temps réel (rapide) + sondage (filet de sécurité)
      stopSubs();
      subsRef.current.push(supabase.channel(`room_${roomId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
          p => { const r = p.new; if(r.status === "active" && r.player2 && !cancelled) { stopLocal(); matched(r, 800); } })
        .subscribe());
      ids.push(setInterval(async () => {
        if(cancelled || busy) return;
        busy = true;
        try {
          const rows = await sb.query(`game_rooms?id=eq.${roomId}&limit=1`).catch(() => null);
          if(rows === null) return;                          // erreur réseau passagère : on réessaie au prochain tour
          const r = rows[0];
          if(!r || r.status === "finished") {                // ma salle a disparu (nettoyage, abandon) : j'en recrée une
            stopLocal(); ownRoomRef.current = null; await host(); return;
          }
          if(r.status === "active" && r.player2) { stopLocal(); matched(r, 500); return; }
          heartbeatRoom(roomId);                             // « je suis toujours là » : la salle reste visible
          waited += 2; setWaitTime(waited);
          const cands = await findCandidates(Math.min(50 + waited * 5, 400));
          if(!cands.length || cancelled) return;
          // 1) je retire ma salle (atomique : échoue si quelqu'un vient de la prendre), 2) je prends celle d'un autre
          const gone = await sb.query(`game_rooms?id=eq.${roomId}&status=eq.waiting`, { method: "DELETE", headers: { ...sb.headers, Prefer: "return=representation" } }).catch(() => null);
          if(!gone?.[0]) {                                   // quelqu'un m'a rejoint pile à ce moment : c'est ma partie
            const again = await sb.query(`game_rooms?id=eq.${roomId}&limit=1`).catch(() => []);
            if(again?.[0]?.status === "active" && again[0].player2) { stopLocal(); matched(again[0], 500); }
            return;
          }
          ownRoomRef.current = null; stopLocal(); stopSubs();
          let claimed = null;
          for(const cand of cands) {
            claimed = await claimSeat(cand.id, { player2: myUsername, elo2: myEloVal, status: "active" });
            if(claimed) break;
          }
          if(cancelled) { if(claimed) claimFinish(claimed.id); return; }
          if(claimed) matched(claimed, 500); else await host(); // tous pris entre-temps : je me remets en attente
        } finally { busy = false; }
      }, 2000));
    };

    (async () => {
      setStatus("searching"); setWaitTime(0);
      const elo = await getOrCreateElo(myUsername);
      myEloVal = elo[eloField] || 400;
      setMyElo(myEloVal);
      await deleteMyWaitingRooms(myUsername, gameType);      // mes anciennes salles oubliées (onglet fermé, plantage…)
      await sleep(Math.random() * 800);                       // évite que tout le monde crée sa salle au même instant
      if(cancelled) return;
      const claimed = await tryClaim(400);                    // d'abord : rejoindre quelqu'un qui attend déjà
      if(claimed) { if(cancelled) { claimFinish(claimed.id); return; } matched(claimed, 500); return; }
      await host();
    })();

    return () => { cancelled = true; stopLocal(); leave(); };
  }, [mode, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PRIVATE : créer ──────────────────────────────────────────────────────────
  const createPrivateRoom = async () => {
    setJoinError("");
    await deleteMyWaitingRooms(myUsername, gameType);
    const code = newRoomCode();
    const created = await sb.query("game_rooms", {
      method: "POST", headers: { ...sb.headers, Prefer: "return=representation" },
      body: JSON.stringify({ game_type: gameType, player1: myUsername, elo1: 400, status: "waiting", state: {}, ranked: false, private_code: code, updated_at: new Date().toISOString() }),
    }).catch(() => null);
    const myRoom = created?.[0];
    if(!myRoom) { setJoinError(x.netError); return; }
    ownRoomRef.current = myRoom.id;
    setPrivateCode(code);
    setMyRoomId(myRoom.id);
    setMode("private-create");
  };
  useEffect(() => {
    if(mode !== "private-create" || !myRoomId) return;
    let ticks = 0, busy = false;
    const roomId = myRoomId;
    const sub = supabase.channel(`room_${roomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        p => { const r = p.new; if(r.status === "active" && r.player2) matched(r, 500); })
      .subscribe();
    subsRef.current.push(sub);
    const id = setInterval(async () => {
      if(busy) return; busy = true;
      try {
        const rows = await sb.query(`game_rooms?id=eq.${roomId}&limit=1`).catch(() => null);
        if(rows === null) return;
        const r = rows[0];
        if(!r || r.status === "finished") { ownRoomRef.current = null; setJoinError(x.roomGone); setMode(null); return; }
        if(r.status === "active" && r.player2) { matched(r, 500); return; }
        if(++ticks % 2 === 0) heartbeatRoom(roomId);          // toutes les 4 s : la salle privée reste « fraîche »
      } finally { busy = false; }
    }, 2000);
    return () => { clearInterval(id); supabase.removeChannel(sub); subsRef.current = subsRef.current.filter(c => c !== sub); };
  }, [mode, myRoomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── PRIVATE : rejoindre ──────────────────────────────────────────────────────
  const joinPrivate = async () => {
    setJoinError("");
    const res = await joinPrivateRoom({ code: joinCode, gameType, me: myUsername });
    if(res.ok) { matched(res.room, 500); return; }
    setJoinError(res.reason === "invalid" ? t.errInvalidCode : res.reason === "own" ? t.errOwnRoom : joinErrorText(res.reason, lang));
  };

  // ── VS IA ────────────────────────────────────────────────────────────────────
  const startAI = (diff, label) => {
    matched({
      id: aiRoomId(), game_type: gameType, player1: myUsername, player2: `🤖 ${x.aiName} (${label})`,
      elo1: 400, elo2: 400, status: "active", ranked: false, _isAI: true, _aiDiff: diff,
    }, 600);
  };

  // ── RENDER ───────────────────────────────────────────────────────────────────
  if(!mode) return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:24,fontWeight:900,color:"var(--text-1)",marginBottom:20}}>
        ⚔️ {t.gameTypeName(gameType)}
      </div>
      {joinError && <div style={{fontSize:11,color:RED,marginBottom:10}}>{joinError}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:240,margin:"0 auto"}}>
        <button onClick={()=>{setJoinError("");setMode("ranked");}} style={BTN_PRIMARY}>{t.rankedBtn}</button>
        <button onClick={()=>setMode("vs-ai")} style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(251,191,36,0.4)",background:"rgba(251,191,36,0.08)",color:"#fbbf24",fontWeight:800,fontSize:13,cursor:"pointer"}}>
          🤖 vs {x.aiName}
        </button>
        <button onClick={createPrivateRoom} style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"var(--text-2)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          {t.createPrivateBtn}
        </button>
        <button onClick={()=>{setJoinError("");setMode("private-join");}} style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"var(--text-2)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          {t.joinPrivateBtn}
        </button>
        <button onClick={cancelAndClose} style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>{tc.cancel}</button>
      </div>
    </div>
  );

  if(mode==="vs-ai") return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:24,fontWeight:900,color:"var(--text-1)",marginBottom:8}}>🤖 vs {x.aiName}</div>
      <div style={{fontSize:12,color:"var(--text-4)",marginBottom:20}}>{x.aiPickLevel}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:240,margin:"0 auto"}}>
        {[
          {label:x.aiEasy,diff:"easy",desc:x.aiEasyDesc},
          {label:x.aiMedium,diff:"medium",desc:x.aiMediumDesc},
          {label:x.aiHard,diff:"hard",desc:x.aiHardDesc},
        ].map(({label,diff,desc})=>(
          <button key={diff} disabled={status==="found"} onClick={()=>startAI(diff,label.split(" ").slice(1).join(" "))}
            style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",
              background:"rgba(255,255,255,0.04)",color:"var(--text-1)",fontWeight:700,fontSize:13,cursor:"pointer",textAlign:"left"}}>
            <div style={{fontWeight:800}}>{label}</div>
            <div style={{fontSize:10,color:"var(--text-4)",marginTop:2}}>{desc}</div>
          </button>
        ))}
        <button onClick={()=>setMode(null)} style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>{tc.cancel}</button>
      </div>
      {status==="found" && <div style={{marginTop:20,fontSize:16,fontWeight:900,color:GREEN}}>{x.launching}</div>}
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

          <div style={{textAlign:"left",marginBottom:16}}>
            <FriendInviteList myUsername={myUsername} gameType={gameType} roomId={myRoomId} privateCode={privateCode}/>
          </div>

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
          <input value={joinCode} onChange={e=>setJoinCode(cleanRoomCode(e.target.value))} onKeyDown={e=>e.key==="Enter"&&joinPrivate()}
            placeholder={t.joinCodePlaceholder} maxLength={6} autoFocus
            style={{width:"100%",boxSizing:"border-box",padding:"12px 16px",borderRadius:12,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"var(--text-1)",fontSize:18,fontWeight:900,textAlign:"center",letterSpacing:4,outline:"none",marginBottom:8}}/>
          {joinError&&<div style={{fontSize:11,color:RED,marginBottom:8}}>{joinError}</div>}
          <button onClick={joinPrivate} style={{...BTN_PRIMARY,width:"100%",padding:"12px",marginBottom:8}}>{t.joinBtn}</button>
          <button onClick={()=>setMode(null)} style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>{tc.cancel}</button>
        </>
      )}
    </div>
  );

  // ranked
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
      ) : status==="error" ? (
        <>
          <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
          <div style={{fontSize:13,color:RED,marginBottom:16}}>{x.netError}</div>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            <button onClick={()=>setRetryKey(k=>k+1)} style={{...BTN_PRIMARY,padding:"8px 20px",borderRadius:20}}>{x.retry}</button>
            <button onClick={cancelAndClose} style={{padding:"8px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.1)",background:"transparent",color:"var(--text-3)",cursor:"pointer",fontSize:12}}>{tc.cancel}</button>
          </div>
        </>
      ) : (
        <><div style={{fontSize:48,marginBottom:12}}>⚔️</div><div style={{fontSize:18,fontWeight:900,color:GREEN}}>{t.opponentFound}</div><div style={{fontSize:12,color:"var(--text-4)",marginTop:8}}>{tc.starting}</div></>
      )}
    </div>
  );
}


// ─── CHAIN GAME ───────────────────────────────────────────────────────────────
// Fiabilité : une seule copie « à jour » de l'état (stateRef) lue par tous les minuteurs (plus de valeurs périmées) ;
// la fin de partie et l'abandon passent par claimFinish() — la partie ne se termine, et l'ELO ne change, qu'UNE fois ;
// un adversaire silencieux (plus aucun changement observé) fait gagner la partie par abandon ; l'IA ne touche jamais la base.
const CHAIN_IDLE_MS = { play: 55_000, choose: 75_000, roundEnd: 20_000 }; // 40 s de manche + marge ; choix du lien ; transition
const HIDDEN_FORFEIT_MS = 8_000;                                          // onglet masqué plus de 8 s en partie classée

// Abandon : celui qui part perd 40 ELO, celui qui reste gagne 5 ELO et 5 points (calculé une seule fois, par celui qui clôt la salle).
async function applyForfeitElo(field, leaver, stayer) {
  await Promise.all([
    updateElo(leaver, field, -FORFEIT_PENALTY, 0),
    updateElo(stayer, field, FORFEIT_BONUS, FORFEIT_BONUS),
  ]);
}

export function ChainGame({ room, onClose, onReady }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).chain;
  const tc = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).common;
  const x = GS_EXTRA[lang] || GS_EXTRA.fr;
  const isAI = !!room._isAI;
  const aiDiff = room._aiDiff || "medium";
  const aiFailRate = aiDiff === "easy" ? 0.30 : aiDiff === "medium" ? 0.15 : 0.05;
  const aiDelay   = aiDiff === "easy" ? 3500 : aiDiff === "medium" ? 2000 : 1000;
  const isP1 = room.player1 === myUsername;
  const oppUsername = isP1 ? room.player2 : room.player1;
  const ranked = isRankedRoom(room);

  const defaultState = {
    round: 1, scores: [0, 0], linkType: null, currentAnime: null, chain: [],
    turn: null, chooser: room.player1, phase: "choose", timer: 40, roundStart: null, times: [0, 0],
  };
  const initial = (room.state && room.state.scores) ? room.state : defaultState;
  const [state, setStateRaw] = useState(initial);
  const stateRef  = useRef(initial);
  const endedRef  = useRef(initial.phase === "gameEnd");
  const [mountedAt] = useState(Date.now);
  const lastChangeRef = useRef(mountedAt);      // dernière fois où la partie a bougé (coup à moi ou à l'adversaire)
  const commit = useCallback((next) => { stateRef.current = next; lastChangeRef.current = Date.now(); setStateRaw(next); }, []);

  const [query, setQuery]       = useState("");
  const [suggestions, setSugs]  = useState([]);
  const [pool, setPool]         = useState([]);
  const [timerVal, setTimerVal] = useState(40);
  const [msg, setMsg]           = useState("");
  const [lastGuess, setLastGuess] = useState(null); // {anime, valid, linkUsed}
  const searchTimer = useRef(null);
  const startTsRef  = useRef(null);
  const lastPollRef   = useRef(mountedAt);
  const transitionRef = useRef(null);
  const [idleInfo, setIdleInfo] = useState(null);   // { actor, left } : qui doit agir et dans combien de secondes l'abandon tombe
  const lastRemoteRef = useRef("");                // dernier état vu côté base (comparé à lui-même : l'ordre des clés JSON y est stable)

  const isMyTurn  = state.turn === myUsername;
  const amChooser = state.chooser === myUsername;

  // ── chargement des animés (liste des TV connus) ───────────────────────────────
  useEffect(() => {
    sb.query("anime_cache?type=eq.TV&score=gte.6.5&scored_by=gte.3000&select=mal_id,title,studios,genres,image_url&order=scored_by.desc&limit=5000")
      .then(r => setPool(r || [])).catch(()=>{});
  }, []);

  // ── écriture de l'état partagé (jamais dans une salle déjà terminée) ──────────────
  const pushState = useCallback(async (next) => {
    if(isAI) return;
    await sb.query(`game_rooms?id=eq.${room.id}&status=eq.active`, {
      method: "PATCH", headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: next, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  }, [isAI, room.id]);

  // ── fin de partie normale : on « clôt » la salle ; seul celui qui la clôt applique l'ELO ─────────────────
  const finishGame = useCallback(async (winner, scores) => {
    if(endedRef.current) return;
    endedRef.current = true;
    const final = { ...stateRef.current, phase: "gameEnd", scores, winner, turn: null, opponentLeft: false };
    commit(final);
    if(isAI) return;
    const row = await claimFinish(room.id, { winner, state: final });
    if(row && ranked) {
      const o = chainGameOutcome(room, winner, scores);
      await Promise.all([
        updateElo(room.player1, "elo_chain", o.delta1, o.pts1),
        updateElo(room.player2, "elo_chain", o.delta2, o.pts2),
      ]);
    }
  }, [commit, isAI, ranked, room]);

  // ── abandon (moi) ───────────────────────────────────────────────────────────────
  const forfeit = useCallback(async () => {
    if(endedRef.current) return;
    endedRef.current = true;
    const cur = stateRef.current;
    const final = { ...cur, phase: "gameEnd", winner: oppUsername, forfeitBy: myUsername, turn: null };
    commit(final);
    if(isAI) return;
    const row = await claimFinish(room.id, { winner: oppUsername, state: final });
    if(row && ranked) await applyForfeitElo("elo_chain", myUsername, oppUsername);
  }, [commit, isAI, myUsername, oppUsername, ranked, room.id]);

  // ── victoire par abandon de l'adversaire (parti, déconnecté, silencieux) ─────────────────
  const claimWin = useCallback(async () => {
    if(endedRef.current) return;
    endedRef.current = true;
    const cur = stateRef.current;
    const final = { ...cur, phase: "gameEnd", winner: myUsername, forfeitBy: oppUsername, turn: null };
    commit(final);
    const row = await claimFinish(room.id, { winner: myUsername, state: final });
    if(row && ranked) await applyForfeitElo("elo_chain", oppUsername, myUsername);
  }, [commit, myUsername, oppUsername, ranked, room.id]);

  // ── manche perdue par `loser` : manche suivante ou fin de partie ──────────────────
  const endRound = useCallback(async (loser) => {
    const cur = stateRef.current;
    if(endedRef.current || cur.phase !== "play") return;
    const res = chainAfterRoundLoss(cur, loser, room);
    if(res.over) { await finishGame(res.winner, res.scores); return; }
    const roundEnd = { ...cur, round: res.round, scores: res.scores, phase: "roundEnd", linkType: null, currentAnime: null,
      chain: [], turn: null, timer: 40, chooser: res.chooser, times: [0, 0] };
    commit(roundEnd);
    await pushState(roundEnd);
    clearTimeout(transitionRef.current);
    transitionRef.current = setTimeout(async () => {
      if(endedRef.current || stateRef.current.phase !== "roundEnd") return;
      const choose = { ...stateRef.current, phase: "choose" };
      commit(choose);
      await pushState(choose);
    }, 3000);
  }, [commit, finishGame, pushState, room]);
  useEffect(() => () => clearTimeout(transitionRef.current), []);

  // Dernières versions des fonctions, lues par les minuteurs (évite de les relancer à chaque rendu)
  const claimWinRef = useRef(claimWin);  const endRoundRef = useRef(endRound);
  useEffect(() => { claimWinRef.current = claimWin; endRoundRef.current = endRound; });

  // ── synchronisation avec l'adversaire (sondage 1,5 s) ────────────────────────────
  useEffect(() => {
    if(isAI) return;
    let stopped = false;
    const poll = setInterval(async () => {
      try {
        const now = Date.now();
        const frozen = now - lastPollRef.current > 6000;         // onglet gelé / réseau coupé : on repart sur une base saine
        lastPollRef.current = now;
        if(frozen) lastChangeRef.current = now;
        const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status,winner&limit=1`);
        const r = rows?.[0];
        if(stopped || !r) return;
        const cur = stateRef.current;
        if(cur.phase === "gameEnd") { clearInterval(poll); return; }
        if(r.status === "finished") {
          clearInterval(poll); endedRef.current = true;
          if(r.state?.phase === "gameEnd" && r.state?.scores) commit(r.state);           // fin normale ou abandon (déjà détaillé)
          else commit({ ...cur, phase: "gameEnd", winner: r.winner, forfeitBy: r.winner === myUsername ? oppUsername : myUsername, turn: null });
          return;
        }
        if(r.status === "waiting") {                                                  // anciennes versions : salle remise en attente = parti
          clearInterval(poll); await claimWinRef.current(); return;
        }
        const next = r.state;
        if(next?.scores) {
          const str = JSON.stringify(next);
          if(str !== lastRemoteRef.current) { lastRemoteRef.current = str; commit(next); }
        }
        // Adversaire silencieux : c'est à lui d'agir et plus rien ne bouge depuis trop longtemps
        const s = stateRef.current;
        const actor = s.phase === "play" ? s.turn : s.phase === "choose" ? s.chooser : null;
        const limit = CHAIN_IDLE_MS[s.phase];
        if(limit && actor && actor !== myUsername && now - lastChangeRef.current > limit) { clearInterval(poll); await claimWinRef.current(); }
      } catch { /* réseau : on réessaie au prochain tour */ }
    }, 1500);
    return () => { stopped = true; clearInterval(poll); };
  }, [room.id, isAI, commit, myUsername, oppUsername]);

  // ── minuterie de 40 s par tour (calculée sur l'heure réelle, donc juste même si l'onglet ralentit) ─────
  const turnKey = state.phase === "play" ? `${state.round}|${state.turn}|${state.chain.length}` : null;
  useEffect(() => {
    if(!turnKey) return;
    const deadline = Date.now() + (stateRef.current.timer || 40) * 1000;
    startTsRef.current = Date.now();
    let fired = false;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimerVal(left);
      if(left === 0 && !fired) {
        fired = true; clearInterval(id);
        if(stateRef.current.turn === myUsername) endRoundRef.current(myUsername); // seul le joueur concerné déclare sa propre défaite
      }
    }, 250);
    return () => clearInterval(id);
  }, [turnKey, myUsername]);

  // ── compte à rebours d'inactivité (affiché seulement pendant les 20 dernières secondes) ───────
  useEffect(() => {
    if(isAI) return;
    const id = setInterval(() => {
      const s = stateRef.current;
      const actor = s.phase === "play" ? s.turn : s.phase === "choose" ? s.chooser : null;
      const limit = CHAIN_IDLE_MS[s.phase];
      setIdleInfo(actor && limit ? { actor, left: Math.ceil((limit - (Date.now() - lastChangeRef.current)) / 1000) } : null);
    }, 1000);
    return () => clearInterval(id);
  }, [isAI]);

  // ── abandon automatique si l'onglet reste masqué (partie classée) ───────────────────────
  const forfeitRef = useRef(forfeit);  const onCloseRef = useRef(onClose);
  useEffect(() => { forfeitRef.current = forfeit; onCloseRef.current = onClose; });
  useEffect(() => {
    if(!ranked) return;
    let timer;
    const onVisibility = () => {
      clearTimeout(timer);
      if(document.hidden && stateRef.current.phase === "play") {
        timer = setTimeout(async () => {
          if(document.hidden && !endedRef.current) { await forfeitRef.current(); onCloseRef.current(); }
        }, HIDDEN_FORFEIT_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [ranked]);

  // ── le parent appelle cette fonction avant de fermer la fenêtre ───────────────────────
  useEffect(() => {
    const fn = () => forfeitRef.current();
    fn.isOver = () => isAI || endedRef.current || stateRef.current.phase === "gameEnd";
    onReady?.(fn);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── début de manche : le joueur qui a choisi le type de lien lance la partie ──────────
  const startRound = useCallback(async (type) => {
    const cur = stateRef.current;
    if(endedRef.current || cur.phase !== "choose" || !pool.length) return;
    const start = pool[Math.floor(Math.random() * pool.length)];
    const next = { ...cur, linkType: type, currentAnime: start, chain: [start], turn: cur.chooser, phase: "play", timer: 40 };
    commit(next);
    await pushState(next);
  }, [commit, pool, pushState]);
  const handleChooseLinkType = (type) => { if(amChooser) startRound(type); };

  // ── IA : choisit le type de lien quand c'est à elle, puis joue ses tours ─────────────
  useEffect(() => {
    if(!isAI || !pool.length) return;
    let cancelled = false, timer;
    if(state.phase === "choose" && state.chooser === oppUsername) {
      timer = setTimeout(() => { if(!cancelled && stateRef.current.chooser === oppUsername) startRound(Math.random() < 0.5 ? "studio" : "genre"); }, 900 + Math.random() * 600);
    } else if(state.phase === "play" && state.turn === oppUsername) {
      timer = setTimeout(() => {
        const s = stateRef.current;
        if(cancelled || s.phase !== "play" || s.turn !== oppUsername) return;
        if(Math.random() < aiFailRate) { endRound(oppUsername); return; }          // l'IA rate : elle perd la manche
        const pick = chainAiPick(s, pool);
        if(!pick) { endRound(oppUsername); return; }                              // plus de coup possible : elle perd la manche
        commit({ ...s, currentAnime: pick, chain: [...s.chain, pick], turn: myUsername, timer: 40 });
      }, aiDelay + Math.random() * 800);
    }
    return () => { cancelled = true; clearTimeout(timer); };
  }, [state.phase, state.turn, state.chooser, state.round, isAI, pool.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── mon coup ──────────────────────────────────────────────────────────────────────
  const currentLinkType = chainLinkForTurn(state);
  const handleGuess = async (anime) => {
    const cur = stateRef.current;
    if(cur.turn !== myUsername || cur.phase !== "play" || endedRef.current) return;
    if(cur.chain.some(a => a.mal_id === anime.mal_id)) { setMsg(t.errAlreadyUsed); setLastGuess(null); return; }
    const linkUsed = chainLinkForTurn(cur);
    const valid = isChainLinkValid(cur.currentAnime, anime, linkUsed);
    setLastGuess({ anime, valid, linkUsed });
    setQuery(""); setSugs([]);
    if(!valid) { setMsg(t.errInvalidLink); return; }
    setMsg("");
    const elapsed = Math.round((Date.now() - (startTsRef.current || Date.now())) / 1000);
    const newTimes = isP1 ? [cur.times[0] + elapsed, cur.times[1]] : [cur.times[0], cur.times[1] + elapsed];
    const next = { ...cur, currentAnime: anime, chain: [...cur.chain, anime], turn: oppUsername, timer: 40, times: newTimes };
    commit(next);
    await pushState(next);
  };

  const search = (q) => {
    setQuery(q);
    clearTimeout(searchTimer.current);
    if(!q.trim()) { setSugs([]); return; }
    searchTimer.current = setTimeout(async () => {
      const rows = await sb.query(`anime_cache?title=ilike.*${encodeURIComponent(q)}*&type=eq.TV&order=score.desc.nullslast&limit=8&select=mal_id,title,studios,genres,image_url`).catch(()=>[]);
      setSugs(rows || []);
    }, 300);
  };

  const linkLabel = currentLinkType === "studio" ? (t.linkLabelStudio||"🏢 Même studio, genre différent") : currentLinkType === "genre" ? (t.linkLabelGenre||"🎌 Même genre, studio différent") : "";

  const idleNote = idleInfo && idleInfo.left <= 20 && idleInfo.left > 0
    ? (idleInfo.actor === myUsername ? x.idleWarnMe(idleInfo.left) : x.idleWarnOpp(idleInfo.left)) : null;

  return (
    <div style={{padding:16,maxWidth:640,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:"var(--text-2)"}}>
          ⚔️ {myUsername} <span style={{color:"var(--text-4)"}}>vs</span> {oppUsername}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--text-4)"}}>{t.round(Math.min(state.round, 3))}</span>
          <div style={{display:"flex",gap:4}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{width:10,height:10,borderRadius:"50%",
                background:i<state.scores[isP1?0:1]?GREEN:i<state.scores[isP1?1:0]?RED:"rgba(255,255,255,0.1)"}}/>
            ))}
          </div>
        </div>
      </div>

      {idleNote && <div style={{textAlign:"center",fontSize:11,fontWeight:700,color:ORANGE,marginBottom:8}}>{idleNote}</div>}

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

      {/* Between rounds */}
      {state.phase === "roundEnd" && (
        <div style={{textAlign:"center",padding:24}}><Spinner/></div>
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
{lastGuess.valid?(t.guessValid||"✅ Valide"):(t.guessInvalid||"❌ Invalide")} · {t.guessStudioLabel||"Studio"}: {(lastGuess.anime.studios||[]).map(s=>s.name||s).join(", ")||"?"} · {t.guessGenresLabel||"Genres"}: {(lastGuess.anime.genres||[]).map(g=>g.name||g).join(", ")||"?"}
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
            {[...state.chain].reverse().map((a)=>(
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
            const iForfeited = state.forfeitBy === myUsername;
            const oppLeft = !!state.forfeitBy && !iForfeited;
            const won = !iForfeited && (oppLeft || state.winner === myUsername || (!state.winner && myScore > oppScore));
            const draw = !state.forfeitBy && !state.winner && myScore === oppScore;
            return (
              <>
<div style={{fontSize:48,marginBottom:12}}>{iForfeited?"🏳️":oppLeft?"🏃":won?"🏆":draw?"🤝":"😢"}</div>
                <div style={{fontSize:20,fontWeight:900,color:won?"#22c55e":draw?ORANGE:RED,marginBottom:8}}>
                  {iForfeited ? x.youForfeited : oppLeft ? x.opponentGone : (won?(tc?.victory||"Victoire !"):(draw?(tc?.draw||"Égalité"):(tc?.defeat||"Défaite")))}
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
// Les règles (placement, fin de partie, IA) vivent dans src/utils/gameRules.js (testées) ; ce composant ne fait que les afficher
// et synchroniser. Même fiabilité que Chain : état lu par les minuteurs via une référence, fin de partie et abandon « une seule
// fois » (claimFinish), adversaire silencieux = victoire par abandon, l'IA ne touche jamais la base.
const TIMELINE_IDLE_MS = 90_000;      // sans coup de l'adversaire pendant 90 s : victoire par abandon

export function TimelineGame({ room, onClose, onReady }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).timeline;
  const tc = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).common;
  const x = GS_EXTRA[lang] || GS_EXTRA.fr;
  const isAI = !!room._isAI;
  const aiDiff = room._aiDiff || "medium";
  const aiFailRate = aiDiff === "easy" ? 0.30 : aiDiff === "medium" ? 0.15 : 0.05;
  const aiDelay   = aiDiff === "easy" ? 3000 : aiDiff === "medium" ? 1800 : 900;
  const isP1 = room.player1 === myUsername;
  const oppUsername = isP1 ? room.player2 : room.player1;
  const ranked = isRankedRoom(room);

  const empty = { timeline: [], hand1: [], hand2: [], placed1: 0, placed2: 0, currentTurn: room.player1, phase: "play", winner: null, isDraw: false, skipped: null, lastChance: false };
  const initial = (room.state && room.state.hand1?.length) ? room.state : empty;
  const [state, setStateRaw] = useState(initial);
  const stateRef = useRef(initial);
  const endedRef = useRef(initial.phase === "gameEnd");
  const [mountedAt] = useState(Date.now);
  const lastChangeRef = useRef(mountedAt);
  const lastRemoteRef = useRef("");
  const lastPollRef   = useRef(mountedAt);
  const commit = useCallback((next) => { stateRef.current = next; lastChangeRef.current = Date.now(); setStateRaw(next); }, []);

  const [selectedCard, setSelectedCard] = useState(0);
  const [msg, setMsg]       = useState("");
  const [startFailed, setStartFailed] = useState(false);
  const [idleInfo, setIdleInfo] = useState(null);

  const myHand    = (isP1 ? state.hand1 : state.hand2) || [];
  const myPlaced  = isP1 ? state.placed1 : state.placed2;
  const oppPlaced = isP1 ? state.placed2 : state.placed1;
  const isMyTurn  = state.currentTurn === myUsername && state.phase === "play";
  const dealt     = (state.hand1?.length || 0) + (state.hand2?.length || 0) + state.timeline.length > 0;
  const sel       = Math.min(selectedCard, Math.max(0, myHand.length - 1));
  const currentAnimeToPlace = myHand[sel];

  const pushState = useCallback(async (next) => {
    if(isAI) return;
    await sb.query(`game_rooms?id=eq.${room.id}&status=eq.active`, {
      method: "PATCH", headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: next, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  }, [isAI, room.id]);

  // ── distribution : seul le joueur 1 la fait, avec plusieurs essais ───────────────────
  useEffect(() => {
    if(!isP1 || (room.state && room.state.hand1?.length)) return;
    let cancelled = false;
    (async () => {
      let rows = null;
      for(let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        rows = await sb.query("anime_cache?type=eq.TV&year=not.is.null&score=gte.6&scored_by=gte.2000&select=mal_id,title,year,image_url&order=scored_by.desc&limit=3000").catch(()=>null);
        if(rows?.length >= 11) break;
        await sleep(1500);
      }
      if(cancelled) return;
      const deal = rows?.length ? dealTimeline(rows, room.player1) : null;
      if(!deal) {                                           // pas de cartes : on annule proprement, sans toucher à l'ELO
        setStartFailed(true); endedRef.current = true;
        if(!isAI) claimFinish(room.id, { winner: null, state: { ...empty, phase: "gameEnd", startFailed: true } });
        return;
      }
      commit(deal);
      await pushState(deal);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Le joueur 2 attend la distribution : au-delà de 30 s, on abandonne l'attente
  useEffect(() => {
    if(isP1) return;
    const id = setTimeout(() => { if(!stateRef.current.hand1?.length && !endedRef.current) setStartFailed(true); }, 30_000);
    return () => clearTimeout(id);
  }, [isP1]);

  // ── fin de partie normale / abandon (une seule fois) ───────────────────────────────
  const finishGame = useCallback(async (final) => {
    endedRef.current = true;
    if(isAI) return;
    const row = await claimFinish(room.id, { winner: final.winner || null, state: final });
    if(row && ranked) {
      const o = timelineGameOutcome(room, final.winner, final.isDraw);
      await Promise.all([
        updateElo(room.player1, "elo_timeline", o.delta1, o.pts1),
        updateElo(room.player2, "elo_timeline", o.delta2, o.pts2),
      ]);
    }
  }, [isAI, ranked, room]);

  const forfeit = useCallback(async () => {
    if(endedRef.current) return;
    endedRef.current = true;
    const final = { ...stateRef.current, phase: "gameEnd", winner: oppUsername, isDraw: false, forfeitBy: myUsername, currentTurn: null };
    commit(final);
    if(isAI) return;
    const row = await claimFinish(room.id, { winner: oppUsername, state: final });
    if(row && ranked) await applyForfeitElo("elo_timeline", myUsername, oppUsername);
  }, [commit, isAI, myUsername, oppUsername, ranked, room.id]);

  const claimWin = useCallback(async () => {
    if(endedRef.current) return;
    endedRef.current = true;
    const final = { ...stateRef.current, phase: "gameEnd", winner: myUsername, isDraw: false, forfeitBy: oppUsername, currentTurn: null };
    commit(final);
    const row = await claimFinish(room.id, { winner: myUsername, state: final });
    if(row && ranked) await applyForfeitElo("elo_timeline", oppUsername, myUsername);
  }, [commit, myUsername, oppUsername, ranked, room.id]);

  const forfeitRef = useRef(forfeit);  const claimWinRef = useRef(claimWin);  const onCloseRef = useRef(onClose);
  useEffect(() => { forfeitRef.current = forfeit; claimWinRef.current = claimWin; onCloseRef.current = onClose; });

  useEffect(() => {
    const fn = () => forfeitRef.current();
    fn.isOver = () => isAI || endedRef.current || stateRef.current.phase === "gameEnd" || startFailed;
    onReady?.(fn);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Onglet masqué plus de 8 s en partie classée : abandon (comme Chain)
  useEffect(() => {
    if(!ranked) return;
    let timer;
    const onVisibility = () => {
      clearTimeout(timer);
      if(document.hidden && stateRef.current.phase === "play" && stateRef.current.hand1?.length) {
        timer = setTimeout(async () => {
          if(document.hidden && !endedRef.current) { await forfeitRef.current(); onCloseRef.current(); }
        }, HIDDEN_FORFEIT_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [ranked]);

  // ── synchronisation (sondage 1,5 s) + adversaire silencieux ─────────────────────────
  useEffect(() => {
    if(isAI) return;
    let stopped = false;
    const poll = setInterval(async () => {
      try {
        const now = Date.now();
        if(now - lastPollRef.current > 6000) lastChangeRef.current = now;   // onglet gelé : base saine
        lastPollRef.current = now;
        const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status,winner&limit=1`);
        const r = rows?.[0];
        if(stopped || !r) return;
        const cur = stateRef.current;
        if(cur.phase === "gameEnd") { clearInterval(poll); return; }
        if(r.status === "finished") {
          clearInterval(poll); endedRef.current = true;
          if(r.state?.startFailed) { setStartFailed(true); return; }
          if(r.state?.phase === "gameEnd") commit(r.state);
          else commit({ ...cur, phase: "gameEnd", winner: r.winner, forfeitBy: r.winner === myUsername ? oppUsername : myUsername, currentTurn: null });
          return;
        }
        if(r.status === "waiting") { clearInterval(poll); await claimWinRef.current(); return; }   // anciennes versions
        if(r.state?.hand1) {
          const str = JSON.stringify(r.state);
          if(str !== lastRemoteRef.current) { lastRemoteRef.current = str; commit(r.state); }
        }
        const s = stateRef.current;
        if(s.hand1?.length && s.phase === "play" && s.currentTurn !== myUsername && now - lastChangeRef.current > TIMELINE_IDLE_MS) {
          clearInterval(poll); await claimWinRef.current();
        }
      } catch { /* réseau : au prochain tour */ }
    }, 1500);
    return () => { stopped = true; clearInterval(poll); };
  }, [room.id, isAI, commit, myUsername, oppUsername]);

  // compte à rebours d'inactivité (20 dernières secondes)
  useEffect(() => {
    if(isAI) return;
    const id = setInterval(() => {
      const s = stateRef.current;
      setIdleInfo(s.hand1?.length && s.phase === "play"
        ? { actor: s.currentTurn, left: Math.ceil((TIMELINE_IDLE_MS - (Date.now() - lastChangeRef.current)) / 1000) } : null);
    }, 1000);
    return () => clearInterval(id);
  }, [isAI]);

  // ── mon coup ──────────────────────────────────────────────────────────────────────
  const applyMove = useCallback(async (by, cardId, pos) => {
    const res = timelineMove(stateRef.current, { by, cardId, pos, p1: room.player1, p2: room.player2 });
    if(res.ignored) return null;
    commit(res.state);
    if(res.ended) await finishGame(res.state); else await pushState(res.state);
    return res;
  }, [commit, finishGame, pushState, room.player1, room.player2]);

  const placeAnime = async (pos) => {
    const card = currentAnimeToPlace;
    if(!card || !isMyTurn || endedRef.current) return;
    const res = await applyMove(myUsername, card.mal_id, pos);
    if(!res) return;
    setSelectedCard(0);
    if(!res.valid) { setMsg(t.errWrongPosition || "❌ Mauvaise position !"); setTimeout(() => setMsg(""), 2000); } else setMsg("");
  };

  // ── IA : joue toujours sa première carte ─────────────────────────────────────────
  useEffect(() => {
    if(!isAI || state.phase !== "play" || state.currentTurn !== oppUsername || !state.hand1?.length) return;
    const timer = setTimeout(() => {
      const s = stateRef.current;
      if(endedRef.current || s.phase !== "play" || s.currentTurn !== oppUsername) return;
      const res = timelineAiMove(s, { ai: oppUsername, p1: room.player1, p2: room.player2, failRate: aiFailRate });
      if(res.ignored) return;
      commit(res.state);
      if(res.ended) endedRef.current = true;
    }, aiDelay + Math.random() * 800);
    return () => clearTimeout(timer);
  }, [state.currentTurn, state.phase, state.hand1?.length, isAI]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmForfeit = () => { if(window.confirm(x.confirmForfeit)) forfeit(); };

  const idleNote = idleInfo && idleInfo.left <= 20 && idleInfo.left > 0
    ? (idleInfo.actor === myUsername ? x.idleWarnMe(idleInfo.left) : x.idleWarnOpp(idleInfo.left)) : null;

  if(startFailed) return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:10}}>⚠️</div>
      <div style={{fontSize:13,color:"var(--text-3)",marginBottom:16}}>{x.dealFail}</div>
      <button onClick={onClose} style={{...BTN_PRIMARY,padding:"10px 24px",borderRadius:20}}>{tc.back}</button>
    </div>
  );

  return (
    <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:800,color:"var(--text-2)"}}>
          📅 {myUsername} <span style={{color:"var(--text-4)"}}>vs</span> {oppUsername}
        </div>
<div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:11,color:"var(--text-4)"}}>
            {t.placed(myPlaced, oppPlaced, oppUsername)}
          </div>
          {state.phase === "play" && (
            <button onClick={confirmForfeit}
              style={{fontSize:9,padding:"3px 8px",borderRadius:8,border:"1px solid rgba(239,68,68,0.3)",
                background:"rgba(239,68,68,0.08)",color:"#ef4444",cursor:"pointer"}}>
              {t.forfeitBtn}
            </button>
          )}
        </div>
      </div>

      {!dealt && state.phase === "play" && (
        <div style={{textAlign:"center",padding:32}}><Spinner label={isP1 ? x.dealing : x.dealWait}/></div>
      )}

      {idleNote && <div style={{textAlign:"center",fontSize:11,fontWeight:700,color:ORANGE,marginBottom:8}}>{idleNote}</div>}

      {/* Turn indicator */}
      {state.phase === "play" && dealt && (
        <div style={{textAlign:"center",marginBottom:12,padding:"6px 14px",borderRadius:20,display:"inline-block",
          background:isMyTurn?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.04)",
          border:`1px solid ${isMyTurn?"rgba(34,197,94,0.3)":"rgba(255,255,255,0.08)"}`,
          color:isMyTurn?GREEN:"var(--text-4)",fontSize:11,fontWeight:700}}>
{state.skipped ? (t.skippedTurn?t.skippedTurn(state.skipped):`⏩ ${state.skipped} a raté — `) : ""}
          {state.lastChance && state.currentTurn !== null && `${state.currentTurn === myUsername ? "⚡ " : ""}`}
          {isMyTurn ? (t.yourTurn||"🎯 Ton tour — clique sur une carte puis sur une position") : (t.turnOf?t.turnOf(oppUsername):`⏳ Tour de ${oppUsername}`)}
        </div>
      )}

      {msg && <div style={{textAlign:"center",fontSize:12,color:RED,marginBottom:8,fontWeight:700}}>{msg}</div>}

      {/* My hand — selectable */}
      {myHand.length > 0 && state.phase==="play" && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"var(--text-4)",marginBottom:8}}>
{isMyTurn ? t.selectCardPrompt : t.remainingAnimeLabel}
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {myHand.map((a,i)=>{
              const selected = i === sel;
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
      {isMyTurn && currentAnimeToPlace && (
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
          {isMyTurn && (
            <DropZone onDrop={()=>placeAnime(0)}/>
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
              {isMyTurn && (
                <DropZone onDrop={()=>placeAnime(i+1)}/>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Game End */}
      {state.phase === "gameEnd" && (() => {
        const iForfeited = state.forfeitBy === myUsername;
        const oppLeft = !!state.forfeitBy && !iForfeited;
        const iWon = !iForfeited && (oppLeft || state.winner === myUsername);
        return (
          <div style={{textAlign:"center",padding:24,marginTop:16,background:"rgba(255,255,255,0.03)",
            borderRadius:16,border:"1px solid rgba(255,255,255,0.07)"}}>
            <div style={{fontSize:40,marginBottom:8}}>
              {iForfeited?"🏳️":oppLeft?"🏃":state.isDraw?"🤝":iWon?"🏆":"😢"}
            </div>
            <div style={{fontSize:18,fontWeight:900,marginBottom:16,color:iWon?GREEN:state.isDraw?ORANGE:RED}}>
              {iForfeited ? x.youForfeited : oppLeft ? x.opponentGone : state.isDraw?(tc?.draw||"Égalité !"):(iWon?(tc?.victory||"Victoire !"):(tc?.defeat||"Défaite"))}
            </div>
            <div style={{fontSize:12,color:"var(--text-4)",marginBottom:20}}>
              {state.forfeitBy||state.isDraw||!state.winner?"":t.wonFirst?t.wonFirst(state.winner):(state.winner+" a placé tous ses animés en premier")}
            </div>
            <button onClick={onClose}
              style={{padding:"10px 24px",borderRadius:20,border:"none",
                background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",
                fontWeight:800,fontSize:13,cursor:"pointer"}}>
              {tc.back}
            </button>
          </div>
        );
      })()}
    </div>
  );
}


function DropZone({ onDrop }) {
  const [hovered, setHover] = useState(false);
  // Écran tactile : pas de survol → zone toujours visible, sinon impossible à viser au doigt
  const hover = hovered || window.matchMedia?.("(hover: none)").matches;
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

const CLUE_IDLE_SECS = 90;   // sans aucune action pendant 1 min 30 : on propose de passer / terminer

export function CluescaleGame({ room, onClose }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const x = GS_EXTRA[lang] || GS_EXTRA.fr;
  const players = room.players || roomPlayers(room);
  const isHost  = myUsername === players[0];

  const [state, setStateRaw] = useState(room.state || null);
  const stateRef = useRef(room.state || null);
  const [clue, setClue]   = useState("");
  const [guess, setGuess] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const lastStateRef = useRef("");
  const myGuessRef = useRef(null);     // { round, value } : mon vote, pour le renvoyer s'il a été écrasé par celui d'un autre juré
  const busyRef = useRef(false);
  const [mountedAt] = useState(Date.now);
  const lastChangeRef = useRef(mountedAt);
  const [idleSecs, setIdleSecs] = useState(0);
  const apply = useCallback((next) => { stateRef.current = next; lastChangeRef.current = Date.now(); setStateRaw(next); }, []);

  const pushState = useCallback(async (newState) => {
    await sb.query(`game_rooms?id=eq.${room.id}&status=eq.active`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ state: newState, updated_at: new Date().toISOString() }),
    }).catch(()=>{});
  }, [room.id]);

  const fetchFresh = useCallback(async () => {
    const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status&limit=1`).catch(()=>null);
    return rows?.[0]?.state || null;
  }, [room.id]);

  // Fin de manche : points + passage à l'écran de révélation
  const revealState = useCallback((s) => ({
    ...s,
    scores: cluescaleScoreRound({ players, judge: s.judge, answer: s.score, guesses: s.guesses || {}, scores: s.scores || {} }),
    phase: "reveal",
    nextPhase: (s.judgeRound || 0) >= players.length * 2 ? "gameEnd" : "next",
  }), [players]);

  // Vote : on repart de la copie la plus récente de la base (deux jurés qui votent en même temps ne s'écrasent plus)
  const commitGuess = useCallback(async () => {
    const mine = myGuessRef.current;
    if(!mine || busyRef.current) return;
    busyRef.current = true;
    try {
      const fresh = (await fetchFresh()) || stateRef.current;
      if(fresh.phase !== "vote" || fresh.judgeRound !== mine.round) { apply(fresh); return; }
      const guesses = { ...(fresh.guesses || {}), [myUsername]: mine.value };
      let next = { ...fresh, guesses };
      if(players.filter(p => p !== fresh.judge).every(p => guesses[p] !== undefined)) next = revealState(next);
      apply(next);
      await pushState(next);
    } finally { busyRef.current = false; }
  }, [apply, fetchFresh, myUsername, players, pushState, revealState]);

  // Synchronisation (1,5 s) + renvoi automatique d'un vote écrasé
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status&limit=1`);
        const r = rows?.[0];
        if(!r?.state) return;
        const str = JSON.stringify(r.state);
        if(str !== lastStateRef.current) {
          lastStateRef.current = str;
          const prev = stateRef.current;
          apply(r.state);
          if(!prev || prev.judgeRound !== r.state.judgeRound) { setClue(""); setGuess(10); }
        }
        const cur = stateRef.current, mine = myGuessRef.current;
        if(mine && cur.phase === "vote" && cur.judgeRound === mine.round && cur.guesses?.[myUsername] === undefined) commitGuess();
      } catch { /* réseau : au prochain tour */ }
    }, 1500);
    return () => clearInterval(poll);
  }, [room.id, apply, commitGuess, myUsername]);

  // Compte des secondes sans aucune action (pour proposer de passer si quelqu'un est parti)
  useEffect(() => {
    const id = setInterval(() => setIdleSecs(Math.floor((Date.now() - lastChangeRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

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
    apply(newState);
    await pushState(newState);
    setSubmitting(false);
  };

  const submitGuess = async () => {
    if(submitting || state?.guesses?.[myUsername] !== undefined) return;
    setSubmitting(true);
    myGuessRef.current = { round: state.judgeRound, value: Number(guess) };
    await commitGuess();
    setSubmitting(false);
  };

  // Tour suivant : l'hôte, ou n'importe qui si l'hôte est resté inactif ; on relit d'abord la base (jamais deux tours d'avance)
  const nextTurn = async () => {
    if(!isHost && idleSecs < CLUE_IDLE_SECS) return;
    const fresh = (await fetchFresh()) || stateRef.current;
    if(fresh.phase !== "reveal") { apply(fresh); return; }
    if(fresh.nextPhase === "gameEnd") { await endGame({ ...fresh, phase: "gameEnd" }); return; }
    const next = buildNextTurn(fresh, players);
    apply(next);
    await pushState(next);
  };

  // Joueur absent : révéler avec les votes reçus, ou terminer la partie
  const forceAct = async (kind) => {
    const fresh = (await fetchFresh()) || stateRef.current;
    const cur = stateRef.current;
    if(fresh.judgeRound !== cur.judgeRound || fresh.phase !== cur.phase) { apply(fresh); return; }   // quelqu'un a déjà avancé
    if(kind !== "reveal") { await endGame({ ...fresh, phase: "gameEnd" }); return; }
    const next = revealState(fresh);
    apply(next);
    await pushState(next);
  };

  // Fin de partie : l'état final et la clôture de la salle (« finished ») s'écrivent EN UNE SEULE requête atomique.
  // (Deux requêtes séparées pouvaient s'inverser : la salle se fermait avant que l'écran de fin soit enregistré, et les autres
  // joueurs restaient bloqués sur la dernière manche.) Plus de partie fantôme : une salle terminée n'est plus « active ».
  const endGame = async (finalState) => {
    apply(finalState);
    await claimFinish(room.id, { winner: cluescaleWinnerPoints(finalState.scores).winner, state: finalState });
  };

  // Award pts_cluescale to the winner on game end — only once per game
  const awardedCluescaleRef = useRef(false);
  useEffect(() => {
    if(state?.phase !== "gameEnd" || awardedCluescaleRef.current) return;
    awardedCluescaleRef.current = true;
    const { winner, earned } = cluescaleWinnerPoints(state.scores);
    if(winner !== myUsername) return; // seul le vainqueur marque des points
    if(earned <= 0) return;
    sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`)
      .then(rows => {
        const row = rows?.[0];
        const patch = {
          pts_cluescale: (row?.pts_cluescale||0) + earned,
          points_total: (row?.points_total||0) + earned,
          updated_at: new Date().toISOString(),
        };
        if(row) {
          sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}`, {
            method:"PATCH", headers:{...sb.headers,"Prefer":"return=minimal"},
            body: JSON.stringify(patch),
          }).catch(()=>{});
        } else {
          sb.query("game_elo", {
            method:"POST", headers:{...sb.headers,"Prefer":"resolution=ignore-duplicates,return=minimal"},
            body: JSON.stringify({ username:myUsername, elo_chain:400, elo_timeline:400, ...patch }),
          }).catch(()=>{});
        }
      }).catch(()=>{});
  }, [state?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if(!state) return <div style={{padding:32,textAlign:"center"}}><div style={{fontSize:32}}>⏳</div><div style={{color:"var(--text-4)",fontSize:13,marginTop:8}}>Initialisation…</div></div>;

  const isJudge = state.judge === myUsername;
  const otherPlayers = players.filter(p => p !== state.judge);
  const idleBox = (idleSecs >= CLUE_IDLE_SECS && state.phase !== "gameEnd") ? (
    <div style={{margin:"0 0 14px",padding:"10px 14px",borderRadius:12,background:"rgba(249,115,22,0.08)",
      border:"1px solid rgba(249,115,22,0.3)",textAlign:"center"}}>
      <div style={{fontSize:11,color:ORANGE,fontWeight:700,marginBottom:8}}>{x.cluIdle}</div>
      <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
        {state.phase === "vote" && Object.keys(state.guesses||{}).length > 0 && (
          <button onClick={()=>forceAct("reveal")} style={{...BTN_PRIMARY,padding:"6px 12px",fontSize:11,borderRadius:8}}>{x.cluReveal}</button>
        )}
        <button onClick={()=>forceAct("end")}
          style={{padding:"6px 12px",fontSize:11,fontWeight:700,borderRadius:8,cursor:"pointer",
            border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.08)",color:RED}}>{x.cluEnd}</button>
      </div>
    </div>
  ) : null;

  // ── GAME END ──
  if(state.phase === "gameEnd") {
    const sorted = Object.entries(state.scores||{}).sort((a,b)=>b[1]-a[1]);
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
        {idleBox}
        {(isHost || idleSecs >= CLUE_IDLE_SECS) ? (
          <button onClick={nextTurn} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",
            background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,cursor:"pointer"}}>
            {state.nextPhase==="gameEnd"?"Voir les résultats 🏆":x.cluNext}
          </button>
        ) : (
          <div style={{textAlign:"center",fontSize:11,color:"var(--text-4)"}}>En attente de {players[0]} pour continuer…</div>
        )}
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
        {idleBox}

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
      {idleBox}

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
// Salon de 2 à 4 joueurs. Rejoindre = prise de place atomique (gameRooms.js), l'hôte « réveille » la salle toutes les 5 s
// (une salle sans réveil depuis 90 s n'accepte plus de code), et si l'hôte quitte le salon avant le début, la salle est supprimée.
export function CluescaleMatchmaking({ onMatch, onClose, initialRoom = null }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const x = GS_EXTRA[lang] || GS_EXTRA.fr;
  const [mode, setMode]       = useState(initialRoom ? "create" : null); // null | create | join  ("create" = salon d'attente)
  const [code, setCode]       = useState(initialRoom?.private_code || "");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [room, setRoom]       = useState(initialRoom);
  const [players, setPlayers] = useState(initialRoom ? roomPlayers(initialRoom) : []);
  const [busy, setBusy]       = useState(false);
  const roomRef    = useRef(initialRoom?.id || null);
  const startedRef = useRef(false);                     // la partie a commencé : ne rien supprimer en quittant
  const hostRef    = useRef(!!initialRoom && initialRoom.player1 === myUsername);

  // Quitter le salon avant le début : l'hôte supprime sa salle (les invités n'ont pas à la retrouver vide)
  useEffect(() => () => {
    if(!startedRef.current && hostRef.current && roomRef.current) deleteWaitingRoom(roomRef.current);
  }, []);

  const createRoom = async () => {
    if(busy) return;
    setBusy(true); setJoinError("");
    await deleteMyWaitingRooms(myUsername, "cluescale");              // anciennes salles restées ouvertes
    const c = newRoomCode();
    const created = await sb.query("game_rooms", {
      method:"POST",
      headers:{...sb.headers,"Prefer":"return=representation"},
      body:JSON.stringify({
        game_type:"cluescale", player1:myUsername, status:"waiting", ranked:false, private_code:c,
        state:{players:[myUsername]},
      }),
    }).catch(()=>null);
    setBusy(false);
    if(created?.[0]) {
      roomRef.current = created[0].id; hostRef.current = true;
      setCode(c); setRoom(created[0]); setPlayers([myUsername]); setMode("create");
    } else setJoinError(x.netError);
  };

  const joinRoom = async () => {
    if(busy) return;
    setBusy(true); setJoinError("");
    const res = await joinCluescaleRoom({ me: myUsername, code: cleanRoomCode(joinCode) });
    setBusy(false);
    if(!res.ok) { setJoinError(joinErrorText(res.reason, lang)); return; }
    roomRef.current = res.room.id; hostRef.current = res.room.player1 === myUsername;
    setRoom(res.room); setPlayers(res.room.players); setCode(res.room.private_code || cleanRoomCode(joinCode));
    if(res.room.status === "active") { startedRef.current = true; onMatch({ ...res.room, players: res.room.players }); return; }
    setMode("create"); // même écran de salon
  };

  // Hôte : réveille la salle pour qu'elle reste « fraîche »
  useEffect(() => {
    if(mode !== "create" || !room?.id || room.player1 !== myUsername) return;
    const id = setInterval(() => heartbeatRoom(room.id), HEARTBEAT_PRIVATE_MS);
    return () => clearInterval(id);
  }, [mode, room?.id, room?.player1, myUsername]);

  // Tous : suivre les joueurs qui arrivent, le lancement par l'hôte, ou la disparition de la salle
  useEffect(() => {
    if(mode !== "create" || !room?.id) return;
    const id = room.id;
    const poll = setInterval(async () => {
      const rows = await sb.query(`game_rooms?id=eq.${encodeURIComponent(id)}&limit=1`).catch(()=>null);
      if(rows === null) return;                                   // erreur réseau : on réessaie
      const r = rows[0];
      if(!r || r.status === "finished") {                         // l'hôte est parti
        clearInterval(poll); roomRef.current = null; hostRef.current = false;
        setRoom(null); setPlayers([]); setCode(""); setMode(null); setJoinError(x.cluRoomGone);
        return;
      }
      const pl = roomPlayers(r);
      setPlayers(pl);
      if(r.status === "active") {
        clearInterval(poll); startedRef.current = true;
        onMatch({ ...r, players: pl });
      }
    }, 1500);
    return () => clearInterval(poll);
  }, [mode, room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = async () => {
    if(busy) return;
    setBusy(true);
    // Liste des joueurs relue juste avant le lancement : un invité arrivé il y a une seconde n'est pas oublié
    const rows = await sb.query(`game_rooms?id=eq.${encodeURIComponent(roomRef.current)}&status=eq.waiting&limit=1`).catch(()=>null);
    const fresh = rows?.[0];
    const list = fresh ? roomPlayers(fresh) : players;
    if(!fresh || list.length < 2) { setBusy(false); if(!fresh && rows) setJoinError(x.cluRoomGone); return; }
    const initState = {
      phase: "clue",
      judgeRound: 1,
      judge: list[0],
      theme: pickRandom(CLUESCALE_THEMES),
      score: Math.floor(Math.random() * 20) + 1,
      clue: null,
      guesses: {},
      scores: Object.fromEntries(list.map(p=>[p,0])),
      history: [],
      players: list,
    };
    const started = await sb.query(`game_rooms?id=eq.${encodeURIComponent(roomRef.current)}&status=eq.waiting`, {
      method:"PATCH",
      headers:{...sb.headers,"Prefer":"return=representation"},
      body:JSON.stringify({ status:"active", state: initState, updated_at: new Date().toISOString() }),
    }).catch(()=>null);
    setBusy(false);
    if(started?.[0]) { startedRef.current = true; onMatch({ ...started[0], players: list }); }
    else setJoinError(x.netError);
  };

  if(!mode) return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:24,fontWeight:900,color:"var(--text-1)",marginBottom:8}}>🎭 Cluescale</div>
      <div style={{fontSize:12,color:"var(--text-4)",marginBottom:20}}>2 à 4 joueurs · Juge & Jury</div>
      <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:240,margin:"0 auto"}}>
        <button onClick={createRoom} disabled={busy}
          style={{opacity:busy?0.6:1,padding:"12px 20px",borderRadius:12,border:"none",
            background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>
          Créer une room
        </button>
        <button onClick={()=>{setJoinError("");setMode("join");}}
          style={{padding:"12px 20px",borderRadius:12,border:"2px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.04)",color:"var(--text-2)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          Rejoindre avec un code
        </button>
        <button onClick={onClose}
          style={{padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>
          Annuler
        </button>
        {joinError && <div style={{fontSize:11,color:"#ef4444"}}>{joinError}</div>}
      </div>
    </div>
  );

  if(mode === "join") return (
    <div style={{padding:32,textAlign:"center"}}>
      <div style={{fontSize:20,fontWeight:900,color:"var(--text-1)",marginBottom:16}}>Rejoindre une room</div>
      <input value={joinCode} onChange={e=>setJoinCode(cleanRoomCode(e.target.value))}
        placeholder="CODE" maxLength={6}
        style={{width:"100%",boxSizing:"border-box",padding:"12px 16px",borderRadius:12,
          background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",
          color:"var(--text-1)",fontSize:22,fontWeight:900,textAlign:"center",letterSpacing:6,
          outline:"none",marginBottom:8}}/>
      {joinError && <div style={{fontSize:11,color:"#ef4444",marginBottom:8}}>{joinError}</div>}
      <button onClick={joinRoom} disabled={busy||joinCode.length<4}
        style={{opacity:busy||joinCode.length<4?0.6:1,width:"100%",padding:"12px",borderRadius:12,border:"none",
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

      {isHost && room?.id && (
        <div style={{marginBottom:16,textAlign:"left"}}>
          <FriendInviteList myUsername={myUsername} gameType="cluescale" roomId={room.id} privateCode={code}/>
        </div>
      )}

      {isHost ? (
        <button onClick={startGame} disabled={players.length < 2 || busy}
          style={{width:"100%",padding:"12px",borderRadius:12,border:"none",
            background:players.length<2?"rgba(255,255,255,0.06)":"linear-gradient(135deg,#7c3aed,#4f46e5)",
            color:players.length<2?"var(--text-4)":"#fff",fontWeight:800,fontSize:13,
            cursor:players.length<2?"not-allowed":"pointer"}}>
          {players.length<2?"Attends encore un joueur…":"Lancer la partie 🚀"}
        </button>
      ) : (
        <div style={{fontSize:11,color:"var(--text-4)"}}>En attente que {players[0]} lance la partie…</div>
      )}
      <button onClick={onClose}
        style={{marginTop:12,padding:"8px",background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>
        {x.cluLeave}
      </button>
    </div>
  );
}


// ─── UNDERCOVER — pass-and-play on one device ─────────────────────────────────
// 3-6 players share the device: each one privately reveals their role, then
// everyone gives one-word clues for 2 rounds, then votes in turn. The crew
// shares the same secret word; the impostor only gets a vague hint. If the
// impostor is caught they get one last chance to guess the word.
// Only the signed-in account's points are saved (pts_undercover + points_total)
// — the other seats are just names typed in the lobby, not real accounts.
// Banque de mots (+ variantes d'écriture et indices FR/EN) : src/constants/undercoverWords.js ; règles testées : src/utils/undercoverRules.js
let undercoverRecent = [];   // derniers mots tirés pendant cette session : on évite de les retirer tout de suite
const UNDERCOVER_MIN = 3, UNDERCOVER_MAX = 6, UNDERCOVER_ROUNDS = 2, UNDERCOVER_GUESS_SECS = 30;

const ucInputStyle = {flex:1,padding:"9px 12px",borderRadius:10,fontSize:12,
  border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.04)",color:"var(--text-1)"};
const ucPrimaryBtn = {padding:"10px 18px",borderRadius:10,border:"none",fontWeight:800,fontSize:13,
  background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",cursor:"pointer"};

export function UndercoverLobby({ onStart }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).undercover;
  const [players, setPlayers] = useState([myUsername]);
  const [input, setInput]     = useState("");

  const addPlayer = () => {
    const name = input.trim().slice(0, 20);
    if(!name || players.some(p => p.toLowerCase() === name.toLowerCase()) || players.length >= UNDERCOVER_MAX) return;
    setPlayers(p => [...p, name]);
    setInput("");
  };

  const startGame = () => {
    if(players.length < UNDERCOVER_MIN) return;
    const entry = pickEntry(UNDERCOVER_WORDS, undercoverRecent);
    undercoverRecent = [...undercoverRecent, entry.word].slice(-12);
    const impostorIdx = Math.floor(Math.random() * players.length);
    onStart(players.map((username, i) => ({
      username,
      isImpostor: i === impostorIdx,
      word: i === impostorIdx ? null : entry.word,
      hint: i === impostorIdx ? (entry.hint[lang] || entry.hint.fr) : null,
    })));
  };

  const ready = players.length >= UNDERCOVER_MIN;
  return (
    <div style={{padding:24}}>
      <div style={{textAlign:"center",marginBottom:18}}>
        <div style={{fontSize:32,marginBottom:6}}>🕵️</div>
        <div style={{fontSize:16,fontWeight:900,color:"var(--text-1)",marginBottom:4}}>{t.title}</div>
        <div style={{fontSize:11,color:"var(--text-4)"}}>{t.subtitle(UNDERCOVER_MIN, UNDERCOVER_MAX)}</div>
      </div>
      <div style={{marginBottom:16}}>
        {players.map((p,i) => (
          <div key={p} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"8px 12px",borderRadius:10,
            background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)"}}>
            <span style={{fontSize:14}}>{i === 0 ? "👑" : "🎭"}</span>
            <span style={{fontSize:12,fontWeight:700,color:"var(--text-1)",flex:1}}>{p}</span>
            {i > 0 && <button onClick={()=>setPlayers(pl=>pl.filter(x=>x!==p))}
              style={{background:"none",border:"none",color:"var(--text-5)",cursor:"pointer",fontSize:16}}>×</button>}
          </div>
        ))}
        {players.length < UNDERCOVER_MAX && (
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPlayer()}
              placeholder={t.addPlaceholder} maxLength={20} style={ucInputStyle}/>
            <button onClick={addPlayer} style={{padding:"8px 14px",borderRadius:10,border:"none",
              background:"rgba(124,58,237,0.2)",color:"#c084fc",fontWeight:800,cursor:"pointer"}}>+</button>
          </div>
        )}
      </div>
      <button onClick={startGame} disabled={!ready} style={{...ucPrimaryBtn,width:"100%",padding:12,
        ...(ready ? {} : {background:"rgba(255,255,255,0.06)",color:"var(--text-4)",cursor:"not-allowed"})}}>
        {ready ? t.start : t.needMore(UNDERCOVER_MIN - players.length)}
      </button>
    </div>
  );
}

export function UndercoverGame({ players, onClose, onReplay }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = (GAME_SYSTEM_I18N[lang] || GAME_SYSTEM_I18N.fr).undercover;
  // phase: reveal → clues → vote → (guess) → result
  const [phase, setPhase]         = useState("reveal");
  const [revealIdx, setRevealIdx] = useState(0);
  const [revealed, setRevealed]   = useState(false);
  const [clues, setClues]         = useState([]); // [{username, word}]
  const [input, setInput]         = useState("");
  const [voteIdx, setVoteIdx]     = useState(0);
  const [votes, setVotes]         = useState({}); // voter → suspect
  const [guessInput, setGuessInput] = useState("");
  const [timer, setTimer]         = useState(UNDERCOVER_GUESS_SECS);
  const [result, setResult]       = useState(null);
  const finishedRef = useRef(false);

  const impostor  = players.find(p => p.isImpostor);
  const crewWord  = players.find(p => !p.isImpostor)?.word || "";
  const crewEntry = UNDERCOVER_WORDS.find(e => e.word === crewWord) || { word: crewWord, aliases: [] };
  const [clueError, setClueError] = useState("");
  const turnIdx   = clues.length;
  const current   = players[turnIdx % players.length];

  const finalize = useCallback((impostorFound, impostorGuessed) => {
    if(finishedRef.current) return;
    finishedRef.current = true;
    const pts = undercoverPoints(players, impostorFound, impostorGuessed);
    setResult({ impostorFound, impostorGuessed, pts });
    setPhase("result");
    // Save only the signed-in account's points
    const mine = pts[myUsername] || 0;
    if(mine > 0) {
      sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`).catch(()=>[]).then(rows => {
        const row = rows?.[0];
        const patch = {
          pts_undercover: (row?.pts_undercover || 0) + mine,
          points_total: (row?.points_total || 0) + mine,
          updated_at: new Date().toISOString(),
        };
        return row
          ? sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}`, {
              method:"PATCH", headers:{...sb.headers,"Prefer":"return=minimal"}, body:JSON.stringify(patch) })
          : sb.query("game_elo", {
              method:"POST", headers:{...sb.headers,"Prefer":"resolution=ignore-duplicates,return=minimal"},
              body:JSON.stringify({ username:myUsername, elo_chain:400, elo_timeline:400, ...patch }) });
      }).catch(()=>{});
    }
  }, [players, myUsername]);

  // Impostor's last-chance countdown (timer is reset when entering the phase)
  useEffect(() => {
    if(phase !== "guess") return;
    const id = setInterval(() => setTimer(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if(phase === "guess" && timer === 0) finalize(true, false);
  }, [phase, timer, finalize]);

  const nextReveal = () => {
    setRevealed(false);
    if(revealIdx + 1 >= players.length) setPhase("clues");
    else setRevealIdx(i => i + 1);
  };

  const submitClue = () => {
    const word = input.trim();
    if(!word) return;
    // Un membre de l'équipage ne peut pas dire le mot secret lui-même (l'imposteur, lui, ne le connaît pas : jamais bloqué)
    if(!current.isImpostor && isClueForbidden(word, crewEntry)) { setClueError(GS_EXTRA[lang]?.ucForbidden || GS_EXTRA.fr.ucForbidden); return; }
    setClueError("");
    const next = [...clues, { username: current.username, word }];
    setClues(next);
    setInput("");
    if(next.length >= players.length * UNDERCOVER_ROUNDS) setPhase("vote");
  };

  const castVote = (suspect) => {
    const voter = players[voteIdx].username;
    const next = { ...votes, [voter]: suspect };
    setVotes(next);
    if(voteIdx + 1 < players.length) { setVoteIdx(i => i + 1); return; }
    // Tout le monde a voté : l'imposteur n'est démasqué que s'il est seul en tête
    if(tallyVotes(next, impostor.username).impostorFound) { setTimer(UNDERCOVER_GUESS_SECS); setPhase("guess"); }
    else finalize(false, false);
  };

  const submitGuess = () => {
    finalize(true, isGuessCorrect(guessInput, crewEntry));
  };

  const cluesByPlayer = (
    <div style={{marginBottom:12}}>
      {players.map(p => {
        const pw = clues.filter(c => c.username === p.username);
        return (
          <div key={p.username} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:10,color:"var(--text-4)",minWidth:70,fontWeight:700}}>{p.username}</span>
            {pw.map((c,i) => <span key={i} style={{fontSize:11,padding:"2px 8px",borderRadius:20,
              background:"rgba(124,58,237,0.15)",color:"var(--text-1)"}}>{c.word}</span>)}
          </div>
        );
      })}
    </div>
  );

  if(phase === "reveal") {
    const p = players[revealIdx];
    return (
      <div style={{padding:28,textAlign:"center"}}>
        {!revealed ? (
          <>
            <div style={{fontSize:32,marginBottom:10}}>📱</div>
            <div style={{fontSize:16,fontWeight:900,color:"var(--text-1)",marginBottom:6}}>{t.passTo(p.username)}</div>
            <div style={{fontSize:11,color:"var(--text-4)",marginBottom:20}}>{t.passHint}</div>
            <button onClick={()=>setRevealed(true)} style={ucPrimaryBtn}>{t.reveal}</button>
          </>
        ) : (
          <>
            <div style={{marginBottom:20,padding:"16px 14px",borderRadius:14,
              background:p.isImpostor?"rgba(239,68,68,0.1)":"rgba(124,58,237,0.1)",
              border:`1px solid ${p.isImpostor?"rgba(239,68,68,0.3)":"rgba(124,58,237,0.3)"}`}}>
              {p.isImpostor ? (
                <>
                  <div style={{fontSize:10,fontWeight:800,color:RED,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{t.youAreImpostor}</div>
                  <div style={{fontSize:13,color:"var(--text-3)"}}>{t.yourHint} <strong style={{color:"#fbbf24"}}>{p.hint}</strong></div>
                </>
              ) : (
                <>
                  <div style={{fontSize:10,fontWeight:800,color:"#c084fc",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{t.yourWord}</div>
                  <div style={{fontSize:22,fontWeight:900,color:"var(--text-1)"}}>{p.word}</div>
                </>
              )}
            </div>
            <button onClick={nextReveal} style={ucPrimaryBtn}>{t.memorized}</button>
          </>
        )}
      </div>
    );
  }

  if(phase === "clues") return (
    <div style={{padding:24}}>
      {clues.length > 0 && cluesByPlayer}
      <div style={{textAlign:"center",fontSize:11,color:"var(--text-4)",marginBottom:10}}>
        {t.round(Math.floor(turnIdx / players.length) + 1, UNDERCOVER_ROUNDS, current.username)}
      </div>
      <div style={{display:"flex",gap:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submitClue()}
          placeholder={t.wordPlaceholder} maxLength={30} autoFocus
          style={{...ucInputStyle,border:"1px solid rgba(124,58,237,0.4)",background:"rgba(124,58,237,0.08)"}}/>
        <button onClick={submitClue} style={ucPrimaryBtn}>{t.ok}</button>
      </div>
      {clueError && <div style={{marginTop:8,fontSize:11,color:RED,textAlign:"center"}}>{clueError}</div>}
    </div>
  );

  if(phase === "vote") {
    const voter = players[voteIdx];
    return (
      <div style={{padding:24}}>
        <div style={{textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:900,color:"var(--text-1)"}}>{t.whoIsImpostor}</div>
          <div style={{fontSize:10,color:"var(--text-5)",marginTop:2}}>{t.votedCount(voteIdx, players.length)}</div>
        </div>
        {cluesByPlayer}
        <div style={{fontSize:12,fontWeight:800,color:"#c084fc",textAlign:"center",marginBottom:8}}>{t.voteTurn(voter.username)}</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {players.filter(p => p.username !== voter.username).map(p => (
            <button key={p.username} onClick={()=>castVote(p.username)}
              style={{padding:10,borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",
                background:"rgba(255,255,255,0.04)",color:"var(--text-1)",cursor:"pointer",fontSize:12,fontWeight:700}}>
              {p.username}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if(phase === "guess") return (
    <div style={{padding:28,textAlign:"center"}}>
      <div style={{fontSize:14,fontWeight:900,color:RED,marginBottom:8}}>{t.impostorCaught}</div>
      <div style={{fontSize:13,color:"var(--text-3)",marginBottom:8}}>{t.guessPrompt(impostor.username, UNDERCOVER_GUESS_SECS)}</div>
      <div style={{fontSize:36,fontWeight:900,color:timer<=10?RED:"#fbbf24",marginBottom:16}}>{timer}s</div>
      <div style={{display:"flex",gap:8}}>
        <input value={guessInput} onChange={e=>setGuessInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submitGuess()}
          placeholder={t.guessPlaceholder} autoFocus style={ucInputStyle}/>
        <button onClick={submitGuess} style={ucPrimaryBtn}>{t.ok}</button>
      </div>
    </div>
  );

  // result
  return (
    <div style={{padding:28,textAlign:"center"}}>
      <div style={{fontSize:36,marginBottom:8}}>{result.impostorFound ? (result.impostorGuessed ? "🤔" : "🎉") : "😈"}</div>
      <div style={{fontSize:17,fontWeight:900,color:"var(--text-1)",marginBottom:4}}>
        {result.impostorFound ? (result.impostorGuessed ? t.resultGuessed : t.resultCaught) : t.resultEscaped}
      </div>
      <div style={{fontSize:12,color:"var(--text-4)",marginBottom:16}}>
        {t.secretWord} <strong style={{color:"#c084fc"}}>{crewWord}</strong>
        {" · "}{t.impostor} <strong style={{color:RED}}>{impostor.username}</strong>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:8}}>
        {Object.entries(result.pts).map(([u,p]) => (
          <div key={u} style={{display:"flex",justifyContent:"space-between",padding:"6px 12px",borderRadius:8,background:"rgba(255,255,255,0.04)"}}>
            <span style={{fontSize:12,fontWeight:700,color:"var(--text-1)"}}>{u}</span>
            <span style={{fontSize:12,fontWeight:900,color:GREEN}}>{t.pts(p)}</span>
          </div>
        ))}
      </div>
      <div style={{fontSize:10,color:"var(--text-5)",marginBottom:18}}>{t.yourPointsNote}</div>
      <div style={{display:"flex",gap:8,justifyContent:"center"}}>
        {onReplay && <button onClick={onReplay} style={{...ucPrimaryBtn,background:"rgba(124,58,237,0.2)",color:"#c084fc"}}>{t.replay}</button>}
        <button onClick={onClose} style={ucPrimaryBtn}>{t.close}</button>
      </div>
    </div>
  );
}
