// ─── Points de jeu à plusieurs (Cluescale, Imposteur) : ajouter des points sur SA ligne game_elo, sans écraser ───────
// Avant : lecture puis écriture sans condition, erreurs avalées. Maintenant : écriture conditionnelle sur les valeurs lues
// (si la ligne a bougé entre-temps, on relit), et le résultat est renvoyé pour être affiché ("enregistré" / "non enregistré").
// `db` = { query(path, opts), headers } ; `column` = "pts_cluescale" | "pts_undercover" ; le serveur borne à +200 par modification.

const enc = encodeURIComponent;
const MAX_AWARD = 200;

export async function awardPoints({ db, user, column, amount, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const add = Math.max(0, Math.min(Math.round(Number(amount) || 0), MAX_AWARD));
  if (!add) return { ok: true, added: 0 };
  const get = async () => (await db.query(`game_elo?username=eq.${enc(user)}&limit=1`))?.[0] || null;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      let row = await get();
      if (!row) {
        await db.query("game_elo", {
          method: "POST", headers: { ...db.headers, Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify({ username: user, elo_chain: 400, elo_timeline: 400, points_total: 0 }),
        }).catch(() => {});
        row = await get();
        if (!row) return { ok: false, error: "ligne introuvable" };
      }
      const col = Number.isFinite(row[column]) ? row[column] : 0;
      const tot = Number.isFinite(row.points_total) ? row.points_total : 0;
      const guard = `${column}=${row[column] == null ? "is.null" : `eq.${row[column]}`}&points_total=${row.points_total == null ? "is.null" : `eq.${row.points_total}`}`;
      const rows = await db.query(`game_elo?username=eq.${enc(user)}&${guard}`, {
        method: "PATCH", headers: { ...db.headers, Prefer: "return=representation" },
        body: JSON.stringify({ [column]: col + add, points_total: tot + add, updated_at: new Date(now()).toISOString() }),
      });
      if (rows?.[0]) return { ok: true, added: add, total: col + add };
      await sleep(60 + attempt * 80);
    }
    return { ok: false, error: "ligne modifiée en continu" };
  } catch (e) {
    return { ok: false, error: /"code"\s*:\s*"42501"/.test(String(e?.message)) ? "refusé par le serveur" : String(e?.message || e).slice(0, 100) };
  }
}
