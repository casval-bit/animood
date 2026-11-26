// Tests de l'espace « AniMood 2026 » (src/utils/awards2026.js) : quels animés comptent, points du top 3, classements (points / plus de n°1 / meilleur ratio
// de n°1, communauté ou amis), grille personnalisable, et bloc de fin d'année (date de fin, fermeture mémorisée, remise à zéro à la déconnexion).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  AWARDS_YEAR, animeYear, isTypeEligible, isEligible2026, formatGroupOf, FORMAT_GROUPS, lightAnime, animeName,
  VOTE_WEIGHTS, RANK_MODES, normalizePicks, ballotFromRow, tally, defaultMinMentions, rankBy, scopeBallots, buildRanking,
  DEFAULT_GRID_KEYS, FEATURED_KEY, MAX_GRID_CELLS, MAX_LABEL_LENGTH, defaultGrid, cellLabel, setCellAnime, clearCell, renameCell, addCell,
  removeCell, moveCell, gridFilledCount, sanitizeGrid, setGridTitle, MAX_TITLE_LENGTH,
  SCOPES, buildAllRankings, rankingIds, visibleRanking,
  placePick, clearPick, slotsToPicks, sameTop3, gridKey, top3Key, readGrid, writeGrid, readTop3Draft, writeTop3Draft,
  BANNER_LAST_DAY, isBannerSeason, bannerKey, isBannerDismissed, dismissBanner, resetBannerDismissals,
} from "../src/utils/awards2026.js";
import { AWARDS_I18N, awardsText } from "../src/constants/awardsI18n.js";
import { MEASURE_IMG_FIX_CSS } from "../src/utils/posterExport.js";

// Générateur d'identifiants prévisible (les vrais mêlent l'heure et un compteur)
const seqIds = () => { let n = 0; return () => `t${++n}`; };
const a26 = (mal_id, extra = {}) => ({ mal_id, title: `Anime ${mal_id}`, year: 2026, type: "TV", ...extra });
const ballot = (username, ...picks) => ({ username, picks });

// ── 1. Éligibilité ──────────────────────────────────────────────────────────────────────────────────────────────────
test("année : `year`, sinon la date de début de diffusion, sinon la saison ; inconnue → null", () => {
  assert.equal(AWARDS_YEAR, 2026);
  assert.equal(animeYear({ year: 2026 }), 2026);
  assert.equal(animeYear({ year: "2026" }), 2026);
  assert.equal(animeYear({ year: null, aired_from: "2026-04-05T00:00:00+00:00" }), 2026);
  assert.equal(animeYear({ aired_from: "2025-12-31" }), 2025);
  assert.equal(animeYear({ anime_season_label: "Hiver 2026" }), 2026);
  assert.equal(animeYear({ anime_season_label: "Summer 2026" }), 2026);
  assert.equal(animeYear({ year: 0, aired_from: "n'importe quoi", anime_season_label: "Bientôt" }), null);
  assert.equal(animeYear({}), null);
  assert.equal(animeYear(null), null);
  assert.equal(animeYear(undefined), null);
});

test("tous les formats comptent : série, film, OVA, ONA, spécial… (donghua chinois et animation coréenne compris)", () => {
  for (const type of ["TV", "Movie", "OVA", "ONA", "Special", "TV Special", "tv", "MOVIE", "TV Short", null, undefined, ""]) {
    assert.equal(isEligible2026(a26(1, { type })), true, `type ${JSON.stringify(type)}`);
  }
  // l'origine (Japon, Chine, Corée…) n'entre jamais dans la règle
  for (const country of ["JP", "CN", "KR", "other", null]) assert.equal(isEligible2026(a26(1, { country })), true, `pays ${country}`);
});

test("pubs, bandes-annonces et clips musicaux ne comptent pas", () => {
  for (const type of ["CM", "PV", "Music", "cm", " pv "]) {
    assert.equal(isTypeEligible(type), false, type);
    assert.equal(isEligible2026(a26(1, { type })), false, type);
  }
  assert.equal(isTypeEligible("TV"), true);
  assert.equal(isTypeEligible(undefined), true);
});

test("seule l'année 2026 compte : 2025 et 2027 sont écartés, sans année aussi", () => {
  assert.equal(isEligible2026(a26(1, { year: 2025 })), false);
  assert.equal(isEligible2026(a26(1, { year: 2027 })), false);
  assert.equal(isEligible2026({ mal_id: 1, type: "TV" }), false);
  assert.equal(isEligible2026(null), false);
  assert.equal(isEligible2026(a26(1, { year: null, aired_from: "2026-01-02" })), true);
  assert.equal(isEligible2026(a26(1, { year: null, aired_from: null, anime_season_label: "Automne 2026" })), true);
});

test("contenu pour adultes : écarté (sauf demande explicite)", () => {
  const rx = a26(1, { rating: "Rx - Hentai" });
  const tagged = a26(2, { genres: [{ name: "Hentai" }] });
  assert.equal(isEligible2026(rx), false);
  assert.equal(isEligible2026(tagged), false);
  assert.equal(isEligible2026(rx, { allowAdult: true }), true);
  assert.equal(isEligible2026(a26(3, { rating: "PG-13 - Teens 13 or older" })), true);
});

