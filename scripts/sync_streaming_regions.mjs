// ─── Sync de la disponibilité streaming PAR PAYS ─────────────────────────────
// Pour chaque animé de anime_cache : retrouve son équivalent TMDB, lit les « watch providers »
// (données JustWatch fournies par TMDB) pour chaque pays demandé, et les range dans la table
// anime_streaming_regions (voir supabase/streaming_regions_schema.sql).
//
// Variables d'environnement (fichier .env) :
//   TMDB_KEY       clé API TMDB (v3, gratuite : themoviedb.org → Paramètres → API) ou jeton « Read Access Token » (v4)
//   SUPABASE_URL, SUPABASE_ANON   (comme les autres scripts)
//
// Utilisation :
//   node --env-file=.env scripts/sync_streaming_regions.mjs                 # pays par défaut, animés jamais vérifiés
//   node --env-file=.env scripts/sync_streaming_regions.mjs --regions=FR,US,GB,IT,JP,DE
//   node --env-file=.env scripts/sync_streaming_regions.mjs --limit=500     # n'en traite que 500 (reprend où ça s'est arrêté)
//   node --env-file=.env scripts/sync_streaming_regions.mjs --refresh=30    # re-vérifie ceux de plus de 30 jours
//
// Pour AJOUTER un pays plus tard : relancer avec --regions=XX (les pays déjà faits ne sont pas refaits sauf --refresh).
// Attribution requise par TMDB : « Données de disponibilité fournies par JustWatch ».

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const TMDB_KEY = process.env.TMDB_KEY;
const TMDB = "https://api.themoviedb.org/3";
const FRIBB = "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json"; // correspondances MAL → TMDB
const DEFAULT_REGIONS = ["FR", "US", "GB", "IT", "JP"];
const KINDS = ["flatrate", "free", "ads"];

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split("=")[1] : d; };
const regions = arg("regions", DEFAULT_REGIONS.join(",")).split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);
const limit = parseInt(arg("limit", "0")) || Infinity;
const refreshDays = parseInt(arg("refresh", "0")) || 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!SUPABASE_URL || !SUPABASE_ANON || !TMDB_KEY) { console.error("Il manque SUPABASE_URL, SUPABASE_ANON ou TMDB_KEY dans le .env"); process.exit(1); }

const SB = { "Content-Type": "application/json", apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };
const tmdbHeaders = TMDB_KEY.length > 60 ? { Authorization: `Bearer ${TMDB_KEY}` } : {};
const tmdbUrl = (path, params = {}) => { const u = new URL(TMDB + path); if (!tmdbHeaders.Authorization) u.searchParams.set("api_key", TMDB_KEY); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); return u.toString(); };

async function tmdb(path, params) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(tmdbUrl(path, params), { headers: tmdbHeaders });
    if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`TMDB ${r.status} ${path}`);
    return r.json();
  }
  throw new Error(`TMDB 429 ${path}`);
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbUpsert(rows) {
  if (!rows.length) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/anime_streaming_regions?on_conflict=mal_id,region`, {
    method: "POST", headers: { ...SB, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase upsert ${r.status}: ${await r.text()}`);
}

// ── 1. Correspondances MAL → TMDB (liste communautaire Fribb/anime-lists) ──────
async function loadMapping() {
  const map = new Map();
  try {
    const r = await fetch(FRIBB);
    if (!r.ok) throw new Error(String(r.status));
    for (const e of await r.json()) {
      // themoviedb_id est un objet {"tv": 30991} ou {"movie": 123} (parfois un nombre seul ou une liste)
      const tm = e.themoviedb_id;
      let id = null, type = null;
      if (tm && typeof tm === "object" && !Array.isArray(tm)) {
        if (tm.tv != null) { id = tm.tv; type = "tv"; } else if (tm.movie != null) { id = tm.movie; type = "movie"; }
      } else if (tm != null) { id = tm; type = /movie/i.test(e.type || "") ? "movie" : "tv"; }
      id = Number(Array.isArray(id) ? id[0] : id);
      if (e.mal_id && Number.isFinite(id) && id > 0) map.set(Number(e.mal_id), { id, type });
    }
    console.log(`Correspondances MAL→TMDB : ${map.size}`);
  } catch (e) { console.warn("Liste de correspondances indisponible, recherche par titre uniquement :", e.message); }
  return map;
}

