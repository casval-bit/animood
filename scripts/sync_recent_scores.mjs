// ─── sync_recent_scores.mjs ───────────────────────────────────────────────────
// Fetch les notes récentes via AniList pour les animés Currently Airing
// et Finished Airing depuis 2026
// Usage : node scripts/sync_recent_scores.mjs

import fetch from "node-fetch";

const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const ANILIST_URL   = "https://graphql.anilist.co";

const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sbQuery(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

// Fetch scores from AniList by MAL IDs (batch of 50)
async function fetchAniListScores(malIds) {
  const query = `query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){idMal averageScore popularity}}}`;
  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Accept":"application/json" },
      body: JSON.stringify({ query, variables: { ids: malIds } }),
    });
    if(res.status === 429) { await sleep(60000); return fetchAniListScores(malIds); }
    const data = await res.json();
    const result = {};
    for(const m of (data?.data?.Page?.media || [])) {
      if(!m.idMal) continue;
      // AniList score is 0-100, convert to MAL 0-10 scale
      result[m.idMal] = {
        score:     m.averageScore ? Math.round(m.averageScore / 10 * 100) / 100 : null,
        scored_by: m.popularity || null,
      };
    }
    return result;
  } catch(e) {
    console.error("AniList error:", e.message);
    return {};
  }
}

async function main() {
  console.log("🌀 AniMood — Sync notes récentes (AniList)");
  console.log("============================================");

  // 1. Récupère les animés airing ou récemment finished depuis 2026
  console.log("\n📺 Récupération des animés Printemps/Été 2026...");
  const recentAnime = await sbQuery(
    `anime_cache?anime_season_label=in.(Printemps%202026,%C3%89t%C3%A9%202026)&status=in.(Finished%20Airing,Currently%20Airing)&select=mal_id,title,score,scored_by&order=mal_id.asc&limit=1000`
  ).catch(()=>[]);

  console.log(`${recentAnime?.length || 0} animés trouvés`);
  if(!recentAnime?.length) return;

  // 2. Batch fetch AniList scores par 50
  let updated = 0;
  const ids = recentAnime.map(a => a.mal_id);

  for(let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i+50);
    const chunkAnime = recentAnime.slice(i, i+50);
    process.stdout.write(`[${i+1}-${Math.min(i+50, ids.length)}/${ids.length}] Fetch AniList... `);

    const scores = await fetchAniListScores(chunk);

    // 3. Update Supabase pour chaque animé avec une note
    let batchUpdated = 0;
    for(const anime of chunkAnime) {
      const s = scores[anime.mal_id];
      if(!s?.score) continue;

      try {
        await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${anime.mal_id}`, {
          method: "PATCH",
          headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
          body: JSON.stringify({ score: s.score, scored_by: s.scored_by }),
        });
        batchUpdated++;
        updated++;
      } catch(e) {
        console.error(`\nDB error for ${anime.mal_id}:`, e.message);
      }
    }

    console.log(`✅ ${batchUpdated} mis à jour`);
    await sleep(1000); // 1s entre les batches AniList
  }

  console.log(`\n============================================`);
  console.log(`✅ ${updated} animés mis à jour sur ${recentAnime.length}`);
}

main().catch(console.error);
