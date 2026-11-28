// Tests des stats en plus (appli de bureau) : obscurité du goût (échelle, libellés, tranches), santé de la watchlist (heures, coups rapides,
// marathons, durée pour tout voir), calendrier d'activité (jours, séries, jours de la semaine, grille, fuseau horaire), textes et branchement.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OBSCURITY_SCALE, OBSCURITY_LEVELS, OBSCURITY_MIN, obscurityScore, obscurityLevel, obscurityOf,
  QUICK_MAX_MIN, MARATHON_MIN, PACES, QUICK_LIMIT, MARATHON_LIMIT, watchlistHealth, formatSpan,
  ACTIVITY_WEEKS, levelOfCount, weekdayOf, dayLabel, activityStats,
} from "../src/utils/statsExtras.js";
import { readPages } from "../src/utils/pagedRead.js";
import { STATS_EXTRAS_I18N } from "../src/constants/statsExtrasI18n.js";

const root =path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readLF = (...p) => fs.readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");   // Windows : git peut écrire les fichiers en CRLF
const DAY = 86400000;
const dayNum = (y, m, d) => Date.UTC(y, m - 1, d) / DAY;                // numéro de jour d'une date du calendrier
const at = (y, m, d, h = 12, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min)).toISOString();
const TODAY = new Date(Date.UTC(2026, 10, 28, 12));                     // samedi 28 novembre 2026
const opts = { today: TODAY, offsetMin: 0 };

// ── Obscurité du goût ───────────────────────────────────────────────────────────────────────────────────────────────────────
test("obscurityScore : 0 au rang 30, 100 au rang 15 000, échelle logarithmique, bornée, sans donnée → null", () => {
  assert.equal(obscurityScore(OBSCURITY_SCALE.low), 0);
  assert.equal(obscurityScore(OBSCURITY_SCALE.high), 100);
  assert.equal(obscurityScore(1), 0); assert.equal(obscurityScore(5), 0);
  assert.equal(obscurityScore(40000), 100);
  assert.equal(obscurityScore(Math.sqrt(OBSCURITY_SCALE.low * OBSCURITY_SCALE.high)), 50, "le milieu (moyenne géométrique) donne 50");
  let last = -1;
  for (let r = 1; r <= 30000; r = Math.ceil(r * 1.3)) { const s = obscurityScore(r); assert.ok(s >= last && s >= 0 && s <= 100, `rang ${r}`); last = s; }
  for (const bad of [0, -3, null, undefined, "abc", NaN]) assert.equal(obscurityScore(bad), null, String(bad));
});

test("obscurityLevel : 5 libellés, seuils inclus", () => {
  const expected = [[0, 0], [24, 0], [25, 1], [44, 1], [45, 2], [61, 2], [62, 3], [77, 3], [78, 4], [100, 4]];
  for (const [score, level] of expected) assert.equal(obscurityLevel(score), level, `score ${score}`);
  assert.equal(obscurityLevel(null), null); assert.equal(obscurityLevel(undefined), null);
  assert.deepEqual(OBSCURITY_LEVELS, [25, 45, 62, 78]);
});

