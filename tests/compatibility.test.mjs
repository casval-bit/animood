// Tests de la compatibilité entre membres (appli de bureau) : normalisation des profils, score (symétrie, monotonie, confiance, données manquantes),
// goûts communs (genres, époques, studios), listes d'idées (aimés ensemble, désaccords, « à voir de sa part », watchlist commune, coups de cœur),
// choix des fiches à charger, textes FR/EN et branchement (bouton et panneau réservés à l'appli de bureau, jamais sur son propre profil).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WEIGHTS, LIMITS, LOVED, BIG_GAP, MIN_META, CONFIDENCE_AT,
  levelOf, memberData, buildLists, idsToLoad, sampleLibrary, computeCompatibility,
} from "../src/utils/compatibility.js";
import { COMPAT_I18N } from "../src/constants/compatI18n.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readLF = (...p) => fs.readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");   // Windows : git peut écrire les fichiers en CRLF

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** Profil « de l'appli » : ratings { id: { score, moods } }, statuses { id: statut }… */
const P = ({ watched = [], ratings = {}, statuses = {}, favorites = [], highlights = [] } = {}) => ({
  watched, statuses, favorites, highlights,
  ratings: Object.fromEntries(Object.entries(ratings).map(([id, score]) => [id, { score, moods: [] }])),
});
const GENRES = ["Action", "Drama", "Comedy", "Romance", "Fantasy", "Sci-Fi", "Horror", "Sports"];
const metaFor = (ids, genreOf = (id) => [GENRES[id % 5], GENRES[(id + 1) % 5]], year = (id) => 2000 + (id % 20)) =>
  Object.fromEntries(ids.map((id) => [id, { mal_id: id, genres: genreOf(id).map((name) => ({ name })), studios: [{ name: `Studio ${id % 3}` }], year: year(id) }]));
const run = (A, B, meta = {}) => computeCompatibility(memberData(A), memberData(B), meta);

// générateur pseudo-aléatoire reproductible
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

// ── Les données d'un membre ─────────────────────────────────────────────────────────────
test("memberData : ids en nombres, notes invalides ignorées, une note compte comme « vu », watchlist hors des vus, coups de cœur sans doublon", () => {
  const m = memberData({
    watched: [1, "2", 2, 0, -3, null, 4.5],
    ratings: { 3: { score: 9 }, "x": { score: 8 }, 5: { score: 0 }, 6: { score: 11 }, 7: { score: "7" }, 8: null },
    statuses: { 1: "watchlist", 9: "watchlist", 10: "completed", abc: "watchlist" },
    highlights: [11, 12, 13, 14, 15, 16, 17], favorites: [12, null, 18, 0],
  });
  assert.deepEqual(m.order, [1, 2]);
  assert.deepEqual(m.ratings, { 3: 9, 7: 7 });
  assert.deepEqual([...m.seen].sort((a, b) => a - b), [1, 2, 3, 7]);
  assert.deepEqual(m.watchlist, [9], "un animé déjà vu n'est pas « à voir »");
  assert.deepEqual(m.top, [11, 12, 13, 14, 15, 18], "5 premiers highlights, puis favoris, sans doublon");
});

test("memberData : un profil absent ou vide ne lance pas d'erreur", () => {
  for (const p of [null, undefined, {}, { watched: null, ratings: null, statuses: null, highlights: null, favorites: null }]) {
    const m = memberData(p);
    assert.equal(m.seen.size, 0); assert.deepEqual(m.top, []); assert.deepEqual(m.watchlist, []); assert.deepEqual(m.ratings, {});
  }
});