// ── 2. Repli : recherche TMDB par titre + année ───────────────────────────────
async function searchTmdb(a) {
  const isMovie = /movie/i.test(a.type || "");
  const titles = [...new Set([a.title_en, a.title].filter(Boolean))];
  for (const q of titles) {
    const res = await tmdb(`/search/${isMovie ? "movie" : "tv"}`, { query: q });
    const hit = (res?.results || []).find((x) => {
      const y = parseInt((x.first_air_date || x.release_date || "").slice(0, 4));
      return !a.year || !y || Math.abs(y - a.year) <= 1;
    });
    if (hit) return { id: hit.id, type: isMovie ? "movie" : "tv" };
    await sleep(120);
  }
  return null;
}

// ── 3. Plateformes d'un titre TMDB, pays par pays ────────────────────────────
async function providersFor(t) {
  const res = await tmdb(`/${t.type}/${t.id}/watch/providers`);
  if (!res) return null; // identifiant TMDB inconnu : on ne stocke rien plutôt qu'un faux « aucune plateforme »
  const out = {};
  for (const region of regions) {
    const r = res?.results?.[region];
    const list = [];
    for (const kind of KINDS) for (const p of r?.[kind] || []) if (!list.some((x) => x.name === p.provider_name)) list.push({ name: p.provider_name, kind });
    out[region] = list;
  }
  return out;
}

// ── Programme ────────────────────────────────────────────────────────────────
const mapping = await loadMapping();
const PAGE = 1000;
let offset = 0, processed = 0, found = 0, missed = 0;
const cutoff = refreshDays ? Date.now() - refreshDays * 86400000 : 0;

while (processed < limit) {
  const anime = await sbGet(`anime_cache?select=mal_id,title,title_en,year,type&order=mal_id.asc&limit=${PAGE}&offset=${offset}`);
  if (!anime.length) break;
  offset += anime.length;
  const ids = anime.map((a) => a.mal_id).join(",");
  const done = await sbGet(`anime_streaming_regions?select=mal_id,region,updated_at&mal_id=in.(${ids})&region=in.(${regions.join(",")})`);
  const have = new Map();
  for (const d of done) have.set(`${d.mal_id}:${d.region}`, new Date(d.updated_at).getTime());

  for (const a of anime) {
    if (processed >= limit) break;
    const need = regions.filter((r) => { const t = have.get(`${a.mal_id}:${r}`); return !t || (cutoff && t < cutoff); });
    if (!need.length) continue;
    processed++;
    try {
      const t = mapping.get(a.mal_id) || (await searchTmdb(a));
      if (!t) { missed++; continue; } // pas d'équivalent TMDB : on ne stocke rien (l'appli garde l'ancien comportement)
      const prov = await providersFor(t);
      if (!prov) { missed++; continue; }
      await sbUpsert(need.map((r) => ({ mal_id: a.mal_id, region: r, providers: prov[r] || [], tmdb_id: t.id, tmdb_type: t.type, updated_at: new Date().toISOString() })));
      found++;
    } catch (e) { console.warn(`#${a.mal_id} ${a.title} : ${e.message}`); await sleep(1000); }
    if (processed % 25 === 0) console.log(`… ${processed} traités (${found} ok, ${missed} sans équivalent TMDB)`);
    await sleep(150);
  }
}
console.log(`Terminé : ${processed} traités, ${found} enregistrés, ${missed} sans équivalent TMDB. Données de disponibilité : JustWatch via TMDB.`);