test("groupes de format du sélecteur : chaque type MAL tombe dans un seul groupe", () => {
  assert.deepEqual(FORMAT_GROUPS.map((g) => g.id), ["all", "tv", "movie", "ova", "ona"]);
  assert.equal(formatGroupOf("TV"), "tv");
  assert.equal(formatGroupOf("Movie"), "movie");
  assert.equal(formatGroupOf("OVA"), "ova");
  assert.equal(formatGroupOf("Special"), "ova");
  assert.equal(formatGroupOf("TV Special"), "ova");
  assert.equal(formatGroupOf("ONA"), "ona");
  assert.equal(formatGroupOf("Mystère"), "other");
  const seen = new Map();
  for (const g of FORMAT_GROUPS) for (const t of g.types || []) { assert.equal(seen.has(t), false, `${t} dans deux groupes`); seen.set(t, g.id); }
});

test("version légère d'un animé : garde l'essentiel, accepte aussi le format de l'appli (images.jpg)", () => {
  const light = lightAnime({ mal_id: "7", title: "Titre", title_en: "Title", image_url: "i.jpg", large_image: "l.jpg", score: 8.1, year: 2026, type: "TV", popularity: 12, genres: ["x"], synopsis: "long texte" });
  assert.deepEqual(light, { mal_id: 7, title: "Titre", title_en: "Title", image_url: "i.jpg", large_image: "l.jpg", score: 8.1, year: 2026, type: "TV", popularity: 12 });
  const fromApp = lightAnime({ mal_id: 8, title: "T", title_english: "E", images: { jpg: { image_url: "a.jpg", large_image_url: "b.jpg" } } });
  assert.equal(fromApp.title_en, "E");
  assert.equal(fromApp.image_url, "a.jpg");
  assert.equal(fromApp.large_image, "b.jpg");
  assert.equal(lightAnime(null), null);
  assert.equal(lightAnime({ title: "sans identifiant" }), null);
  assert.equal(animeName({ title: "Titre", title_en: "Title" }), "Title");
  assert.equal(animeName({ title: "Titre" }), "Titre");
  assert.equal(animeName(null), "");
});

// ── 2. Votes : points et classements ──────────────────────────────────────────────────────────────────────────────────
test("points : 1er = 3, 2e = 2, 3e = 1", () => {
  assert.deepEqual([...VOTE_WEIGHTS], [3, 2, 1]);
  const { voters, rows } = tally([ballot("a", 10, 20, 30)]);
  assert.equal(voters, 1);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId[10].points, 3);
  assert.equal(byId[20].points, 2);
  assert.equal(byId[30].points, 1);
  assert.deepEqual([byId[10].firsts, byId[20].seconds, byId[30].thirds], [1, 1, 1]);
});

