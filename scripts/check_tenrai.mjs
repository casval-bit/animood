// Vérifie que les sources de données des scripts de synchronisation répondent comme ils l'attendent. Lecture seule.
//   node --env-file=.env scripts/check_tenrai.mjs
// Sources testées une par une (jamais l'une à la place de l'autre) :
//   • Tenrai (MyAnimeList, source principale)  • Jikan (MyAnimeList, secours automatique)  • AniList (streaming, statuts, horaires)
// Le .env peut contenir TENRAI_SERVER_KEY ; sans clé, ça marche aussi mais avec des limites plus basses.
// MAL_SOURCES=tenrai (ou jikan) limite le test à une seule source MyAnimeList.
import { malGet, malStats } from "./lib/malApi.mjs";

let bad = 0;
const ok = (m) => console.log("   ✅", m);
const ko = (m) => { bad++; console.log("   ❌", m); };

const head = malStats();
console.log(`Ordre des sources MyAnimeList : ${head.order.join(" → ")}  ·  Tenrai ${head.withKey ? "avec Server Key" : "sans Server Key"}\n`);

/** Les trois requêtes utilisées par les scripts, posées sur UNE source. Renvoie le nombre de problèmes rencontrés. */
async function checkSource(id, label) {
  const before = bad;
  console.log(`── ${label} ──`);
  const get = (path) => malGet(path, { source: id, tries: 2 });

  // 1. Fiche d'un anime (scores, diffusion, trailers, statut)
  try {
    const d = (await get("/anime/1"))?.data;                  // Cowboy Bebop
    d?.title ? ok(`/anime/1 → « ${d.title} » · type=${d.type} · statut=${d.status} · score=${d.score} · scored_by=${d.scored_by}`) : ko("/anime/1 : réponse sans « data.title »");
    for (const k of ["status", "score", "scored_by", "broadcast", "trailer", "titles"]) if (!(k in (d || {}))) ko(`/anime/1 : champ « ${k} » absent`);
  } catch (e) { ko(`/anime/1 : ${e.message}`); }

  // 2. Liste triée (rafraîchissement des scores, 25 par page)
  try {
    const j = await get("/anime?page=1&limit=25&order_by=score&sort=desc&sfw=false");
    const n = j?.data?.length;
    n ? ok(`/anime?order_by=score → ${n} résultats · has_next_page=${j.pagination?.has_next_page} · 1er : ${j.data[0]?.title} (${j.data[0]?.score})`) : ko("liste vide");
    if (j?.pagination && !("has_next_page" in j.pagination)) ko("pagination.has_next_page absent (le script s'arrêterait après 1 page)");
  } catch (e) { ko(`/anime?order_by=score : ${e.message}`); }

  // 3. Fiche complète (ajout d'un nouvel animé : studios, genres)
  try {
    const d = (await get("/anime/1/full"))?.data;
    d?.title ? ok(`/anime/1/full → ${(d.studios || []).map((s) => s.name).join(", ")} · ${(d.genres || []).length} genres`) : ko("/anime/1/full : réponse vide");
  } catch (e) { ko(`/anime/1/full : ${e.message}`); }

  // 4. Plateformes de streaming (secours quand AniList n'en connaît pas)
  try {
    const j = await get("/anime/1/streaming");
    Array.isArray(j?.data) ? ok(`/anime/1/streaming → ${j.data.length} plateforme(s)${j.data.length ? " : " + j.data.map((x) => x.name).join(", ") : ""}`) : ko("/anime/1/streaming : réponse sans « data »");
  } catch (e) { ko(`/anime/1/streaming : ${e.message}`); }
  return bad - before;
}

const results = [];
for (const s of head.sources) results.push({ label: s.label, problems: await checkSource(s.id, s.label) });

// AniList (streaming par lots de 50, statuts, horaires)
console.log("── AniList ──");
let aniOk = false;
try {
  const r = await fetch("https://graphql.anilist.co", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ query: `query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){idMal title{romaji} externalLinks{site url type}}}}`, variables: { ids: [1, 5114, 16498] } }),
  });
  const media = (await r.json())?.data?.Page?.media || [];
  const streaming = media.flatMap((m) => (m.externalLinks || []).filter((l) => l.type === "STREAMING").map((l) => l.site));
  if (media.length) { aniOk = true; ok(`${media.length} animés, plateformes de streaming vues : ${[...new Set(streaming)].join(", ") || "aucune"}`); }
  else ko(`aucune donnée (HTTP ${r.status})`);
} catch (e) { ko(e.message); }

// Verdict : Tenrai ET Jikan en panne = vrai problème ; une seule des deux = les scripts fonctionnent grâce au secours.
const working = results.filter((r) => !r.problems);
console.log("\n══ Bilan ══");
for (const r of results) console.log(`${r.problems ? "❌" : "✅"} ${r.label}${r.problems ? ` : ${r.problems} problème(s)` : " : tout répond"}`);
console.log(`${aniOk ? "✅" : "❌"} AniList`);
const st = malStats();
console.log(`Requêtes réussies : ${st.sources.map((s) => `${s.label} ${s.ok}/${s.calls}`).join(" · ")}`);
if (!working.length) console.log("\n⚠️ Aucune source MyAnimeList ne répond correctement : les scripts de synchronisation ne pourront pas mettre à jour les scores. Colle-moi cette sortie.");
else if (results.length > 1 && working.length < results.length) console.log(`\n⚠️ ${results.filter((r) => r.problems).map((r) => r.label).join(" et ")} ne répond pas bien, mais ${working.map((r) => r.label).join(" et ")} prend le relais : les scripts fonctionneront. Colle-moi cette sortie pour que je corrige la source en panne.`);
else if (!aniOk) console.log("\n⚠️ AniList ne répond pas : le streaming et les statuts ne seront pas mis à jour (MyAnimeList sert de secours pour le streaming).");
else console.log("\n🎉 Tout est bon : les scripts de synchronisation ont leurs sources (et leur secours).");
process.exitCode = working.length && aniOk ? 0 : 1;
