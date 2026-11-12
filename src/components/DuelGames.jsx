// ─── JEUX À DEUX — Chaîne d'animés (Chain) et Timeline ─────────────────────────────────────────────────────────────
// Chain    : chaque joueur enchaîne un animé qui partage le studio (ou le genre) du précédent, 40 s par tour, 2 manches gagnantes.
// Timeline : poser ses 5 cartes sur la frise dans l'ordre chronologique ; une erreur défausse la carte (règles : gameRules.js).
// Les règles, l'ELO et l'IA sont dans src/utils/gameRules.js (testé) ; l'enregistrement de l'ELO / des points dans gameSettle.js.
// Ce fichier : l'écran, la synchronisation entre les deux joueurs (useDuelCore) et l'écran de fin (DuelEnd).
//
// Synchronisation : chaque changement local incrémente `state.v`. On n'accepte d'un sondage que les états PLUS RÉCENTS (v plus
// grand) : un état ancien, lu juste avant l'arrivée de notre dernier coup, ne peut plus « rendre la main » ni faire réapparaître
// une carte. Si la base est en retard sur notre état, on le renvoie (avec relances) au lieu d'ignorer l'erreur.
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useApp } from "../context/useApp.js";
import { sb } from "../api/supabase.js";
import {
  GameRoot, Btn, Dots, Eyebrow, Note, ModeCard, DuelHud, Pips, TurnPill, TimerBar, QuitDialog, EndScreen,
  GOOD, BAD,
} from "./gameUi.jsx";
import { useGameText, useQuitGate } from "../hooks/useGameUi.js";
import {
  roomMode, duelResult, chainAfterRoundLoss, chainAiPick, chainLinkForTurn, isChainLinkValid,
  dealTimeline, timelineMove, timelineAiMove, TIMELINE_HAND,
} from "../utils/gameRules.js";
import { withSettlementFields } from "../utils/gameSettle.js";
import { finishRoom, readRoom } from "../utils/gameRooms.js";
import { useDuelSettlement } from "../hooks/useDuelSettlement.js";
import { aiRecordFor, recordAiResult } from "../utils/aiRecord.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HIDDEN_FORFEIT_MS = 8_000;          // onglet masqué plus de 8 s pendant une partie classée : abandon
const TONE_STUDIO = "59,130,246", TONE_GENRE = "236,72,153";

// ─── Styles propres aux jeux à deux ─────────────────────────────────────────────────────────────────────────────
const DUEL_CSS = `
.gm-poster{position:relative;display:inline-block;flex-shrink:0;overflow:hidden;background:linear-gradient(160deg,rgba(var(--fg-rgb),.14),rgba(var(--fg-rgb),.05));border:1px solid var(--gm-line)}
.gm-poster img{width:100%;height:100%;object-fit:cover;display:block}
.gm-poster-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:900;color:var(--text-3)}
.gm-link{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:16px;background:rgba(var(--tone),.1);border:1px solid rgba(var(--tone),.34)}
.gm-link-ico{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:21px;background:rgba(var(--tone),.18);border:1px solid rgba(var(--tone),.4);flex-shrink:0}
.gm-cur{display:flex;gap:16px;align-items:center;padding:14px 16px;border-radius:20px;background:var(--gm-fill);border:1px solid var(--gm-line)}
.gm-chip{display:inline-flex;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;color:var(--text-2);background:rgba(var(--fg-rgb),.07);border:1px solid var(--gm-line)}
.gm-chip.hl{color:#fff;background:rgba(var(--tone,139,92,246),.55);border-color:rgba(var(--tone,139,92,246),.8)}
.gm-sug{margin-top:6px;max-height:268px;overflow-y:auto;border-radius:14px;background:var(--surface-1-strong,#161226);border:1px solid rgba(var(--fg-rgb),.18);box-shadow:var(--shadow-modal,0 14px 44px rgba(0,0,0,.5));animation:gm-slide .14s both}
.gm-sug button{display:flex;align-items:center;gap:11px;width:100%;padding:8px 12px;background:none;border:none;color:inherit;cursor:pointer;text-align:left;font:inherit;transition:background .12s}
.gm-sug button:hover:not(:disabled),.gm-sug button.on{background:rgba(139,92,246,.2)}
.gm-sug button:disabled{opacity:.45;cursor:not-allowed}
.gm-chain-row{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:12px;background:var(--gm-fill);border:1px solid var(--gm-line)}
.gm-hand-card{display:flex;flex-direction:column;align-items:center;gap:7px;padding:8px;border-radius:16px;border:2px solid transparent;background:transparent;color:inherit;font:inherit;cursor:pointer;transition:transform .16s,border-color .16s,background .16s,box-shadow .16s}
.gm-hand-card:hover:not(:disabled){transform:translateY(-4px)}
.gm-hand-card.sel{border-color:#a78bfa;background:rgba(139,92,246,.15);transform:translateY(-8px);box-shadow:0 14px 30px rgba(139,92,246,.38)}
.gm-hand-card:disabled{cursor:default}
.gm-hand-card[draggable=true]:not(:disabled){cursor:grab}
.gm-hand-card.drag{opacity:.45}
.gm-hand-card:focus-visible{outline:2px solid var(--gm-violet);outline-offset:2px}
.gm-hand-title{font-size:11.5px;font-weight:700;line-height:1.25;text-align:center;max-width:112px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.gm-tl{overflow-x:auto;padding:14px 4px 8px;scrollbar-width:thin;border-radius:20px;background:linear-gradient(180deg,rgba(var(--fg-rgb),.04),rgba(var(--fg-rgb),.015));border:1px solid var(--gm-line)}
.gm-tl-in{position:relative;display:flex;align-items:flex-start;min-width:max-content;margin:0 auto;padding:0 8px;width:max-content}
.gm-tl-in::before{content:"";position:absolute;left:8px;right:8px;top:76px;height:3px;border-radius:3px;background:linear-gradient(90deg,transparent,rgba(167,139,250,.55) 12%,rgba(236,72,153,.5) 88%,transparent)}
.gm-tl-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;width:112px;flex-shrink:0}
.gm-tl-year{font-size:16px;font-weight:900;color:var(--gm-violet);letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.gm-tl-name{font-size:10.5px;font-weight:600;color:var(--text-2);text-align:center;max-width:104px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.gm-slot{position:relative;flex-shrink:0;align-self:flex-start;width:36px;height:152px;display:flex;align-items:center;justify-content:center;border-radius:14px;border:2px dashed transparent;background:transparent;color:transparent;font-size:24px;font-weight:900;padding:0;cursor:default;transition:width .15s,background .15s,border-color .15s,color .15s}
.gm-slot.live{border-color:rgba(167,139,250,.55);color:var(--gm-violet);background:rgba(139,92,246,.08);cursor:pointer}
.gm-slot.live:hover,.gm-slot.over{width:56px;border-color:var(--gm-violet);background:rgba(139,92,246,.3);color:var(--gm-on-violet)}
.gm-slot:focus-visible{outline:2px solid var(--gm-violet);outline-offset:2px}
.gm-last{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;border:1px solid var(--gm-line);background:var(--gm-fill);animation:gm-rise .3s both}
.gm-last.good{border-color:rgba(34,197,94,.42);background:rgba(34,197,94,.09)}
.gm-last.bad{border-color:rgba(239,68,68,.45);background:rgba(239,68,68,.09);animation:gm-shake .45s both}
`;
let duelCssDone = false;
function ensureDuelStyles() {
  if (duelCssDone || typeof document === "undefined") return;
  duelCssDone = true;
  if (document.getElementById("animood-duel-ui")) return;
  const el = document.createElement("style");
  el.id = "animood-duel-ui";
  el.textContent = DUEL_CSS;
  document.head.appendChild(el);
}
ensureDuelStyles();

