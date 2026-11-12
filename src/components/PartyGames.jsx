// ─── JEUX À PLUSIEURS — Cluescale (2-4 joueurs, en ligne) et Imposteur / Undercover (même appareil ou en ligne) ──────
// Cluescale : chaque joueur est juge deux fois. Le juge reçoit un thème et une note secrète de 1 à 20, donne un indice, le jury
//   devine la note. Jury : exact +3, à 1 près +1 ; juge : +2 si quelqu'un s'est approché à 1 près. Le vainqueur gagne 3 points
//   de classement par point d'avance sur le second.
// Imposteur : l'équipage partage un mot secret, l'imposteur n'a qu'un vague indice. Deux tours d'indices, un vote, et l'imposteur
//   démasqué a une dernière chance de deviner le mot. Règles : src/utils/undercoverRules.js et undercoverOnline.js (testées).
import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../context/useApp.js";
import { sb } from "../api/supabase.js";
import {
  GameRoot, Btn, Bubble, Dots, Eyebrow, Note, EndScreen, QuitDialog, TurnPill, GOOD, BAD,
} from "./gameUi.jsx";
import { useGameText, useQuitGate } from "../hooks/useGameUi.js";
import { cluescaleScoreRound, cluescaleWinnerPoints } from "../utils/gameRules.js";
import { CLUESCALE_THEMES, pickRandom, randomScore } from "../utils/cluescaleState.js";
import { UNDERCOVER_WORDS } from "../constants/undercoverWords.js";
import { isGuessCorrect, isClueForbidden, undercoverPoints, tallyVotes } from "../utils/undercoverRules.js";
import { claimFinish, readRoom, roomTx, addGamePoints } from "../utils/gameRooms.js";
import { ucReady, ucClue, ucSkip, ucVote, ucGuess, ucGuessTimeout, ucAbort, ucCurrent, ucImpostor, ucWaitingFor, UC_ROUNDS } from "../utils/undercoverOnline.js";

// ─── CLUESCALE ────────────────────────────────────────────────────────────────────────────────────────────────────
const CLUE_IDLE_SECS = 90;   // sans aucune action pendant 1 min 30 : on propose de passer / terminer

function ScoreStrip({ players, scores, judge, me, g }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 18 }} role="group" aria-label="score">
      {players.map((p) => (
        <div key={p} className="gm-seat" style={{ padding: "5px 12px 5px 6px", borderRadius: 99, gap: 7,
          ...(p === judge ? { borderColor: "rgba(167,139,250,.65)", background: "rgba(139,92,246,.13)" } : null) }}>
          <Bubble name={p} size={26} active={p === judge} />
          <span style={{ fontSize: 12, fontWeight: 800 }}>{p}{p === me ? ` (${g.common.you})` : ""}</span>
          {p === judge ? <span title={g.cluescale.judge} aria-label={g.cluescale.judge}>⚖️</span> : null}
          <b style={{ fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{scores?.[p] || 0}</b>
          <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700 }}>pts</span>
        </div>
      ))}
    </div>
  );
}

/** Bouton discret « Quitter la partie » (rouge au survol) : ouvre la même fenêtre de confirmation que la croix de la fenêtre. */
function LeaveRow({ label, onClick }) {
  return (
    <div style={{ textAlign: "center", marginTop: 16 }}>
      <Btn variant="leave" size="sm" icon="🚪" onClick={() => onClick()}>{label}</Btn>
    </div>
  );
}