test("un vote valide = 3 animés différents (entiers positifs) ; le reste est refusé", () => {
  assert.deepEqual(normalizePicks([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(normalizePicks(["4", "5", "6"]), [4, 5, 6]);
  assert.equal(normalizePicks([1, 1, 2]), null);
  assert.equal(normalizePicks([1, 2]), null);
  assert.equal(normalizePicks([1, 2, 3, 4]), null);
  assert.equal(normalizePicks([1, 2, 0]), null);
  assert.equal(normalizePicks([1, 2, -3]), null);
  assert.equal(normalizePicks([1, 2, 2.5]), null);
  assert.equal(normalizePicks([1, 2, "x"]), null);
  assert.equal(normalizePicks(null), null);
  assert.equal(normalizePicks("1,2,3"), null);
});

test("ligne de la table → vote ; incomplète ou sans pseudo → ignorée", () => {
  assert.deepEqual(ballotFromRow({ username: "alice", pick1: 1, pick2: 2, pick3: 3, updated_at: "x" }), { username: "alice", picks: [1, 2, 3] });
  assert.equal(ballotFromRow({ username: "alice", pick1: 1, pick2: 1, pick3: 3 }), null);
  assert.equal(ballotFromRow({ username: "alice", pick1: 1, pick2: 2, pick3: null }), null);
  assert.equal(ballotFromRow({ pick1: 1, pick2: 2, pick3: 3 }), null);
  assert.equal(ballotFromRow(null), null);
});

test("décompte : points cumulés, votes reçus et part de n°1 ; un membre = un seul vote (le dernier)", () => {
  const { voters, rows } = tally([
    ballot("a", 1, 2, 3),
    ballot("b", 1, 3, 2),
    ballot("c", 2, 1, 3),
    ballot("a", 3, 2, 1),                       // « a » change d'avis : seul ce dernier vote compte
  ]);
  assert.equal(voters, 3);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  // b : 1er=1, 2e=3, 3e=2 ; c : 1er=2, 2e=1, 3e=3 ; a (dernier) : 1er=3, 2e=2, 3e=1
  assert.deepEqual([by[1].points, by[1].firsts, by[1].mentions], [3 + 2 + 1, 1, 3]);
  assert.deepEqual([by[2].points, by[2].firsts, by[2].mentions], [1 + 3 + 2, 1, 3]);
  assert.deepEqual([by[3].points, by[3].firsts, by[3].mentions], [2 + 1 + 3, 1, 3]);
  assert.equal(by[1].ratio, 1 / 3);
  assert.equal(rows.reduce((s, r) => s + r.points, 0), 3 * 6, "chaque votant distribue 6 points");
});

test("votes invalides ignorés (doublon, incomplet, vide) ; listes vides sans erreur", () => {
  const { voters, rows } = tally([ballot("a", 1, 1, 2), ballot("b", 1, 2), null, undefined, { username: "c" }, ballot("d", 4, 5, 6)]);
  assert.equal(voters, 1);
  assert.deepEqual(rows.map((r) => r.id).sort(), [4, 5, 6]);
  assert.deepEqual(tally([]), { voters: 0, rows: [] });
  assert.deepEqual(tally(null), { voters: 0, rows: [] });
});

test("classement par points : le plus de points d'abord ; à égalité, plus de n°1, puis plus de votes", () => {
  // A : 1 n°1 (3) → 3 pts ; B : deux 2es (4) → 4 pts ; C : 3e ×3 → 3 pts ; D : 1 n°1 + 1 3e → 4 pts
  const { rows } = tally([ballot("u1", 100, 200, 300), ballot("u2", 400, 200, 300), ballot("u3", 500, 600, 300), ballot("u4", 700, 800, 400)]);
  const order = rankBy(rows, "points").map((r) => r.id);
  // 200 : 2+2=4 pts (0 n°1) ; 400 : 3+1=4 pts (1 n°1) ; 300 : 1+1+1=3 pts ; 100/500/700 : 3 pts (1 n°1)
  assert.deepEqual(order.slice(0, 2), [400, 200], "4 pts chacun : celui qui a un n°1 passe devant");
  const three = order.slice(2, 6);
  assert.equal(new Set(three).size, 4);
  assert.equal(three[three.length - 1], 300, "3 pts sans aucun n°1 : après ceux qui en ont un");
});

test("classement par n°1 : le plus de 1res places d'abord ; à égalité, points", () => {
  const { rows } = tally([ballot("u1", 1, 2, 3), ballot("u2", 1, 3, 2), ballot("u3", 2, 1, 3), ballot("u4", 3, 2, 1)]);
  // 1 : deux n°1 ; 2 : un n°1 ; 3 : un n°1 ; points → 1 : 3+3+2+1=9, 2 : 2+1+3+2=8, 3 : 1+2+1+3=7
  assert.deepEqual(rankBy(rows, "firsts").map((r) => r.id), [1, 2, 3]);
});

test("ratio de n°1 : part de n°1 parmi les votes reçus ; en dessous du minimum de votes, pas classé", () => {
  // 10 : cité 2 fois, deux fois en 1er (100 %) ; 20 : cité 4 fois, 3 fois en 1er (75 %) ; 30 : cité 1 fois, en 1er (100 % mais trop peu de votes)
  const ballots = [
    ballot("a", 10, 40, 50), ballot("b", 10, 40, 50),
    ballot("c", 20, 40, 50), ballot("d", 20, 40, 50), ballot("e", 20, 40, 50), ballot("f", 60, 20, 50),
    ballot("g", 30, 40, 50),
  ];
  const { rows } = tally(ballots);
  assert.deepEqual(rankBy(rows, "ratio", { minMentions: 2 }).map((r) => r.id).slice(0, 2), [10, 20]);
  assert.equal(rankBy(rows, "ratio", { minMentions: 2 }).some((r) => r.id === 30), false, "cité une seule fois : écarté");
  assert.equal(rankBy(rows, "ratio", { minMentions: 1 })[0].id === 10 || rankBy(rows, "ratio", { minMentions: 1 })[0].id === 30, true);
  assert.equal(rankBy(rows, "ratio", { minMentions: 99 }).length, 0);
});

test("minimum de votes pour le ratio : 10 % des votants, entre 2 et 5", () => {
  assert.equal(defaultMinMentions(0), 2);
  assert.equal(defaultMinMentions(5), 2);
  assert.equal(defaultMinMentions(40), 4);
  assert.equal(defaultMinMentions(200), 5);
  assert.equal(defaultMinMentions(100000), 5);
  assert.equal(defaultMinMentions(undefined), 2);
});

test("égalité parfaite : l'animé le plus populaire (rang MAL le plus petit) d'abord, puis l'identifiant", () => {
  const { rows } = tally([ballot("a", 1, 2, 3), ballot("b", 2, 1, 3)]);   // 1 et 2 : 5 points, un n°1, 2 votes
  const pop = { 1: 500, 2: 20 };
  assert.deepEqual(rankBy(rows, "points", { popularity: (id) => pop[id] }).map((r) => r.id).slice(0, 2), [2, 1]);
  assert.deepEqual(rankBy(rows, "points").map((r) => r.id).slice(0, 2), [1, 2], "sans popularité : identifiant croissant");
  assert.deepEqual(rankBy(rows, "points", { popularity: () => 0 }).map((r) => r.id).slice(0, 2), [1, 2], "popularité inconnue ou nulle : ignorée");
  // l'ordre ne dépend pas de l'ordre d'arrivée des votes
  const shuffled = tally([ballot("b", 2, 1, 3), ballot("a", 1, 2, 3)]).rows;
  assert.deepEqual(rankBy(shuffled, "points").map((r) => r.id), rankBy(rows, "points").map((r) => r.id));
});

test("mode inconnu → classement par points ; la liste d'origine n'est pas modifiée", () => {
  assert.deepEqual(RANK_MODES, ["points", "firsts", "ratio"]);
  const { rows } = tally([ballot("a", 5, 6, 7), ballot("b", 6, 5, 7)]);
  const copy = rows.map((r) => ({ ...r }));
  assert.deepEqual(rankBy(rows, "n'importe quoi").map((r) => r.id), rankBy(rows, "points").map((r) => r.id));
  assert.deepEqual(rows, copy);
});

test("amis : seuls les votes des membres que je suis comptent (mon propre vote n'en fait pas partie)", () => {
  const ballots = [ballot("me", 1, 2, 3), ballot("ami1", 9, 8, 7), ballot("ami2", 9, 7, 8), ballot("inconnu", 5, 6, 4)];
  const friends = new Set(["ami1", "ami2"]);
  assert.deepEqual(scopeBallots(ballots, "friends", { friends }).map((b) => b.username), ["ami1", "ami2"]);
  assert.equal(scopeBallots(ballots, "community").length, 4);
  assert.deepEqual(scopeBallots(ballots, "friends", { friends: ["ami1"] }).map((b) => b.username), ["ami1"], "tableau accepté comme ensemble");
  assert.deepEqual(scopeBallots(ballots, "friends", { friends: undefined }), [], "pas d'amis : liste vide");
  assert.deepEqual(scopeBallots(null, "friends", { friends }), []);
  const top = buildRanking(ballots, { scope: "friends", friends, mode: "points", limit: 3 });
  assert.equal(top.voters, 2);
  assert.deepEqual(top.list.map((r) => r.id), [9, 7, 8]);
  assert.deepEqual(top.list.map((r) => r.points), [6, 3, 3]);
});

test("classement prêt à afficher : limite, votants, minimum de votes, 3 modes", () => {
  const ballots = Array.from({ length: 30 }, (_, i) => ballot(`u${i}`, 1 + (i % 4), 5 + (i % 3), 20));
  const byPoints = buildRanking(ballots, { limit: 3 });
  assert.equal(byPoints.voters, 30);
  assert.equal(byPoints.list.length, 3);
  assert.equal(byPoints.minMentions, 3);
  for (const mode of RANK_MODES) {
    const r = buildRanking(ballots, { mode });
    assert.ok(r.list.length > 0, mode);
    assert.ok(r.list.length <= 10, mode);
  }
  assert.deepEqual(buildRanking([], { mode: "ratio" }), { voters: 0, minMentions: 2, list: [] });
  assert.deepEqual(buildRanking(null).list, []);
});

test("tous les classements d'un coup : 2 portées × 3 modes ; identifiants à retrouver ; animés inconnus écartés", () => {
  const ballots = [ballot("me", 1, 2, 3), ballot("ami", 9, 8, 7), ballot("autre", 9, 1, 2), ballot("autre2", 8, 9, 1)];
  const all = buildAllRankings(ballots, { friends: new Set(["ami"]) });
  assert.deepEqual(SCOPES, ["community", "friends"]);
  for (const scope of SCOPES) assert.deepEqual(Object.keys(all[scope]), ["points", "firsts", "ratio"]);
  assert.equal(all.community.points.voters, 4);
  assert.equal(all.friends.points.voters, 1);
  assert.deepEqual(all.friends.points.list.map((r) => r.id), [9, 8, 7]);
  assert.equal(all.community.points.list[0].id, 9, "9 : 3 + 3 + 2 = 8 points");
  assert.deepEqual(rankingIds(all).sort((a, b) => a - b), [1, 2, 3, 7, 8, 9]);
  const known = new Map([[9, {}], [1, {}], [2, {}]]);
  assert.deepEqual(visibleRanking(all.community.points, known, 10).list.map((r) => r.id).sort(), [1, 2, 9]);
  assert.equal(visibleRanking(all.community.points, known, 2).list.length, 2);
  assert.equal(visibleRanking(all.community.points, known).voters, 4, "le nombre de votants reste celui du classement complet");
  assert.deepEqual(rankingIds(null), []);
  assert.deepEqual(visibleRanking(undefined, known).list, []);
  // la popularité sert à départager, et le même classement est reproductible
  const pop = (id) => ({ 7: 5, 8: 6, 9: 7 })[id];
  const withPop = buildAllRankings(ballots, { friends: ["ami"], popularity: pop });
  assert.deepEqual(withPop.friends.points.list.map((r) => r.id), [9, 8, 7], "amis : 9 (3 pts) > 8 (2 pts) > 7 (1 pt)");
});

// ── 3. Grille ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test("grille par défaut : 9 cases, avec meilleure animation, meilleure OST, meilleur héros et meilleure héroïne, toutes vides", () => {
  const g = defaultGrid(seqIds());
  assert.equal(g.cells.length, 9);
  assert.deepEqual(g.cells.map((c) => c.key), DEFAULT_GRID_KEYS);
  for (const key of ["animation", "ost", "mc_m", "mc_f"]) assert.ok(g.cells.some((c) => c.key === key), key);
  assert.ok(g.cells.every((c) => c.anime === null && c.label === null));
  assert.equal(new Set(g.cells.map((c) => c.id)).size, 9, "identifiants uniques");
  assert.equal(g.cells[4].key, FEATURED_KEY, "l'animé de l'année au centre de la grille 3×3");
  assert.equal(gridFilledCount(g), 0);
});

test("identifiants de cases : toujours différents, même créés à la même milliseconde", () => {
  const ids = Array.from({ length: 200 }, () => defaultGrid().cells[0].id);
  assert.equal(new Set(ids).size, 200);
});

test("le même animé peut remplir plusieurs cases", () => {
  let g = defaultGrid(seqIds());
  const anime = a26(42, { image_url: "x.jpg", synopsis: "texte long à ne pas garder" });
  g = setCellAnime(g, g.cells[0].id, anime);
  g = setCellAnime(g, g.cells[1].id, anime);
  g = setCellAnime(g, g.cells[8].id, anime);
  assert.equal(gridFilledCount(g), 3);
  assert.deepEqual(g.cells.filter((c) => c.anime).map((c) => c.anime.mal_id), [42, 42, 42]);
  assert.equal(g.cells[0].anime.synopsis, undefined, "seule la version légère est gardée");
});

test("changer / vider une case n'en touche aucune autre ; la grille d'origine n'est pas modifiée", () => {
  const g0 = defaultGrid(seqIds());
  const g1 = setCellAnime(g0, g0.cells[2].id, a26(1));
  assert.equal(g0.cells[2].anime, null);
  const g2 = setCellAnime(g1, g1.cells[3].id, a26(2));
  const g3 = clearCell(g2, g2.cells[2].id);
  assert.deepEqual(g3.cells.map((c) => c.anime?.mal_id ?? null), [null, null, null, 2, null, null, null, null, null]);
  assert.equal(g2.cells[2].anime.mal_id, 1);
  assert.equal(setCellAnime(g0, g0.cells[0].id, null).cells[0].anime, null);
  assert.equal(setCellAnime(g0, "inexistant", a26(5)).cells.every((c) => !c.anime), true);
});

test("renommer une case : nom nettoyé et limité ; vide = nom d'origine", () => {
  const labels = { animation: "Meilleure animation", ost: "Meilleure OST" };
  let g = defaultGrid(seqIds());
  const id = g.cells[0].id;
  assert.equal(cellLabel(g.cells[0], labels), "Meilleure animation");
  g = renameCell(g, id, "   Plus beau   combat \n");
  assert.equal(g.cells[0].label, "Plus beau combat");
  assert.equal(cellLabel(g.cells[0], labels), "Plus beau combat");
  g = renameCell(g, id, "x".repeat(200));
  assert.equal(g.cells[0].label.length, MAX_LABEL_LENGTH);
  g = renameCell(g, id, "   ");
  assert.equal(g.cells[0].label, null);
  assert.equal(cellLabel(g.cells[0], labels), "Meilleure animation");
  assert.equal(cellLabel({ key: null, label: null }, labels), "");
  assert.equal(cellLabel(null, labels), "");
});

test("ajouter, retirer et déplacer des cases : plafond de 12, au moins 1 case, déplacement aux bornes sans effet", () => {
  const ids = seqIds();
  let g = defaultGrid(ids);
  g = addCell(g, "  Plus gros choc ", ids);
  assert.equal(g.cells.length, 10);
  assert.deepEqual([g.cells[9].key, g.cells[9].label], [null, "Plus gros choc"]);
  while (g.cells.length < MAX_GRID_CELLS) g = addCell(g, "", ids);
  assert.equal(g.cells.length, MAX_GRID_CELLS);
  assert.equal(addCell(g, "de trop", ids), g, "au-delà du plafond : inchangée");
  g = removeCell(g, g.cells[0].id);
  assert.equal(g.cells.length, MAX_GRID_CELLS - 1);
  let tiny = { v: 1, cells: [{ id: "solo", key: null, label: "seule", anime: null }] };
  assert.equal(removeCell(tiny, "solo"), tiny, "il reste toujours une case");
  const m = defaultGrid(seqIds());
  const firstId = m.cells[0].id, secondId = m.cells[1].id;
  assert.equal(moveCell(m, firstId, -1), m, "déjà en première position");
  assert.equal(moveCell(m, m.cells[8].id, 1), m, "déjà en dernière position");
  const moved = moveCell(m, firstId, 1);
  assert.deepEqual([moved.cells[0].id, moved.cells[1].id], [secondId, firstId]);
  assert.equal(moveCell(m, "inexistant", 1), m);
});

test("grille relue du stockage : texte abîmé, cases invalides et trop nombreuses → nettoyées ; rien d'exploitable → grille par défaut", () => {
  const ids = seqIds();
  for (const bad of [null, undefined, "", "pas du json", "{}", '{"cells":[]}', '{"cells":"x"}', 42, [], { cells: [null, 3, "x"] }]) {
    const g = sanitizeGrid(bad, ids);
    assert.equal(g.cells.length, 9, `entrée ${JSON.stringify(bad)}`);
    assert.deepEqual(g.cells.map((c) => c.key), DEFAULT_GRID_KEYS);
  }
  const raw = {
    v: 1,
    cells: [
      { id: "a", key: "ost", label: "  Mon  OST  ", anime: { mal_id: 5, title: "Cinq", synopsis: "à jeter" } },
      { id: "a", key: "inconnue", label: 12, anime: { mal_id: "zéro" } },       // identifiant en double, catégorie inconnue, nom non texte, animé sans identifiant
      null,
      { key: "mc_f", anime: null },                                              // sans identifiant : on en fabrique un
    ],
  };
  const g = sanitizeGrid(JSON.stringify(raw), ids);
  assert.equal(g.cells.length, 3);
  assert.deepEqual([g.cells[0].id, g.cells[0].key, g.cells[0].label, g.cells[0].anime.mal_id], ["a", "ost", "Mon OST", 5]);
  assert.equal(g.cells[0].anime.synopsis, undefined);
  assert.equal(g.cells[1].key, null);
  assert.equal(g.cells[1].label, null);
  assert.equal(g.cells[1].anime, null);
  assert.notEqual(g.cells[1].id, "a", "identifiant en double remplacé");
  assert.equal(g.cells[2].key, "mc_f");
  assert.equal(new Set(g.cells.map((c) => c.id)).size, 3);
  const many = { cells: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, key: null, label: `case ${i}`, anime: null })) };
  assert.equal(sanitizeGrid(many, ids).cells.length, MAX_GRID_CELLS);
  // aller-retour : une grille enregistrée se relit à l'identique
  let filled = defaultGrid(ids);
  filled = setCellAnime(filled, filled.cells[0].id, a26(7, { image_url: "a.jpg", score: 8.5, popularity: 33 }));
  filled = renameCell(filled, filled.cells[1].id, "Mon préféré");
  assert.deepEqual(sanitizeGrid(JSON.stringify(filled), ids), filled);
});