test("obscurityOf : médiane, tranches (bornes incluses), plus connus / plus confidentiels, données invalides ignorées", () => {
  const rows = [5, 80, 100, 101, 900, 1000, 1001, 4000, 5000, 5001, 9000].map((pop, i) => ({ id: i + 1, title: `A${i + 1}`, img: `i${i + 1}`, pop }));
  const out = obscurityOf(rows);
  assert.equal(out.n, 11); assert.equal(out.median, 1000, "11 valeurs : la 6e");
  assert.deepEqual(out.bands, [3, 3, 3, 2], "≤100 : 5, 80, 100 · ≤1000 : 101, 900, 1000 · ≤5000 : 1001, 4000, 5000 · au-delà : 5001, 9000");
  assert.equal(out.score, obscurityScore(1000)); assert.equal(out.level, obscurityLevel(out.score)); assert.equal(out.reliable, true);
  assert.deepEqual(out.mostPopular.map((x) => x.id), [1, 2, 3]);
  assert.deepEqual(out.mostObscure.map((x) => x.id), [11, 10, 9]);
  assert.equal(out.mostObscure[0].title, "A11"); assert.equal(out.mostObscure[0].img, "i11");
  // médiane d'un nombre pair d'animés : moyenne des deux du milieu, arrondie
  assert.equal(obscurityOf([{ id: 1, pop: 100 }, { id: 2, pop: 201 }]).median, 151);
  // égalités : par identifiant
  assert.deepEqual(obscurityOf([{ id: 9, pop: 50 }, { id: 3, pop: 50 }, { id: 5, pop: 50 }, { id: 1, pop: 50 }]).mostPopular.map((x) => x.id), [1, 3, 5]);
  assert.deepEqual(obscurityOf([{ id: 9, pop: 50 }, { id: 3, pop: 50 }, { id: 5, pop: 50 }, { id: 1, pop: 50 }]).mostObscure.map((x) => x.id), [9], "les 3 premiers sont « plus connus » : il ne reste que le 4e pour « plus confidentiel »");
  // jamais le même animé dans les deux listes, même avec très peu d'animés
  for (const k of [1, 2, 3, 4, 5, 6, 7, 20]) {
    const o = obscurityOf(Array.from({ length: k }, (_, i) => ({ id: i + 1, pop: 10 + i * 7 })));
    const popular = new Set(o.mostPopular.map((x) => x.id));
    assert.ok(o.mostObscure.every((x) => !popular.has(x.id)), `${k} animés`);
    assert.equal(o.mostPopular.length, Math.min(3, k), `${k} animés : plus connus`);
    assert.equal(o.mostObscure.length, Math.max(0, Math.min(3, k - 3)), `${k} animés : plus confidentiels`);
  }
  // rien d'exploitable
  for (const empty of [undefined, null, [], [{ id: 1, pop: 0 }, { id: 2, pop: null }, { id: 3, pop: "abc" }, { id: 4, pop: -9 }, null]]) {
    const o = obscurityOf(empty);
    assert.deepEqual([o.n, o.median, o.score, o.level, o.reliable], [0, null, null, null, false]);
    assert.deepEqual(o.bands, [0, 0, 0, 0]); assert.deepEqual(o.mostPopular, []); assert.deepEqual(o.mostObscure, []);
  }
  assert.equal(obscurityOf([{ id: 1, pop: "250" }]).median, 250, "un rang écrit en texte est accepté");
});

test("obscurityOf : « indicatif » sous 5 animés, entrée jamais modifiée, tranches = nombre d'animés", () => {
  const few = Array.from({ length: OBSCURITY_MIN - 1 }, (_, i) => ({ id: i + 1, pop: 100 * (i + 1) }));
  assert.equal(obscurityOf(few).reliable, false);
  assert.equal(obscurityOf([...few, { id: 99, pop: 500 }]).reliable, true);
  const copy = JSON.stringify(few); obscurityOf(few); assert.equal(JSON.stringify(few), copy);
  const big = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, pop: 1 + ((i * 37) % 12000) }));
  const o = obscurityOf(big);
  assert.equal(o.bands.reduce((a, b) => a + b, 0), 300);
  assert.ok(o.mostPopular.length === 3 && o.mostObscure.length === 3);
  assert.ok(o.mostPopular.every((x) => x.pop <= o.median) && o.mostObscure.every((x) => x.pop >= o.median));
});

// ── Santé de la watchlist ───────────────────────────────────────────────────────────────────────────────────────────────────
const W = (id, o = {}) => ({ mal_id: id, title: `T${id}`, title_en: `Title ${id}`, image_url: `img${id}`, type: "TV", episodes: 12, duration: "24 min per ep", score: 7, ...o });