export function CluescaleGame({ room, onClose, onReady }) {
  const { myUsername } = useApp();
  const { g } = useGameText();
  const c = g.cluescale;
  const players = room.players || [room.player1, room.player2, room.player3, room.player4].filter(Boolean);
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
  const [award, setAward] = useState({ status: "none" });
  const apply = useCallback((next) => { stateRef.current = next; lastChangeRef.current = Date.now(); setStateRaw(next); }, []);
  const quit = useQuitGate(onReady, () => stateRef.current?.phase === "gameEnd", null);

  const pushState = useCallback(async (newState) => {
    await sb.query(`game_rooms?id=eq.${room.id}&status=eq.active`, {
      method: "PATCH", headers: { ...sb.headers, Prefer: "return=minimal" },
      body: JSON.stringify({ state: newState, updated_at: new Date().toISOString() }),
    }).catch(() => {});
  }, [room.id]);

  const fetchFresh = useCallback(async () => {
    const rows = await sb.query(`game_rooms?id=eq.${room.id}&select=state,status&limit=1`).catch(() => null);
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
    if (!mine || busyRef.current) return;
    busyRef.current = true;
    try {
      const fresh = (await fetchFresh()) || stateRef.current;
      if (fresh.phase !== "vote" || fresh.judgeRound !== mine.round) { apply(fresh); return; }
      const guesses = { ...(fresh.guesses || {}), [myUsername]: mine.value };
      let next = { ...fresh, guesses };
      if (players.filter((p) => p !== fresh.judge).every((p) => guesses[p] !== undefined)) next = revealState(next);
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
        if (!r?.state) return;
        const str = JSON.stringify(r.state);
        if (str !== lastStateRef.current) {
          lastStateRef.current = str;
          const prev = stateRef.current;
          apply(r.state);
          if (!prev || prev.judgeRound !== r.state.judgeRound) { setClue(""); setGuess(10); }
        }
        const cur = stateRef.current, mine = myGuessRef.current;
        if (mine && cur.phase === "vote" && cur.judgeRound === mine.round && cur.guesses?.[myUsername] === undefined) commitGuess();
      } catch { /* réseau : au prochain tour */ }
    }, 1500);
    return () => clearInterval(poll);
  }, [room.id, apply, commitGuess, myUsername]);

  // Compte des secondes sans aucune action (pour proposer de passer si quelqu'un est parti)
  useEffect(() => {
    const id = setInterval(() => setIdleSecs(Math.floor((Date.now() - lastChangeRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  function buildNextTurn(prev) {
    const totalTurns = players.length * 2;
    const judgeRound = prev.judgeRound || 0;
    if (judgeRound >= totalTurns) return { ...prev, phase: "gameEnd" };
    return {
      ...prev, phase: "clue", judgeRound: judgeRound + 1, judge: players[judgeRound % players.length],
      theme: pickRandom(CLUESCALE_THEMES), score: randomScore(), clue: null, guesses: {},
    };
  }

  const submitClue = async () => {
    if (!clue.trim() || submitting) return;
    setSubmitting(true);
    const newState = { ...state, phase: "vote", clue: clue.trim() };
    apply(newState);
    await pushState(newState);
    setSubmitting(false);
  };

  const submitGuess = async () => {
    if (submitting || state?.guesses?.[myUsername] !== undefined) return;
    setSubmitting(true);
    myGuessRef.current = { round: state.judgeRound, value: Number(guess) };
    await commitGuess();
    setSubmitting(false);
  };

  // Fin de partie : l'état final et la clôture de la salle (« finished ») s'écrivent EN UNE SEULE requête atomique.
  const endGame = async (finalState) => {
    apply(finalState);
    await claimFinish(room.id, { winner: cluescaleWinnerPoints(finalState.scores).winner, state: finalState });
  };

  // Tour suivant : l'hôte, ou n'importe qui si l'hôte est resté inactif ; on relit d'abord la base (jamais deux tours d'avance)
  const nextTurn = async () => {
    if (!isHost && idleSecs < CLUE_IDLE_SECS) return;
    const fresh = (await fetchFresh()) || stateRef.current;
    if (fresh.phase !== "reveal") { apply(fresh); return; }
    if (fresh.nextPhase === "gameEnd") { await endGame({ ...fresh, phase: "gameEnd" }); return; }
    const next = buildNextTurn(fresh);
    apply(next);
    await pushState(next);
  };

  // Joueur absent : révéler avec les votes reçus, ou terminer la partie
  const forceAct = async (kind) => {
    const fresh = (await fetchFresh()) || stateRef.current;
    const cur = stateRef.current;
    if (fresh.judgeRound !== cur.judgeRound || fresh.phase !== cur.phase) { apply(fresh); return; }   // quelqu'un a déjà avancé
    if (kind !== "reveal") { await endGame({ ...fresh, phase: "gameEnd" }); return; }
    const next = revealState(fresh);
    apply(next);
    await pushState(next);
  };

  // Points de classement du vainqueur — une seule fois par partie, avec écriture conditionnelle et résultat affiché
  const awardedRef = useRef(false);
  const doAward = useCallback(async (earned) => {
    setAward({ status: "pending", pts: earned });
    const r = await addGamePoints(myUsername, "pts_cluescale", earned);
    setAward(r.ok ? { status: "done", pts: r.added } : { status: "failed", pts: earned, error: r.error });
  }, [myUsername]);
  useEffect(() => {
    if (state?.phase !== "gameEnd") return undefined;
    const id = setTimeout(() => {
      if (awardedRef.current) return;
      awardedRef.current = true;
      const { winner, earned } = cluescaleWinnerPoints(stateRef.current?.scores);
      if (winner === myUsername && earned > 0) doAward(earned);
    }, 0);
    return () => clearTimeout(id);
  }, [state?.phase, myUsername, doAward]);

  if (!state) return <GameRoot style={{ padding: 40, textAlign: "center" }}><div style={{ fontSize: 32 }}>⏳</div><div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 8 }}>{c.init}<Dots /></div></GameRoot>;

  const isJudge = state.judge === myUsername;
  const otherPlayers = players.filter((p) => p !== state.judge);
  const idleBox = (idleSecs >= CLUE_IDLE_SECS && state.phase !== "gameEnd") ? (
    <Note tone="warn" style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 8 }}>{c.idle}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {state.phase === "vote" && Object.keys(state.guesses || {}).length > 0 && <Btn size="sm" onClick={() => forceAct("reveal")}>{c.reveal}</Btn>}
        <Btn variant="warn" size="sm" onClick={() => forceAct("end")}>{c.endGame}</Btn>
      </div>
    </Note>
  ) : null;

  const frame = (content) => (
    <GameRoot style={{ padding: 22, maxWidth: 580, margin: "0 auto" }}>
      {state.phase !== "gameEnd" && <ScoreStrip players={players} scores={state.scores} judge={state.judge} me={myUsername} g={g} />}
      {content}
      {state.phase !== "gameEnd" && <LeaveRow label={c.quitConfirm} onClick={quit.ask} />}
      <QuitDialog open={quit.open} title={c.quitTitle} body={c.quitBody} stayLabel={c.quitStay} quitLabel={c.quitConfirm} onStay={quit.stay} onQuit={() => { quit.stay(); onClose(); }} danger={false} />
    </GameRoot>
  );

  // ── Fin de partie ──
  if (state.phase === "gameEnd") {
    const sorted = Object.entries(state.scores || {}).sort((a, b) => b[1] - a[1]);
    const { winner, earned } = cluescaleWinnerPoints(state.scores);
    const iWon = winner === myUsername;
    return frame(
      <EndScreen tone={iWon ? "win" : "neutral"} icon="🏆" title={c.endTitle} subtitle={winner ? c.winnerIs(winner) : c.tie}
        mode={iWon && earned > 0 ? "party" : undefined} settlement={award.status === "none" ? { status: "pending" } : award}
        onRetry={award.status === "failed" ? () => doAward(earned) : undefined}
        actions={[{ label: g.common.back, onClick: onClose }]}>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8, maxWidth: 320, margin: "18px auto 0" }}>
          {sorted.map(([p, s], i) => (
            <div key={p} className="gm-seat gm-pop" style={{ animationDelay: `${0.3 + i * 0.08}s`, ...(i === 0 ? { borderColor: "rgba(34,197,94,.5)", background: "rgba(34,197,94,.1)" } : null) }}>
              <span style={{ fontSize: 18 }}>{["🥇", "🥈", "🥉", "4️⃣"][i]}</span>
              <Bubble name={p} size={28} />
              <span style={{ flex: 1, minWidth: 0, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{s} pts</b>
            </div>
          ))}
        </div>
      </EndScreen>
    );
  }

  // ── Révélation ──
  if (state.phase === "reveal") {
    return frame(
      <div className="gm-rise">
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <Eyebrow>{c.themeLabel} · {state.theme}</Eyebrow>
          <div style={{ fontSize: 34, fontWeight: 900, color: "var(--gm-violet)", margin: "6px 0 4px", letterSpacing: "-.03em" }} className="gm-pop">{c.scoreWas(state.score)}</div>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>{c.clueBy(state.judge)} <strong>« {state.clue} »</strong></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {otherPlayers.map((p) => {
            const gu = state.guesses?.[p];
            const diff = gu !== undefined ? Math.abs(gu - state.score) : null;
            const pts = diff === 0 ? "+3" : diff === 1 ? "+1" : "+0";
            const color = diff === 0 ? GOOD : diff === 1 ? "var(--gm-warn-text)" : "var(--text-3)";
            return (
              <div key={p} className="gm-seat">
                <Bubble name={p} size={30} />
                <span style={{ flex: 1, fontWeight: 800 }}>{p}</span>
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>{gu === undefined ? c.noVote : c.said(gu)}</span>
                <b style={{ color, minWidth: 28, textAlign: "right" }}>{pts}</b>
              </div>
            );
          })}
          {Object.values(state.guesses || {}).some((v) => Math.abs(v - state.score) <= 1) && <Note tone="good">🎯 {c.judgeBonus(state.judge)}</Note>}
        </div>
        {idleBox}
        {(isHost || idleSecs >= CLUE_IDLE_SECS)
          ? <Btn variant="primary" size="lg" block onClick={nextTurn}>{state.nextPhase === "gameEnd" ? c.seeResults : c.nextTurn}</Btn>
          : <Note tone="info">{c.waitingHostNext(players[0])}<Dots /></Note>}
      </div>
    );
  }

  // ── Vote ──
  if (state.phase === "vote") {
    const myGuess = state.guesses?.[myUsername];
    const votedCount = Object.keys(state.guesses || {}).length;
    return frame(
      <div className="gm-rise">
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <Eyebrow style={{ color: "var(--gm-violet)" }}>{c.themeLabel}</Eyebrow>
          <div style={{ fontSize: 21, fontWeight: 900, margin: "4px 0 12px", letterSpacing: "-.01em" }}>{state.theme}</div>
          <div className="gm-card" style={{ padding: "14px 18px", fontSize: 17, fontWeight: 700, background: "rgba(139,92,246,.1)", borderColor: "rgba(139,92,246,.3)" }}>💬 « {state.clue} »</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>{c.clueBy(state.judge)}</div>
        </div>
        {idleBox}
        {isJudge ? (
          <div className="gm-card" style={{ textAlign: "center", padding: 22 }}>
            <div style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 700 }}>{c.juryVoting(votedCount, otherPlayers.length)}<Dots /></div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
              {otherPlayers.map((p) => (
                <span key={p} className="gm-tag" style={{ "--tone": state.guesses?.[p] !== undefined ? "34,197,94" : "148,163,184" }}>{p} {state.guesses?.[p] !== undefined ? "✓" : "…"}</span>
              ))}
            </div>
          </div>
        ) : myGuess !== undefined ? (
          <div className="gm-card" style={{ textAlign: "center", padding: 22 }}>
            <div style={{ fontSize: 30 }}>✅</div>
            <div style={{ fontSize: 14, color: "var(--text-2)", marginTop: 6 }}>{c.yourAnswer} <strong style={{ color: "var(--gm-violet)", fontSize: 18 }}>{myGuess}/20</strong></div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>{c.votedCount(votedCount, otherPlayers.length)}</div>
          </div>
        ) : (
          <div className="gm-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, color: "var(--text-2)", textAlign: "center", marginBottom: 12 }}>{c.whichScore(state.judge)}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 10 }}>
              <Btn variant="soft" size="sm" aria-label="-1" onClick={() => setGuess((v) => Math.max(1, v - 1))}>−</Btn>
              <div style={{ minWidth: 86, textAlign: "center", fontSize: 40, fontWeight: 900, color: "var(--gm-violet)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{guess}<span style={{ fontSize: 16, color: "var(--text-3)" }}>/20</span></div>
              <Btn variant="soft" size="sm" aria-label="+1" onClick={() => setGuess((v) => Math.min(20, v + 1))}>+</Btn>
            </div>
            <input type="range" min={1} max={20} value={guess} onChange={(e) => setGuess(Number(e.target.value))} aria-label={c.whichScore(state.judge)} style={{ width: "100%", accentColor: "#a78bfa", marginBottom: 14 }} />
            <Btn variant="primary" size="lg" block onClick={submitGuess} disabled={submitting}>{c.vote(guess)}</Btn>
          </div>
        )}
      </div>
    );
  }

  // ── Indice ──
  return frame(
    <div className="gm-rise">
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <Eyebrow>{c.round(state.judgeRound, players.length * 2)} · {c.judgeIs(state.judge)}</Eyebrow>
        <div style={{ fontSize: 22, fontWeight: 900, margin: "6px 0 0", letterSpacing: "-.01em" }}>{state.theme}</div>
      </div>
      {idleBox}
      {isJudge ? (
        <div>
          <div style={{ textAlign: "center", marginBottom: 16, padding: "16px 20px", borderRadius: 18, background: "linear-gradient(160deg,rgba(124,58,237,.22),rgba(79,70,229,.08))", border: "1px solid rgba(139,92,246,.35)" }}>
            <Eyebrow>{c.secretScore}</Eyebrow>
            <div style={{ fontSize: 52, fontWeight: 900, color: "var(--gm-violet)", lineHeight: 1.1 }}>{state.score}<span style={{ fontSize: 20, color: "var(--text-3)" }}>/20</span></div>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 10, textAlign: "center" }}>{c.giveClueHint}</div>
          <input className="gm-input" value={clue} onChange={(e) => setClue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitClue()}
            placeholder={c.cluePlaceholder(state.score, state.theme)} maxLength={80} style={{ marginBottom: 10 }} aria-label={c.giveClue} />
          <Btn variant="primary" size="lg" block onClick={submitClue} disabled={!clue.trim() || submitting}>{c.giveClue}</Btn>
        </div>
      ) : (
        <div className="gm-card" style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 13.5, color: "var(--text-2)" }}>{c.waitingClue(state.judge)}<Dots /></div>
        </div>
      )}
    </div>
  );
}