test("levelOf : seuils 25 / 45 / 65 / 80, null sans score", () => {
  assert.deepEqual([0, 24, 25, 44, 45, 64, 65, 79, 80, 100].map(levelOf), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(levelOf(null), null);
});

// ── Le score ──────────────────────────────────────────────────────────────────────────────
const ids40 = range(1, 40);
const profile40 = () => P({ watched: ids40, ratings: Object.fromEntries(ids40.map((id) => [id, 5 + (id % 6)])), favorites: [1, 2, 3, null, null] });

test("deux profils identiques : score très haut, « âmes sœurs », tous les ingrédients présents", () => {
  const r = run(profile40(), profile40(), metaFor(ids40));
  assert.ok(r.score >= 95, `score ${r.score}`);
  assert.equal(r.level, 4);
  assert.equal(r.parts.library, 1);
  assert.equal(r.parts.genres, 1);
  assert.equal(r.parts.favorites, 1);
  assert.ok(r.parts.ratings > 0.9);
  assert.equal(r.basis.commonRated, 40); assert.equal(r.basis.commonSeen, 40); assert.equal(r.basis.reliable, true);
  assert.equal(r.basis.avgGap, 0); assert.equal(r.basis.close, 1);
});

test("aucun animé en commun, genres différents : score très bas, « univers opposés »", () => {
  const A = P({ watched: range(1, 30), ratings: Object.fromEntries(range(1, 30).map((id) => [id, 8])) });
  const B = P({ watched: range(101, 130), ratings: Object.fromEntries(range(101, 130).map((id) => [id, 8])) });
  const meta = { ...metaFor(range(1, 30), () => ["Action"]), ...metaFor(range(101, 130), () => ["Romance"]) };
  const r = run(A, B, meta);
  assert.ok(r.score <= 10, `score ${r.score}`);
  assert.equal(r.level, 0);
  assert.equal(r.parts.ratings, null, "aucune note en commun : l'ingrédient est ignoré");
  assert.equal(r.parts.library, 0); assert.equal(r.parts.genres, 0);
});

test("symétrie : compatibilité(A, B) = compatibilité(B, A), et les listes d'idées changent simplement de sens", () => {
  const rnd = lcg(42);
  const make = () => {
    const ids = range(1, 120).filter(() => rnd() < 0.5);
    return P({
      watched: ids, ratings: Object.fromEntries(ids.filter(() => rnd() < 0.7).map((id) => [id, 1 + Math.floor(rnd() * 10)])),
      statuses: Object.fromEntries(range(121, 140).filter(() => rnd() < 0.4).map((id) => [id, "watchlist"])),
      highlights: ids.filter(() => rnd() < 0.08).slice(0, 5),
    });
  };
  const meta = metaFor(range(1, 140));
  for (let i = 0; i < 12; i++) {
    const A = make(), B = make();
    const ab = run(A, B, meta), ba = run(B, A, meta);
    assert.equal(ab.score, ba.score);
    assert.deepEqual(ab.parts, ba.parts);
    assert.deepEqual(ab.genres.map((g) => g.name), ba.genres.map((g) => g.name));
    assert.deepEqual(ab.lists.theyLoved.map((x) => x.id), ba.lists.iLoved.map((x) => x.id));
    assert.deepEqual(ab.lists.watchlist.map((x) => x.id), ba.lists.watchlist.map((x) => x.id));
    assert.deepEqual(ab.lists.lovedTogether.map((x) => x.id), ba.lists.lovedTogether.map((x) => x.id));
    assert.ok(ab.score == null || (Number.isInteger(ab.score) && ab.score >= 0 && ab.score <= 100));
  }
});

test("plus les notes s'écartent, plus le score baisse", () => {
  const ids = range(1, 20);
  const A = P({ watched: ids, ratings: Object.fromEntries(ids.map((id) => [id, 8])) });
  const scores = [0, 1, 2, 3, 4].map((d) => run(A, P({ watched: ids, ratings: Object.fromEntries(ids.map((id) => [id, 8 - d])) }), metaFor(ids)).score);
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i] < scores[i - 1], `écart ${i} : ${scores}`);
});

test("un noteur sévère qui classe comme l'autre reste compatible (écart relatif), bien plus qu'un classement au hasard", () => {
  const ids = range(1, 24);
  const base = Object.fromEntries(ids.map((id) => [id, 3 + (id % 8)]));          // 3 à 10
  const A = P({ watched: ids, ratings: base });
  const harsh = P({ watched: ids, ratings: Object.fromEntries(ids.map((id) => [id, Math.max(1, base[id] - 2)])) });
  const rnd = lcg(7);
  const random = P({ watched: ids, ratings: Object.fromEntries(ids.map((id) => [id, 1 + Math.floor(rnd() * 10)])) });
  const harshRatings = run(A, harsh).parts.ratings, randomRatings = run(A, random).parts.ratings;
  assert.ok(harshRatings > 0.65, `sévère : ${harshRatings}`);
  assert.ok(harshRatings > randomRatings + 0.15, `sévère ${harshRatings} contre hasard ${randomRatings}`);
});