test("watchlistHealth : heures totales (films, séries, durée inconnue), séries en cours comptées à part", () => {
  const rows = [
    W(1),                                                                  // 12 × 24 = 288 min
    W(2, { type: "Movie", episodes: 1, duration: "1 hr 50 min" }),         // 110 min
    W(3, { episodes: 26, duration: undefined }),                           // 26 × 24 (durée par défaut) = 624 min
    W(4, { episodes: null }),                                              // en cours : inconnu
    W(5, { type: "Movie", episodes: null, duration: undefined }),          // film sans durée : 100 min par défaut
  ];
  const h = watchlistHealth(rows);
  assert.equal(h.count, 5); assert.equal(h.knownCount, 4); assert.equal(h.unknownCount, 1);
  assert.equal(h.minutes, 288 + 110 + 624 + 100);
  assert.deepEqual(h.clear, [{ perDay: 0.5, days: Math.ceil(1122 / 60 / 0.5) }, { perDay: 1, days: Math.ceil(1122 / 60) }, { perDay: 2, days: Math.ceil(1122 / 60 / 2) }]);
  assert.deepEqual(PACES, [0.5, 1, 2]);
});

test("watchlistHealth : coups rapides (≤ 5 h, meilleure note d'abord, 6 au plus) et marathons (≥ 25 h, du plus long, 4 au plus)", () => {
  const rows = [
    ...Array.from({ length: 9 }, (_, i) => W(10 + i, { episodes: 12, score: 6 + (i % 4) })),         // 288 min : 9 coups rapides
    W(30, { episodes: 13, duration: "23 min per ep" }),                                               // 299 min : encore rapide
    W(31, { episodes: 14, duration: "22 min per ep", score: 9.5 }),                                   // 308 min : trop long
    ...[100, 200, 300, 400, 500].map((eps, i) => W(40 + i, { episodes: eps })),                      // 2 400 à 12 000 min : marathons
    W(50, { episodes: 62 }),                                                                          // 1 488 min : juste sous le seuil
  ];
  const h = watchlistHealth(rows);
  assert.equal(h.quickCount, 10); assert.equal(h.quick.length, QUICK_LIMIT);
  assert.ok(h.quick.every((x) => x.minutes <= QUICK_MAX_MIN));
  assert.ok(h.quick.every((x, i) => i === 0 || h.quick[i - 1].score >= x.score), "meilleure note d'abord");
  assert.ok(!h.quick.some((x) => x.id === 31), "308 min : trop long");
  assert.equal(h.marathonCount, 5); assert.equal(h.marathons.length, MARATHON_LIMIT);
  assert.deepEqual(h.marathons.map((x) => x.id), [44, 43, 42, 41], "du plus long au plus court");
  assert.ok(h.marathons.every((x) => x.minutes >= MARATHON_MIN));
  assert.ok(!h.marathons.some((x) => x.id === 50), "1 488 min : sous le seuil");
  assert.deepEqual(h.quick[0], { id: h.quick[0].id, title: `T${h.quick[0].id}`, img: `img${h.quick[0].id}`, type: "TV", episodes: h.quick[0].episodes, minutes: h.quick[0].minutes, score: 9 });
  assert.equal(QUICK_MAX_MIN, 300); assert.equal(MARATHON_MIN, 1500);
});

test("watchlistHealth : égalités départagées de façon stable, titres de repli, liste vide ou lignes absentes sans plantage", () => {
  const h = watchlistHealth([W(7), W(3), W(5)]);
  assert.deepEqual(h.quick.map((x) => x.id), [3, 5, 7], "même note, même durée : par identifiant");
  const t = watchlistHealth([{ mal_id: 8, title: "Romaji", type: "Movie", episodes: 1 }, { mal_id: 9 }]);
  assert.equal(t.count, 2); assert.equal(t.quick[0].title, "Romaji"); assert.equal(t.knownCount, 1);
  assert.equal(watchlistHealth([{ mal_id: 6, title_en: "English only", type: "Movie", episodes: 1 }]).quick[0].title, "English only", "sans nom principal : le nom anglais");
  assert.equal(watchlistHealth([{ mal_id: 6, title: "Romaji", title_en: "English", type: "Movie", episodes: 1 }]).quick[0].title, "Romaji", "le même nom que partout ailleurs dans l'appli");
  assert.equal(watchlistHealth([{ mal_id: 9 }]).count, 1);
  for (const none of [undefined, null, [], [null, undefined]]) {
    const e = watchlistHealth(none);
    assert.deepEqual([e.count, e.knownCount, e.unknownCount, e.minutes, e.quickCount, e.marathonCount], [0, 0, 0, 0, 0, 0]);
    assert.deepEqual(e.clear.map((c) => c.days), [0, 0, 0]);
  }
  assert.deepEqual(watchlistHealth([W(1)], { paces: [3] }).clear, [{ perDay: 3, days: Math.ceil(288 / 60 / 3) }]);
});

