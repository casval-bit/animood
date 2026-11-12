// ─── Modification atomique de l'état d'une salle (plusieurs joueurs qui écrivent en même temps) ────────────────
// Problème : l'état d'une partie à plusieurs est un seul bloc JSON. Si deux joueurs écrivent à la même seconde (deux votes, deux
// « prêt »), le dernier écrase le premier. Solution : un compteur `state.v`. On relit l'état, on calcule le nouvel état avec
// `mutate`, puis on l'écrit seulement si le compteur n'a pas bougé (écriture conditionnelle côté base) ; sinon on relit et on
// recommence. Aucune écriture n'est perdue. `db` = { query(path, opts), headers } (en production : `sb`).

const enc = encodeURIComponent;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeRoomTx({ db, now = Date.now, sleep = defaultSleep, random = Math.random }) {
  const REP = () => ({ ...db.headers, Prefer: "return=representation" });

  /** Lit { state, status, winner } ou null. */
  const read = async (roomId) => (await db.query(`game_rooms?id=eq.${enc(roomId)}&select=state,status,winner&limit=1`))?.[0] || null;

  /**
   * @param {string} roomId
   * @param {(state: object) => object|null} mutate  nouvel état complet, ou null pour ne rien changer
   * @param {{ tries?: number, patch?: (next: object) => object|null }} [opts]  patch : colonnes à écrire en plus (status, winner…)
   * @returns {Promise<{ok:true, state:object, noop?:boolean}|{ok:false, reason:string, state?:object}>}
   */
  async function roomTx(roomId, mutate, { tries = 8, patch = null } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        const row = await read(roomId);
        if (!row) return { ok: false, reason: "gone" };
        if (row.status !== "active") return { ok: false, reason: "closed", state: row.state };
        const cur = row.state || {};
        const next = mutate(cur);
        if (!next) return { ok: true, state: cur, noop: true };
        const hasV = Number.isFinite(cur.v);
        const filter = hasV ? `state->>v=eq.${cur.v}` : "state->>v=is.null";
        const body = { state: { ...next, v: (hasV ? cur.v : 0) + 1 }, updated_at: new Date(now()).toISOString(), ...(patch?.(next) || {}) };
        const rows = await db.query(`game_rooms?id=eq.${enc(roomId)}&status=eq.active&${filter}`, {
          method: "PATCH", headers: REP(), body: JSON.stringify(body),
        });
        if (rows?.[0]) return { ok: true, state: rows[0].state };
        lastErr = null;                                       // quelqu'un a écrit avant nous : on relit
      } catch (e) {
        lastErr = e;
        if (/"code"\s*:\s*"42501"/.test(String(e?.message || e))) return { ok: false, reason: "refused" };
      }
      await sleep(40 + attempt * 60 + random() * 80);
    }
    return { ok: false, reason: lastErr ? "network" : "contended" };
  }
  return { roomTx, read };
}
