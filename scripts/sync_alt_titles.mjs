// ─── Stocke les titres alternatifs de CHAQUE animé de anime_cache (colonne alt_titles) ───────────────────────────
// Source : AniList (titre anglais, romaji, synonymes) + les titres déjà présents dans la base.
// Utile à la fonction « plateforme perso » de l'appli de bureau : on essaie le titre, puis chaque variante.
//
// Avant la 1re utilisation : exécuter supabase/alt_titles_schema.sql dans Supabase (SQL Editor).
//
// Utilisation (depuis la racine du projet) :
//   node --env-file=.env scripts/sync_alt_titles.mjs              # seulement les animés jamais remplis (alt_titles NULL)
//   node --env-file=.env scripts/sync_alt_titles.mjs --all        # recalcule TOUS les animés
//   node --env-file=.env scripts/sync_alt_titles.mjs --limit=500  # n'en traite que 500 (le reste au prochain lancement)
// Reprenable : un animé déjà rempli n'est plus retraité, on peut interrompre (Ctrl+C) et relancer.
// Variables : SUPABASE_URL + SUPABASE_SERVICE_KEY (clé de service : l'écriture dans anime_cache l'exige après security_rls_2).

import { buildAltTitles } from "./lib/altTitles.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON;
if (!SUPABASE_URL || !KEY) { console.error("❌ SUPABASE_URL et SUPABASE_SERVICE_KEY doivent être définis dans .env"); process.exit(1); }
const H = { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` };

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split("=")[1] : d; };
const ALL = process.argv.includes("--all");
const LIMIT = parseInt(arg("limit", "0")) || Infinity;
const CHUNK = 50;            // AniList accepte 50 identifiants par requête
const AL_DELAY = 1000;       // ~60 requêtes/min (limite AniList : 90)
const WRITE_PARALLEL = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
  return text ? JSON.parse(text) : [];
}

async function listRows(extra) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await sbGet(`anime_cache?select=mal_id,title,title_en&${ALL ? "" : "alt_titles=is.null&"}${extra}&order=mal_id.desc&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

const AL_QUERY = "query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){idMal title{romaji english} synonyms}}}";
async function anilistChunk(ids) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch("https://graphql.anilist.co", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: AL_QUERY, variables: { ids } }),
      });
      if (r.status === 429) { await sleep((parseInt(r.headers.get("retry-after")) || 60) * 1000 + 1000); continue; }
      if (r.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
      if (!r.ok) return null;
      const media = (await r.json())?.data?.Page?.media || [];
      return new Map(media.filter((m) => m.idMal).map((m) => [m.idMal, m]));
    } catch { await sleep(3000 * (attempt + 1)); }
  }
  return null; // AniList injoignable : on ne remplit rien pour ce paquet (il sera repris au prochain lancement)
}

async function patch(malId, titles) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${malId}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ alt_titles: titles }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
}

async function main() {
  console.log("🔤 AniMood — titres alternatifs");
  try { await sbGet("anime_cache?select=alt_titles&limit=1"); }
  catch (e) {
    console.error(/alt_titles/.test(e.message)
      ? "❌ La colonne alt_titles n'existe pas : exécute d'abord supabase/alt_titles_schema.sql dans Supabase (SQL Editor), puis relance."
      : `❌ Connexion à Supabase impossible : ${e.message}`);
    process.exit(1);
  }

  // En cours / à venir d'abord (ce sont eux qu'on regarde), puis le reste
  const first = await listRows("status=in.(%22Currently%20Airing%22,%22Not%20yet%20aired%22)");
  const seen = new Set(first.map((r) => r.mal_id));
  const rest = (await listRows("")).filter((r) => !seen.has(r.mal_id));
  const rows = [...first, ...rest].slice(0, LIMIT);
  console.log(`${rows.length} animé(s) à traiter${ALL ? " (mode --all)" : ""}`);
  if (!rows.length) { console.log("✅ Rien à faire : tout est déjà rempli"); return; }

  let done = 0, withAl = 0, skipped = 0, failed = 0, firstError = "";
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const al = await anilistChunk(chunk.map((r) => r.mal_id));
    await sleep(AL_DELAY);
    if (!al) { skipped += chunk.length; console.log(`  ⚠️ AniList injoignable pour le paquet ${i / CHUNK + 1} — repris au prochain lancement`); continue; }

    const jobs = chunk.map((row) => {
      const m = al.get(row.mal_id);
      if (m) withAl++;
      return { id: row.mal_id, titles: buildAltTitles([m?.title?.english, m?.title?.romaji, m?.synonyms || [], row.title_en, row.title]) };
    });
    for (let j = 0; j < jobs.length; j += WRITE_PARALLEL) {
      await Promise.all(jobs.slice(j, j + WRITE_PARALLEL).map((job) => patch(job.id, job.titles)
        .then(() => { done++; })
        .catch((e) => { failed++; firstError ||= e.message; })));
    }
    if (failed && !done) {
      console.error(/alt_titles/.test(firstError)
        ? "❌ La colonne alt_titles n'existe pas : exécute d'abord supabase/alt_titles_schema.sql dans Supabase (SQL Editor), puis relance."
        : `❌ Écriture refusée (${firstError}) — vérifie SUPABASE_SERVICE_KEY dans .env`);
      process.exit(1);
    }
    process.stdout.write(`\r  ${done}/${rows.length} enregistrés`);
  }
  console.log(`\n✅ ${done} animé(s) remplis (${withAl} trouvés sur AniList) · ${skipped} reportés · ${failed} échecs${firstError ? ` — ex. ${firstError}` : ""}`);
  if (failed || skipped) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