// ─── IMPOSTEUR — éléments communs (même appareil / en ligne) ────────────────────────────────────────────────────────────
function UcSteps({ phase, g }) {
  const steps = [["reveal", g.uc.stepRole], ["clues", g.uc.stepClues], ["vote", g.uc.stepVote], ["result", g.uc.stepResult]];
  const idx = phase === "guess" ? 2 : Math.max(0, steps.findIndex(([k]) => k === phase));
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 16 }} aria-label={steps[idx][1]}>
      {steps.map(([k, label], i) => (
        <span key={k} className="gm-tag" style={{ "--tone": i === idx ? "244,114,182" : "148,163,184", opacity: i <= idx ? 1 : 0.55 }}>{i < idx ? "✓ " : ""}{label}</span>
      ))}
    </div>
  );
}

function UcClues({ players, clues, currentName, me }) {
  return (
    <div className="gm-card" style={{ padding: 12, marginBottom: 14, display: "flex", flexDirection: "column", gap: 7 }}>
      {players.map((p) => {
        const words = clues.filter((c) => c.username === p.username);
        const active = p.username === currentName;
        return (
          <div key={p.username} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 30 }}>
            <Bubble name={p.username} size={26} active={active} />
            <span style={{ fontSize: 12, fontWeight: 800, minWidth: 74, color: active ? "#f9a8d4" : "var(--text-1)" }}>{p.username}{p.username === me ? " ★" : ""}</span>
            {words.map((c, i) => (
              <span key={i} className="gm-pop" style={{ fontSize: 12.5, fontWeight: 700, padding: "3px 11px", borderRadius: 99, background: c.skipped ? "rgba(148,163,184,.15)" : "rgba(236,72,153,.14)", border: "1px solid rgba(236,72,153,.28)", opacity: c.skipped ? 0.6 : 1 }}>{c.word}</span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function UcRoleCard({ g, player }) {
  const u = g.uc;
  return (
    <div className="gm-pop" style={{ padding: "18px 16px", borderRadius: 18, textAlign: "center",
      background: player.isImpostor ? "linear-gradient(160deg,rgba(239,68,68,.2),rgba(239,68,68,.05))" : "linear-gradient(160deg,rgba(124,58,237,.22),rgba(79,70,229,.06))",
      border: `1px solid ${player.isImpostor ? "rgba(239,68,68,.45)" : "rgba(139,92,246,.45)"}` }}>
      {player.isImpostor ? (
        <>
          <div style={{ fontSize: 34 }}>😈</div>
          <Eyebrow style={{ color: "var(--gm-bad-text)", margin: "6px 0" }}>{u.youAreImpostor}</Eyebrow>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>{u.yourHint} <strong style={{ color: "var(--gm-warn-text)" }}>{player.hint}</strong></div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>{u.impostorTip}</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 34 }}>🕵️</div>
          <Eyebrow style={{ color: "var(--gm-violet)", margin: "6px 0" }}>{u.yourWord}</Eyebrow>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-.02em" }}>{player.word}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8 }}>{u.crewTip}</div>
        </>
      )}
    </div>
  );
}

/** Écran de fin commun : verdict + mot + imposteur + points. `myPts` = points de ce joueur ; `award` = état de l'enregistrement. */
function UcResultScreen({ g, result, word, impostorName, me, meIsImpostor, award, onRetry, actions, votes, extra }) {
  const u = g.uc;
  const aborted = !!result.aborted;
  const partial = result.impostorFound && result.impostorGuessed;
  const crewWon = result.impostorFound && !result.impostorGuessed;
  const iWon = meIsImpostor == null ? crewWon : meIsImpostor ? !result.impostorFound : crewWon;
  const tone = aborted ? "neutral" : partial ? "draw" : iWon ? "win" : "loss";
  const icon = aborted ? "🚪" : result.impostorFound ? (partial ? "🤔" : "🎉") : "😈";
  const title = aborted ? u.resultAborted : result.impostorFound ? (partial ? u.resultGuessed : u.resultCaught) : u.resultEscaped;
  const myPts = result.pts?.[me] || 0;
  return (
    <EndScreen tone={tone} icon={icon} title={title}
      subtitle={<>{u.secretWord} <strong style={{ color: "var(--gm-violet)" }}>{word}</strong> · {u.impostor} <strong style={{ color: "var(--gm-bad-text)" }}>{impostorName}</strong></>}
      mode={myPts > 0 && award ? "party" : undefined} settlement={award} onRetry={onRetry} actions={actions}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6, maxWidth: 360, margin: "16px auto 0" }}>
        {Object.entries(result.pts || {}).map(([name, p]) => (
          <div key={name} className="gm-seat" style={{ padding: "6px 12px" }}>
            <Bubble name={name} size={26} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>{name}{name === me ? ` (${g.common.you})` : ""}</span>
            <b style={{ color: GOOD }}>{u.pts(p)}</b>
          </div>
        ))}
        {votes ? <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>{Object.entries(votes).map(([v, s]) => `${v} → ${s}`).join(" · ")}</div> : null}
      </div>
      {extra}
    </EndScreen>
  );
}

// Points de l'Imposteur : uniquement ceux du compte connecté, une seule fois par partie
function useUndercoverAward(me) {
  const [award, setAward] = useState(null);                 // null = rien à enregistrer
  const doneRef = useRef(false);
  const run = useCallback(async (pts) => {
    setAward({ status: "pending", elo: 0, pts });
    const r = await addGamePoints(me, "pts_undercover", pts);
    setAward(r.ok ? { status: "done", elo: 0, pts: r.added } : { status: "failed", elo: 0, pts, error: r.error });
  }, [me]);
  const once = useCallback((pts) => { if (doneRef.current) return; doneRef.current = true; if (pts > 0) run(pts); }, [run]);
  return { award, once, retry: (pts) => run(pts) };
}

// ─── IMPOSTEUR — sur le même appareil ──────────────────────────────────────────────────────────────────────────────────
const UC_GUESS_SECS = 30;

function UndercoverLocal({ players, onClose, onReplay, onReady }) {
  const { myUsername } = useApp();
  const { g } = useGameText();
  const t = g.uc;
  const [phase, setPhase]         = useState("reveal");   // reveal → clues → vote → (guess) → result
  const [revealIdx, setRevealIdx] = useState(0);
  const [revealed, setRevealed]   = useState(false);
  const [clues, setClues]         = useState([]);
  const [input, setInput]         = useState("");
  const [voteIdx, setVoteIdx]     = useState(0);
  const [votes, setVotes]         = useState({});
  const [guessInput, setGuessInput] = useState("");
  const [timer, setTimer]         = useState(UC_GUESS_SECS);
  const [result, setResult]       = useState(null);
  const [clueError, setClueError] = useState("");
  const finishedRef = useRef(false);
  const { award, once, retry } = useUndercoverAward(myUsername);
  const quit = useQuitGate(onReady, () => finishedRef.current || phase === "result", null);

  const impostor  = players.find((p) => p.isImpostor);
  const crewWord  = players.find((p) => !p.isImpostor)?.word || "";
  const crewEntry = UNDERCOVER_WORDS.find((e) => e.word === crewWord) || { word: crewWord, aliases: [] };
  const turnIdx   = clues.length;
  const current   = players[turnIdx % players.length];

  const finalize = useCallback((impostorFound, impostorGuessed) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const pts = undercoverPoints(players, impostorFound, impostorGuessed);
    setResult({ impostorFound, impostorGuessed, pts });
    setPhase("result");
    once(pts[myUsername] || 0);
  }, [players, myUsername, once]);

  useEffect(() => {
    if (phase !== "guess") return;
    const id = setInterval(() => setTimer((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => { if (phase === "guess" && timer === 0) finalize(true, false); }, [phase, timer, finalize]);

  const nextReveal = () => { setRevealed(false); if (revealIdx + 1 >= players.length) setPhase("clues"); else setRevealIdx((i) => i + 1); };
  const submitClue = () => {
    const word = input.trim();
    if (!word) return;
    if (!current.isImpostor && isClueForbidden(word, crewEntry)) { setClueError(t.forbidden); return; }
    setClueError("");
    const next = [...clues, { username: current.username, word }];
    setClues(next);
    setInput("");
    if (next.length >= players.length * UC_ROUNDS) setPhase("vote");
  };
  const castVote = (suspect) => {
    const voter = players[voteIdx].username;
    const next = { ...votes, [voter]: suspect };
    setVotes(next);
    if (voteIdx + 1 < players.length) { setVoteIdx((i) => i + 1); return; }
    if (tallyVotes(next, impostor.username).impostorFound) { setTimer(UC_GUESS_SECS); setPhase("guess"); }
    else finalize(false, false);
  };

  let body;
  if (phase === "reveal") {
    const p = players[revealIdx];
    body = !revealed ? (
      <div style={{ textAlign: "center", padding: "14px 0" }} className="gm-rise">
        <div style={{ fontSize: 40, marginBottom: 10 }}>📱</div>
        <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 6 }}>{t.passTo(p.username)}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 20 }}>{t.passHint}</div>
        <Btn variant="primary" size="lg" onClick={() => setRevealed(true)}>{t.reveal}</Btn>
      </div>
    ) : (
      <div style={{ textAlign: "center" }}>
        <UcRoleCard g={g} player={p} />
        <div style={{ marginTop: 16 }}><Btn variant="primary" size="lg" block onClick={nextReveal}>{t.memorized}</Btn></div>
      </div>
    );
  } else if (phase === "clues") {
    body = (
      <div className="gm-rise">
        {clues.length > 0 && <UcClues players={players} clues={clues} currentName={current.username} />}
        <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-2)", fontWeight: 700, marginBottom: 10 }}>{t.round(Math.floor(turnIdx / players.length) + 1, UC_ROUNDS, current.username)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="gm-input" value={input} onChange={(e) => { setInput(e.target.value); setClueError(""); }} onKeyDown={(e) => e.key === "Enter" && submitClue()}
            placeholder={t.wordPlaceholder} maxLength={30} autoFocus aria-label={t.wordPlaceholder} />
          <Btn variant="primary" onClick={submitClue} disabled={!input.trim()}>{t.ok}</Btn>
        </div>
        {clueError ? <Note tone="bad" style={{ marginTop: 10 }}>{clueError}</Note> : null}
      </div>
    );
  } else if (phase === "vote") {
    const voter = players[voteIdx];
    body = (
      <div className="gm-rise">
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{t.whoIsImpostor}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{t.votedCount(voteIdx, players.length)}</div>
        </div>
        <UcClues players={players} clues={clues} currentName={voter.username} />
        <div style={{ fontSize: 13, fontWeight: 800, color: "#f9a8d4", textAlign: "center", marginBottom: 8 }}>{t.voteTurn(voter.username)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
          {players.filter((p) => p.username !== voter.username).map((p) => (
            <Btn key={p.username} variant="soft" onClick={() => castVote(p.username)}><Bubble name={p.username} size={24} /> {p.username}</Btn>
          ))}
        </div>
      </div>
    );
  } else if (phase === "guess") {
    body = (
      <div style={{ textAlign: "center" }} className="gm-rise">
        <div style={{ fontSize: 17, fontWeight: 900, color: "var(--gm-bad-text)", marginBottom: 6 }}>{t.impostorCaught}</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 10 }}>{t.guessPrompt(impostor.username, UC_GUESS_SECS)}</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: timer <= 10 ? BAD : "var(--gm-warn-text)", marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>{timer}s</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="gm-input" value={guessInput} onChange={(e) => setGuessInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && finalize(true, isGuessCorrect(guessInput, crewEntry))}
            placeholder={t.guessPlaceholder} autoFocus aria-label={t.guessPlaceholder} />
          <Btn variant="primary" onClick={() => finalize(true, isGuessCorrect(guessInput, crewEntry))}>{t.ok}</Btn>
        </div>
      </div>
    );
  } else {
    body = (
      <UcResultScreen g={g} result={result} word={crewWord} impostorName={impostor.username} me={myUsername} meIsImpostor={null}
        award={award} onRetry={() => retry(result.pts[myUsername] || 0)}
        extra={<div style={{ position: "relative", fontSize: 11, color: "var(--text-3)", marginTop: 12 }}>{t.yourPointsNote}</div>}
        actions={[...(onReplay ? [{ label: t.replay, onClick: onReplay }] : []), { label: t.close, onClick: onClose, variant: onReplay ? "soft" : "primary" }]} />
    );
  }

  return (
    <GameRoot style={{ padding: 22 }}>
      {phase !== "result" && <UcSteps phase={phase} g={g} />}
      {body}
      {phase !== "result" && <LeaveRow label={t.quitConfirm} onClick={quit.ask} />}
      <QuitDialog open={quit.open} title={t.quitTitle} body={t.quitBodyLocal} stayLabel={t.quitStay} quitLabel={t.quitConfirm} onStay={quit.stay} onQuit={() => { quit.stay(); onClose(); }} danger={false} />
    </GameRoot>
  );
}

