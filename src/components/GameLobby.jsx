// ─── SALONS — Matchmaking (Chain / Timeline), salon de Cluescale et d'Imposteur, invitations d'amis ──────────────
// Un seul système pour tous les jeux à plusieurs : choisir un mode, créer un salon (code + invitations d'amis) ou rejoindre
// avec un code. Garanties (voir src/utils/gameRooms.js) : une place ne se prend qu'une fois (prise atomique côté base), une
// salle qui attend est « réveillée » en continu (sans réveil depuis 25 s / 90 s elle est ignorée), et ce client ne supprime
// que SA salle en attente — jamais celle d'un autre.
import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { sb, supabase, gameInvites } from "../api/supabase.js";
import { Spinner } from "./Spinner.jsx";
import {
  GameRoot, Btn, Bubble, Radar, Dots, Eyebrow, Note, LobbyHeader, ModeCard, Meter, CodeBox, CodeInput, Seat, GOOD,
} from "./gameUi.jsx";
import { useGameText } from "../hooks/useGameUi.js";
import { AI_LEVELS } from "../utils/gameRules.js";
import { aiRecordFor } from "../utils/aiRecord.js";
import { UNDERCOVER_WORDS } from "../constants/undercoverWords.js";
import { pickEntry } from "../utils/undercoverRules.js";
import { ucInit, UC_MIN_ONLINE } from "../utils/undercoverOnline.js";
import { cluescaleInitialState } from "../utils/cluescaleState.js";
import {
  RANKED_FRESH_MS, HEARTBEAT_PRIVATE_MS, MULTI_MAX, agoIso, claimSeat, heartbeatRoom, deleteWaitingRoom, deleteMyWaitingRooms,
  getOrCreateElo, claimFinish, newRoomCode, cleanRoomCode, joinPrivateRoom, joinMultiRoom, createMultiRoom, joinErrorText, roomPlayers,
} from "../utils/gameRooms.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const aiRoomId = () => "ai-" + Date.now();          // identifiant d'une partie contre l'IA (jamais envoyée à la base)
const AI_NAMES = { easy: "Kōhai", medium: "Sempai", hard: "Sensei" };
const AI_ICONS = { easy: "🐣", medium: "🎌", hard: "🧠" };
const AI_TONES = { easy: "34,197,94", medium: "245,158,11", hard: "239,68,68" };
const GAME_ICONS = { chain: "⛓", timeline: "📅" };

// ─── Inviter un ami dans un salon ───────────────────────────────────────────────────────────────────────────────
export function FriendInviteList({ myUsername, gameType, roomId, privateCode }) {
  const { g } = useGameText();
  const t = g.friends;
  const [friends, setFriends] = useState([]);        // [{ name, mutual }]
  const [status, setStatus]   = useState({});        // pseudo → "sending" | "sent" | "error"
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("");

  useEffect(() => {
    if (!myUsername) return;
    let alive = true;
    Promise.all([
      sb.query(`follows?follower=eq.${encodeURIComponent(myUsername)}&select=following`).catch(() => []),
      sb.query(`follows?following=eq.${encodeURIComponent(myUsername)}&select=follower`).catch(() => []),
    ]).then(([following, followers]) => {
      if (!alive) return;
      const followingSet = new Set((following || []).map((r) => r.following));
      const followerSet  = new Set((followers || []).map((r) => r.follower));
      const all = [...new Set([...followingSet, ...followerSet])].filter((u) => u && u !== myUsername);
      const list = all.map((name) => ({ name, mutual: followingSet.has(name) && followerSet.has(name) }))
        .sort((a, b) => (b.mutual - a.mutual) || a.name.localeCompare(b.name));
      setFriends(list);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [myUsername]);

  const invite = async (toUser) => {
    setStatus((s) => ({ ...s, [toUser]: "sending" }));
    try { await gameInvites.send(myUsername, toUser, gameType, roomId, privateCode); setStatus((s) => ({ ...s, [toUser]: "sent" })); }
    catch { setStatus((s) => ({ ...s, [toUser]: "error" })); }
  };

  const shown = filter.trim() ? friends.filter((f) => f.name.toLowerCase().includes(filter.trim().toLowerCase())) : friends;
  return (
    <div>
      <Eyebrow style={{ marginBottom: 8 }}>{t.title}</Eyebrow>
      {loading ? <div style={{ textAlign: "center", padding: 10 }}><Spinner /></div>
        : !friends.length ? <Note tone="info">{t.noFriends}</Note>
        : (
          <>
            {friends.length > 6 && <input className="gm-input" style={{ marginBottom: 8, padding: "9px 12px", fontSize: 13 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.search} />}
            <div className="gm-scroll" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 214, paddingRight: 2 }}>
              {shown.map((f) => {
                const st = status[f.name];
                return (
                  <div key={f.name} className="gm-seat" style={{ padding: "7px 10px" }}>
                    <Bubble name={f.name} size={30} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{f.name}</span>
                    {f.mutual && <span className="gm-tag" style={{ "--tone": "34,197,94" }}>{t.mutual}</span>}
                    <Btn variant={st === "sent" ? "ghost" : st === "error" ? "warn" : "soft"} size="sm" disabled={st === "sent" || st === "sending"} onClick={() => invite(f.name)}>
                      {st === "sent" ? t.sent : st === "sending" ? <Dots /> : st === "error" ? t.retry : t.invite}
                    </Btn>
                  </div>
                );
              })}
              {!shown.length && <Note tone="info">{t.noMatch}</Note>}
            </div>
          </>
        )}
    </div>
  );
}

// ─── Briques communes des salons ──────────────────────────────────────────────────────────────────────────────────
/** « Créer un salon » ou « Rejoindre avec un code » sur un seul écran. */
function FriendEntry({ g, onCreate, creating, code, onCode, onJoin, joining, error }) {
  const f = g.friends;
  return (
    <div className="gm-rise">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
        <div className="gm-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 26 }} aria-hidden="true">✨</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>{f.createTitle}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45, flex: 1 }}>{f.createDesc}</div>
          <Btn variant="primary" block onClick={onCreate} disabled={creating}>{creating ? <Dots /> : f.createBtn}</Btn>
        </div>
        <div className="gm-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 26 }} aria-hidden="true">🔑</div>
          <div style={{ fontSize: 16, fontWeight: 900 }}>{f.joinTitle}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45 }}>{f.joinDesc}</div>
          <CodeInput value={code} onChange={(v) => onCode(cleanRoomCode(v))} onSubmit={onJoin} placeholder={f.codePlaceholder} error={!!error} aria-label={f.joinTitle} />
          <Btn variant="soft" block onClick={onJoin} disabled={joining || code.length < 4}>{joining ? <Dots /> : f.joinBtn}</Btn>
        </div>
      </div>
      {error ? <Note tone="bad" style={{ marginTop: 12 }}>{error}</Note> : null}
    </div>
  );
}