// ── Mon top 3 : les 3 places ─────────────────────────────────────────────────────────────────────────────────────────────
test("top 3 : choisir un animé remplit la place ; un animé déjà placé échange les deux places (jamais de doublon)", () => {
  let slots = [null, null, null];
  slots = placePick(slots, 0, a26(10));
  slots = placePick(slots, 1, a26(20));
  slots = placePick(slots, 2, a26(30));
  assert.deepEqual(slots.map((s) => s.mal_id), [10, 20, 30]);
  // 30 passe en 1re place : l'ancien n°1 (10) prend sa place
  slots = placePick(slots, 0, a26(30));
  assert.deepEqual(slots.map((s) => s.mal_id), [30, 20, 10]);
  // choisir pour une place vide un animé déjà placé : il se déplace, l'ancienne place devient vide
  slots = clearPick(slots, 2);
  slots = placePick(slots, 2, a26(30));
  assert.deepEqual(slots.map((s) => s?.mal_id ?? null), [null, 20, 30]);
  // même animé, même place : rien ne change
  assert.deepEqual(placePick(slots, 1, a26(20)).map((s) => s?.mal_id ?? null), [null, 20, 30]);
  // remplacer par un autre animé
  assert.deepEqual(placePick(slots, 1, a26(99)).map((s) => s?.mal_id ?? null), [null, 99, 30]);
});