test("formatSpan : jours, mois, années en français et en anglais", () => {
  assert.equal(formatSpan(0), "0 j"); assert.equal(formatSpan(45), "45 j"); assert.equal(formatSpan(59), "59 j");
  assert.equal(formatSpan(60), "2 mois"); assert.equal(formatSpan(400), "13 mois"); assert.equal(formatSpan(700), "23 mois");
  assert.equal(formatSpan(730), "2 ans"); assert.equal(formatSpan(800), "2 ans 2 mois"); assert.equal(formatSpan(1500), "4 ans 1 mois");
  assert.equal(formatSpan(45, "en"), "45 d"); assert.equal(formatSpan(400, "en"), "13 mo"); assert.equal(formatSpan(730, "en"), "2 y"); assert.equal(formatSpan(800, "en"), "2 y 2 mo");
  for (const bad of [-5, NaN, null, undefined, "x"]) assert.equal(formatSpan(bad), "0 j", String(bad));
});

// ── Calendrier d'activité ───────────────────────────────────────────────────────────────────────────────────────────────────
test("weekdayOf, levelOfCount, dayLabel", () => {
  assert.equal(weekdayOf(0), 3, "1er janvier 1970 : un jeudi");
  assert.equal(weekdayOf(dayNum(2026, 11, 23)), 0, "lundi 23 novembre 2026");
  assert.equal(weekdayOf(dayNum(2026, 11, 28)), 5, "samedi"); assert.equal(weekdayOf(dayNum(2026, 11, 29)), 6, "dimanche");
  assert.equal(weekdayOf(-1), 2, "mercredi 31 décembre 1969 (jours négatifs corrects)");
  assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 50].map(levelOfCount), [0, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(levelOfCount(-2), 0);
  const fr = dayLabel(dayNum(2026, 11, 28), "fr"), en = dayLabel(dayNum(2026, 11, 28), "en");
  assert.match(fr, /28/); assert.match(fr, /2026/); assert.match(en, /28/); assert.match(en, /2026/); assert.notEqual(fr, en);
});

test("activityStats : rien du tout → des zéros et une grille vide de 53 semaines", () => {
  for (const none of [undefined, null, [], ["garbage", null, NaN, undefined]]) {
    const a = activityStats(none, opts);
    assert.deepEqual([a.total, a.activeDays, a.current, a.longest, a.best, a.inGrid], [0, 0, 0, 0, null, 0]);
    assert.deepEqual(a.weekdays, [0, 0, 0, 0, 0, 0, 0]);
    assert.equal(a.cols.length, ACTIVITY_WEEKS); assert.ok(a.cols.every((c) => c.length === 7));
    assert.ok(a.cols.flat().every((cell) => cell.count === 0 && cell.level === 0));
  }
});

test("activityStats : série en cours (finit aujourd'hui ou hier), plus longue série, jours actifs, meilleur jour", () => {
  const times = [at(2026, 11, 28, 9), at(2026, 11, 28, 20), at(2026, 11, 27), at(2026, 11, 26), at(2026, 11, 20), at(2026, 11, 19),
    at(2026, 3, 1), at(2026, 3, 2), at(2026, 3, 3), at(2026, 3, 4), at(2026, 3, 5)];
  const a = activityStats(times, opts);
  assert.equal(a.total, 11); assert.equal(a.activeDays, 10);
  assert.equal(a.current, 3, "28, 27, 26 novembre"); assert.equal(a.longest, 5, "du 1er au 5 mars");
  assert.deepEqual(a.best, { day: dayNum(2026, 11, 28), count: 2 });
  // la journée n'est pas finie : sans note aujourd'hui, la série d'hier reste en vie
  assert.equal(activityStats([at(2026, 11, 27), at(2026, 11, 26), at(2026, 11, 25)], opts).current, 3);
  // …mais avant-hier, elle est perdue
  assert.equal(activityStats([at(2026, 11, 26), at(2026, 11, 25)], opts).current, 0);
  assert.equal(activityStats([at(2026, 11, 26), at(2026, 11, 25)], opts).longest, 2);
  // un jour tout seul
  const one = activityStats([at(2026, 11, 28)], opts); assert.deepEqual([one.current, one.longest, one.activeDays], [1, 1, 1]);
  // un trou d'un jour coupe la série
  assert.equal(activityStats([at(2026, 11, 28), at(2026, 11, 26), at(2026, 11, 25)], opts).current, 1);
  // égalité pour le meilleur jour : le plus récent
  assert.equal(activityStats([at(2026, 11, 20), at(2026, 11, 20), at(2026, 11, 22), at(2026, 11, 22), at(2026, 11, 23)], opts).best.day, dayNum(2026, 11, 22));
});

