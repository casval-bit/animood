// ─── Migration Firebase Firestore → Supabase (raw) ───────────────────────────
// Importe la collection "anime" de Firebase telle quelle dans Supabase
// Sans conversion de moods — données raw dans une table dédiée
// Lance avec: node migrate_firebase_to_supabase.mjs
// Prérequis: npm install firebase-admin

import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Config ────────────────────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = "./animemood-b6908-firebase-adminsdk-fbsvc-2939d52426.json";

const SUPABASE_URL  = "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";

const BATCH_SIZE    = 20;
const SKIP_EXISTING = true;

// ── Supabase helpers ──────────────────────────────────────────────────────────
const SB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON,
  "Authorization": `Bearer ${SUPABASE_ANON}`,
};

async function sbQuery(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbUpsertBatch(rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/mood_pts_firebase?on_conflict=mal_id`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(await r.text());
}

async function getExistingIds() {
  const ids = new Set();
  let offset = 0;
  while (true) {
    const rows = await sbQuery(`mood_pts_firebase?select=mal_id&limit=1000&offset=${offset}`);
    if (!rows.length) break;
    rows.forEach(r => ids.add(parseInt(r.mal_id)));
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return ids;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔥→🟩 Migration Firebase → Supabase (raw)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  let existingIds = new Set();
  if (SKIP_EXISTING) {
    process.stdout.write("📦 Chargement des IDs existants... ");
    existingIds = await getExistingIds();
    console.log(`${existingIds.size} déjà présents`);
  }

  console.log("\n📥 Lecture de Firebase 'anime'...");
  const snapshot = await db.collection("anime").get();
  console.log(`   ${snapshot.size} documents\n`);

  let batch = [];
  let totalDone = 0, totalSkipped = 0, totalErrors = 0;

  for (const doc of snapshot.docs) {
    const mal_id = parseInt(doc.id);
    if (isNaN(mal_id)) { totalErrors++; continue; }

    if (SKIP_EXISTING && existingIds.has(mal_id)) {
      process.stdout.write("·");
      totalSkipped++;
      continue;
    }

    const d = doc.data();
    const mp = d.mood_percentages || {};

    // Store raw Firebase mood_percentages as-is
    batch.push({
      mal_id,
      sad:     mp.sad     || 0,
      romance: mp.romance || 0,
      happy:   mp.happy   || 0,
      chill:   mp.chill   || 0,
      focus:   mp.focus   || 0,
      fun:     mp.fun     || 0,
      dark:    mp.dark    || 0,
      hype:    mp.hype    || 0,
      // raw metadata
      title:   d.title    || null,
      score:   d.score    || null,
      moods:   d.moods    || [],
    });

    process.stdout.write("✓");
    totalDone++;

    if (batch.length >= BATCH_SIZE) {
      try { await sbUpsertBatch(batch); batch = []; }
      catch(e) { console.error(`\n  ✗ batch error: ${e.message}`); }
    }
  }

  if (batch.length > 0) {
    try { await sbUpsertBatch(batch); }
    catch(e) { console.error(`\n  ✗ final batch: ${e.message}`); }
  }

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Migration terminée`);
  console.log(`   Importés : ${totalDone}`);
  console.log(`   Skippés  : ${totalSkipped}`);
  console.log(`   Erreurs  : ${totalErrors}`);

  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
