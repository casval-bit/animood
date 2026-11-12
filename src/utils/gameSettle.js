// ─── Enregistrement des points / de l'ELO d'une partie à deux terminée — sans réseau en dur (testable) ─────────
// Le problème à résoudre : « le gagnant ne reçoit rien ». Avant, celui qui terminait la partie écrivait l'ELO des DEUX joueurs
// d'un coup, en ignorant les erreurs : si une écriture échouait (réseau, règle de sécurité), personne ne le savait, et rien
// ne montrait à l'écran ce qui avait été gagné ou perdu.
//
// Le principe maintenant :
//   1. Celui qui termine la partie la clôt ET publie le bilan dans l'état de la salle (state.result, voir duelResult) : les deux
//      joueurs peuvent donc toujours lire ce qu'ils ont gagné ou perdu, même si l'un d'eux était parti.
//   2. Chaque ligne (un joueur) est enregistrée UNE seule fois : on « réserve » d'abord la ligne dans state.result.applied
//      (écriture conditionnelle sur un compteur, state.result.ak : si deux appareils s'y prennent en même temps, un seul gagne),
//      puis on applique la variation sur game_elo (écriture conditionnelle sur les valeurs lues : jamais d'écrasement), puis
//      on marque la ligne « faite ».
//   3. Celui qui a terminé la partie enregistre les deux lignes (le gagnant est servi même si le perdant a déjà fermé la fenêtre).
//      L'autre joueur sert de filet de sécurité : si sa ligne n'est pas faite au bout de quelques secondes, il l'enregistre lui-même.
//   4. Toute erreur est remontée à l'écran (« non enregistré — réessayer ») au lieu d'être avalée.
//
// `db` = { query(path, opts) → JSON|null (lève une Error si la requête échoue), headers } ; en production c'est `sb`.

import { ELO_START, clampEloStep } from "./gameRules.js";

export const CLAIM_TTL_MS = 20_000;       // une réservation « en cours » plus vieille que ça est considérée comme abandonnée
export const FALLBACK_GRACE_MS = 4_000;   // l'autre joueur attend ce délai avant de s'occuper lui-même de sa ligne
const MAX_CROSS_POINTS = 20;              // limite serveur sur la ligne d'un adversaire

const enc = encodeURIComponent;
const isSecurityRefusal = (e) => /"code"\s*:\s*"42501"/.test(String(e?.message || e));
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Résultat à publier avec l'état final : le bilan + les compteurs de réservation. */
export const withSettlementFields = (result) => ({ ...result, ak: 0, applied: {} });

/** Ce que l'écran doit montrer pour `user` : { status: "none"|"pending"|"done"|"failed", elo, pts, oldElo, newElo, error }. */
export function settlementView(result, user) {
  const planned = result?.deltas?.[user];
  if (!result || !planned) return { status: "none", elo: 0, pts: 0 };
  const e = result.applied?.[user];
  const nothing = !planned.elo && !planned.pts;
  if (result.mode !== "ranked" && result.mode !== "friend") return { status: "none", elo: 0, pts: 0 };
  if (nothing) return { status: "done", elo: 0, pts: 0, noop: true };
  if (e?.done) return { status: "done", elo: e.eloDelta ?? planned.elo, pts: e.ptsDelta ?? planned.pts, oldElo: e.oldElo, newElo: e.newElo };
  if (e?.failed) return { status: "failed", elo: planned.elo, pts: planned.pts, error: e.failed };
  return { status: "pending", elo: planned.elo, pts: planned.pts };
}