test("activityStats : jours de la semaine (lundi en premier), formats de dates acceptés, dates invalides ignorées", () => {
  const times = [at(2026, 11, 28), at(2026, 11, 21), at(2026, 11, 23), at(2026, 11, 29, 3)];       // sam, sam, lun, dim
  const a = activityStats(times, opts);
  assert.deepEqual(a.weekdays, [1, 0, 0, 0, 0, 2, 1]);
  const mixed = activityStats([at(2026, 11, 27), new Date(Date.UTC(2026, 10, 26, 8)), Date.UTC(2026, 10, 25, 8), "pas une date", "", null, undefined, NaN, {}], opts);
  assert.equal(mixed.total, 3); assert.equal(mixed.current, 3);
});

test("activityStats : le fuseau horaire décide du jour (23 h 30 UTC = le lendemain à Paris, la veille à New York)", () => {
  const t = [at(2026, 11, 27, 23, 30)];
  const day = (offsetMin) => activityStats(t, { today: TODAY, offsetMin }).best.day;
  assert.equal(day(0), dayNum(2026, 11, 27));
  assert.equal(day(60), dayNum(2026, 11, 28), "UTC+1");
  assert.equal(day(-300), dayNum(2026, 11, 27), "UTC−5 : 18 h 30, même jour");
  assert.equal(activityStats([at(2026, 11, 28, 2)], { today: TODAY, offsetMin: -300 }).best.day, dayNum(2026, 11, 27), "UTC−5 : 21 h la veille");
  // sans offsetMin : le fuseau de l'ordinateur, quel qu'il soit — deux notes à 23 h 30 et 0 h 30 (heure locale) tombent sur 2 jours différents
  const local = activityStats([new Date(2026, 10, 27, 23, 30), new Date(2026, 10, 28, 0, 30)], { today: new Date(2026, 10, 28, 12) });
  assert.equal(local.activeDays, 2); assert.equal(local.current, 2);
});

test("activityStats : la grille — 53 colonnes du lundi au dimanche, aujourd'hui dans la dernière, le futur marqué, jours consécutifs", () => {
  const a = activityStats([at(2026, 11, 28), at(2026, 11, 28), at(2026, 11, 28), at(2026, 11, 20), at(2026, 11, 29), at(2024, 1, 1)], opts);
  assert.equal(a.cols.length, 53);
  assert.equal(weekdayOf(a.cols[0][0].day), 0, "la grille commence un lundi");
  const flat = a.cols.flat();
  flat.forEach((cell, i) => assert.equal(cell.day, a.firstDay + i, `jour ${i}`));
  const today = a.cols[52][5];
  assert.equal(today.day, dayNum(2026, 11, 28)); assert.equal(today.count, 3); assert.equal(today.level, 2); assert.equal(today.future, false);
  assert.equal(a.cols[52][6].future, true, "dimanche : pas encore arrivé");
  assert.equal(a.cols[52][6].count, 1, "…mais une note datée de demain est gardée dans sa case");
  assert.equal(flat.filter((c) => c.future).length, 1);
  assert.equal(a.total, 6); assert.equal(a.inGrid, 4, "la note de 2024 et celle de demain ne comptent pas dans l'année affichée");
  assert.equal(a.current, 1, "demain ne rallonge pas la série");
  assert.equal(activityStats([], { ...opts, weeks: 4 }).cols.length, 4);
  assert.equal(activityStats([], { ...opts, weeks: 0 }).cols.length, 1, "au moins une semaine");
});

