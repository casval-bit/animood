// Ménage des parties « fantômes » (salles de jeu abandonnées) et des invitations périmées. Tourne chaque jour dans
// .github/workflows/sync-daily.yml, ou à la main :
//   node --env-file=.env scripts/cleanup_game_rooms.mjs          (nettoie)
//   node --env-file=.env scripts/cleanup_game_rooms.mjs --dry    (compte seulement, ne touche à rien)
//
// Règles (toutes sur « updated_at », que l'hôte rafraîchit toutes les 2 à 5 s tant qu'il attend) :
//   • salle « waiting » sans signe de vie depuis 10 min  → supprimée (et ses invitations avec, en cascade)
//   • salle « active »  sans aucun coup depuis 2 h       → marquée « finished » (aucun ELO n'est modifié)
//   • salle « finished » de plus de 7 jours              → supprimée (on garde 7 jours : le serveur exige une partie récente
//                                                          pour valider un changement d'ELO)
//   • invitation « pending » de plus de 24 h             → supprimée
// Nécessite SUPABASE_URL + SUPABASE_SERVICE_KEY (clé « service role » : jamais dans le navigateur).

const DRY = process.argv.includes("--dry");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !KEY) {
  console.log("SUPABASE_URL / SUPABASE_SERVICE_KEY absents : ménage des salles ignoré.");
  process.exit(0);
}

const ago = (ms) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

async function run(label, method, path, body) {
  const url = `${URL_}/rest/v1/${path}`;
  try {
    if (DRY) {
      const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}select=id`, { headers: { ...H, Prefer: "count=exact" }, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      console.log(`[dry] ${label} : ${(await r.json()).length}`);
      return;
    }
    const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
    console.log(`${label} : ${(await r.json()).length}`);
  } catch (e) {
    console.log(`${label} : échec (${e.message})`);
    process.exitCode = 0;      // le ménage ne doit jamais faire échouer la synchronisation
  }
}

await run("Salles en attente abandonnées supprimées", "DELETE", `game_rooms?status=eq.waiting&updated_at=lt.${ago(10 * MIN)}`);
await run("Parties actives sans coup depuis 2 h clôturées", "PATCH", `game_rooms?status=eq.active&updated_at=lt.${ago(2 * HOUR)}`, { status: "finished" });
await run("Anciennes salles terminées supprimées", "DELETE", `game_rooms?status=eq.finished&updated_at=lt.${ago(7 * DAY)}`);
await run("Invitations périmées supprimées", "DELETE", `game_invites?status=eq.pending&created_at=lt.${ago(DAY)}`);