test("top 3 : places invalides ou animé invalide → rien ne change ; la liste d'origine n'est pas modifiée", () => {
  const base = [a26(1), null, null].map((a) => (a ? lightAnime(a) : null));
  const copy = JSON.stringify(base);
  assert.deepEqual(placePick(base, 3, a26(2)), base);
  assert.deepEqual(placePick(base, -1, a26(2)), base);
  assert.deepEqual(placePick(base, 1.5, a26(2)), base);
  assert.deepEqual(placePick(base, 1, { title: "sans identifiant" }), base);
  assert.deepEqual(placePick(null, 0, a26(5)).map((s) => s?.mal_id ?? null), [5, null, null]);
  assert.equal(JSON.stringify(base), copy);
  assert.equal(placePick(base, 1, a26(2)).length, 3);
});

test("top 3 : complet seulement avec 3 animés différents ; comparaison avec ce qui est enregistré", () => {
  let slots = [null, null, null];
  assert.equal(slotsToPicks(slots), null);
  slots = placePick(placePick(slots, 0, a26(1)), 1, a26(2));
  assert.equal(slotsToPicks(slots), null, "il manque la 3e place");
  slots = placePick(slots, 2, a26(3));
  assert.deepEqual(slotsToPicks(slots), [1, 2, 3]);
  assert.equal(sameTop3(slots, [1, 2, 3]), true);
  assert.equal(sameTop3(slots, [1, 3, 2]), false, "même animés, autre ordre : à enregistrer");
  assert.equal(sameTop3(slots, null), false);
  assert.equal(sameTop3([null, null, null], [1, 2, 3]), false);
  assert.deepEqual(slotsToPicks(clearPick(slots, 1)), null);
  assert.deepEqual(clearPick(slots, 7).map((s) => s.mal_id), [1, 2, 3], "place inexistante : rien ne change");
});

