// Diagnostic : pourquoi un anime n'apparaît pas (ou apparaît à tort) dans le calendrier ?
// Usage : node --env-file=.env scripts/check_anime.mjs "steel ball run"
// Affiche la ligne de la base (type, statut, jour de diffusion…) ET ce que disent AniList / Jikan en direct.
const URL_ = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON;
const q = process.argv.slice(2).join(" ").trim();
if(!q || !URL_ || !KEY) { console.log('Usage : node --env-file=.env scripts/check_anime.mjs "titre"   (.env doit contenir SUPABASE_URL et SUPABASE_SERVICE_KEY)'); process.exit(1); }

const pat = `*${q.replace(/[*,()]/g," ").trim()}*`;
const r = await fetch(`${URL_}/rest/v1/anime_cache?or=(title.ilike.${encodeURIComponent(pat)},title_en.ilike.${encodeURIComponent(pat)})&select=mal_id,title,title_en,type,status,episodes,aired_from,broadcast,score&order=mal_id.desc&limit=15`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if(!r.ok) { console.log("❌ Supabase :", r.status, await r.text()); process.exit(1); }
const rows = await r.json();
console.log(`\n=== Dans la base AniMood (${rows.length} résultat${rows.length>1?"s":""}) ===`);
if(!rows.length) console.log("Aucune ligne : l'anime n'est PAS dans anime_cache (→ il faut le job new-anime / run_new_anime.bat).");
for(const a of rows) {
  const inCal = ["Currently Airing"].includes(a.status) && ["TV","ONA","OVA"].includes(a.type);
  console.log(`\n#${a.mal_id}  ${a.title}${a.title_en?` / ${a.title_en}`:""}\n   type=${a.type}  statut=${a.status}  épisodes=${a.episodes ?? "?"}  aired_from=${a.aired_from ?? "?"}  note=${a.score ?? "-"}\n   diffusion=${a.broadcast ? JSON.stringify(a.broadcast) : "aucune"}  →  ${inCal ? "✅ éligible au calendrier" : "❌ PAS dans le calendrier (statut/type)"}`);
  // Ce que disent les sources en direct
  try {
    const al = await fetch("https://graphql.anilist.co", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ query:`query($id:Int){Media(idMal:$id,type:ANIME){status format episodes startDate{year month day} nextAiringEpisode{episode airingAt}}}`, variables:{ id:a.mal_id } }) });
    const m = (await al.json())?.data?.Media;
    console.log("   AniList :", m ? `statut=${m.status} format=${m.format} épisodes=${m.episodes ?? "?"} prochain épisode=${m.nextAiringEpisode ? `n°${m.nextAiringEpisode.episode} le ${new Date(m.nextAiringEpisode.airingAt*1000).toISOString().slice(0,16)}Z` : "aucun"}` : "introuvable");
  } catch(e) { console.log("   AniList : erreur", e.message); }
  try {
    const j = await fetch(`https://api.jikan.moe/v4/anime/${a.mal_id}`); const d = (await j.json())?.data;
    console.log("   Jikan/MAL :", d ? `statut=${d.status} type=${d.type} épisodes=${d.episodes ?? "?"} diffusion=${d.broadcast?.string || "aucune"}` : "introuvable");
  } catch(e) { console.log("   Jikan : erreur", e.message); }
  await new Promise(r => setTimeout(r, 1200));
}
console.log("\nSi AniList/Jikan disent « en cours » mais la base dit autre chose : lance run_refresh_airing.bat.");