test("peu d'animés en commun : le score est tiré vers 50 et signalé comme indicatif", () => {
  const A = P({ watched: [1, 2, 3, 4, 5], ratings: { 1: 8, 2: 8, 3: 8 } });
  const B = P({ watched: [1, 2, 3, 50, 51], ratings: { 1: 8, 2: 8, 3: 8 } });
  const small = run(A, B, metaFor([1, 2, 3, 4, 5, 50, 51]));
  assert.ok(small.score > 45 && small.score < 65, `score ${small.score}`);
  assert.equal(small.basis.reliable, false);
  assert.ok(small.confidence < 0.5);
  const big = run(profile40(), profile40(), metaFor(ids40));
  assert.equal(big.confidence, 1);
  assert.ok(big.score > small.score + 30);
  assert.equal(CONFIDENCE_AT, 25);
});

test("sans fiches d'animés : pas d'ingrédient « genres », le score existe quand même et les poids sont renormalisés", () => {
  const withMeta = run(profile40(), profile40(), metaFor(ids40));
  const noMeta = run(profile40(), profile40());
  assert.equal(noMeta.parts.genres, null);
  assert.deepEqual(noMeta.genres, []); assert.deepEqual(noMeta.decades, []); assert.deepEqual(noMeta.studios, []);
  assert.ok(noMeta.score >= 95);
  assert.ok(Math.abs(withMeta.score - noMeta.score) <= 3);
  // trop peu de fiches par membre : on n'invente pas de goûts
  const few = run(profile40(), profile40(), metaFor(range(1, MIN_META - 1)));
  assert.equal(few.parts.genres, null);
});

test("pas de score sans de quoi comparer (moins de deux ingrédients)", () => {
  assert.equal(run(P(), P()).score, null);
  assert.equal(run(P(), P()).level, null);
  const full = profile40();
  assert.equal(run(full, P()).score, null, "l'autre membre n'a rien : seul l'ingrédient « coups de cœur » existerait");
  assert.equal(run(P({ watched: [1] }), P({ watched: [1] })).score, null);
  assert.equal(run(null, undefined).score, null);
});

test("les poids valent 100 % et les notes pèsent le plus", () => {
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(WEIGHTS.ratings > WEIGHTS.genres && WEIGHTS.genres > WEIGHTS.library && WEIGHTS.library > WEIGHTS.favorites);
});

test("coups de cœur : exacts = 1, aimés par l'autre sans être en tête = presque, vus sans note = peu, jamais vus = 0 ; dans les deux sens", () => {
  const ids = range(1, 12);
  const mk = (extra) => P({ watched: ids, ...extra });
  const same = run(mk({ highlights: [1, 2, 3] }), mk({ highlights: [1, 2, 3] }));
  assert.equal(same.parts.favorites, 1);
  const loved = run(mk({ highlights: [1, 2, 3] }), mk({ ratings: { 1: 9, 2: 8, 3: 8 } }));      // lui n'a pas de coup de cœur : un seul sens compte
  assert.equal(loved.parts.favorites, 1);
  const lukewarm = run(mk({ highlights: [1, 2] }), mk({ ratings: { 1: 7, 2: 5 } }));
  assert.ok(Math.abs(lukewarm.parts.favorites - (0.6 + 0.25) / 2) < 1e-9);
  const unseen = run(mk({ highlights: [50] }), mk({}));
  assert.equal(unseen.parts.favorites, 0);
  const seenUnrated = run(mk({ highlights: [1] }), mk({}));
  assert.ok(Math.abs(seenUnrated.parts.favorites - 0.3) < 1e-9);
  assert.equal(run(mk({}), mk({})).parts.favorites, null, "personne n'a de coup de cœur : ingrédient ignoré");
});

