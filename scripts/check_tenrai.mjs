// Vérifie que Tenrai (MyAnimeList) et AniList répondent comme les scripts de synchronisation l'attendent. Lecture seule.
//   node --env-file=.env scripts/check_tenrai.mjs
// (le .env peut contenir TENRAI_SERVER_KEY ; sans clé, ça marche aussi mais avec des limites plus basses.
//  Si la clé est refusée, le test continue sans clé et te le dit : il faut alors en demander une nouvelle.)
import { malGet, malStats } from "./lib/malApi.mjs";

let bad = 0;
const ok = (m) => console.log("✅", m);
const ko = (m) => { bad++; console.log("❌", m); };

console.log(`Tenrai : ${malStats().base}  ${malStats().withKey ? "(Server Key détectée)" : "(pas de Server Key)"}\n`);

// 1. Fiche d'un anime (utilisée pour scores, diffusion, trailers, statut)
try {
  const j = await malGet("/anime/1", { tries: 2 });         // Cowboy Bebop
  const d = j?.data;
  d?.title ? ok(`/anime/1 → « ${d.title} » · type=${d.type} · statut=${d.status} · score=${d.score} · scored_by=${d.scored_by}`) : ko("/anime/1 : réponse sans « data.title »");
  for (const k of ["status", "score", "scored_by", "broadcast", "trailer", "titles"]) if (!(k in (d || {}))) ko(`/anime/1 : champ « ${k} » absent`);
} catch (e) { ko(`/anime/1 : ${e.message}`); }

// 2. Liste triée (utilisée pour rafraîchir les scores, 25 par page)
try {
  const j = await malGet("/anime?page=1&limit=25&order_by=score&sort=desc&sfw=false", { tries: 2 });
  const n = j?.data?.length;
  n ? ok(`/anime?order_by=score → ${n} résultats · has_next_page=${j.pagination?.has_next_page} · 1er : ${j.data[0]?.title} (${j.data[0]?.score})`) : ko("liste vide");
  if (j?.pagination && !("has_next_page" in j.pagination)) ko("pagination.has_next_page absent (le script s'arrêterait après 1 page)");
} catch (e) { ko(`/anime?order_by=score : ${e.message}`); }

// 3. Fiche complète (utilisée pour ajouter un nouvel animé)
try {
  const d = (await malGet("/anime/1/full", { tries: 2 }))?.data;
  d?.title ? ok(`/anime/1/full → ${(d.studios || []).map((s) => s.name).join(", ")} · ${(d.genres || []).length} genres`) : ko("/anime/1/full : réponse vide");
} catch (e) { ko(`/anime/1/full : ${e.message}`); }

// 4. Plateformes de streaming (secours quand AniList n'en connaît pas)
try {
  const j = await malGet("/anime/1/streaming", { tries: 2 });
  Array.isArray(j?.data) ? ok(`/anime/1/streaming → ${j.data.length} plateforme(s)${j.data.length ? " : " + j.data.map((x) => x.name).join(", ") : ""}`) : ko("/anime/1/streaming : réponse sans « data »");
} catch (e) { ko(`/anime/1/streaming : ${e.message}`); }

// 5. AniList (streaming par lots de 50, statuts, horaires)
try {
  const r = await fetch("https://graphql.anilist.co", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ query: `query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){idMal title{romaji} externalLinks{site url type}}}}`, variables: { ids: [1, 5114, 16498] } }),
  });
  const media = (await r.json())?.data?.Page?.media || [];
  const streaming = media.flatMap((m) => (m.externalLinks || []).filter((l) => l.type === "STREAMING").map((l) => l.site));
  media.length ? ok(`AniList → ${media.length} animés, plateformes de streaming vues : ${[...new Set(streaming)].join(", ") || "aucune"}`) : ko(`AniList : aucune donnée (HTTP ${r.status})`);
} catch (e) { ko(`AniList : ${e.message}`); }

const st = malStats();
console.log(`\nTenrai : ${st.ok}/${st.calls} requêtes réussies${st.keyRefused ? " — ⚠️ Server Key REFUSÉE (test fait sans clé) : demande-en une nouvelle sur Tenrai" : ""}`);
console.log(bad ? `\n⚠️ ${bad} problème(s) : colle-moi cette sortie et j'adapte les scripts.` : "\n🎉 Tout est bon : les scripts de synchronisation peuvent utiliser Tenrai.");
process.exitCode = bad ? 1 : 0;
