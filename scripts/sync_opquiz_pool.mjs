// ─── Sync Quiz OP pool — pick candidate anime from anime_cache (Jikan-sourced,
// tiered by MAL popularity), resolve a guaranteed-playable opening audio file
// via AnimeThemes.moe (self-hosted, no YouTube region-lock/Content-ID risk),
// and upsert the results into the opquiz_pool table.
//
// Run manually with SUPABASE_URL/SUPABASE_ANON set, or via the scheduled
// GitHub Action in .github/workflows/sync-anime.yml.

import { atGet, animeThemesStats } from "./lib/animeThemesApi.mjs";

const SUPABASE_URL  = process.env.SUPABASE_URL;
// clé de service si disponible (nécessaire une fois security_rls_2_reference.sql exécuté), sinon clé publique
const SUPABASE_ANON = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON;
// AnimeThemes : 90 requêtes/min — l'espacement, le « 429 » et le User-Agent (Cloudflare refuse les clients sans) sont gérés par scripts/lib/animeThemesApi.mjs
// Budget de temps (SYNC_BUDGET_MIN, en minutes ; absent = pas de limite) : le script s'arrête de lui-même et enregistre ce qu'il a trouvé.
const DEADLINE = Number(process.env.SYNC_BUDGET_MIN) > 0 ? Date.now() + Number(process.env.SYNC_BUDGET_MIN) * 60_000 : Infinity;
const overBudget = () => Date.now() > DEADLINE;
const TARGET_PER_TIER = 50;
const CANDIDATE_TYPES = "TV,ONA"; // openings mostly make sense for these

// Tunable: MAL `popularity` rank thresholds (lower = more popular/recognizable).
const TIERS = [
  { difficulty: "easy",   maxPopularity: 150 },
  { difficulty: "medium", maxPopularity: 600 },
  { difficulty: "hard",   maxPopularity: 3000 },
];

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

async function sbQuery(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if(!r.ok) throw new Error(await r.text());
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function sbUpsert(table, rows) {
  if(!rows.length) return;
  const deduped = [...new Map(rows.map(r=>[r.mal_id,r])).values()];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=mal_id`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(deduped),
  });
  if(!r.ok) throw new Error(await r.text());
}

function extractMalId(resources) {
  const r = (resources || []).find(res => res.site === "MyAnimeList");
  return r ? r.external_id : null;
}

// Same resolution logic as src/api/animethemes.js's fetchOpeningAudio — kept
// standalone here since this script runs outside the Vite/browser build.
async function fetchOpeningAudio(title, malId) {
  const json = await atGet(`/anime?q=${encodeURIComponent(title)}&page[size]=5&include=animethemes.animethemeentries.videos.audio,resources`, { tries: 2 })
    .catch(e => { if(e.status === 429) throw e; return null; });   // refus (404…) = pas de musique trouvée ; limite de requêtes = on remonte l'erreur
  if(!json) return null;
  const list = json.anime || [];
  const match = list.find(a => extractMalId(a.resources) === malId) || null;
  if(!match) return null;
  const openings = (match.animethemes || []).filter(t => t.type === "OP");
  for(const theme of openings) {
    for(const entry of theme.animethemeentries || []) {
      for(const video of entry.videos || []) {
        const audioLink = video.audio?.link || null;
        if(audioLink || video.link) return { audioUrl: audioLink || video.link, videoUrl: video.link || null };
      }
    }
  }
  return null;
}

async function getExistingPoolIds() {
  const rows = await sbQuery("opquiz_pool?select=mal_id&limit=5000").catch(() => []);
  return new Set((rows || []).map(r => r.mal_id));
}

async function fetchCandidates(maxPopularity, minPopularity) {
  const popFilter = minPopularity != null
    ? `&popularity=gt.${minPopularity}&popularity=lte.${maxPopularity}`
    : `&popularity=gt.0&popularity=lte.${maxPopularity}`;
  return await sbQuery(
    `anime_cache?select=mal_id,title,popularity,type,score&type=in.(${CANDIDATE_TYPES})&score=not.is.null${popFilter}&order=popularity.asc&limit=1000`
  ).catch(() => []) || [];
}

async function buildTier(tier, prevMaxPopularity, existingIds) {
  console.log(`\n🎵 Tier "${tier.difficulty}" (popularity ${prevMaxPopularity ?? 0}–${tier.maxPopularity})`);
  const candidates = await fetchCandidates(tier.maxPopularity, prevMaxPopularity);
  console.log(`  ${candidates.length} candidates from anime_cache`);

  const found = [];
  for(const anime of candidates) {
    if(found.length >= TARGET_PER_TIER) break;
    if(overBudget()) { console.log("\n  ⏱️ budget de temps atteint — le reste au prochain passage"); break; }
    if(existingIds.has(anime.mal_id)) { process.stdout.write("·"); continue; }
    try {
      const audio = await fetchOpeningAudio(anime.title, anime.mal_id);
      if(audio) {
        found.push({
          mal_id: anime.mal_id,
          title: anime.title,
          difficulty: tier.difficulty,
          audio_url: audio.audioUrl,
          video_url: audio.videoUrl,
          source: "auto",
          updated_at: new Date().toISOString(),
        });
        existingIds.add(anime.mal_id);
        process.stdout.write("✓");
      } else {
        process.stdout.write(".");
      }
    } catch(e) {
      process.stdout.write("x");
    }
  }
  console.log(`\n  ✅ ${found.length} openings resolved for "${tier.difficulty}"`);
  return found;
}

async function main() {
  if(!SUPABASE_URL || !SUPABASE_ANON) {
    console.error("Missing SUPABASE_URL / SUPABASE_ANON env vars");
    process.exit(1);
  }
  console.log("🎵 AniMood — Quiz OP pool sync");
  console.log("================================");

  const existingIds = await getExistingPoolIds();
  console.log(`📦 ${existingIds.size} openings already in opquiz_pool`);

  let prevMax = null;
  let totalAdded = 0;
  for(const tier of TIERS) {
    if(overBudget()) break;
    const rows = await buildTier(tier, prevMax, existingIds);
    await sbUpsert("opquiz_pool", rows);
    totalAdded += rows.length;
    prevMax = tier.maxPopularity;
  }

  console.log("\n================================");
  console.log(`✅ Sync complete — ${totalAdded} new openings added (AnimeThemes : ${animeThemesStats().calls} requêtes${animeThemesStats().throttled ? `, ${animeThemesStats().throttled}× « trop de requêtes »` : ""})`);
}

main().catch(e => { console.error(e); process.exit(1); });