// ── Goûts communs ────────────────────────────────────────────────────────────────────────
test("genres, époques et studios en commun : triés par part commune, seuils respectés", () => {
  const idsA = range(1, 20), idsB = range(101, 120);                      // bibliothèques sans aucun animé en commun
  const meta = {
    ...Object.fromEntries(idsA.map((id) => [id, { genres: [{ name: "Action" }, { name: "Drama" }], studios: [{ name: "MAPPA" }, { name: "Bones" }], year: 2012 }])),
    ...Object.fromEntries(idsB.map((id) => [id, { genres: [{ name: "Action" }, { name: "Comedy" }], studios: [{ name: "MAPPA" }, { name: "Trigger" }], year: id % 2 ? 2015 : 1998 }])),
  };
  const r = run(P({ watched: idsA }), P({ watched: idsB }), meta);
  assert.deepEqual(r.genres.map((g) => g.name), ["Action"], "Drama et Comedy ne sont pas partagés");
  assert.ok(Math.abs(r.genres[0].mine - 0.5) < 1e-9 && Math.abs(r.genres[0].theirs - 0.5) < 1e-9);
  assert.deepEqual(r.decades.map((d) => d.decade), [2010], "1990 : 50 % chez lui, 0 % chez moi, pas en commun");
  assert.deepEqual(r.studios.map((s) => s.name), ["MAPPA"]);
  assert.ok(r.genres.length <= 5 && r.studios.length <= 3 && r.decades.length <= 2);
  // même résultat dans l'autre sens
  const back = run(P({ watched: idsB }), P({ watched: idsA }), meta);
  assert.deepEqual(back.genres.map((g) => g.name), ["Action"]);
  assert.deepEqual(back.decades.map((d) => d.decade), [2010]);
});

test("les profils de genres suivent les notes : un animé adoré pèse plus qu'un animé noté 3", () => {
  const ids = range(1, 12);
  const meta = Object.fromEntries(ids.map((id) => [id, { genres: [{ name: id <= 6 ? "Action" : "Romance" }], year: 2020 }]));
  const A = P({ watched: ids, ratings: Object.fromEntries(ids.map((id) => [id, id <= 6 ? 10 : 3])) });     // adore l'action, déteste la romance
  const B = P({ watched: ids, ratings: Object.fromEntries(ids.map((id) => [id, id <= 6 ? 3 : 10])) });     // l'inverse
  const same = run(A, A, meta).parts.genres, opposite = run(A, B, meta).parts.genres;
  assert.equal(same, 1);
  assert.ok(opposite < same - 0.3, `${opposite} contre ${same}`);
});

// ── Listes d'idées ────────────────────────────────────────────────────────────────────────
const listsFixture = () => {
  const A = P({
    watched: [1, 2, 3, 4, 5, 6, 7], ratings: { 1: 9, 2: 9, 3: 4, 4: 8, 5: 10 }, highlights: [1],
    statuses: { 9: "watchlist", 20: "watchlist", 21: "watchlist", 1: "watchlist" },
  });
  const B = P({
    watched: [1, 2, 3, 4, 8, 9, 10], ratings: { 1: 10, 2: 9, 3: 9, 4: 3, 8: 9, 9: 10, 10: 7 }, favorites: [1, null, null, null, null],
    statuses: { 5: "watchlist", 20: "watchlist", 30: "watchlist" },
  });
  return { a: memberData(A), b: memberData(B) };
};

test("listes : aimés tous les deux, désaccords, à voir de sa part (et inversement), watchlist et coups de cœur communs", () => {
  const { a, b } = listsFixture();
  const l = buildLists(a, b);
  assert.deepEqual(l.favorites.map((x) => x.id), [1]);
  assert.deepEqual(l.lovedTogether.map((x) => x.id), [2], "les coups de cœur communs ont leur propre étagère, pas de doublon");
  assert.deepEqual(l.lovedTogether[0], { id: 2, mine: 9, theirs: 9 });
  assert.deepEqual(l.gaps.map((x) => x.id), [3, 4], "écart ≥ 3, du plus grand au plus petit, puis par id");
  assert.deepEqual(l.gaps[0], { id: 3, mine: 4, theirs: 9 });
  assert.deepEqual(l.theyLoved.map((x) => x.id), [9, 8], "adorés par lui, que je n'ai pas vus : sa meilleure note d'abord");
  assert.equal(l.theyLoved[0].onMyWatchlist, true);
  assert.equal(l.theyLoved[1].onMyWatchlist, false);
  assert.deepEqual(l.iLoved.map((x) => x.id), [5], "6 et 7 ne sont pas notés : pas « adorés »");
  assert.equal(l.iLoved[0].onTheirWatchlist, true);
  assert.deepEqual(l.watchlist.map((x) => x.id), [20]);
  assert.equal(LOVED, 8); assert.equal(BIG_GAP, 3);
});

