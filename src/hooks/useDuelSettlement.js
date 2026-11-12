// ─── Suivi de l'enregistrement de l'ELO / des points d'une partie à deux terminée ──────────────────────────────
// Le jeu publie le bilan (state.result) en même temps qu'il ferme la salle. Ce hook :
//   • lance l'enregistrement des lignes game_elo (voir src/utils/gameSettle.js) — tout de suite pour celui qui a terminé
//     la partie, après un court délai pour l'autre joueur (filet de sécurité si le premier a fermé son onglet) ;
//   • relit la salle toutes les 1,5 s pour afficher ce qui a vraiment été enregistré ;
//   • réessaie tout seul une fois si une réservation est restée bloquée, et propose `retry` à l'écran.
// Il ne s'arrête pas quand la fenêtre se ferme : l'enregistrement en cours va jusqu'au bout.

import { useCallback, useEffect, useRef, useState } from "react";
import { settleDuel, readRoom } from "../utils/gameRooms.js";
import { settlementView, FALLBACK_GRACE_MS, CLAIM_TTL_MS } from "../utils/gameSettle.js";

const POLL_MS = 1500;
const POLL_MAX_MS = 90_000;

/**
 * @param {object}  p
 * @param {string}  p.roomId
 * @param {string}  p.me
 * @param {object|null} p.result   state.result de la partie terminée (null tant que la partie n'est pas fermée en base)
 * @param {boolean} p.finisher     ce client a fermé la salle (il enregistre tout de suite)
 * @returns {{ view: object, retry: () => void, busy: boolean }}
 */
export function useDuelSettlement({ roomId, me, result, finisher }) {
  const needs = !!result && (result.mode === "ranked" || result.mode === "friend") && !!roomId && !String(roomId).startsWith("ai-");
  const [remote, setRemote] = useState(null);
  const [local, setLocal] = useState(null);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const resultRef = useRef(result);
  useEffect(() => { resultRef.current = result; });
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const run = useCallback(async (graceMs) => {
    const res = resultRef.current;
    if (!res) return;
    if (aliveRef.current) setBusy(true);
    try {
      const out = await settleDuel({
        roomId, result: res, me, users: Object.keys(res.deltas || {}), graceMs,
        onUpdate: (o) => { if (aliveRef.current) setLocal(o); },
      });
      if (aliveRef.current) setLocal(out);
    } catch { /* settleDuel ne lève pas ; sécurité */ }
    if (aliveRef.current) setBusy(false);
  }, [roomId, me]);

  // Lancement (une seule fois par partie)
  useEffect(() => {
    if (!needs || startedRef.current) return;
    startedRef.current = true;
    run(finisher ? 0 : FALLBACK_GRACE_MS);
  }, [needs, finisher, run]);

  // Lecture de ce qui est enregistré en base
  useEffect(() => {
    if (!needs) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const row = await readRoom(roomId);
        if (!stop && row?.state?.result) setRemote(row.state.result);
      } catch { /* réseau : au prochain tour */ }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    const end = setTimeout(() => clearInterval(id), POLL_MAX_MS);
    return () => { stop = true; clearInterval(id); clearTimeout(end); };
  }, [needs, roomId]);

  const merged = remote || result;
  const base = settlementView(merged, me);
  // Ce que CET appareil vient d'enregistrer s'affiche sans attendre la prochaine lecture
  const mine = local?.[me];
  const view = !needs ? base
    : base.status !== "done" && mine?.ok && !mine.noop && mine.newElo != null
      ? { status: "done", elo: mine.eloDelta ?? base.elo, pts: mine.ptsDelta ?? base.pts, oldElo: mine.oldElo, newElo: mine.newElo }
    : base.status === "pending" && mine && mine.ok === false && mine.error
      ? { status: "failed", elo: base.elo, pts: base.pts, error: mine.error }
    : base;

  // Réservation restée bloquée (l'autre joueur a planté en plein travail) : une seule relance quand elle a expiré
  const watchdogRef = useRef(false);
  useEffect(() => {
    if (!needs || view.status !== "pending" || watchdogRef.current) return undefined;
    const id = setTimeout(() => { watchdogRef.current = true; run(0); }, CLAIM_TTL_MS + 5000);
    return () => clearTimeout(id);
  }, [needs, view.status, run]);

  const retry = useCallback(() => { run(0); }, [run]);
  return { view, retry, busy };
}