export function makeSettler({ db, now = Date.now, sleep = defaultSleep, random = Math.random }) {
  const REP = () => ({ ...db.headers, Prefer: "return=representation" });
  const iso = () => new Date(now()).toISOString();
  const appliedHere = new Map();      // « salle|joueur » → variation déjà appliquée par CET appareil (jamais deux fois, même après une erreur de marquage)

  async function readRoom(roomId) {
    const rows = await db.query(`game_rooms?id=eq.${enc(roomId)}&select=state,status,winner&limit=1`);
    return rows?.[0] || null;
  }

  /** Écrit state.result.applied[user] avec une écriture conditionnelle (compteur ak). `decide(entryExistant, result)` renvoie
   *  la nouvelle entrée, ou un objet { stop: valeur } pour s'arrêter sans écrire. */
  async function updateEntry(roomId, user, decide) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const room = await readRoom(roomId);
      const res = room?.state?.result;
      if (!res) return { status: "noresult" };
      const decision = decide(res.applied?.[user], res);
      if (decision?.stop) return decision.stop;
      const ak = res.ak || 0;
      const next = { ...room.state, result: { ...res, ak: ak + 1, applied: { ...(res.applied || {}), [user]: decision } } };
      const rows = await db.query(`game_rooms?id=eq.${enc(roomId)}&status=eq.finished&state->result->>ak=eq.${ak}`, {
        method: "PATCH", headers: REP(), body: JSON.stringify({ state: next, updated_at: iso() }),
      });
      if (rows?.[0]) return { status: "written", entry: decision, state: rows[0].state };
      await sleep(30 + attempt * 50 + random() * 60);          // un autre appareil a écrit avant nous : on relit et on réessaie
    }
    return { status: "contended" };
  }

  /** Réserve la ligne de `user` pour `me`. status : claimed | done | busy | noresult | contended. */
  function claimRow(roomId, user, me) {
    return updateEntry(roomId, user, (cur) => {
      if (cur?.done) return { stop: { status: "done", entry: cur } };
      const fresh = cur && !cur.failed && now() - (cur.at || 0) < CLAIM_TTL_MS;
      if (fresh && cur.by !== me) return { stop: { status: "busy", entry: cur } };
      return { by: me, at: now(), done: false };
    }).then((r) => (r.status === "written" ? { status: "claimed", entry: r.entry } : r));
  }

  const markDone = (roomId, user, me, applied) => updateEntry(roomId, user, (cur) =>
    cur?.done ? { stop: { status: "done", entry: cur } } : { by: me, at: cur?.at || now(), done: true, ...applied });
  const markFailed = (roomId, user, me, error) => updateEntry(roomId, user, (cur) =>
    cur?.done ? { stop: { status: "done", entry: cur } } : { by: me, at: now(), done: false, failed: String(error).slice(0, 160) });

  /** La ligne game_elo de `user` (créée avec les valeurs de départ si elle n'existe pas encore). */
  async function ensureEloRow(user) {
    const get = async () => (await db.query(`game_elo?username=eq.${enc(user)}&limit=1`))?.[0] || null;
    let row = await get();
    if (row) return row;
    try {
      await db.query("game_elo", {
        method: "POST", headers: { ...db.headers, Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ username: user, elo_chain: ELO_START, elo_timeline: ELO_START, points_total: 0 }),
      });
    } catch (e) { if (isSecurityRefusal(e)) throw e; }
    row = await get();
    if (!row) throw new Error("ligne de classement introuvable");
    return row;
  }

  /** Applique la variation sur la ligne de `user`. Écriture conditionnelle sur les valeurs lues (compare-and-swap). */
  async function applyRow(user, field, eloDelta, ptsDelta) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await ensureEloRow(user);
      const oldElo = Number.isFinite(row[field]) ? row[field] : ELO_START;
      const oldPts = Number.isFinite(row.points_total) ? row.points_total : 0;
      const newElo = eloDelta ? Math.max(0, oldElo + clampEloStep(eloDelta)) : oldElo;
      const newPts = oldPts + Math.max(0, Math.min(Number(ptsDelta) || 0, MAX_CROSS_POINTS));
      if (newElo === oldElo && newPts === oldPts) return { oldElo, newElo, eloDelta: 0, ptsDelta: 0 };
      const guard = `${field}=${row[field] == null ? "is.null" : `eq.${row[field]}`}&points_total=${row.points_total == null ? "is.null" : `eq.${row.points_total}`}`;
      const rows = await db.query(`game_elo?username=eq.${enc(user)}&${guard}`, {
        method: "PATCH", headers: REP(), body: JSON.stringify({ [field]: newElo, points_total: newPts, updated_at: iso() }),
      });
      if (rows?.[0]) return { oldElo, newElo, eloDelta: newElo - oldElo, ptsDelta: newPts - oldPts };
      await sleep(60 + attempt * 80 + random() * 60);          // la ligne a changé entre-temps (autre partie) : on relit
    }
    throw new Error("la ligne de classement est modifiée en continu");
  }

  /**
   * Enregistre les lignes de `users` (dans l'ordre) pour la partie `roomId`. Renvoie { [pseudo]: { ok, ...détails } }.
   *   graceMs : attente avant de commencer (filet de sécurité de l'autre joueur) ; onUpdate(results) après chaque ligne.
   */
  async function settle({ roomId, result, me, users, graceMs = 0, onUpdate }) {
    const out = {};
    if (!result || (result.mode !== "ranked" && result.mode !== "friend")) return out;
    if (graceMs) await sleep(graceMs);
    for (const user of users) {
      const d = result.deltas?.[user];
      if (!d || (!d.elo && !d.pts)) { out[user] = { ok: true, noop: true }; continue; }
      try {
        const claim = await claimRow(roomId, user, me);
        if (claim.status === "done") out[user] = { ok: true, already: true, ...claim.entry };
        else if (claim.status !== "claimed") out[user] = { ok: false, pending: true, reason: claim.status };
        else {
          const key = `${roomId}|${user}`;
          let applied = appliedHere.get(key);
          if (!applied) {
            try { applied = await applyRow(user, result.field, d.elo, d.pts); }
            catch (e) {
              await markFailed(roomId, user, me, e.message).catch(() => {});
              throw e;
            }
            appliedHere.set(key, applied);
          }
          // La variation est appliquée : on note « fait » (quelques essais) ; si ça échoue quand même, on ne la réappliquera pas.
          for (let t = 0; t < 3; t++) {
            const r = await markDone(roomId, user, me, applied).catch(() => null);
            if (r && r.status !== "contended") break;
            await sleep(150 * (t + 1));
          }
          out[user] = { ok: true, ...applied };
        }
      } catch (e) {
        out[user] = { ok: false, error: isSecurityRefusal(e) ? "refusé par le serveur" : String(e?.message || e).slice(0, 120) };
      }
      onUpdate?.({ ...out });
    }
    return out;
  }

  return { settle, claimRow, applyRow, readRoom };
}