/** Affiche d'animé (image de repli : l'initiale du titre). */
function Poster({ src, title, w = 96, h = 136, radius = 10 }) {
  const [bad, setBad] = useState(false);
  return (
    <span className="gm-poster" style={{ width: w, height: h, borderRadius: radius }}>
      {src && !bad
        ? <img src={src} alt="" loading="lazy" draggable={false} onError={() => setBad(true)} />
        : <span className="gm-poster-ph" style={{ fontSize: Math.round(w * 0.32) }}>{(String(title || "?").trim()[0] || "?").toUpperCase()}</span>}
    </span>
  );
}

const names = (list) => (list || []).map((x) => (x && x.name) || x).filter(Boolean);

// ─── Écriture de l'état (jamais dans une salle déjà terminée) ───────────────────────────────────────────────────────
async function patchRoomState(roomId, state) {
  try {
    await sb.query(`game_rooms?id=eq.${encodeURIComponent(roomId)}&status=eq.active`, {
      method: "PATCH", headers: { ...sb.headers, Prefer: "return=minimal" },
      body: JSON.stringify({ state, updated_at: new Date().toISOString() }),
    });
    return true;
  } catch { return false; }
}

// ─── Cœur commun aux deux jeux : état partagé, clôture de la salle, abandon, adversaire silencieux ─────────────────────
/**
 * @param {object} p
 * @param {object} p.room        salle (ou fausse salle « ai-… » contre l'IA)
 * @param {"chain"|"timeline"} p.game
 * @param {object} p.empty       état de départ tant que rien n'a été reçu
 * @param {(s:object)=>boolean} p.isLive  cet état distant est-il un état de partie ?
 * @param {(s:object)=>({actor:string,limit:number}|null)} p.idleOf  qui doit jouer, et après combien de ms de silence il perd
 * @param {object} p.finalExtra  champs ajoutés à l'état final (ex. { turn: null })
 * @param {()=>boolean} [p.isOverExtra]  partie à considérer comme terminée pour la fermeture (ex. distribution impossible)
 * @param {()=>void} [p.onStartFailed]   la salle a été fermée par l'hôte parce que la partie n'a pas pu démarrer
 */