test("listes : un coup de cœur non noté compte comme adoré (9), un statut « à voir » sur un animé déjà vu est ignoré", () => {
  const A = memberData(P({ watched: [1, 2, 3], highlights: [3], statuses: { 1: "watchlist" } }));
  const B = memberData(P({ watched: [10, 11], highlights: [10] }));
  const l = buildLists(A, B);
  assert.deepEqual(l.theyLoved.map((x) => x.id), [10]);
  assert.deepEqual(l.iLoved.map((x) => x.id), [3]);
  assert.equal(l.theyLoved[0].theirs, 9);
  assert.deepEqual(A.watchlist, []);
});

test("listes : limites respectées et ordre stable (les ids les plus récents d'abord pour la watchlist)", () => {
  const ids = range(1, 60);
  const A = memberData(P({ watched: ids, ratings: Object.fromEntries(ids.map((id) => [id, 9])), statuses: Object.fromEntries(range(100, 130).map((id) => [id, "watchlist"])) }));
  const B = memberData(P({ watched: ids, ratings: Object.fromEntries(ids.map((id) => [id, 9])), statuses: Object.fromEntries(range(100, 130).map((id) => [id, "watchlist"])) }));
  const l = buildLists(A, B);
  assert.equal(l.lovedTogether.length, LIMITS.lovedTogether);
  assert.equal(l.watchlist.length, LIMITS.watchlist);
  assert.deepEqual(l.watchlist.map((x) => x.id), range(123, 130).reverse());
  assert.deepEqual(buildLists(A, B), l, "deux appels : même résultat");
});

// ── Fiches à charger ────────────────────────────────────────────────────────────────────
test("idsToLoad : ce qu'on affiche d'abord, puis un échantillon borné par membre (notés du mieux noté au moins bien, puis les plus récents)", () => {
  const ids = range(1, 300);
  const rated = Object.fromEntries(range(1, 50).map((id) => [id, 1 + (id % 10)]));
  const A = memberData(P({ watched: ids, ratings: rated }));
  const B = memberData(P({ watched: range(1, 10), ratings: { 1: 9 } }));
  const out = idsToLoad(A, B, { perUser: 100 });
  assert.equal(new Set(out).size, out.length, "sans doublon");
  const shown = Object.values(buildLists(A, B)).flat().map((x) => x.id);
  for (const id of shown) assert.ok(out.includes(id), `affiché ${id}`);
  const mineSample = out.filter((id) => !shown.includes(id));
  assert.ok(out.length <= 100 + 10 + shown.length, `taille ${out.length}`);
  for (const id of range(1, 50).filter((x) => rated[x] === 10)) assert.ok(out.includes(id), `noté 10 : ${id}`);
  assert.ok(out.includes(300), "le plus récent est pris");
  assert.ok(!out.includes(150), "au milieu, ni noté ni récent : laissé de côté");
  assert.ok(mineSample.length > 0);
  assert.deepEqual(idsToLoad(memberData(P()), memberData(P())), []);
});

test("sampleLibrary : les mieux notés d'abord (à note égale, le plus petit identifiant), puis les ajouts récents non notés, borné", () => {
  const m = memberData(P({ watched: [10, 20, 30, 40, 50, 60], ratings: { 10: 7, 20: 9, 30: 9, 40: 3 } }));
  assert.deepEqual(sampleLibrary(m), [20, 30, 10, 40, 60, 50], "notés (9, 9, 7, 3) puis non notés du plus récent au plus ancien");
  assert.deepEqual(sampleLibrary(m, 3), [20, 30, 10]);
  assert.deepEqual(sampleLibrary(m, 0), []);
  assert.deepEqual(sampleLibrary(memberData(P())), []);
  const big = memberData(P({ watched: range(1, 400), ratings: Object.fromEntries(range(1, 200).map((id) => [id, 1 + (id % 10)])) }));
  assert.equal(sampleLibrary(big).length, 220, "220 par membre par défaut");
  assert.equal(sampleLibrary(big, 500).length, 150 + 200, "150 notés au plus, puis les récents non notés (200 restants)");
  const loaded = idsToLoad(big, memberData(P()));
  assert.ok(sampleLibrary(big).every((id) => loaded.includes(id)), "idsToLoad s'appuie sur le même échantillon");
});