test("activityStats : étiquettes de mois posées sur la colonne du 1er du mois, jamais dans le futur", () => {
  const a = activityStats([], opts);
  const firsts = a.cols.flatMap((col, w) => col.filter((c) => !c.future && new Date(c.day * DAY).getUTCDate() === 1).map(() => w));
  assert.deepEqual(a.months.map((m) => m.col), firsts);
  assert.deepEqual(a.months.map((m) => m.month), [11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "décembre 2025 … novembre 2026");
  assert.ok(a.months.every((m, i) => i === 0 || m.col > a.months[i - 1].col));
  const early = activityStats([], { today: new Date(Date.UTC(2026, 10, 2, 12)), offsetMin: 0 });
  assert.equal(early.months.at(-1).month, 10, "le 1er novembre est déjà passé");
});

// ── Branchement ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("le module est pur : aucune requête, aucun écran", () => {
  const src = readLF("src", "utils", "statsExtras.js");
  assert.ok(!/from "\.\.\/api\//.test(src) && !/from "react/.test(src) && !/\bfetch\(/.test(src));
  assert.deepEqual([...src.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]).sort(), [
    "ACTIVITY_WEEKS", "MARATHON_LIMIT", "MARATHON_MIN", "OBSCURITY_BANDS", "OBSCURITY_LEVELS", "OBSCURITY_MIN", "OBSCURITY_SCALE", "PACES", "QUICK_LIMIT", "QUICK_MAX_MIN",
    "activityStats", "dayLabel", "formatSpan", "levelOfCount", "obscurityLevel", "obscurityOf", "obscurityScore", "watchlistHealth", "weekdayOf",
  ].sort());
});

// ── Lecture par pages ───────────────────────────────────────────────────────────────────────────────────────────────────────
test("readPages : pages successives jusqu'à une page incomplète, plafond de pages, échec en cours de route, réponse inattendue", async () => {
  const data = Array.from({ length: 2500 }, (_, i) => ({ i }));
  const calls = [];
  const all = await readPages(async (offset) => { calls.push(offset); return data.slice(offset, offset + 1000); }, { pageSize: 1000, maxPages: 3 });
  assert.deepEqual(calls, [0, 1000, 2000]); assert.equal(all.items.length, 2500); assert.deepEqual([all.failed, all.truncated], [false, false]);
  assert.deepEqual(all.items.map((r) => r.i), data.map((r) => r.i), "dans l'ordre");
  // une seule page incomplète : une seule requête
  let once = 0;
  const short = await readPages(async () => { once++; return [{ i: 1 }, { i: 2 }]; });
  assert.equal(once, 1); assert.equal(short.items.length, 2);
  // plus de lignes que le plafond : on s'arrête à 3 pages et on le dit
  let n3 = 0;
  const capped = await readPages(async (o) => { n3++; return Array.from({ length: 1000 }, (_, i) => ({ i: o + i })); }, { pageSize: 1000, maxPages: 3 });
  assert.equal(n3, 3); assert.equal(capped.items.length, 3000); assert.deepEqual([capped.failed, capped.truncated], [false, true]);
  // une page qui échoue : on garde ce qui est déjà lu, sans rejeter
  let k = 0;
  const flaky = await readPages(async () => { if (k++ === 1) throw new Error("boom"); return Array(1000).fill({ i: 0 }); }, { pageSize: 1000, maxPages: 3 });
  assert.equal(flaky.items.length, 1000); assert.deepEqual([flaky.failed, flaky.truncated], [true, false]);
  const dead = await readPages(async () => { throw new Error("réseau"); });
  assert.deepEqual(dead, { items: [], failed: true, truncated: false });
  // réponse qui n'est pas une liste (ou vide) : traitée comme « rien »
  for (const weird of [null, undefined, {}, "x", []]) assert.deepEqual(await readPages(async () => weird), { items: [], failed: false, truncated: false }, String(weird));
  // tailles de page personnalisées
  const small = await readPages(async (o) => (o < 4 ? [{ o }, { o: o + 1 }] : []), { pageSize: 2, maxPages: 10 });
  assert.deepEqual(small.items.map((r) => r.o), [0, 1, 2, 3]); assert.equal(small.truncated, false);
});