function useDuelCore({ room, game, empty, isLive, idleOf, finalExtra, isOverExtra, onStartFailed, onReady }) {
  const { myUsername: me } = useApp();
  const isAI = !!room._isAI;
  const isP1 = room.player1 === me;
  const opp = isP1 ? room.player2 : room.player1;
  const mode = roomMode(room);
  const ranked = mode === "ranked";
  const level = room._aiDiff || "medium";

  const initial = room.state && isLive(room.state) ? room.state : empty;
  const [state, setState] = useState(initial);
  const stateRef = useRef(initial);
  const endedRef = useRef(initial.phase === "gameEnd");   // la partie est finie ICI (l'écriture en base peut encore être en cours)
  const closedRef = useRef(false);                          // la salle est fermée en base
  const [closed, setClosed] = useState(false);
  const [finisher, setFinisher] = useState(false);          // c'est CET appareil qui a fermé la salle
  const [fin, setFin] = useState({ status: "none" });       // none | saving | ok | error
  const [mountedAt] = useState(Date.now);
  const lastChangeRef = useRef(mountedAt);                  // dernière fois où la partie a bougé (mon coup ou celui de l'adversaire)
  const lastPollRef = useRef(mountedAt);
  const [idleInfo, setIdleInfo] = useState(null);           // { actor, left } (secondes avant abandon automatique)
  const [netBad, setNetBad] = useState(false);
  const [aiRec, setAiRec] = useState(null);

  // Dernières versions des fonctions / réglages lus par les minuteurs (assignation hors rendu)
  const live = useRef({});
  useEffect(() => { live.current = { idleOf, isLive, finalExtra, isOverExtra, onStartFailed }; });
  const finRef = useRef(fin);
  useEffect(() => { finRef.current = fin; }, [fin]);

  const commitLocal = useCallback((next) => {
    const withV = { ...next, v: (stateRef.current?.v || 0) + 1 };
    stateRef.current = withV;
    lastChangeRef.current = Date.now();
    setState(withV);
    return withV;
  }, []);
  const adopt = useCallback((remote) => {
    stateRef.current = remote;
    lastChangeRef.current = Date.now();
    setState(remote);
  }, []);

  // Envoi de l'état courant : un seul envoi à la fois, toujours la dernière version, relances si le réseau coupe
  const pushing = useRef(false), dirty = useRef(false);
  const push = useCallback(async () => {
    if (isAI) return;
    dirty.current = true;
    if (pushing.current) return;
    pushing.current = true;
    let fails = 0;
    try {
      while (dirty.current && !endedRef.current) {
        dirty.current = false;
        if (await patchRoomState(room.id, stateRef.current)) { fails = 0; setNetBad(false); }
        else {
          dirty.current = true; fails += 1;
          if (fails >= 4) { setNetBad(true); break; }
          await sleep(900 * fails);
        }
      }
    } finally { pushing.current = false; }
  }, [isAI, room.id]);

  // ── Fermeture de la salle (une seule fois pour toute la partie) ─────────────────────────────────────────────────────
  const adoptFinishedRow = useCallback((row) => {
    closedRef.current = true;
    endedRef.current = true;
    if (row.state?.startFailed) { live.current.onStartFailed?.(); setClosed(true); return; }
    if (row.state?.phase === "gameEnd") adopt(row.state);
    else adopt({ ...stateRef.current, phase: "gameEnd", winner: row.winner || null, forfeitBy: row.winner === me ? opp : me });   // ancienne version : pas de bilan détaillé
    setFinisher(false); setClosed(true); setFin({ status: "ok" });
  }, [adopt, me, opp]);

  const writeClose = useCallback(async (final) => {
    const r = await finishRoom(room.id, { winner: final.winner || null, state: final });
    if (r.ok) { closedRef.current = true; setFinisher(true); setClosed(true); setFin({ status: "ok" }); return; }
    if (r.lost) {                                     // l'adversaire a fermé la salle avant nous : on prend SA version
      for (let i = 0; i < 4; i++) {
        const row = await readRoom(room.id).catch(() => null);
        if (row?.status === "finished") { adoptFinishedRow(row); return; }
        await sleep(500);
      }
    }
    setFin({ status: "error", error: r.error || "" });
  }, [room.id, adoptFinishedRow]);

  /** Termine la partie. kind : normal | forfeit (abandon volontaire) | timeout (adversaire silencieux). `base` = état à partir duquel
   *  on construit l'état final (par défaut l'état courant). Renvoie false si la partie était déjà terminée. */
  const closeWith = useCallback(async ({ kind = "normal", winner = null, isDraw = false, leaver = null, scores = null, base = null, extra = null }) => {
    if (endedRef.current) return false;
    endedRef.current = true;
    const cur = base || stateRef.current;
    const result = withSettlementFields(duelResult({ game, room, kind, winner, isDraw, leaver, scores }));
    const final = commitLocal({
      ...cur, ...(live.current.finalExtra || {}), ...(extra || {}),
      phase: "gameEnd", winner: result.winner, isDraw: result.isDraw, result, lastChance: false,
      ...(kind !== "normal" ? { forfeitBy: result.leaver } : {}),
    });
    if (isAI) { closedRef.current = true; setClosed(true); setFin({ status: "ok" }); return true; }
    setFin({ status: "saving" });
    await writeClose(final);
    return true;
  }, [game, room, isAI, commitLocal, writeClose]);

  const forfeit  = useCallback(() => closeWith({ kind: "forfeit", leaver: me }), [closeWith, me]);
  const claimWin = useCallback(() => closeWith({ kind: "timeout", leaver: opp, winner: me }), [closeWith, opp, me]);
  const retryClose = useCallback(() => { if (finRef.current.status === "error") { setFin({ status: "saving" }); writeClose(stateRef.current); } }, [writeClose]);

  const claimWinRef = useRef(claimWin), forfeitRef = useRef(forfeit);
  useEffect(() => { claimWinRef.current = claimWin; forfeitRef.current = forfeit; });

  // ── Synchronisation avec l'adversaire (sondage 1,5 s) ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAI) return undefined;
    let stopped = false, tick = 0;
    const id = setInterval(async () => {
      if (closedRef.current) { clearInterval(id); return; }
      try {
        const now = Date.now();
        if (now - lastPollRef.current > 6000) lastChangeRef.current = now;         // onglet gelé : on repart sur une base saine
        lastPollRef.current = now;
        const r = await readRoom(room.id);
        if (stopped || !r) return;
        if (r.status === "finished") { if (!closedRef.current) adoptFinishedRow(r); return; }
        const cur = stateRef.current;
        if (endedRef.current) {                                                      // fini ici, mais pas encore fermé en base : réessayer
          if (finRef.current.status === "error" && ++tick % 2 === 0) { setFin({ status: "saving" }); writeClose(cur); }
          return;
        }
        if (r.status === "waiting") { claimWinRef.current(); return; }               // anciennes versions : salle remise en attente = parti
        const remote = r.state;
        if (live.current.isLive(remote)) {
          if ((remote.v || 0) > (cur.v || 0)) adopt(remote);                         // plus récent que le nôtre
          else if ((remote.v || 0) < (cur.v || 0)) push();                           // la base est en retard sur notre dernier coup
        }
        const idle = live.current.idleOf(stateRef.current);                          // adversaire silencieux ?
        if (idle?.actor && idle.actor !== me && Date.now() - lastChangeRef.current > idle.limit) claimWinRef.current();
      } catch { /* réseau : au prochain tour */ }
    }, 1500);
    return () => { stopped = true; clearInterval(id); };
  }, [room.id, isAI, me, adopt, push, writeClose, adoptFinishedRow]);

  // Compte à rebours d'inactivité (affiché pendant les 20 dernières secondes seulement)
  useEffect(() => {
    if (isAI) return undefined;
    const id = setInterval(() => {
      const s = stateRef.current;
      const idle = s.phase !== "gameEnd" ? live.current.idleOf(s) : null;
      if (!idle?.actor) { setIdleInfo((p) => (p ? null : p)); return; }
      const left = Math.ceil((idle.limit - (Date.now() - lastChangeRef.current)) / 1000);
      setIdleInfo((p) => (p && p.actor === idle.actor && p.left === left ? p : { actor: idle.actor, left }));
    }, 1000);
    return () => clearInterval(id);
  }, [isAI]);

  // Onglet masqué plus de 8 s pendant une partie classée : abandon (on ne ferme PAS la fenêtre : l'écran de fin attend le joueur)
  useEffect(() => {
    if (!ranked) return undefined;
    let timer;
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.hidden && stateRef.current.phase === "play") {
        timer = setTimeout(() => { if (document.hidden && !endedRef.current) forfeitRef.current(); }, HIDDEN_FORFEIT_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [ranked]);

  // Fenêtre « Abandonner ? » ouverte par le parent quand le joueur ferme la fenêtre en pleine partie
  const quit = useQuitGate(onReady, () => endedRef.current || !!live.current.isOverExtra?.(), forfeit);

  // Bilan contre l'IA (gardé sur cet appareil). Un abandon n'est pas compté.
  const recordedRef = useRef(false);
  useEffect(() => {
    if (!isAI || state.phase !== "gameEnd" || recordedRef.current) return;
    recordedRef.current = true;
    const res = state.result;
    const timer = setTimeout(() => {
      if (res?.kind === "forfeit") setAiRec(aiRecordFor(game, level));
      else setAiRec(recordAiResult(game, level, res?.isDraw ? "draw" : res?.winner === me ? "win" : "loss"));
    }, 0);
    return () => clearTimeout(timer);
  }, [isAI, state.phase, state.result, game, level, me]);

  // Enregistrement de l'ELO / des points (partie classée ou entre amis) : démarre dès que la salle est fermée en base
  const settle = useDuelSettlement({ roomId: room.id, me, result: closed ? state.result || null : null, finisher });

  return {
    me, opp, isP1, isAI, mode, ranked, level, state, stateRef, endedRef, commitLocal, push, closeWith, forfeit, claimWin, retryClose,
    fin, idleInfo, netBad, aiRec, quit, settle,
  };
}

// ─── Écran de fin commun ────────────────────────────────────────────────────────────────────────────────────────────
function DuelEnd({ core, scoreLine, subtitle, onClose, children }) {
  const { g } = useGameText();
  const d = g.duel;
  const { me, opp, state, fin, settle, aiRec, mode } = core;
  const res = state.result || {
    kind: state.forfeitBy ? "forfeit" : "normal", winner: state.winner || null, isDraw: !!state.isDraw, leaver: state.forfeitBy || null, mode: undefined,
  };
  const iLeft = !!res.leaver && res.leaver === me;
  const oppLeft = !!res.leaver && res.leaver !== me;
  const iWon = res.winner === me && !iLeft;
  const draw = !!res.isDraw;
  const tone = draw ? "draw" : iWon ? "win" : "loss";
  const icon = iLeft ? (res.kind === "timeout" ? "⌛" : "🏳️") : oppLeft ? "🏃" : draw ? "🤝" : iWon ? "🏆" : "😢";
  const title = iLeft ? (res.kind === "timeout" ? d.titleTimeoutMe : d.titleForfeitMe) : oppLeft ? (res.kind === "timeout" ? d.titleTimeout : d.titleForfeitOpp) : draw ? g.common.draw : iWon ? g.common.victory : g.common.defeat;
  const sub = iLeft ? (res.kind === "timeout" ? d.subTimeoutMe : d.subForfeitMe) : oppLeft ? (res.kind === "timeout" ? d.subTimeout(opp) : d.subForfeitOpp(opp)) : subtitle;

  const settlement = fin.status === "saving" ? { status: "pending" }
    : fin.status === "error" ? { status: "failed", error: d.closeError }
    : settle.view;
  const onRetry = fin.status === "error" ? core.retryClose : settle.retry;

  return (
    <EndScreen tone={tone} icon={icon} title={title} subtitle={sub} scoreLine={scoreLine}
      mode={res.mode || mode} settlement={settlement} record={aiRec} onRetry={onRetry} retrying={settle.busy}
      actions={[{ label: d.close, onClick: onClose }]}>
      {children}
    </EndScreen>
  );
}

/** Texte et pénalité de la fenêtre « Abandonner ? » selon le mode de la partie. */
function useQuitCopy(core, room, game) {
  const { g } = useGameText();
  const d = g.duel;
  return useMemo(() => {
    if (core.mode === "ranked") {
      const lost = Math.abs(duelResult({ game, room, kind: "forfeit", leaver: core.me }).deltas[core.me]?.elo || 0);
      return { body: d.quitBodyRanked, penalty: d.penaltyRanked(lost) };
    }
    if (core.mode === "friend") return { body: d.quitBodyFriend, penalty: d.penaltyFriend };
    return { body: d.quitBodyAi, penalty: null };
  }, [core.mode, core.me, room, game, d]);
}

/** Bouton « Abandonner » toujours visible pendant la partie (ouvre la même fenêtre de confirmation que la croix de la fenêtre). */
function LeaveButton({ core, d }) {
  if (core.state.phase === "gameEnd") return null;
  return (
    <div style={{ textAlign: "center", marginTop: 16 }}>
      <Btn variant="leave" size="sm" icon="🏳️" onClick={() => core.quit.ask()}>{core.mode === "ai" ? d.leaveAiBtn : d.forfeitBtn}</Btn>
    </div>
  );
}

function QuitBox({ core, copy, d, onLeave }) {
  const { quit, forfeit } = core;
  // Contre l'IA, quitter n'enregistre rien : on ferme tout de suite (pas d'écran de fin « abandon »)
  const leave = () => { quit.stay(); if (core.isAI && onLeave) onLeave(); else forfeit(); };
  return (
    <QuitDialog open={quit.open} title={core.isAI ? d.quitTitleAi : d.quitTitle} body={copy.body} penalty={copy.penalty} stayLabel={d.quitStay}
      quitLabel={core.isAI ? d.quitConfirmAi : d.quitConfirm} danger={core.mode !== "ai"} onStay={quit.stay} onQuit={leave} />
  );
}

/** Texte « ELO … » / « Entre amis » / « IA … » sous le nom d'un joueur. */
function subLabel(core, room, user, d) {
  if (core.mode === "ranked") return d.elo(user === room.player1 ? room.elo1 : room.elo2);
  if (core.mode === "friend") return d.friendTag;
  return user === core.me ? d.you : d.aiLevel[core.level] || d.aiTag;
}

function IdleBanner({ core, d }) {
  const { idleInfo, me } = core;
  if (!idleInfo || idleInfo.left > 20 || idleInfo.left <= 0) return null;
  return <Note tone="warn" style={{ marginTop: 10 }}>{idleInfo.actor === me ? d.idleMe(idleInfo.left) : d.idleOpp(idleInfo.left)}</Note>;
}

// ─── CHAIN ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const CHAIN_IDLE_MS = { play: 55_000, choose: 75_000, roundEnd: 20_000 };      // 40 s de tour + marge ; choix du lien ; transition
const CHAIN_AI_DELAY = { easy: 3400, medium: 2300, hard: 1400 };
const chainIdleOf = (s) => {
  const limit = CHAIN_IDLE_MS[s.phase];
  if (!limit) return null;
  const actor = s.phase === "play" ? s.turn : s.phase === "choose" ? s.chooser : s.lastRound?.loser || null;
  return actor ? { actor, limit } : null;
};
const isChainLive = (s) => !!s?.scores;

/** Suggestions : le titre tapé en entier d'abord, puis ceux qui commencent par le texte, puis le reste (déjà trié par note). */
function rankSuggestions(rows, exact, term) {
  const t = term.toLowerCase();
  const seen = new Set(), all = [];
  for (const a of [...(exact || []), ...(rows || [])]) { if (a && !seen.has(a.mal_id)) { seen.add(a.mal_id); all.push(a); } }
  const rank = (a) => { const x = String(a.title || "").toLowerCase(); return x === t ? 0 : x.startsWith(t) ? 1 : 2; };
  return all.map((a, i) => [a, i]).sort((p, q) => rank(p[0]) - rank(q[0]) || p[1] - q[1]).map((p) => p[0]).slice(0, 8);
}

/** Champ de recherche d'un animé TV avec suggestions (flèches + Entrée au clavier). */
function AnimeSearch({ onPick, usedIds, placeholder, emptyLabel, usedLabel, ariaLabel }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const req = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (value) => {
    setQ(value); setHi(0);
    clearTimeout(timer.current);
    const term = value.replace(/[*(),%]/g, " ").trim();
    req.current += 1;
    const mine = req.current;
    if (!term) { setItems([]); setBusy(false); return; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      const enc = encodeURIComponent(term), cols = "mal_id,title,studios,genres,image_url";
      const [rows, exact] = await Promise.all([
        sb.query(`anime_cache?title=ilike.*${enc}*&type=eq.TV&order=score.desc.nullslast&limit=8&select=${cols}`).catch(() => []),
        sb.query(`anime_cache?title=ilike.${enc}&type=eq.TV&limit=1&select=${cols}`).catch(() => []),     // sans « * » : égalité insensible à la casse
      ]);
      if (mine !== req.current) return;
      setItems(rankSuggestions(rows, exact, term)); setBusy(false);
    }, 260);
  };
  const pick = (a) => {
    if (!a || usedIds.has(a.mal_id)) return;
    req.current += 1; clearTimeout(timer.current);
    setQ(""); setItems([]); setBusy(false);
    onPick(a);
  };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, Math.max(0, items.length - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[hi] || items[0]); }
    else if (e.key === "Escape") { setQ(""); setItems([]); }
  };
  return (
    <div>
      <input className="gm-input" value={q} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} placeholder={placeholder}
        aria-label={ariaLabel} autoFocus autoComplete="off" spellCheck={false} style={{ fontSize: 15, padding: "14px 16px" }} />
      {q.trim() && (items.length > 0 || !busy) ? (
        <div className="gm-sug" role="listbox">
          {items.length === 0
            ? <div style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--text-3)" }}>{emptyLabel}</div>
            : items.map((a, i) => {
              const used = usedIds.has(a.mal_id);
              return (
                <button key={a.mal_id} type="button" role="option" aria-selected={i === hi} className={i === hi ? "on" : ""} disabled={used}
                  onMouseEnter={() => setHi(i)} onClick={() => pick(a)}>
                  <Poster src={a.image_url} title={a.title} w={30} h={42} radius={6} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                  {used ? <span className="gm-tag" style={{ "--tone": "148,163,184" }}>{usedLabel}</span> : null}
                </button>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}

export function ChainGame({ room, onClose, onReady }) {
  const { g } = useGameText();
  const c = g.chain, d = g.duel;
  const empty = useMemo(() => ({
    round: 1, scores: [0, 0], linkType: null, currentAnime: null, chain: [], turn: null, chooser: room.player1,
    phase: "choose", timer: 40, times: [0, 0], lastRound: null,
  }), [room.player1]);
  const core = useDuelCore({ room, game: "chain", empty, isLive: isChainLive, idleOf: chainIdleOf, finalExtra: { turn: null }, onReady });
  const { me, opp, isP1, isAI, level, state, stateRef, endedRef, commitLocal, push, closeWith } = core;
  const copy = useQuitCopy(core, room, "chain");

  const [pool, setPool] = useState(null);                 // null = chargement
  const [poolErr, setPoolErr] = useState(false);
  const [poolTry, setPoolTry] = useState(0);
  const [tried, setTried] = useState(null);               // dernier essai invalide : { anime, linkUsed }
  const [usedMsg, setUsedMsg] = useState(false);
  const [giveUpArmed, setGiveUpArmed] = useState(false);
  const [clock, setClock] = useState({ key: null, left: 40 });
  const startTsRef = useRef(0);

  const myTurn = state.phase === "play" && state.turn === me;
  const amChooser = state.chooser === me;
  const myRounds = state.scores[isP1 ? 0 : 1], oppRounds = state.scores[isP1 ? 1 : 0];

  // ── Liste des animés TV connus (3 essais) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        const rows = await sb.query("anime_cache?type=eq.TV&score=gte.6.5&scored_by=gte.3000&select=mal_id,title,studios,genres,image_url&order=scored_by.desc&limit=5000").catch(() => null);
        if (rows?.length) { if (!cancelled) setPool(rows); return; }
        await sleep(1200);
      }
      if (!cancelled) setPoolErr(true);
    })();
    return () => { cancelled = true; };
  }, [poolTry]);
  const reloadPool = () => { setPoolErr(false); setPool(null); setPoolTry((n) => n + 1); };

  // ── Fin de manche : manche suivante, ou fin de partie ──
  const endRound = useCallback(async (loser, why) => {
    const cur = stateRef.current;
    if (endedRef.current || cur.phase !== "play") return;
    const res = chainAfterRoundLoss(cur, loser, room);
    const lastRound = { round: cur.round, loser, why, len: cur.chain.length };
    if (res.over) {
      await closeWith({ kind: "normal", winner: res.winner, isDraw: !res.winner, scores: res.scores, extra: { scores: res.scores, lastRound } });
      return;
    }
    commitLocal({ ...cur, round: res.round, scores: res.scores, phase: "roundEnd", linkType: null, currentAnime: null, chain: [], turn: null, timer: 40, chooser: res.chooser, times: [0, 0], lastRound });
    push();
  }, [room, stateRef, endedRef, closeWith, commitLocal, push]);
  const endRoundRef = useRef(endRound);
  useEffect(() => { endRoundRef.current = endRound; });

  // ── Entre deux manches : « choose » au bout de 3 s (par celui qui a perdu la manche ; l'autre prend le relais après 6,5 s) ──
  useEffect(() => {
    if (state.phase !== "roundEnd") return undefined;
    const delay = isAI ? 2800 : state.lastRound?.loser === me ? 3000 : 6500;
    const round = state.round;
    const id = setTimeout(() => {
      const s = stateRef.current;
      if (endedRef.current || s.phase !== "roundEnd" || s.round !== round) return;
      commitLocal({ ...s, phase: "choose" });
      push();
    }, delay);
    return () => clearTimeout(id);
  }, [state.phase, state.round, state.lastRound, me, isAI, stateRef, endedRef, commitLocal, push]);

  // ── Début de manche : celui qui choisit le type de lien lance la partie ──
  const startRound = useCallback((type) => {
    const cur = stateRef.current;
    if (endedRef.current || cur.phase !== "choose" || !pool?.length) return;
    const start = pool[Math.floor(Math.random() * pool.length)];
    commitLocal({ ...cur, linkType: type, currentAnime: start, chain: [start], turn: cur.chooser, phase: "play", timer: 40 });
    push();
  }, [pool, stateRef, endedRef, commitLocal, push]);

  // ── Minuteur de 40 s par tour (calculé sur l'heure réelle : juste même si l'onglet ralentit) ──
  const turnKey = state.phase === "play" ? `${state.round}|${state.turn}|${state.chain.length}` : null;
  useEffect(() => {
    if (!turnKey) return undefined;
    const total = stateRef.current.timer || 40;
    const deadline = Date.now() + total * 1000;
    startTsRef.current = Date.now();
    let fired = false;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setClock({ key: turnKey, left });
      if (left === 0 && !fired) {
        fired = true; clearInterval(id);
        if (stateRef.current.turn === me) endRoundRef.current(me, "time");           // seul le joueur concerné déclare sa propre défaite
      }
    }, 250);
    return () => clearInterval(id);
  }, [turnKey, me, stateRef]);
  const timeLeft = clock.key === turnKey ? clock.left : (state.timer || 40);

  // ── IA : choisit le type de lien quand c'est à elle, puis joue ses tours (voir chainAiPick) ──
  useEffect(() => {
    if (!isAI || !pool?.length) return undefined;
    let timer;
    if (state.phase === "choose" && state.chooser === opp) {
      timer = setTimeout(() => { if (stateRef.current.chooser === opp && stateRef.current.phase === "choose") startRound(Math.random() < 0.5 ? "studio" : "genre"); }, 900 + Math.random() * 600);
    } else if (state.phase === "play" && state.turn === opp) {
      timer = setTimeout(() => {
        const s = stateRef.current;
        if (endedRef.current || s.phase !== "play" || s.turn !== opp) return;
        const pick = chainAiPick(s, pool, { level });
        if (!pick) { endRoundRef.current(opp, "blank"); return; }                  // rien ne lui revient : elle sèche, comme un humain
        commitLocal({ ...s, currentAnime: pick, chain: [...s.chain, pick], turn: me, timer: 40 });
      }, (CHAIN_AI_DELAY[level] || 2300) + Math.random() * 900);
    }
    return () => clearTimeout(timer);
  }, [state.phase, state.turn, state.chooser, state.round, state.chain.length, isAI, pool, opp, me, level, startRound, stateRef, endedRef, commitLocal]);

  // ── Mon coup ──
  const linkForTurn = chainLinkForTurn(state);
  const usedIds = useMemo(() => new Set(state.chain.map((a) => a.mal_id)), [state.chain]);
  const handleGuess = (anime) => {
    const cur = stateRef.current;
    if (cur.turn !== me || cur.phase !== "play" || endedRef.current) return;
    if (cur.chain.some((a) => a.mal_id === anime.mal_id)) { setUsedMsg(true); return; }
    setUsedMsg(false);
    const linkUsed = chainLinkForTurn(cur);
    if (!isChainLinkValid(cur.currentAnime, anime, linkUsed)) { setTried({ anime, linkUsed }); return; }
    setTried(null); setGiveUpArmed(false);
    const elapsed = Math.round((Date.now() - (startTsRef.current || Date.now())) / 1000);
    const times = isP1 ? [cur.times[0] + elapsed, cur.times[1]] : [cur.times[0], cur.times[1] + elapsed];
    commitLocal({ ...cur, currentAnime: anime, chain: [...cur.chain, anime], turn: opp, timer: 40, times });
    push();
  };
  const giveUp = () => {
    if (!giveUpArmed) { setGiveUpArmed(true); setTimeout(() => setGiveUpArmed(false), 3000); return; }
    setGiveUpArmed(false);
    endRound(me, "giveup");
  };

  const linkTone = linkForTurn === "studio" ? TONE_STUDIO : TONE_GENRE;
  const linkText = linkForTurn === "studio" ? c.linkStudio : c.linkGenre;
  const aiThinking = isAI && state.phase === "play" && state.turn === opp;
  const chainBy = (i) => (i === 0 ? null : (i % 2 === 1) === (state.chooser === me) ? me : opp);

  const hud = (
    <DuelHud
      me={{ name: me, sub: subLabel(core, room, me, d), score: myRounds, active: myTurn || (state.phase === "choose" && amChooser) }}
      opp={{ name: opp, sub: subLabel(core, room, opp, d), score: oppRounds, active: (state.phase === "play" && state.turn === opp) || (state.phase === "choose" && !amChooser) }}
      center={<><Eyebrow>{c.round(Math.min(state.round, 3))}</Eyebrow><Pips total={3} won={myRounds} lost={oppRounds} /></>} />
  );

  let body;
  if (state.phase === "gameEnd") {
    body = (
      <DuelEnd core={core} scoreLine={<>{myRounds}<span style={{ color: "var(--text-3)" }}>–</span>{oppRounds}</>} subtitle={c.endSubtitle} onClose={onClose}>
        {state.lastRound?.round ? <div style={{ position: "relative", marginTop: 14, fontSize: 12, color: "var(--text-3)" }}>{c.roundLine(state.lastRound.round, state.lastRound.loser === me ? me : opp, c.why[state.lastRound.why] || "")}</div> : null}
      </DuelEnd>
    );
  } else if (state.phase === "choose") {
    body = amChooser ? (
      <div className="gm-rise" style={{ marginTop: 18 }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>{c.chooseTitle}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>{c.chooseSub}</div>
        </div>
        {pool === null && !poolErr ? <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>{c.loadingPool}<Dots /></div>
          : poolErr && !pool ? (
            <div style={{ textAlign: "center" }}><Note tone="bad">{c.poolError}</Note><div style={{ marginTop: 10 }}><Btn variant="soft" onClick={reloadPool} icon="↻">{g.common.retry}</Btn></div></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
              <ModeCard icon="🏢" title={c.studioTitle} desc={c.studioDesc} tone={TONE_STUDIO} onClick={() => startRound("studio")} />
              <ModeCard icon="🎌" title={c.genreTitle} desc={c.genreDesc} tone={TONE_GENRE} onClick={() => startRound("genre")} />
            </div>
          )}
      </div>
    ) : (
      <div className="gm-card gm-rise" style={{ marginTop: 18, padding: 30, textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>{isAI ? "🤖" : "⏳"}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)" }}>{c.waitingChoose(opp)}<Dots /></div>
      </div>
    );
  } else if (state.phase === "roundEnd") {
    const lr = state.lastRound || {};
    const iLost = lr.loser === me;
    body = (
      <div className="gm-card gm-pop" style={{ marginTop: 18, padding: 26, textAlign: "center", borderColor: iLost ? "rgba(239,68,68,.4)" : "rgba(34,197,94,.4)" }}>
        <div style={{ fontSize: 34 }}>{iLost ? "💥" : "🎯"}</div>
        <div style={{ fontSize: 19, fontWeight: 900, color: iLost ? BAD : GOOD, margin: "6px 0 4px" }}>{iLost ? c.roundLost : c.roundWon}</div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>{c.roundLine(lr.round || 1, lr.loser, c.why[lr.why] || "")}</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>{c.chainLen(lr.len || 0)} · {c.nextRound}<Dots /></div>
      </div>
    );
  } else {
    const cur = state.currentAnime;
    const curStudios = names(cur?.studios), curGenres = names(cur?.genres);
    body = (
      <div className="gm-rise" style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="gm-link" style={{ "--tone": linkTone }}>
          <span className="gm-link-ico" aria-hidden="true">{linkForTurn === "studio" ? "🏢" : "🎌"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700 }}>{myTurn ? c.yourLink : c.theirLink(opp)}</div>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>{linkText}</div>
          </div>
          <TurnPill mine={myTurn}>{myTurn ? c.yourTurn : aiThinking ? d.thinking(opp) : c.turnOf(opp)}</TurnPill>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}><TimerBar left={timeLeft} total={40} /></div>
          <b style={{ minWidth: 34, textAlign: "right", fontVariantNumeric: "tabular-nums", color: timeLeft <= 10 ? BAD : "var(--text-2)" }}>{timeLeft}s</b>
        </div>

        {cur ? (
          <div className="gm-cur">
            <Poster key={cur.mal_id} src={cur.image_url} title={cur.title} w={72} h={102} radius={10} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Eyebrow>{c.current}</Eyebrow>
              <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-.01em", margin: "3px 0 8px", lineHeight: 1.2 }}>{cur.title}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {curStudios.slice(0, 3).map((s, i) => <span key={`${s}-${i}`} className="gm-chip" style={{ "--tone": TONE_STUDIO }}>🏢 {s}</span>)}
                {curGenres.slice(0, 4).map((x, i) => <span key={`${x}-${i}`} className="gm-chip" style={{ "--tone": TONE_GENRE }}>{x}</span>)}
              </div>
            </div>
          </div>
        ) : null}

        {myTurn ? (
          <div>
            <AnimeSearch onPick={handleGuess} usedIds={usedIds} placeholder={c.placeholder} emptyLabel={c.noResult} usedLabel={c.used} ariaLabel={c.placeholder} />
            {usedMsg ? <Note tone="bad" style={{ marginTop: 8 }}>{c.errUsed}</Note> : null}
            {tried ? (
              <div className="gm-seat gm-shake" style={{ marginTop: 8, borderColor: "rgba(239,68,68,.45)", background: "rgba(239,68,68,.08)", alignItems: "flex-start" }}>
                <Poster src={tried.anime.image_url} title={tried.anime.title} w={34} h={48} radius={6} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{tried.anime.title}</div>
                  <div style={{ fontSize: 12, color: BAD, fontWeight: 700, margin: "2px 0 5px" }}>{c.triedInvalid(tried.linkUsed === "studio" ? c.linkStudio : c.linkGenre)}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {names(tried.anime.studios).slice(0, 3).map((s, i) => <span key={`${s}-${i}`} className={`gm-chip${curStudios.includes(s) ? " hl" : ""}`} style={{ "--tone": TONE_STUDIO }}>🏢 {s}</span>)}
                    {names(tried.anime.genres).slice(0, 4).map((x, i) => <span key={`${x}-${i}`} className={`gm-chip${curGenres.includes(x) ? " hl" : ""}`} style={{ "--tone": TONE_GENRE }}>{x}</span>)}
                  </div>
                </div>
              </div>
            ) : null}
            <div style={{ marginTop: 8, textAlign: "right" }}>
              <Btn variant={giveUpArmed ? "warn" : "ghost"} size="sm" onClick={giveUp}>{giveUpArmed ? c.giveUpSure : c.giveUp}</Btn>
            </div>
          </div>
        ) : null}

        <div>
          <Eyebrow style={{ marginBottom: 6 }}>{c.chainTitle} · {state.chain.length}</Eyebrow>
          <div className="gm-scroll" style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 190 }}>
            {[...state.chain].reverse().map((a, ri) => {
              const i = state.chain.length - 1 - ri;
              const by = chainBy(i);
              return (
                <div key={a.mal_id} className={`gm-chain-row${ri === 0 ? " gm-pop" : ""}`}>
                  <Poster src={a.image_url} title={a.title} w={22} h={31} radius={5} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700 }}>{by ? (by === me ? g.common.you : by) : c.startTag}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <GameRoot style={{ padding: 18, maxWidth: 780, margin: "0 auto" }}>
      {hud}
      {state.phase !== "gameEnd" && <IdleBanner core={core} d={d} />}
      {core.netBad ? <Note tone="warn" style={{ marginTop: 10 }}>{d.netTrouble}</Note> : null}
      {body}
      <LeaveButton core={core} d={d} />
      <QuitBox core={core} copy={copy} d={d} onLeave={onClose} />
    </GameRoot>
  );
}