/** Salon d'attente : code à partager, places, invitations d'amis, bouton de lancement. */
function RoomLobby({ g, icon, title, subtitle, code, players, max, me, invite, footer, onLeave, leaveLabel, tone }) {
  const f = g.friends;
  const seats = Array.from({ length: max }, (_, i) => players[i] || null);
  return (
    <div className="gm-rise">
      <LobbyHeader icon={icon} title={title} subtitle={subtitle} tone={tone} />
      <div className="gm-card" style={{ padding: "18px 14px 14px", marginBottom: 14, textAlign: "center" }}>
        <Eyebrow style={{ marginBottom: 12 }}>{f.codeLabel}</Eyebrow>
        <CodeBox code={code} copyLabel={g.common.copy} copiedLabel={g.common.copied} />
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-3)" }}>{f.codeHint}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, alignItems: "start" }}>
        <div>
          <Eyebrow style={{ marginBottom: 8 }}>{f.players(players.length, max)}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {seats.map((p, i) => <Seat key={i} name={p} you={p === me} host={i === 0 && !!p} youLabel={g.common.you} hostLabel={g.common.host} emptyLabel={f.waitingSeat} />)}
          </div>
        </div>
        {invite ? <div>{invite}</div> : null}
      </div>
      {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
      <div style={{ textAlign: "center", marginTop: 8 }}><Btn variant="ghost" size="sm" onClick={onLeave}>{leaveLabel}</Btn></div>
    </div>
  );
}