// ── Textes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("textes : mêmes clés en français et en anglais, mêmes formes, fonctions qui renvoient du texte, pluriels", () => {
  const { fr, en } = STATS_EXTRAS_I18N;
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  const lengths = { obscLevels: 5, obscSentences: 5, obscBands: 4, obscEnds: 2, actWeekdays: 7, actWeekdaysFull: 7, actMonths: 12 };
  for (const k of Object.keys(fr)) {
    assert.equal(typeof fr[k], typeof en[k], k);
    if (Array.isArray(fr[k])) {
      assert.equal(fr[k].length, en[k].length, k);
      if (lengths[k]) assert.equal(fr[k].length, lengths[k], k);
      assert.ok([...fr[k], ...en[k]].every((s) => typeof s === "string" && s.trim()), k);
    } else if (typeof fr[k] === "function") {
      for (const lang of [fr, en]) for (const n of [0, 1, 2, 1234]) { const s = lang[k](n, 2); assert.ok(typeof s === "string" && s.trim() && !/undefined|NaN|\[object/.test(s), `${k}(${n}) → ${s}`); }
    } else assert.ok(typeof fr[k] === "string" && fr[k].trim() && en[k].trim(), k);
  }
  assert.match(fr.actDays(1), /^1 jour$/); assert.match(fr.actDays(2), /^2 jours$/); assert.match(en.actDays(1), /^1 day$/); assert.match(en.actDays(2), /^2 days$/);
  assert.match(fr.actCell("1 janv. 2026", 0), /aucune note/); assert.match(en.actCell("Jan 1, 2026", 0), /no ratings/);
  assert.match(fr.actCell("x", 1), /1 note$/); assert.match(fr.actCell("x", 3), /3 notes$/); assert.match(en.actCell("x", 1), /1 rating$/); assert.match(en.actCell("x", 3), /3 ratings$/);
  assert.match(fr.wlUnknown(1), /1 animé sans durée connue n'est pas compté /); assert.match(fr.wlUnknown(3), /3 animés sans durée connue ne sont pas comptés /);
  assert.match(en.wlUnknown(1), /isn't/); assert.match(en.wlUnknown(3), /aren't/);
  assert.equal(fr.wlPace(0.5), "à 0,5 h par jour"); assert.equal(en.wlPace(0.5), "at 0.5 h a day"); assert.equal(fr.wlPace(2), "à 2 h par jour");
  assert.equal(fr.obscScore(63), "63/100"); assert.match(fr.obscMedian(1234), /n° 1\s?234/); assert.match(en.obscMedian(1234), /#1,234/);
  assert.match(fr.obscCount(1), /^1 animé pris en compte$/); assert.match(fr.obscCount(2), /^2 animés pris en compte$/); assert.equal(en.obscCount(5), "5 anime counted");
  assert.match(fr.actFavoriteDay("samedi"), /samedi/); assert.match(en.actFavoriteDay("Saturday"), /Saturdays?\./);
});

// ── Branchement ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("branchement : les 3 cartes ne sont montrées que dans l'appli de bureau, le profil lit les rangs de popularité et transmet le pseudo", () => {
  const desk = readLF("src", "views", "ProfileStatsDesktop.jsx");
  assert.match(desk, /import \{ ActivityCard, ObscurityCard, WatchlistCard \} from "\.\/ProfileStatsExtras\.jsx";/);
  assert.match(desk, /import \{ isDesktopApp \} from "\.\.\/utils\/streamingLinks\.js";/);
  assert.match(desk, /const desktop = isDesktopApp\(\);/);
  assert.match(desk, /export function ProfileStatsDesktop\(\{[^}]*\busername\b[^}]*\}\)/);
  for (const card of ["<ActivityCard username={username} />", "<ObscurityCard rows={D.popRows} onOpenDetail={onOpenDetail} />", "<WatchlistCard statuses={statuses} onOpenDetail={onOpenDetail} />"]) {
    const line = desk.split("\n").find((l) => l.includes(card));
    assert.ok(line && /^\s*\{desktop && /.test(line), `${card} : seulement dans l'appli de bureau`);
  }
  assert.equal((desk.match(/<(Activity|Obscurity|Watchlist)Card /g) || []).length, 3, "une seule fois chacune");
  assert.ok(desk.indexOf("<ActivityCard") > desk.indexOf("Formats regardés"), "après « Ta liste / Formats regardés »");
  assert.ok(desk.indexOf("<WatchlistCard") < desk.indexOf("5 — Genres"), "avant les genres");

  const view = readLF("src", "views", "ProfileView.jsx");
  assert.match(view, /select=mal_id,type,title,title_en,image_url,score,duration,genres,studios,characters,staff,episodes,year,popularity&limit=/);
  assert.match(view, /const popRows = \[\];/);
  assert.match(view, /if\(a\.popularity > 0\) popRows\.push\(\{ id:a\.mal_id, title:a\.title\|\|a\.title_en, img:a\.image_url, pop:a\.popularity, type:a\.type, score:a\.score \}\);/);
  assert.ok(view.indexOf("popRows.push") < view.indexOf('if(a.type && a.type !== "TV") return;'), "tous les formats comptent (films, OAV…), pas seulement les séries TV");
  assert.match(view, /setStatsData\(\{[^}]*\bpopRows\b[^}]*\}\);/);
  assert.match(view, /<ProfileStatsDesktop [^>]*\busername=\{myUsername\}/);
});