// ── Textes ───────────────────────────────────────────────────────────────────────────────
test("textes FR / EN : mêmes clés, mêmes types, 5 niveaux, fonctions qui rendent du texte", () => {
  const fr = COMPAT_I18N.fr, en = COMPAT_I18N.en;
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  for (const k of Object.keys(fr)) {
    assert.equal(typeof fr[k], typeof en[k], k);
    if (Array.isArray(fr[k])) assert.equal(fr[k].length, en[k].length, k);
  }
  assert.equal(fr.levels.length, 5); assert.equal(en.levels.length, 5);
  const samples = { basis: [2, 3], closeNotes: [0.5, 2.5] };                  // les autres fonctions prennent un nom de membre
  for (const lang of [fr, en]) {
    for (const [k, v] of Object.entries(lang)) {
      const out = typeof v === "function" ? v(...(samples[k] || ["bob"])) : v;
      const flat = Array.isArray(out) ? out.join(" ") : String(out);
      assert.ok(flat.length > 0 && !/undefined|NaN|\[object/.test(flat), `${k} → ${flat}`);
    }
  }
  assert.match(fr.title("bob"), /@bob/); assert.match(en.title("bob"), /@bob/);
  assert.match(fr.basis(1, 3), /1 animé noté en commun/); assert.match(fr.basis(2, 1), /2 animés notés en commun · 1 vu en commun/);
  assert.match(fr.closeNotes(0.72, 1.2, "fr"), /72 % · écart moyen 1,2 pt/); assert.match(en.closeNotes(0.72, 1.2, "en"), /72% · average gap 1\.2 pt/);
});

// ── Branchement ───────────────────────────────────────────────────────────────────────────
test("profil d'un membre : bouton et panneau seulement dans l'appli de bureau, jamais sur son propre profil, jamais si le profil est privé", () => {
  const src = readLF("src", "views", "UserProfileModal.jsx");
  assert.match(src, /const desktop = isDesktopApp\(\)/);
  assert.match(src, /\{desktop && canView && \(\s*<button[\s\S]{0,300}?data-compat-toggle/, "le bouton exige l'appli de bureau et un profil visible");
  assert.match(src, /\{desktop && !isOwnProfile && showCompat && \(\s*<CompatibilityPanel/, "le panneau exige l'appli de bureau, un autre membre, et l'ouverture");
  // le bouton est dans le bloc « pas bloqué » avec Suivre / Message
  const header = src.slice(src.indexOf("{!isBlocked && ("), src.indexOf("data-compat-toggle"));
  assert.ok(header.includes("t.messageBtn"), "bouton rangé sous « Message »");
  // le panneau est dans la partie réservée aux profils visibles (après le blocage « privé »)
  assert.ok(src.indexOf("<CompatibilityPanel") > src.indexOf("t.privateProfileTitle"));
});

test("le panneau : un seul export (composant), pas de couche flottante, fiches lues par lots dans anime_cache sans jamais rejeter", () => {
  const panel = readLF("src", "components", "CompatibilityPanel.jsx");
  assert.deepEqual([...panel.matchAll(/^export (?:default )?(?:function|const|class) (\w+)/gm)].map((m) => m[1]), ["CompatibilityPanel"]);
  assert.ok(!/position:\s*["']?fixed/.test(panel), "pas d'overlay : le garde-fou des zones de déplacement ne le concerne pas");
  assert.match(panel, /data-compat-panel/);
  const meta = readLF("src", "api", "animeMeta.js");
  assert.match(meta, /anime_cache\?mal_id=in\.\(/);
  assert.match(meta, /const CHUNK = 100/);
  assert.match(meta, /catch \{ failed = true; \}/, "une erreur réseau n'interrompt pas l'affichage");
});

test("styles : la jauge s'anime sur le bureau seulement et respecte « réduire les animations »", () => {
  const css = readLF("src", "index.css");
  assert.match(css, /html\[data-app="desktop"\] \.compat-gauge-arc \{ animation: compat-fill/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*html\[data-app="desktop"\] \.compat-gauge-arc \{ animation: none; \}/);
});