test("titre de la grille : nettoyé, limité, vide par défaut", () => {
  const g = defaultGrid(seqIds());
  assert.equal(g.title, "");
  assert.equal(setGridTitle(g, "  Mon   année \n 2026  ").title, "Mon année 2026");
  assert.equal(setGridTitle(g, "x".repeat(300)).title.length, MAX_TITLE_LENGTH);
  assert.equal(setGridTitle(g, null).title, "");
  assert.equal(g.title, "", "grille d'origine intacte");
  assert.equal(sanitizeGrid({ cells: [{ id: "a", key: "ost" }], title: "  Ma   grille " }, seqIds()).title, "Ma grille");
  assert.equal(sanitizeGrid({ cells: [{ id: "a", key: "ost" }], title: 42 }, seqIds()).title, "42");
  assert.equal(sanitizeGrid({ cells: [{ id: "a", key: "ost" }] }, seqIds()).title, "");
});

// ── Sauvegarde sur l'appareil ───────────────────────────────────────────────────────────────────────────────────────────────
test("sauvegarde locale de la grille : par pseudo, relue à l'identique, jamais d'erreur si le stockage est bloqué", () => {
  const store = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, keys: () => [...m.keys()] }; })();
  const ids = seqIds();
  let g = defaultGrid(ids);
  g = setCellAnime(g, g.cells[0].id, a26(5, { image_url: "a.jpg" }));
  g = setGridTitle(renameCell(g, g.cells[1].id, "Mon choix"), "Ma grille");
  writeGrid(store, "alice", g);
  assert.deepEqual(store.keys(), [gridKey("alice")]);
  assert.deepEqual(readGrid(store, "alice", ids), g);
  assert.equal(readGrid(store, "bob", ids).cells.every((c) => !c.anime), true, "un autre compte repart d'une grille vide");
  assert.notEqual(gridKey("alice"), gridKey("bob"));
  assert.equal(readGrid(store, "", ids).cells.length, 9);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readGrid(broken, "alice", ids).cells.length, 9);
  assert.doesNotThrow(() => writeGrid(broken, "alice", g));
  assert.equal(readGrid(undefined, "alice", ids).cells.length, 9);
});