test("lecture des dates de notes : colonne voted_at, plus récentes d'abord, pages de 1 000, 3 pages au plus, jamais d'erreur", () => {
  const src = readLF("src", "api", "voteActivity.js");
  assert.match(src, /export const PAGE_SIZE = 1000;/); assert.match(src, /export const MAX_PAGES = 3;/);
  assert.ok(src.includes("user_votes?username=eq.${encodeURIComponent(username)}&voted_at=not.is.null&select=voted_at&order=voted_at.desc&limit=${PAGE_SIZE}&offset=${offset}"));
  assert.match(src, /readPages\(/); assert.match(src, /if \(!username\) return \{ times: \[\], failed: false, truncated: false \};/);
  const pr = readLF("src", "utils", "pagedRead.js");
  assert.ok(!/from "react/.test(pr) && !/from "\.\.\/api\//.test(pr) && !/\bfetch\(/.test(pr), "pur");
});

test("cartes : pas de fenêtre fixe, affiches ouvrables avec la carte de survol, états vide / chargement / échec, lectures annulables", () => {
  const src = readLF("src", "views", "ProfileStatsExtras.jsx");
  assert.ok(!/position:\s*"fixed"/.test(src), "aucune fenêtre qui flotte sur la barre de titre");
  assert.match(src, /\{\.\.\.quickProps\(it\.id\)\}/); assert.match(src, /onClick=\{\(\) => onOpen\?\.\(seedOf\(it\)\)\}/);
  for (const marker of ['data-extras="obscurity"', 'data-extras="watchlist"', 'data-extras="activity"', "data-extras-empty", "data-extras-failed", "data-activity-cell", "data-obscurity-marker"]) assert.ok(src.includes(marker), marker);
  assert.equal((src.match(/let cancelled = false;/g) || []).length, 2, "les deux lectures sont annulées quand la carte disparaît");
  assert.equal((src.match(/return \(\) => \{ cancelled = true; \};/g) || []).length, 2);
  const setters = [...src.matchAll(/\bset(?:Loaded|State)\(/g)];
  assert.equal(setters.length, 2);
  for (const s of setters) assert.ok(/\.then\(/.test(src.slice(Math.max(0, s.index - 140), s.index)), "setState dans le .then d'une lecture, jamais dans le corps de l'effet");
  const exported = [...src.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(exported, ["ActivityCard", "ObscurityCard", "WatchlistCard"], "que des composants exportés (rafraîchissement à chaud)");
});