// ─── IMPOSTEUR — en ligne ────────────────────────────────────────────────────────────────────────────────────────────────
const UC_IDLE_SECS = 60;
const finishPatch = (next) => (next.phase === "result" ? { status: "finished" } : null);

function UndercoverOnline({ room, onClose, onReady }) {
  const { myUsername: me } = useApp();
  const { g } = useGameText();
  const t = g.uc;
  const [state, setState] = useState(room.state);
  const stateRef = useRef(room.state);
  const [mountedAt] = useState(Date.now);
  const [lastChange, setLastChange] = useState(mountedAt);   // dernière fois où la partie a bougé
  const [now, setNow] = useState(mountedAt);
  const [input, setInput] = useState("");
  const [shown, setShown] = useState(false);          // le rôle reste masqué tant qu'on ne le découvre pas
  const [peek, setPeek] = useState(true);             // rappel du rôle pendant les indices
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const { award, once, retry } = useUndercoverAward(me);
  const quit = useQuitGate(onReady, () => stateRef.current?.phase === "result", null);

  const apply = useCallback((next) => {
    if (!next) return;
    const prev = stateRef.current;
    if (prev && prev.v === next.v && prev.phase === next.phase) return;
    stateRef.current = next; setLastChange(Date.now()); setState(next);
  }, []);

  const act = useCallback(async (mutate) => {
    setBusy(true); setMsg("");
    const res = await roomTx(room.id, mutate, { patch: finishPatch });
    setBusy(false);
    if (res.ok) apply(res.state);
    else if (res.reason === "closed" && res.state) apply(res.state);
    else if (res.reason === "gone") setMsg(t.roomGone);
    else setMsg(t.netError);
    return res;
  }, [room.id, apply, t.roomGone, t.netError]);

  // Synchronisation (1,2 s) + horloge
  useEffect(() => {
    let stop = false;
    const poll = setInterval(async () => {
      try {
        const row = await readRoom(room.id);
        if (stop) return;
        if (!row) { setMsg(t.roomGone); return; }
        if (row.state) apply(row.state);
      } catch { /* réseau : au prochain tour */ }
    }, 1200);
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => { stop = true; clearInterval(poll); clearInterval(clock); };
  }, [room.id, apply, t.roomGone]);

  // Dernière chance de l'imposteur : le temps est écoulé → n'importe quel joueur le constate (une seule écriture passe)
  const guessDeadline = state?.phase === "guess" ? state.guessDeadline : null;
  const timeoutTried = useRef(0);
  useEffect(() => {
    if (!guessDeadline || now < guessDeadline || timeoutTried.current === guessDeadline) return;
    timeoutTried.current = guessDeadline;
    act((s) => ucGuessTimeout(s, Date.now()));
  }, [guessDeadline, now, act]);

  // Points : ceux de ce compte, une seule fois
  useEffect(() => {
    if (state?.phase === "result" && !state.result?.aborted) once(state.result?.pts?.[me] || 0);
  }, [state?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;
  const mePlayer = state.players.find((p) => p.username === me);
  const impostor = ucImpostor(state);
  const idle = Math.floor((now - lastChange) / 1000);
  const waiting = ucWaitingFor(state);
  const myTurn = state.phase === "clues" && ucCurrent(state).username === me;

  const sendClue = async () => {
    const r = ucClue(stateRef.current, me, input);
    if (!r) return;
    if (r.error) { setMsg(r.error === "forbidden" ? t.forbidden : r.error === "empty" ? "" : t.notYourTurn); return; }
    const w = input;
    setInput("");
    await act((s) => ucClue(s, me, w)?.state || null);
  };
  const sendGuess = () => act((s) => ucGuess(s, me, input));

  const idleBox = idle >= UC_IDLE_SECS && state.phase !== "result" && state.phase !== "guess" ? (
    <Note tone="warn" style={{ marginTop: 14 }}>
      <div style={{ marginBottom: 8 }}>{t.idle(waiting.join(", "))}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {state.phase === "clues" && <Btn size="sm" onClick={() => act((s) => ucSkip(s))}>{t.skipTurn}</Btn>}
        <Btn variant="warn" size="sm" onClick={() => act((s) => ucAbort(s))}>{t.endGame}</Btn>
      </div>
    </Note>
  ) : null;

  let body;
  if (state.phase === "reveal") {
    const iAmReady = !!state.ready?.[me];
    body = (
      <div style={{ textAlign: "center" }} className="gm-rise">
        {!shown && !iAmReady ? (
          <div style={{ padding: "10px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎴</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>{t.yourRoleTitle}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 18 }}>{t.revealPrivate}</div>
            <Btn variant="primary" size="lg" onClick={() => setShown(true)}>{t.reveal}</Btn>
          </div>
        ) : (
          <>
            <UcRoleCard g={g} player={mePlayer} />
            {!iAmReady
              ? <div style={{ marginTop: 16 }}><Btn variant="primary" size="lg" block disabled={busy} onClick={() => act((s) => ucReady(s, me))}>{t.memorized}</Btn></div>
              : <Note tone="info" style={{ marginTop: 16 }}>{t.waitingFor(waiting.join(", "))}<Dots /></Note>}
          </>
        )}
      </div>
    );
  } else if (state.phase === "clues") {
    const cur = ucCurrent(state);
    body = (
      <div className="gm-rise">
        <UcClues players={state.players} clues={state.clues} currentName={cur.username} me={me} />
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <TurnPill mine={myTurn}>{myTurn ? t.yourTurn : t.turnOf(cur.username)}</TurnPill>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 6 }}>{t.round(Math.floor(state.clues.length / state.players.length) + 1, UC_ROUNDS, cur.username)}</div>
        </div>
        {myTurn ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input className="gm-input" value={input} onChange={(e) => { setInput(e.target.value); setMsg(""); }} onKeyDown={(e) => e.key === "Enter" && sendClue()}
              placeholder={t.wordPlaceholder} maxLength={30} autoFocus aria-label={t.wordPlaceholder} />
            <Btn variant="primary" onClick={sendClue} disabled={!input.trim() || busy}>{t.ok}</Btn>
          </div>
        ) : null}
        {idleBox}
      </div>
    );
  } else if (state.phase === "vote") {
    const myVote = state.votes?.[me];
    body = (
      <div className="gm-rise">
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{t.whoIsImpostor}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{t.votedCount(Object.keys(state.votes || {}).length, state.players.length)}</div>
        </div>
        <UcClues players={state.players} clues={state.clues} currentName={null} me={me} />
        {myVote ? (
          <Note tone="good">✓ {t.youVoted(myVote)} — {t.waitingFor(waiting.join(", "))}<Dots /></Note>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
            {state.players.filter((p) => p.username !== me).map((p) => (
              <Btn key={p.username} variant="soft" disabled={busy} onClick={() => act((s) => ucVote(s, me, p.username))}><Bubble name={p.username} size={24} /> {p.username}</Btn>
            ))}
          </div>
        )}
        {idleBox}
      </div>
    );
  } else if (state.phase === "guess") {
    const left = Math.max(0, Math.ceil((state.guessDeadline - now) / 1000));
    const iAmImpostor = impostor.username === me;
    body = (
      <div style={{ textAlign: "center" }} className="gm-rise">
        <div style={{ fontSize: 17, fontWeight: 900, color: "var(--gm-bad-text)", marginBottom: 6 }}>{t.impostorCaught}</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: left <= 10 ? BAD : "var(--gm-warn-text)", marginBottom: 12, fontVariantNumeric: "tabular-nums" }}>{left}s</div>
        {iAmImpostor ? (
          <>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 12 }}>{t.guessPromptSelf}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="gm-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendGuess()}
                placeholder={t.guessPlaceholder} autoFocus aria-label={t.guessPlaceholder} />
              <Btn variant="primary" onClick={sendGuess} disabled={busy}>{t.ok}</Btn>
            </div>
          </>
        ) : <Note tone="info">{t.guessPrompt(impostor.username, left)}<Dots /></Note>}
      </div>
    );
  } else {
    body = (
      <UcResultScreen g={g} result={state.result} word={state.entry.word} impostorName={impostor.username} me={me} meIsImpostor={mePlayer?.isImpostor}
        award={state.result.aborted || !(state.result.pts?.[me] > 0) ? null : award} votes={state.votes}
        onRetry={() => retry(state.result.pts?.[me] || 0)} actions={[{ label: t.close, onClick: onClose }]} />
    );
  }

  return (
    <GameRoot style={{ padding: 22 }}>
      {state.phase !== "result" && (
        <>
          <UcSteps phase={state.phase} g={g} />
          {(state.phase === "clues" || state.phase === "vote") && mePlayer ? (
            <div style={{ marginBottom: 12, textAlign: "center" }}>
              {peek ? (
                <span className="gm-tag" style={{ "--tone": mePlayer.isImpostor ? "239,68,68" : "139,92,246", fontSize: 11 }}>
                  {mePlayer.isImpostor ? `😈 ${t.youAreImpostor} · ${mePlayer.hint}` : `🕵️ ${mePlayer.word}`}
                  <button type="button" onClick={() => setPeek(false)} aria-label={t.hideRole} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                </span>
              ) : <Btn variant="ghost" size="sm" onClick={() => setPeek(true)}>👁 {t.showRole}</Btn>}
            </div>
          ) : null}
        </>
      )}
      {body}
      {msg ? <Note tone="bad" style={{ marginTop: 12 }}>{msg}</Note> : null}
      {state.phase !== "result" && <LeaveRow label={t.quitConfirm} onClick={quit.ask} />}
      <QuitDialog open={quit.open} title={t.quitTitle} body={t.quitBodyOnline} stayLabel={t.quitStay} quitLabel={t.quitConfirm} onStay={quit.stay} onQuit={() => { quit.stay(); onClose(); }} danger={false} />
    </GameRoot>
  );
}

/** Imposteur : `players` (tableau) = partie sur le même appareil ; `room` = partie en ligne. */
export function UndercoverGame({ players, room = null, onClose, onReplay, onReady }) {
  if (room) return <UndercoverOnline room={room} onClose={onClose} onReady={onReady} />;
  return <UndercoverLocal players={players} onClose={onClose} onReplay={onReplay} onReady={onReady} />;
}