test("sauvegarde locale du brouillon du top 3 : places + ce que le serveur a déjà reçu", () => {
  const store = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); } }; })();
  assert.deepEqual(readTop3Draft(store, "alice"), { slots: [null, null, null], savedIds: null });
  let slots = placePick(placePick(null, 0, a26(7)), 2, a26(9));
  writeTop3Draft(store, "alice", { slots, savedIds: null });
  const back = readTop3Draft(store, "alice");
  assert.deepEqual(back.slots.map((s) => s?.mal_id ?? null), [7, null, 9]);
  assert.equal(back.savedIds, null);
  slots = placePick(slots, 1, a26(8));
  writeTop3Draft(store, "alice", { slots, savedIds: [7, 8, 9] });
  const full = readTop3Draft(store, "alice");
  assert.deepEqual(full.savedIds, [7, 8, 9]);
  assert.equal(sameTop3(full.slots, full.savedIds), true);
  assert.notEqual(top3Key("alice"), top3Key("bob"));
  // contenu abîmé : brouillon vide, doublons écartés
  store.setItem(top3Key("eve"), "pas du json");
  assert.deepEqual(readTop3Draft(store, "eve"), { slots: [null, null, null], savedIds: null });
  store.setItem(top3Key("eve"), JSON.stringify({ slots: [a26(1), a26(1), a26(2)], savedIds: [1, 1, 2] }));
  const dup = readTop3Draft(store, "eve");
  assert.equal(new Set(dup.slots.filter(Boolean).map((s) => s.mal_id)).size, dup.slots.filter(Boolean).length, "jamais deux fois le même animé");
  assert.equal(dup.savedIds, null);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readTop3Draft(broken, "alice"), { slots: [null, null, null], savedIds: null });
  assert.doesNotThrow(() => writeTop3Draft(broken, "alice", { slots, savedIds: null }));
});

// ── 4. Bloc de fin d'année ──────────────────────────────────────────────────────────────────────────────────────────────
test("le bloc s'affiche jusqu'au 15 janvier 2027 inclus (heure locale), puis disparaît", () => {
  assert.deepEqual({ ...BANNER_LAST_DAY }, { year: 2027, month: 1, day: 15 });
  assert.equal(isBannerSeason(new Date(2026, 10, 26, 12, 0)), true, "26 nov. 2026");
  assert.equal(isBannerSeason(new Date(2026, 11, 25, 9, 0)), true, "Noël");
  assert.equal(isBannerSeason(new Date(2026, 11, 31, 23, 59)), true, "31 déc.");
  assert.equal(isBannerSeason(new Date(2027, 0, 1, 0, 0)), true, "1er janv.");
  assert.equal(isBannerSeason(new Date(2027, 0, 15, 23, 59, 59)), true, "dernier jour, fin de soirée");
  assert.equal(isBannerSeason(new Date(2027, 0, 16, 0, 0, 0)), false, "lendemain, minuit");
  assert.equal(isBannerSeason(new Date(2027, 5, 1)), false);
});

// Stockage de session factice (même interface que sessionStorage)
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

test("fermeture : mémorisée par pseudo ; un autre compte revoit le bloc", () => {
  const s = fakeStorage();
  assert.equal(isBannerDismissed(s, "alice"), false);
  dismissBanner(s, "alice");
  assert.equal(isBannerDismissed(s, "alice"), true, "rechargement de la page : toujours fermé");
  assert.equal(isBannerDismissed(s, "bob"), false);
  assert.equal(isBannerDismissed(s, null), false);
  dismissBanner(s, null);
  assert.equal(isBannerDismissed(s, undefined), true, "visiteur sans compte : clé commune");
  assert.notEqual(bannerKey("alice"), bannerKey("bob"));
});

test("déconnexion : efface les marques de fermeture (le bloc revient à la prochaine connexion) sans toucher au reste", () => {
  const s = fakeStorage({ autre_reglage: "1" });
  dismissBanner(s, "alice"); dismissBanner(s, "bob"); dismissBanner(s, null);
  resetBannerDismissals(s);
  assert.equal(isBannerDismissed(s, "alice"), false);
  assert.equal(isBannerDismissed(s, "bob"), false);
  assert.equal(isBannerDismissed(s, null), false);
  assert.deepEqual(s.dump(), { autre_reglage: "1" });
});