// ─── TIMELINE ──────────────────────────────────────────────────────────────────────────────────────────────────────
const TIMELINE_IDLE_MS = 90_000;                         // sans coup de l'adversaire pendant 90 s : victoire par abandon
const TIMELINE_AI_DELAY = { easy: 3000, medium: 2000, hard: 1300 };
// « Distribué » = au moins une carte quelque part. Ne PAS se fier à la main d'un seul joueur : celui qui a posé ses 5 cartes a la main vide.
const isTimelineLive = (s) => !!s && ((s.timeline?.length || 0) + (s.hand1?.length || 0) + (s.hand2?.length || 0) > 0);
const timelineIdleOf = (s) => (isTimelineLive(s) && s.phase === "play" ? { actor: s.currentTurn, limit: TIMELINE_IDLE_MS } : null);

export function TimelineGame({ room, onClose, onReady }) {
  const { g } = useGameText();
  const tl = g.timeline, d = g.duel;
  const startFailedRef = useRef(false);
  const [startFailed, setStartFailed] = useState(false);
  const empty = useMemo(() => ({
    timeline: [], hand1: [], hand2: [], deck: [], placed1: 0, placed2: 0, misses1: 0, misses2: 0, moves: 0, last: null,
    currentTurn: room.player1, phase: "play", winner: null, isDraw: false, skipped: null, lastChance: false,
  }), [room.player1]);
  const onStartFailed = useCallback(() => { startFailedRef.current = true; setStartFailed(true); }, []);
  const core = useDuelCore({
    room, game: "timeline", empty, isLive: isTimelineLive, idleOf: timelineIdleOf, finalExtra: { currentTurn: null },
    isOverExtra: () => startFailedRef.current, onStartFailed, onReady,
  });
  const { me, opp, isP1, isAI, level, state, stateRef, endedRef, commitLocal, push, closeWith } = core;
  const copy = useQuitCopy(core, room, "timeline");

  const [selId, setSelId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overSlot, setOverSlot] = useState(-1);

  const myHand = (isP1 ? state.hand1 : state.hand2) || [];
  const myPlaced = isP1 ? state.placed1 : state.placed2;
  const oppPlaced = isP1 ? state.placed2 : state.placed1;
  const myTurn = state.phase === "play" && state.currentTurn === me;
  const dealt = isTimelineLive(state);
  const selected = myHand.find((cd) => cd.mal_id === selId) || myHand[0] || null;      // sélection par identifiant : stable quand la main change

  // ── Distribution : seul le joueur 1 la fait (3 essais) ; impossible → partie annulée sans toucher à l'ELO ──
  useEffect(() => {
    if (!isP1 || isTimelineLive(room.state)) return undefined;
    let cancelled = false;
    (async () => {
      let rows = null;
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        rows = await sb.query("anime_cache?type=eq.TV&year=not.is.null&score=gte.6&scored_by=gte.2000&select=mal_id,title,year,image_url,scored_by&order=scored_by.desc&limit=3000").catch(() => null);
        if (rows?.length >= 11) break;
        await sleep(1500);
      }
      if (cancelled) return;
      const deal = rows?.length ? dealTimeline(rows, room.player1) : null;
      if (!deal) {
        startFailedRef.current = true; endedRef.current = true; setStartFailed(true);
        if (!isAI) finishRoom(room.id, { winner: null, state: { phase: "gameEnd", startFailed: true, timeline: [], hand1: [], hand2: [] } });
        return;
      }
      commitLocal(deal);
      push();
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Le joueur 2 attend la distribution : au-delà de 30 s, on abandonne l'attente
  useEffect(() => {
    if (isP1) return undefined;
    const id = setTimeout(() => { if (!isTimelineLive(stateRef.current) && !endedRef.current) { startFailedRef.current = true; setStartFailed(true); } }, 30_000);
    return () => clearTimeout(id);
  }, [isP1, stateRef, endedRef]);

  // ── Poser une carte ──
  const place = (cardId, pos) => {
    const s = stateRef.current;
    if (endedRef.current || s.phase !== "play" || s.currentTurn !== me) return;
    const res = timelineMove(s, { by: me, cardId, pos, p1: room.player1, p2: room.player2 });
    if (res.ignored) return;
    setSelId(null); setDragId(null); setOverSlot(-1);
    if (res.ended) { closeWith({ base: res.state, kind: "normal", winner: res.state.winner, isDraw: res.state.isDraw }); return; }
    commitLocal(res.state);
    push();
  };

  // ── IA : estime l'année de chaque carte (voir timelineAiMove) et joue celle dont elle est la plus sûre ──
  useEffect(() => {
    if (!isAI || state.phase !== "play" || state.currentTurn !== opp || !isTimelineLive(state)) return undefined;
    const timer = setTimeout(() => {
      const s = stateRef.current;
      if (endedRef.current || s.phase !== "play" || s.currentTurn !== opp) return;
      const res = timelineAiMove(s, { ai: opp, p1: room.player1, p2: room.player2, level });
      if (res.ignored) return;
      if (res.ended) closeWith({ base: res.state, kind: "normal", winner: res.state.winner, isDraw: res.state.isDraw });
      else commitLocal(res.state);
    }, (TIMELINE_AI_DELAY[level] || 2000) + Math.random() * 800);
    return () => clearTimeout(timer);
  }, [isAI, state.phase, state.currentTurn, state.moves, state, opp, level, room.player1, room.player2, stateRef, endedRef, closeWith, commitLocal]);

  const hud = (
    <DuelHud
      me={{ name: me, sub: subLabel(core, room, me, d), score: <>{myPlaced}<small>/{TIMELINE_HAND}</small></>, active: myTurn }}
      opp={{ name: opp, sub: subLabel(core, room, opp, d), score: <>{oppPlaced}<small>/{TIMELINE_HAND}</small></>, active: state.phase === "play" && state.currentTurn === opp }}
      center={<><Eyebrow>{tl.hudTitle}</Eyebrow><span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{tl.deckLeft(state.deck?.length || 0)}</span></>} />
  );

  if (startFailed) {
    return (
      <GameRoot style={{ padding: 30, textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
        <div style={{ fontSize: 38, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 18, lineHeight: 1.5 }}>{tl.dealFail}</div>
        <Btn variant="primary" size="lg" onClick={onClose}>{d.close}</Btn>
      </GameRoot>
    );
  }

  const last = state.last;
  const lastBanner = last ? (
    <div key={last.seq} className={`gm-last ${last.ok ? "good" : "bad"}`} role="status">
      <span style={{ fontSize: 24 }}>{last.ok ? "✅" : "❌"}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{last.by === me ? tl.youPlaced : tl.theyPlaced(last.by)} « {last.title} » — <span style={{ color: "var(--gm-violet)" }}>{last.year}</span></div>
        <div style={{ fontSize: 12, color: last.ok ? GOOD : BAD, fontWeight: 700, marginTop: 1 }}>{last.ok ? tl.rightSpot : tl.wrongSpot}</div>
      </div>
    </div>
  ) : null;

  // Frise : cartes posées (avec leur année) et emplacements entre elles
  const slotsLive = myTurn && !!selected;
  const board = (
    <div className="gm-tl" aria-label={tl.boardLabel}>
      <div className="gm-tl-in">
        {Array.from({ length: state.timeline.length * 2 + 1 }, (_, k) => {
          if (k % 2 === 0) {
            const pos = k / 2;
            return (
              <button key={`s${pos}`} type="button" className={`gm-slot${slotsLive ? " live" : ""}${overSlot === pos ? " over" : ""}`}
                disabled={!slotsLive} aria-label={tl.slotLabel(pos + 1)}
                onClick={() => selected && place(selected.mal_id, pos)}
                onDragOver={(e) => { if (slotsLive) { e.preventDefault(); setOverSlot(pos); } }}
                onDragLeave={() => setOverSlot((p) => (p === pos ? -1 : p))}
                onDrop={(e) => { e.preventDefault(); const id = Number(e.dataTransfer.getData("text/plain")) || dragId; if (slotsLive && id) place(id, pos); }}>
                +
              </button>
            );
          }
          const a = state.timeline[(k - 1) / 2];
          return (
            <div key={a.mal_id} className={`gm-tl-card${last && last.cardId === a.mal_id && last.ok ? " gm-pop" : ""}`}>
              <Poster src={a.image_url} title={a.title} w={104} h={146} radius={12} />
              <div className="gm-tl-year">{a.year || "?"}</div>
              <div className="gm-tl-name" title={a.title}>{a.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const hand = myHand.length > 0 && state.phase === "play" ? (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "4px 2px 4px" }}>
        <Eyebrow>{tl.handTitle(myHand.length)}</Eyebrow>
        <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{myTurn ? tl.dragHint : tl.handWait}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", padding: "6px 0 2px" }}>
        {myHand.map((cd) => {
          const isSel = selected?.mal_id === cd.mal_id && myTurn;
          return (
            <button key={cd.mal_id} type="button" className={`gm-hand-card${isSel ? " sel" : ""}${dragId === cd.mal_id ? " drag" : ""}`} disabled={!myTurn}
              draggable={myTurn} aria-pressed={isSel} title={cd.title}
              onClick={() => setSelId(cd.mal_id)}
              onDragStart={(e) => { setSelId(cd.mal_id); setDragId(cd.mal_id); e.dataTransfer.setData("text/plain", String(cd.mal_id)); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => { setDragId(null); setOverSlot(-1); }}>
              <Poster src={cd.image_url} title={cd.title} w={96} h={136} radius={12} />
              <span className="gm-hand-title">{cd.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  const turnLine = state.phase === "play" && dealt ? (
    <div style={{ textAlign: "center", margin: "12px 0 10px" }}>
      <TurnPill mine={myTurn}>
        {myTurn ? tl.yourTurn : (isAI ? d.thinking(opp) : tl.turnOf(opp))}
      </TurnPill>
      {state.lastChance ? <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gm-warn-text)", marginTop: 8 }}>{state.currentTurn === me ? tl.lastChanceMe : tl.lastChanceOpp(opp)}</div> : null}
    </div>
  ) : null;

  let endBox = null;
  if (state.phase === "gameEnd") {
    const w = state.result?.winner || state.winner;
    const sub = state.isDraw ? tl.endDraw : state.endReason === "count" ? tl.endCount(w) : tl.endRace(w);
    endBox = (
      <div style={{ marginTop: 14 }}>
        <DuelEnd core={core} scoreLine={<>{myPlaced}<span style={{ color: "var(--text-3)" }}>–</span>{oppPlaced}</>} subtitle={w || state.isDraw ? sub : null} onClose={onClose} />
      </div>
    );
  }

  return (
    <GameRoot style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
      {hud}
      {!dealt && state.phase === "play" ? (
        <div className="gm-card" style={{ marginTop: 14, padding: 34, textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 6 }}>🃏</div>
          <div style={{ fontSize: 13.5, color: "var(--text-2)" }}>{isP1 ? tl.dealing : tl.dealWait}<Dots /></div>
        </div>
      ) : (
        <>
          {state.phase !== "gameEnd" && turnLine}
          {state.phase !== "gameEnd" && <IdleBanner core={core} d={d} />}
          {core.netBad ? <Note tone="warn" style={{ marginTop: 10 }}>{d.netTrouble}</Note> : null}
          {lastBanner ? <div style={{ margin: "10px 0" }}>{lastBanner}</div> : <div style={{ height: 8 }} />}
          {endBox}
          <div style={{ marginTop: 10, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-3)", margin: "0 6px 6px" }}>
              <span>← {tl.oldest}</span><span>{tl.newest} →</span>
            </div>
            {board}
          </div>
          {hand}
        </>
      )}
      <LeaveButton core={core} d={d} />
      <QuitBox core={core} copy={copy} d={d} onLeave={onClose} />
    </GameRoot>
  );
}
