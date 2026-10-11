// Vérifie ce qu'un VISITEUR non connecté (clé publique, comme n'importe qui avec F12) peut lire. Lecture seule : rien n'est écrit.
//   node --env-file=.env scripts/check_rls.mjs
// Utilise SUPABASE_URL / SUPABASE_ANON du .env (sinon ceux de src/api/supabase.js). Si SUPABASE_SERVICE_KEY est aussi dans
// le .env, le script compare avec le nombre réel de lignes pour dire si la table est vraiment protégée.
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/api/supabase.js", import.meta.url), "utf8");
const URL_ = process.env.SUPABASE_URL || src.match(/VITE_SUPABASE_URL\s*\|\|\s*"([^"]+)"/)?.[1];
const ANON = process.env.SUPABASE_ANON || src.match(/VITE_SUPABASE_ANON\s*\|\|\s*"([^"]+)"/)?.[1];
const SERVICE = process.env.SUPABASE_SERVICE_KEY || "";
if (!URL_ || !ANON) { console.error("URL / clé publique introuvables"); process.exit(1); }

// [table, doit être illisible pour un visiteur ?]
const TABLES = [
  ["direct_messages", true], ["user_blocks", true], ["game_invites", true], ["profiles", true], ["follows", true],
  ["user_votes", true], ["opquiz_user_stats", true], ["posts", true], ["comments", true], ["forum_threads", true],
  ["forum_replies", true], ["polls", true], ["game_elo", true], ["game_rooms", true],
  ["anime_cache", false], ["mood_pts_v4", false], ["artist_cache", false], ["opquiz_pool", false],
];

async function count(table, key) {
  let r;
  try {
    r = await fetch(`${URL_}/rest/v1/${table}?select=*&limit=1`, {
      method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" },
    });
  } catch { return { error: "réseau" }; }
  if (r.status === 401 || r.status === 403) return { denied: true };
  if (!r.ok) return { error: r.status };
  const total = Number((r.headers.get("content-range") || "").split("/")[1]);
  return { total: Number.isFinite(total) ? total : null };
}

let bad = 0;
console.log("Visiteur non connecté (clé publique) :\n");
for (const [table, mustBeClosed] of TABLES) {
  const a = await count(table, ANON);
  const real = SERVICE ? await count(table, SERVICE) : null;
  let line, open = false;
  if (a.denied) line = "refusé";
  else if (a.error) line = `erreur ${a.error} (table absente ?)`;
  else { line = `${a.total ?? "?"} ligne(s) visible(s)`; open = (a.total || 0) > 0; }
  if (real && real.total != null) line += ` sur ${real.total} réelle(s)`;
  const status = mustBeClosed ? (open ? "❌ OUVERT" : "✅ fermé") : (open ? "ℹ️  public (normal)" : "·");
  if (mustBeClosed && open) bad++;
  console.log(`${status.padEnd(20)} ${table.padEnd(20)} ${line}`);
}
console.log(bad ? `\n⚠️  ${bad} table(s) privée(s) lisible(s) sans connexion : exécute supabase/security_rls_1_private.sql.` : "\n✅ Rien de privé n'est lisible sans connexion.");