test("stockage indisponible (navigation privée, politique du navigateur) : jamais d'erreur", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); }, key() { throw new Error("blocked"); }, length: 1 };
  assert.equal(isBannerDismissed(broken, "alice"), false);
  assert.doesNotThrow(() => dismissBanner(broken, "alice"));
  assert.doesNotThrow(() => resetBannerDismissals(broken));
  assert.equal(isBannerDismissed(undefined, "alice"), false);
  assert.doesNotThrow(() => dismissBanner(undefined, "alice"));
  assert.doesNotThrow(() => resetBannerDismissals(undefined));
});

// ── 5. Textes (français / anglais) ──────────────────────────────────────────────────────────────────────────────────────
test("textes : le français et l'anglais ont exactement les mêmes clés, du même type, et rien de vide", () => {
  const fr = AWARDS_I18N.fr, en = AWARDS_I18N.en;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort(), "clés différentes entre FR et EN");
  for(const key of Object.keys(fr)) {
    assert.equal(typeof en[key], typeof fr[key], `type différent pour « ${key} »`);
    if(typeof fr[key] === "string") {
      assert.ok(fr[key].trim() && en[key].trim(), `texte vide : ${key}`);
    } else if(typeof fr[key] === "function") {
      for(const lang of [fr, en]) for(const args of [[0, 0, 0], [1, 1, 1], [2, 3, 4]]) {
        const out = lang[key](...args);
        assert.equal(typeof out, "string", `${key}() doit renvoyer du texte`);
        assert.ok(out.trim(), `${key}() renvoie un texte vide`);
        assert.ok(!/undefined|NaN|\[object/.test(out), `${key}(${args}) → « ${out} »`);
      }
    } else {
      assert.deepEqual(Object.keys(en[key]).sort(), Object.keys(fr[key]).sort(), `sous-clés différentes pour « ${key} »`);
    }
  }
});

test("textes : chaque case de grille par défaut a un nom dans les deux langues ; langue inconnue → français", () => {
  for(const lang of ["fr", "en"]) for(const key of DEFAULT_GRID_KEYS) assert.ok(AWARDS_I18N[lang].cellLabels[key], `${lang} : nom manquant pour la case « ${key} »`);
  assert.equal(AWARDS_I18N.fr.cellLabels.mc_m, "Meilleur MC homme");
  assert.equal(AWARDS_I18N.fr.cellLabels.mc_f, "Meilleur MC femme");
  assert.equal(AWARDS_I18N.fr.cellLabels.animation, "Meilleure animation");
  assert.equal(AWARDS_I18N.fr.cellLabels.ost, "Meilleure OST");
  assert.equal(awardsText("de"), AWARDS_I18N.fr);
  assert.equal(awardsText("en"), AWARDS_I18N.en);
});

test("textes : le bloc de fin d'année souhaite de bonnes fêtes et annonce la tierlist et la grille (FR et EN)", () => {
  assert.match(AWARDS_I18N.fr.bannerTitle, /bonnes fêtes/i);
  assert.match(AWARDS_I18N.fr.bannerBody, /tierlist/i);
  assert.match(AWARDS_I18N.fr.bannerBody, /grille/i);
  assert.match(AWARDS_I18N.en.bannerTitle, /happy holidays|happy new year|season/i);
  assert.match(AWARDS_I18N.en.bannerBody, /tier ?list/i);
  assert.match(AWARDS_I18N.en.bannerBody, /grid/i);
});

// ── 5. Export en image ────────────────────────────────────────────────────────────────────────────────────────────
test("export PNG : l'image est dessinée en thème sombre (en thème clair, html2canvas butait sur les couleurs oklch())", () => {
  const src = readFileSync(new URL("../src/utils/posterExport.js", import.meta.url), "utf8");
  const clone = /onclone\s*:\s*\(doc\)\s*=>\s*\{[\s\S]*?\n    \},/.exec(src);
  assert.ok(clone, "onclone introuvable dans renderToCanvas");
  assert.match(clone[0], /documentElement\.setAttribute\(\s*"data-theme"\s*,\s*"dark"\s*\)/, "le clone doit passer en thème sombre avant le dessin");
});

test("export PNG : le texte est dessiné à sa vraie place (le GIF de mesure de html2canvas reste « inline » malgré le CSS de base de Tailwind)", () => {
  // html2canvas mesure la ligne de base du texte avec un GIF 1×1 posé dans la vraie page ; en « display:block » (Tailwind) la mesure se trompe de
  // 5 à 7 px et tout le texte de l'image sortait trop bas (noms de cases de la grille coupés en deux).
  const src = readFileSync(new URL("../src/utils/posterExport.js", import.meta.url), "utf8");
  assert.match(MEASURE_IMG_FIX_CSS, /display:inline!important/);
  assert.match(src, /fixTextBaseline\(\);\s*\n\s*const imgs = /, "renderToCanvas doit poser la règle avant de dessiner");
  // La règle reconnaît le GIF par son adresse : si html2canvas change de GIF, ce test le dit au lieu de laisser le texte retomber trop bas.
  const h2c = new URL("../node_modules/html2canvas/dist/html2canvas.js", import.meta.url);
  if(existsSync(h2c)) {
    const probe = /SMALL_IMAGE\s*=\s*'([^']+)'/.exec(readFileSync(h2c, "utf8"));
    assert.ok(probe, "GIF de mesure introuvable dans html2canvas");
    const prefix = /img\[src\^="([^"]+)"\]/.exec(MEASURE_IMG_FIX_CSS)?.[1];
    assert.ok(prefix && probe[1].startsWith(prefix), "la règle ne reconnaît plus le GIF de mesure de html2canvas");
  }
});
