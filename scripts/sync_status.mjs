// ─── sync_status.mjs ──────────────────────────────────────────────────────────
// Met à jour le status des animés Spring/Summer 2026 depuis Jikan

const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON;
const JIKAN_BASE    = "https://api.jikan.moe/v4";
const DELAY_MS      = 1100;

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

async function jikanGet(malId, attempt=0) {
  const r = await fetch(`${JIKAN_BASE}/anime/${malId}`);
  if(r.status === 429) { await sleep(60000); return jikanGet(malId, attempt+1); }
  if(!r.ok) return null;
  return r.json();
}

async function main() {
  console.log("🌀 Sync status Spring/Summer 2026 depuis Jikan");
  console.log("================================================");

  const anime = await sbQuery(
    `anime_cache?anime_season_label=in.(Printemps%202026,%C3%89t%C3%A9%202026)&select=mal_id,title,status&order=mal_id.asc&limit=1000`
  ).catch(()=>[]);

  console.log(`${anime?.length || 0} animés trouvés`);
  if(!anime?.length) return;

  let updated = 0;

  for(const a of anime) {
    process.stdout.write(`[${a.mal_id}] ${a.title?.slice(0,35).padEnd(35)} → `);

    const data = await jikanGet(a.mal_id);
    if(!data?.data) { console.log("❌ Jikan échec"); await sleep(DELAY_MS); continue; }

    const newStatus = data.data.status;
    const score     = data.data.score || null;
    const scored_by = data.data.scored_by || null;

    await fetch(`${SUPABASE_URL}/rest/v1/anime_cache?mal_id=eq.${a.mal_id}`, {
      method: "PATCH",
      headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify({ status: newStatus, score, scored_by }),
    }).catch(()=>{});

    console.log(`✅ ${newStatus} | score: ${score||"—"}`);
    updated++;
    await sleep(DELAY_MS);
  }

  console.log(`\n✅ ${updated} animés mis à jour`);
}

main().catch(console.error);