function VersusSplash({ g, room, me, label }) {
  const isP1 = room.player1 === me;
  const opp = isP1 ? room.player2 : room.player1;
  const showElo = !room._isAI && room.ranked !== false && !room.private_code;
  const side = (name, elo) => (
    <div style={{ textAlign: "center", minWidth: 0, maxWidth: 140 }} className="gm-pop">
      <Bubble name={name} size={68} />
      <div style={{ marginTop: 8, fontSize: 14, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
      {showElo && elo ? <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-3)" }}>ELO {elo}</div> : <div style={{ height: 15 }} />}
    </div>
  );
  return (
    <div style={{ textAlign: "center", padding: "26px 8px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        {side(me, isP1 ? room.elo1 : room.elo2)}
        <div className="gm-pop" style={{ fontSize: 30, fontWeight: 900, letterSpacing: ".05em", background: "linear-gradient(135deg,#6d5bff,#ec4899)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", animationDelay: ".15s" }}>VS</div>
        {side(opp, isP1 ? room.elo2 : room.elo1)}
      </div>
      <div style={{ marginTop: 22, fontSize: 17, fontWeight: 900, color: GOOD }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 12, color: "var(--text-3)" }}>{g.common.starting}</div>
    </div>
  );
}

// ─── MATCHMAKING (Chain / Timeline) ──────────────────────────────────────────────────────────────────────────────────
// `footer` (optionnel) : bloc affiché sous les trois modes sur l'écran d'accueil (ex. le classement ELO du jeu).
export function Matchmaking({ gameType, onMatch, footer = null }) {
  const { myUsername } = useApp();
  const { lang, g } = useGameText();
  const eloField = gameType === "chain" ? "elo_chain" : "elo_timeline";
  const [mode, setMode]           = useState(null);        // null | ranked | ai | friends | private-create
  const [status, setStatus]       = useState("searching"); // searching | found | error
  const [waitTime, setWaitTime]   = useState(0);
  const [myElo, setMyElo]         = useState(null);
  const [privateCode, setPrivateCode] = useState("");
  const [myRoomId, setMyRoomId]   = useState(null);
  const [joinCode, setJoinCode]   = useState("");
  const [joinError, setJoinError] = useState("");
  const [busy, setBusy]           = useState(false);
  const [retryKey, setRetryKey]   = useState(0);
  const [foundRoom, setFoundRoom] = useState(null);
  const ownRoomRef = useRef(null);   // ma salle qui attend un adversaire (à supprimer si je pars)
  const subsRef    = useRef([]);     // canaux temps réel ouverts
  const timersRef  = useRef([]);     // délais en cours (ouverture de la partie)
  const matchedRef = useRef(false);

  const stopSubs = () => { subsRef.current.forEach((c) => supabase.removeChannel(c)); subsRef.current = []; };
  const leave = () => {
    stopSubs();
    timersRef.current.forEach(clearTimeout); timersRef.current = [];
    const id = ownRoomRef.current; ownRoomRef.current = null;
    if (id && !matchedRef.current) deleteWaitingRoom(id);
  };
  const matched = (room, delay = 1200) => {
    if (matchedRef.current) return;
    matchedRef.current = true;
    ownRoomRef.current = null;
    stopSubs();
    setFoundRoom(room);
    setStatus("found");
    timersRef.current.push(setTimeout(() => onMatch(room), delay));
  };
  const leaveRoom = () => { leave(); setMyRoomId(null); setPrivateCode(""); setMode("friends"); };
  // Fermeture de la fenêtre sans passer par « Annuler » : on retire quand même ma salle
  useEffect(() => leave, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mon ELO, affiché dès l'accueil
  useEffect(() => {
    let alive = true;
    getOrCreateElo(myUsername).then((e) => { if (alive) setMyElo(e[eloField] || 400); }).catch(() => {});
    return () => { alive = false; };
  }, [myUsername, eloField]);

  // ── CLASSÉ ──────────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "ranked") return;
    let cancelled = false, working = false, waited = 0, myRoom = null, myEloVal = 400;
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
        .filter((r) => Math.abs((r.elo1 || 400) - myEloVal) <= range)
        .filter((r) => !myRoom || r.created_at < myRoom.created_at || (r.created_at === myRoom.created_at && String(r.id) < String(myRoom.id)))
        .sort((a, b) => Math.abs((a.elo1 || 400) - myEloVal) - Math.abs((b.elo1 || 400) - myEloVal));
    };
    const tryClaim = async (range) => {
      for (const cand of await findCandidates(range)) {
        const claimed = await claimSeat(cand.id, { player2: myUsername, elo2: myEloVal, status: "active" });
        if (claimed) return claimed;
      }
      return null;
    };

    const host = async () => {
      if (cancelled) return;
      const created = await sb.query("game_rooms", {
        method: "POST", headers: { ...sb.headers, Prefer: "return=representation" },
        body: JSON.stringify({ game_type: gameType, player1: myUsername, elo1: myEloVal, status: "waiting", state: {}, ranked: true, updated_at: new Date().toISOString() }),
      }).catch(() => null);
      myRoom = created?.[0];
      if (!myRoom) { if (!cancelled) setStatus("error"); return; }
      if (cancelled) { deleteWaitingRoom(myRoom.id); return; }
      ownRoomRef.current = myRoom.id;
      const roomId = myRoom.id;
      // Temps réel (rapide) + sondage (filet de sécurité)
      stopSubs();
      subsRef.current.push(supabase.channel(`room_${roomId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
          (p) => { const r = p.new; if (r.status === "active" && r.player2 && !cancelled) { stopLocal(); matched(r, 1300); } })
        .subscribe());
      ids.push(setInterval(async () => {
        if (cancelled || working) return;
        working = true;
        try {
          const rows = await sb.query(`game_rooms?id=eq.${roomId}&limit=1`).catch(() => null);
          if (rows === null) return;                          // erreur réseau passagère : on réessaie au prochain tour
          const r = rows[0];
          if (!r || r.status === "finished") {                // ma salle a disparu (nettoyage, abandon) : j'en recrée une
            stopLocal(); ownRoomRef.current = null; await host(); return;
          }
          if (r.status === "active" && r.player2) { stopLocal(); matched(r, 1200); return; }
          heartbeatRoom(roomId);                             // « je suis toujours là » : la salle reste visible
          waited += 2; setWaitTime(waited);
          const cands = await findCandidates(Math.min(50 + waited * 5, 400));
          if (!cands.length || cancelled) return;
          // 1) je retire ma salle (atomique : échoue si quelqu'un vient de la prendre), 2) je prends celle d'un autre
          const gone = await sb.query(`game_rooms?id=eq.${roomId}&status=eq.waiting`, { method: "DELETE", headers: { ...sb.headers, Prefer: "return=representation" } }).catch(() => null);
          if (!gone?.[0]) {                                   // quelqu'un m'a rejoint pile à ce moment : c'est ma partie
            const again = await sb.query(`game_rooms?id=eq.${roomId}&limit=1`).catch(() => []);
            if (again?.[0]?.status === "active" && again[0].player2) { stopLocal(); matched(again[0], 1200); }
            return;
          }
          ownRoomRef.current = null; stopLocal(); stopSubs();
          let claimed = null;
          for (const cand of cands) {
            claimed = await claimSeat(cand.id, { player2: myUsername, elo2: myEloVal, status: "active" });
            if (claimed) break;
          }
          if (cancelled) { if (claimed) claimFinish(claimed.id); return; }
          if (claimed) matched(claimed, 1200); else await host(); // tous pris entre-temps : je me remets en attente
        } finally { working = false; }
      }, 2000));
    };

    (async () => {
      setStatus("searching"); setWaitTime(0);
      const elo = await getOrCreateElo(myUsername);
      myEloVal = elo[eloField] || 400;
      setMyElo(myEloVal);
      await deleteMyWaitingRooms(myUsername, gameType);      // mes anciennes salles oubliées (onglet fermé, plantage…)
      await sleep(Math.random() * 800);                       // évite que tout le monde crée sa salle au même instant
      if (cancelled) return;
      const claimed = await tryClaim(400);                    // d'abord : rejoindre quelqu'un qui attend déjà
      if (claimed) { if (cancelled) { claimFinish(claimed.id); return; } matched(claimed, 1200); return; }
      await host();
    })();

    return () => { cancelled = true; stopLocal(); leave(); };
  }, [mode, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ENTRE AMIS : créer un salon ─────────────────────────────────────────────────────────────────────────────────────
  const createPrivateRoom = async () => {
    if (busy) return;
    setBusy(true); setJoinError("");
    await deleteMyWaitingRooms(myUsername, gameType);
    const code = newRoomCode();
    const created = await sb.query("game_rooms", {
      method: "POST", headers: { ...sb.headers, Prefer: "return=representation" },
      body: JSON.stringify({ game_type: gameType, player1: myUsername, elo1: myElo || 400, status: "waiting", state: {}, ranked: false, private_code: code, updated_at: new Date().toISOString() }),
    }).catch(() => null);
    setBusy(false);
    const myRoom = created?.[0];
    if (!myRoom) { setJoinError(g.common.netError); return; }
    ownRoomRef.current = myRoom.id;
    setPrivateCode(code);
    setMyRoomId(myRoom.id);
    setMode("private-create");
  };
  useEffect(() => {
    if (mode !== "private-create" || !myRoomId) return;
    let ticks = 0, working = false;
    const roomId = myRoomId;
    const sub = supabase.channel(`room_${roomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        (p) => { const r = p.new; if (r.status === "active" && r.player2) matched(r, 1200); })
      .subscribe();
    subsRef.current.push(sub);
    const id = setInterval(async () => {
      if (working) return; working = true;
      try {
        const rows = await sb.query(`game_rooms?id=eq.${roomId}&limit=1`).catch(() => null);
        if (rows === null) return;
        const r = rows[0];
        if (!r || r.status === "finished") { ownRoomRef.current = null; setJoinError(g.common.roomGone); setMyRoomId(null); setMode("friends"); return; }
        if (r.status === "active" && r.player2) { matched(r, 1200); return; }
        if (++ticks % 2 === 0) heartbeatRoom(roomId);          // toutes les 4 s : la salle privée reste « fraîche »
      } finally { working = false; }
    }, 2000);
    return () => { clearInterval(id); supabase.removeChannel(sub); subsRef.current = subsRef.current.filter((c) => c !== sub); };
  }, [mode, myRoomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ENTRE AMIS : rejoindre avec un code ───────────────────────────────────────────────────────────────────────────────
  const joinPrivate = async () => {
    if (busy || joinCode.length < 4) return;
    setBusy(true); setJoinError("");
    const res = await joinPrivateRoom({ code: joinCode, gameType, me: myUsername });
    setBusy(false);
    if (res.ok) { matched(res.room, 1200); return; }
    setJoinError(res.reason === "invalid" ? g.friends.errInvalidCode : res.reason === "own" ? g.friends.errOwnRoom : joinErrorText(res.reason, lang));
  };

  // ── CONTRE L'IA ────────────────────────────────────────────────────────────────────────────────────────────────────
  const startAI = (level) => {
    matched({
      id: aiRoomId(), game_type: gameType, player1: myUsername, player2: `🤖 ${AI_NAMES[level]}`,
      elo1: myElo || 400, elo2: 400, status: "active", ranked: false, _isAI: true, _aiDiff: level,
    }, 1100);
  };

  // ── ÉCRANS ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const gameName = g.lobby.gameName[gameType];
  const header = (subtitle) => (
    <LobbyHeader icon={GAME_ICONS[gameType]} title={gameName} subtitle={subtitle}
      chip={myElo ? <span className="gm-tag" style={{ "--tone": "167,139,250", fontSize: 11 }}>{g.lobby.eloChip(myElo)}</span> : null} />
  );
  const back = (to = null) => (
    <div style={{ marginBottom: 12 }}><Btn variant="ghost" size="sm" onClick={() => { setJoinError(""); setMode(to); }}>← {g.common.back}</Btn></div>
  );

  let body;
  if (status === "found" && foundRoom) {
    body = <VersusSplash g={g} room={foundRoom} me={myUsername} label={foundRoom._isAI ? g.lobby.aiReady : mode === "friends" || mode === "private-create" ? g.lobby.connected : g.lobby.opponentFound} />;
  } else if (!mode) {
    body = (
      <div className="gm-rise">
        {header(g.lobby.intro[gameType])}
        {joinError ? <Note tone="warn" style={{ marginBottom: 12 }}>{joinError}</Note> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <ModeCard icon="🏆" tone="139,92,246" title={g.lobby.ranked} desc={g.lobby.rankedDesc} tag={g.lobby.rankedTag} onClick={() => { setJoinError(""); setMode("ranked"); }} />
          <ModeCard icon="🤝" tone="34,211,238" title={g.lobby.friends} desc={g.lobby.friendsDesc} tag={g.lobby.friendsTag} onClick={() => { setJoinError(""); setMode("friends"); }} />
          <ModeCard icon="🤖" tone="251,191,36" title={g.lobby.ai} desc={g.lobby.aiDesc} tag={g.lobby.aiTag} onClick={() => setMode("ai")} />
        </div>
        {footer ? <div style={{ marginTop: 22 }}>{footer}</div> : null}
      </div>
    );
  } else if (mode === "ranked") {
    body = status === "error" ? (
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>⚠️</div>
        <Note tone="bad" style={{ marginBottom: 14 }}>{g.common.netError}</Note>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <Btn onClick={() => setRetryKey((k) => k + 1)}>{g.common.retry}</Btn>
          <Btn variant="soft" onClick={() => setMode(null)}>{g.common.cancel}</Btn>
        </div>
      </div>
    ) : (
      <div style={{ textAlign: "center", padding: "6px 0 0" }} className="gm-rise">
        <Radar icon={GAME_ICONS[gameType]} />
        <div style={{ marginTop: 12, fontSize: 18, fontWeight: 900 }}>{g.lobby.searching}<Dots /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", margin: "12px 0 6px" }}>
          {myElo ? <span className="gm-tag" style={{ "--tone": "167,139,250" }}>{g.lobby.eloChip(myElo)}</span> : null}
          <span className="gm-tag" style={{ "--tone": "34,211,238" }}>{waitTime > 0 ? g.lobby.range(waitTime, Math.min(50 + waitTime * 5, 400)) : g.lobby.connecting}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 18 }}>{g.lobby.rangeHint}</div>
        <Btn variant="soft" onClick={() => setMode(null)}>{g.common.cancel}</Btn>
      </div>
    );
  } else if (mode === "ai") {
    body = (
      <div className="gm-rise">
        {back(null)}
        {header(g.lobby.aiPick)}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          {AI_LEVELS.map((lv) => {
            const rec = aiRecordFor(gameType, lv);
            const played = rec.w + rec.l + rec.d;
            return (
              <ModeCard key={lv} icon={AI_ICONS[lv]} tone={AI_TONES[lv]} title={`${AI_NAMES[lv]} · ${g.lobby.levelName[lv]}`} desc={g.lobby.aiPersonality[gameType][lv]}
                onClick={() => startAI(lv)}
                extra={<><Meter value={AI_LEVELS.indexOf(lv) + 1} tone={AI_TONES[lv]} />{played ? <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-2)" }}>{g.lobby.record(rec)}</span> : null}</>} />
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>{g.lobby.aiNote}</div>
      </div>
    );
  } else if (mode === "friends") {
    body = (
      <div>
        {back(null)}
        {header(g.lobby.friendsIntro)}
        <FriendEntry g={g} onCreate={createPrivateRoom} creating={busy} code={joinCode} onCode={setJoinCode} onJoin={joinPrivate} joining={busy} error={joinError} />
      </div>
    );
  } else {   // private-create
    body = (
      <RoomLobby g={g} icon={GAME_ICONS[gameType]} title={g.friends.lobbyTitle(gameName)} subtitle={g.friends.lobbyDuelSubtitle}
        code={privateCode} players={[myUsername]} max={2} me={myUsername}
        invite={<FriendInviteList myUsername={myUsername} gameType={gameType} roomId={myRoomId} privateCode={privateCode} />}
        onLeave={leaveRoom} leaveLabel={g.friends.leaveRoom} />
    );
  }

  return <GameRoot style={{ padding: 22 }}>{body}</GameRoot>;
}

// ─── SALON À PLUSIEURS (Cluescale, Imposteur en ligne) ───────────────────────────────────────────────────────────────
// 2 à 4 joueurs. Rejoindre = prise de place atomique (gameRooms.js), l'hôte « réveille » la salle toutes les 5 s (une salle sans
// réveil depuis 90 s n'accepte plus de code), et si l'hôte quitte le salon avant le début, la salle est supprimée.
function PartyLobby({ gameType, icon, title, subtitle, tone, minPlayers, buildState, onMatch, onClose, initialRoom = null, intro = null }) {
  const { myUsername } = useApp();
  const { lang, g } = useGameText();
  const [mode, setMode]       = useState(initialRoom ? "lobby" : null);   // null = écran d'entrée ; "lobby" = salon d'attente
  const [code, setCode]       = useState(initialRoom?.private_code || "");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [room, setRoom]       = useState(initialRoom);
  const [players, setPlayers] = useState(initialRoom ? roomPlayers(initialRoom) : []);
  const [busy, setBusy]       = useState(false);
  const roomRef    = useRef(initialRoom?.id || null);
  const startedRef = useRef(false);                     // la partie a commencé : ne rien supprimer en quittant
  const hostRef    = useRef(!!initialRoom && initialRoom.player1 === myUsername);
  const max = MULTI_MAX[gameType] || 4;

  // Quitter le salon avant le début : l'hôte supprime sa salle (les invités n'ont pas à la retrouver vide)
  useEffect(() => () => {
    if (!startedRef.current && hostRef.current && roomRef.current) deleteWaitingRoom(roomRef.current);
  }, []);

  const createRoom = async () => {
    if (busy) return;
    setBusy(true); setJoinError("");
    const res = await createMultiRoom({ gameType, me: myUsername });
    setBusy(false);
    if (!res) { setJoinError(g.common.netError); return; }
    roomRef.current = res.room.id; hostRef.current = true;
    setCode(res.code); setRoom(res.room); setPlayers([myUsername]); setMode("lobby");
  };

  const joinRoom = async () => {
    if (busy || joinCode.length < 4) return;
    setBusy(true); setJoinError("");
    const res = await joinMultiRoom({ gameType, me: myUsername, code: cleanRoomCode(joinCode) });
    setBusy(false);
    if (!res.ok) { setJoinError(joinErrorText(res.reason, lang)); return; }
    roomRef.current = res.room.id; hostRef.current = res.room.player1 === myUsername;
    setRoom(res.room); setPlayers(res.room.players); setCode(res.room.private_code || cleanRoomCode(joinCode));
    if (res.room.status === "active") { startedRef.current = true; onMatch({ ...res.room, players: res.room.players }); return; }
    setMode("lobby");
  };

  // Hôte : réveille la salle pour qu'elle reste « fraîche »
  useEffect(() => {
    if (mode !== "lobby" || !room?.id || room.player1 !== myUsername) return;
    const id = setInterval(() => heartbeatRoom(room.id), HEARTBEAT_PRIVATE_MS);
    return () => clearInterval(id);
  }, [mode, room?.id, room?.player1, myUsername]);

  // Tous : suivre les joueurs qui arrivent, le lancement par l'hôte, ou la disparition de la salle
  useEffect(() => {
    if (mode !== "lobby" || !room?.id) return;
    const id = room.id;
    const poll = setInterval(async () => {
      const rows = await sb.query(`game_rooms?id=eq.${encodeURIComponent(id)}&limit=1`).catch(() => null);
      if (rows === null) return;                                   // erreur réseau : on réessaie
      const r = rows[0];
      if (!r || r.status === "finished") {                         // l'hôte est parti
        clearInterval(poll); roomRef.current = null; hostRef.current = false;
        setRoom(null); setPlayers([]); setCode(""); setMode(null); setJoinError(g.party.roomGone);
        return;
      }
      const pl = roomPlayers(r);
      setPlayers(pl);
      if (r.status === "active") {
        clearInterval(poll); startedRef.current = true;
        onMatch({ ...r, players: pl });
      }
    }, 1500);
    return () => clearInterval(poll);
  }, [mode, room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = async () => {
    if (busy) return;
    setBusy(true);
    // Liste des joueurs relue juste avant le lancement : un invité arrivé il y a une seconde n'est pas oublié
    const rows = await sb.query(`game_rooms?id=eq.${encodeURIComponent(roomRef.current)}&status=eq.waiting&limit=1`).catch(() => null);
    const fresh = rows?.[0];
    const list = fresh ? roomPlayers(fresh) : players;
    if (!fresh || list.length < minPlayers) { setBusy(false); if (!fresh && rows) setJoinError(g.party.roomGone); return; }
    const started = await sb.query(`game_rooms?id=eq.${encodeURIComponent(roomRef.current)}&status=eq.waiting`, {
      method: "PATCH", headers: { ...sb.headers, Prefer: "return=representation" },
      body: JSON.stringify({ status: "active", state: buildState(list, lang), updated_at: new Date().toISOString() }),
    }).catch(() => null);
    setBusy(false);
    if (started?.[0]) { startedRef.current = true; onMatch({ ...started[0], players: list }); }
    else setJoinError(g.common.netError);
  };

  if (mode !== "lobby") {
    return (
      <GameRoot style={{ padding: 22 }}>
        <LobbyHeader icon={icon} title={title} subtitle={subtitle} tone={tone} />
        {intro}
        <FriendEntry g={g} onCreate={createRoom} creating={busy} code={joinCode} onCode={setJoinCode} onJoin={joinRoom} joining={busy} error={joinError} />
      </GameRoot>
    );
  }

  const isHost = myUsername === players[0];
  const ready = players.length >= minPlayers;
  return (
    <GameRoot style={{ padding: 22 }}>
      <RoomLobby g={g} icon={icon} title={g.party.lobbyTitle(title)} subtitle={g.party.lobbySubtitle(minPlayers, max)} tone={tone}
        code={code} players={players} max={max} me={myUsername}
        invite={isHost && room?.id ? <FriendInviteList myUsername={myUsername} gameType={gameType} roomId={room.id} privateCode={code} /> : null}
        footer={isHost ? (
          <>
            {joinError ? <Note tone="warn" style={{ marginBottom: 10 }}>{joinError}</Note> : null}
            <Btn variant="primary" size="lg" block onClick={startGame} disabled={!ready || busy}>{ready ? g.party.start : g.party.needMore(minPlayers - players.length)}</Btn>
          </>
        ) : <Note tone="info">{g.party.waitingHost(players[0])}<Dots /></Note>}
        onLeave={onClose} leaveLabel={g.friends.leaveRoom} />
    </GameRoot>
  );
}

export function CluescaleMatchmaking({ onMatch, onClose, initialRoom = null }) {
  const { g } = useGameText();
  return (
    <PartyLobby gameType="cluescale" icon="🎭" tone="251,113,133" title="Cluescale" subtitle={g.party.cluescaleSubtitle}
      minPlayers={2} buildState={(list) => cluescaleInitialState(list)} onMatch={onMatch} onClose={onClose} initialRoom={initialRoom}
      intro={<Note tone="info" style={{ marginBottom: 14, textAlign: "left", fontWeight: 600, lineHeight: 1.5 }}>{g.party.cluescaleRules}</Note>} />
  );
}

// ─── IMPOSTEUR : sur le même appareil ou en ligne ─────────────────────────────────────────────────────────────────────
let undercoverRecent = [];   // derniers mots tirés pendant cette session : on évite de les retirer tout de suite
const UC_LOCAL_MIN = 3, UC_LOCAL_MAX = 6;

function UndercoverLocalSetup({ onStart, onBack, initialPlayers = null }) {
  const { myUsername } = useApp();
  const { lang, g } = useGameText();
  const u = g.uc;
  const [players, setPlayers] = useState(() => (initialPlayers?.length ? initialPlayers : [myUsername]));   // « Rejouer » : mêmes joueurs
  const [input, setInput]     = useState("");

  const addPlayer = () => {
    const name = input.trim().slice(0, 20);
    if (!name || players.some((p) => p.toLowerCase() === name.toLowerCase()) || players.length >= UC_LOCAL_MAX) return;
    setPlayers((p) => [...p, name]);
    setInput("");
  };
  const startGame = () => {
    if (players.length < UC_LOCAL_MIN) return;
    const entry = pickEntry(UNDERCOVER_WORDS, undercoverRecent);
    undercoverRecent = [...undercoverRecent, entry.word].slice(-12);
    const impostorIdx = Math.floor(Math.random() * players.length);
    onStart(players.map((username, i) => ({
      username, isImpostor: i === impostorIdx,
      word: i === impostorIdx ? null : entry.word,
      hint: i === impostorIdx ? (entry.hint[lang] || entry.hint.fr) : null,
    })));
  };
  const ready = players.length >= UC_LOCAL_MIN;
  return (
    <div className="gm-rise">
      {onBack ? <div style={{ marginBottom: 12 }}><Btn variant="ghost" size="sm" onClick={onBack}>← {g.common.back}</Btn></div> : null}
      <LobbyHeader icon="📱" tone="244,114,182" title={u.localTitle} subtitle={u.localSubtitle(UC_LOCAL_MIN, UC_LOCAL_MAX)} />
      <Eyebrow style={{ marginBottom: 8 }}>{u.localPlayers(players.length, UC_LOCAL_MAX)}</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
        {players.map((p, i) => (
          <div key={p} className="gm-seat gm-pop">
            <Bubble name={p} size={34} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
            {i === 0 ? <span className="gm-tag" style={{ "--tone": "34,197,94" }}>{g.common.you}</span>
              : <Btn variant="ghost" size="sm" aria-label={u.remove(p)} onClick={() => setPlayers((pl) => pl.filter((x) => x !== p))}>✕</Btn>}
          </div>
        ))}
      </div>
      {players.length < UC_LOCAL_MAX && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input className="gm-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            placeholder={u.namePlaceholder} maxLength={20} aria-label={u.namePlaceholder} />
          <Btn variant="soft" onClick={addPlayer} disabled={!input.trim()}>{u.addBtn}</Btn>
        </div>
      )}
      <Btn variant="primary" size="lg" block onClick={startGame} disabled={!ready}>{ready ? u.start : u.needMore(UC_LOCAL_MIN - players.length)}</Btn>
    </div>
  );
}

// `localPlayers` (optionnel) : pseudos de la partie précédente sur le même appareil → « Rejouer » arrive directement sur leur préparation.
export function UndercoverLobby({ onStart, onStartOnline = null, initialRoom = null, onClose = null, localPlayers = null }) {
  const { g } = useGameText();
  const [view, setView] = useState(initialRoom ? "online" : localPlayers?.length ? "local" : onStartOnline ? "menu" : "local");
  const u = g.uc;

  if (view === "local") return <GameRoot style={{ padding: 22 }}><UndercoverLocalSetup onStart={onStart} initialPlayers={localPlayers} onBack={onStartOnline ? () => setView("menu") : null} /></GameRoot>;
  if (view === "online") {
    return (
      <PartyLobby gameType="undercover" icon="🕵️" tone="244,114,182" title="Undercover" subtitle={u.onlineSubtitle(UC_MIN_ONLINE, MULTI_MAX.undercover)}
        minPlayers={UC_MIN_ONLINE} buildState={(list, lang) => {
          const entry = pickEntry(UNDERCOVER_WORDS, undercoverRecent);
          undercoverRecent = [...undercoverRecent, entry.word].slice(-12);
          return ucInit({ users: list, entry, lang });
        }}
        onMatch={onStartOnline} onClose={() => (initialRoom ? onClose?.() : setView("menu"))} initialRoom={initialRoom}
        intro={<Note tone="info" style={{ marginBottom: 14, textAlign: "left", fontWeight: 600, lineHeight: 1.5 }}>{u.onlineRules}</Note>} />
    );
  }
  return (
    <GameRoot style={{ padding: 22 }}>
      <div className="gm-rise">
        <LobbyHeader icon="🕵️" tone="244,114,182" title="Undercover" subtitle={u.menuSubtitle} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <ModeCard icon="🌐" tone="34,211,238" title={u.onlineTitle} desc={u.onlineDesc(UC_MIN_ONLINE, MULTI_MAX.undercover)} tag={u.onlineTag} onClick={() => setView("online")} />
          <ModeCard icon="📱" tone="244,114,182" title={u.localTitle} desc={u.localDesc(UC_LOCAL_MIN, UC_LOCAL_MAX)} tag={u.localTag} onClick={() => setView("local")} />
        </div>
      </div>
    </GameRoot>
  );
}
