// Tests de la carte de survol des affiches (appli de bureau) : changements du profil (vu, highlight, watchlist, statut, note, listes),
// minutage du survol (arrêt, passage d'une affiche à l'autre, délai de grâce), position de la carte, faits sur un animé, requête user_votes,
// et branchement (marqueurs data-quick-anime absents du site web, hôte monté uniquement dans l'appli de bureau).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATUS_CHOICES, hasWatched, isOnWatchlist, isHighlighted, scoreOf, statusOf, listsContaining,
  withWatchedToggled, withWatchlistToggled, withHighlightToggled, withStatus, withRating, withListToggled,
  STAR_COUNT, scoreForStar, starFills, placeCard, quickProps,
} from "../src/utils/quickActions.js";
import { createHoverIntent } from "../src/utils/hoverIntent.js";
import {
  episodeMinutes, totalMinutes, genreNames, studioNames, yearOf, decadeOf, popularityRank, posterOf, formatHours,
} from "../src/utils/animeFacts.js";
import { userScoreRequest } from "../src/utils/userVoteRequest.js";
import { QUICK_CARD_I18N } from "../src/constants/quickCardI18n.js";
import { STATUS_COLORS, STATUS_LABELS } from "../src/constants/statuses.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readLF = (...p) => fs.readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");   // Windows : git peut écrire les fichiers en CRLF

const base = () => ({ watched: [1], statuses: { 1: "completed", 2: "watchlist" }, ratings: { 1: { score: 8, moods: ["epic"] } }, favorites: [null, null, null, null, null], highlights: [], customLists: [{ id: "a", name: "Cosy", animeIds: [1] }, { id: "b", name: "Epic", animeIds: [] }] });
const frozen = (o) => JSON.parse(JSON.stringify(o));

// ── Changements du profil ──────────────────────────────────────────────────────────────────────────────────────────────────────
test("vu : on ajoute / on retire, sans toucher au reste ni à l'ancien profil", () => {
  const me = base(), before = frozen(me);
  const on = withWatchedToggled(me, 5);
  assert.deepEqual(on.watched, [1, 5]);
  assert.equal(hasWatched(on, 5), true);
  assert.deepEqual(withWatchedToggled(on, 5).watched, [1]);
  assert.deepEqual(on.statuses, me.statuses);
  assert.deepEqual(me, before, "l'ancien profil n'est jamais modifié");
});

test("watchlist : le marque-page pose / retire le statut « watchlist » sans toucher à « vu »", () => {
  const me = base();
  const on = withWatchlistToggled(me, 5);
  assert.equal(on.statuses[5], "watchlist");
  assert.equal(isOnWatchlist(on, 5), true);
  assert.deepEqual(on.watched, [1]);
  const off = withWatchlistToggled(on, 5);
  assert.equal(5 in off.statuses, false);
  assert.equal(off.statuses[1], "completed");
  assert.equal(isOnWatchlist(withWatchlistToggled(me, 2), 2), false, "l'animé 2 était déjà en watchlist : on l'enlève");
});

test("highlight : les 5 premiers coups de cœur remplissent les favoris du profil, dans l'ordre", () => {
  let me = base();
  for (const id of [11, 12, 13, 14, 15, 16, 17]) me = withHighlightToggled(me, id);
  assert.deepEqual(me.highlights, [11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(me.favorites, [11, 12, 13, 14, 15]);
  me = withHighlightToggled(me, 12);                                    // on retire le 2e : le 6e prend sa place dans la vitrine
  assert.deepEqual(me.highlights, [11, 13, 14, 15, 16, 17]);
  assert.deepEqual(me.favorites, [11, 13, 14, 15, 16]);
  assert.equal(isHighlighted(me, 12), false);
  assert.equal(isHighlighted(me, 11), true);
  const none = withHighlightToggled(withHighlightToggled(base(), 3), 3);
  assert.deepEqual(none.favorites, [null, null, null, null, null]);
});

test("statut : choisir pose le statut ; le re-choisir l'enlève ; tout statut sauf « à voir » compte comme vu", () => {
  const me = base();
  const watching = withStatus(me, 7, "watching");
  assert.equal(watching.statuses[7], "watching");
  assert.ok(watching.watched.includes(7), "en cours = déjà commencé : compté comme vu (comme à l'import MAL)");
  const plan = withStatus(me, 8, "watchlist");
  assert.equal(plan.statuses[8], "watchlist");
  assert.equal(plan.watched.includes(8), false, "« à voir » ne marque pas comme vu");
  const cleared = withStatus(watching, 7, "watching");
  assert.equal(7 in cleared.statuses, false);
  assert.ok(cleared.watched.includes(7), "retirer le statut ne démarque pas « vu »");
  assert.equal(7 in withStatus(watching, 7, null).statuses, false);
  assert.equal(withStatus(me, 1, "dropped").statuses[1], "dropped");
  assert.deepEqual(STATUS_CHOICES.slice().sort(), Object.keys(STATUS_COLORS).sort(), "chaque statut proposé a une couleur");
  for (const lang of ["fr", "en"]) for (const s of STATUS_CHOICES) assert.ok(STATUS_LABELS[lang][s], `${lang}/${s}`);
});

test("statut affiché : celui du profil ; un animé vu sans statut compte comme « complété » ; sinon aucun", () => {
  const me = { watched: [1, 2], statuses: { 2: "dropped" } };
  assert.equal(statusOf(me, 1), "completed");
  assert.equal(statusOf(me, 2), "dropped");
  assert.equal(statusOf(me, 3), null);
});

test("note : enregistrée avec les humeurs déjà choisies, l'animé passe en « vu » ; 0 retire la note", () => {
  const me = base();
  const rated = withRating(me, 9, 7);
  assert.deepEqual(rated.ratings[9], { score: 7, moods: [] });
  assert.ok(rated.watched.includes(9));
  assert.equal(scoreOf(rated, 9), 7);
  const rerated = withRating(me, 1, 9);
  assert.deepEqual(rerated.ratings[1], { score: 9, moods: ["epic"] }, "les humeurs du profil sont conservées");
  assert.deepEqual(withRating(me, 1, 6, ["cozy"]).ratings[1], { score: 6, moods: ["cozy"] }, "des humeurs explicites remplacent les anciennes");
  const cleared = withRating(rated, 9, 0);
  assert.equal(9 in cleared.ratings, false);
  assert.ok(cleared.watched.includes(9), "retirer la note ne démarque pas « vu »");
  assert.equal(scoreOf(cleared, 9), null);
  assert.deepEqual(me, frozen(base()));
});

test("listes : l'animé entre dans la liste choisie et en sort, les autres listes ne bougent pas", () => {
  const me = base();
  const added = withListToggled(me, "b", 1);
  assert.deepEqual(added.customLists.map((l) => l.animeIds), [[1], [1]]);
  assert.deepEqual(listsContaining(added, 1), ["a", "b"]);
  const removed = withListToggled(added, "a", 1);
  assert.deepEqual(removed.customLists.map((l) => l.animeIds), [[], [1]]);
  assert.deepEqual(withListToggled(me, "inconnue", 1).customLists, me.customLists);
  assert.deepEqual(withListToggled({ customLists: [{ id: "x", name: "Sans ids" }] }, "x", 4).customLists[0].animeIds, [4]);
});

test("un profil incomplet (anciens comptes) ne fait planter aucune action", () => {
  const bare = {};
  assert.deepEqual(withWatchedToggled(bare, 1).watched, [1]);
  assert.deepEqual(withWatchlistToggled(bare, 1).statuses, { 1: "watchlist" });
  assert.deepEqual(withHighlightToggled(bare, 1).favorites, [1, null, null, null, null]);
  assert.equal(withStatus(bare, 1, "dropped").statuses[1], "dropped");
  assert.equal(withRating(bare, 1, 5).ratings[1].score, 5);
  assert.deepEqual(withListToggled(bare, "a", 1), { customLists: [] });
  assert.equal(statusOf(null, 1), null);
  assert.equal(scoreOf(undefined, 1), null);
  assert.deepEqual(listsContaining(bare, 1), []);
});

// ── Étoiles ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("étoiles : cinq étoiles, chacune en deux moitiés = une note de 1 à 10", () => {
  assert.equal(STAR_COUNT, 5);
  const scores = [];
  for (let star = 1; star <= STAR_COUNT; star++) scores.push(scoreForStar(star, true), scoreForStar(star, false));
  assert.deepEqual(scores, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(starFills(0), [0, 0, 0, 0, 0]);
  assert.deepEqual(starFills(null), [0, 0, 0, 0, 0]);
  assert.deepEqual(starFills(1), [0.5, 0, 0, 0, 0]);
  assert.deepEqual(starFills(7), [1, 1, 1, 0.5, 0]);
  assert.deepEqual(starFills(10), [1, 1, 1, 1, 1]);
  assert.deepEqual(starFills(7.6), [1, 1, 1, 1, 0], "une note décimale (MAL) est arrondie");
});

// ── Minutage du survol ────────────────────────────────────────────────────────────────────────────────────────────────────────
function fakeClock() {
  let now = 0, next = 1;
  const queue = new Map();
  return {
    timers: { set: (fn, ms) => { const id = next++; queue.set(id, { at: now + ms, fn }); return id; }, clear: (id) => { queue.delete(id); } },
    tick(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]); now = due[1].at; due[1].fn();
      }
      now = target;
    },
    pending: () => queue.size,
  };
}
function harness(opts = {}) {
  const clock = fakeClock(), log = [];
  const intent = createHoverIntent({ onShow: (t) => log.push(`show:${t}`), onHide: () => log.push("hide"), timers: clock.timers, ...opts });
  return { clock, log, intent };
}

test("survol : la carte s'ouvre après un temps d'arrêt, pas en traversant l'affiche", () => {
  const { clock, log, intent } = harness();
  intent.overTarget("A");
  clock.tick(379);
  assert.deepEqual(log, []);
  clock.tick(1);
  assert.deepEqual(log, ["show:A"]);
  assert.equal(intent.isOpen(), true);
  assert.equal(intent.current(), "A");
  // passage rapide : le pointeur quitte l'affiche avant la fin du délai
  const b = harness();
  b.intent.overTarget("A"); b.clock.tick(200); b.intent.leave(); b.clock.tick(1000);
  assert.deepEqual(b.log, []);
  assert.equal(b.clock.pending(), 0);
});

test("survol : rester sur la même affiche n'ouvre qu'une fois, et ne relance pas le délai", () => {
  const { clock, log, intent } = harness();
  intent.overTarget("A"); clock.tick(300);
  intent.overTarget("A"); clock.tick(79);                              // 379 ms au total : pas encore
  assert.deepEqual(log, []);
  clock.tick(1);                                                       // 380 ms depuis la première entrée : le délai n'a pas été relancé
  assert.deepEqual(log, ["show:A"]);
  intent.overTarget("A"); clock.tick(5000);
  assert.deepEqual(log, ["show:A"]);
});

test("survol : d'une affiche à l'autre, la carte change vite (120 ms) sans se fermer entre les deux", () => {
  const { clock, log, intent } = harness();
  intent.overTarget("A"); clock.tick(380);
  intent.leave(); intent.overTarget("B");                              // le navigateur envoie « sortie de A » puis « entrée sur B »
  clock.tick(119);
  assert.deepEqual(log, ["show:A"]);
  clock.tick(1);
  assert.deepEqual(log, ["show:A", "show:B"]);
  clock.tick(5000);
  assert.deepEqual(log, ["show:A", "show:B"], "jamais de fermeture entre les deux");
});

test("survol : quitter l'affiche ferme après 180 ms ; rejoindre la carte ou revenir sur l'affiche annule la fermeture", () => {
  const a = harness();
  a.intent.overTarget("A"); a.clock.tick(380);
  a.intent.leave(); a.clock.tick(179);
  assert.equal(a.intent.isOpen(), true);
  a.clock.tick(1);
  assert.deepEqual(a.log, ["show:A", "hide"]);
  assert.equal(a.intent.isOpen(), false);

  const b = harness();                                                 // affiche → carte (interstice de quelques pixels)
  b.intent.overTarget("A"); b.clock.tick(380);
  b.intent.leave(); b.clock.tick(100); b.intent.overCard(); b.clock.tick(5000);
  assert.deepEqual(b.log, ["show:A"]);
  b.intent.leave(); b.clock.tick(180);                                 // puis on quitte la carte
  assert.deepEqual(b.log, ["show:A", "hide"]);

  const c = harness();                                                 // carte → retour sur l'affiche
  c.intent.overTarget("A"); c.clock.tick(380);
  c.intent.overCard(); c.intent.leave(); c.clock.tick(100); c.intent.overTarget("A"); c.clock.tick(5000);
  assert.deepEqual(c.log, ["show:A"]);
  assert.equal(c.clock.pending(), 0);
});

test("survol : fermeture immédiate (défilement, clic, Échap) et arrêt définitif", () => {
  const { clock, log, intent } = harness();
  intent.overTarget("A"); clock.tick(380);
  intent.hideNow();
  assert.deepEqual(log, ["show:A", "hide"]);
  intent.hideNow();                                                    // déjà fermée : rien de plus
  assert.deepEqual(log, ["show:A", "hide"]);
  intent.overTarget("B"); clock.tick(100); intent.hideNow(); clock.tick(5000);   // en attente d'ouverture : annulée
  assert.deepEqual(log, ["show:A", "hide"]);
  intent.overTarget("C"); clock.tick(380); intent.leave();
  intent.dispose(); clock.tick(5000);
  assert.deepEqual(log, ["show:A", "hide", "show:C"], "plus aucun appel après dispose");
  assert.equal(clock.pending(), 0);
});

test("survol : ouvrir une nouvelle affiche pendant qu'une autre attend ne garde que la dernière", () => {
  const { clock, log, intent } = harness();
  intent.overTarget("A"); clock.tick(200);
  intent.overTarget("B"); clock.tick(379);
  assert.deepEqual(log, []);
  clock.tick(1);
  assert.deepEqual(log, ["show:B"]);
});

test("survol : les délais se règlent", () => {
  const { clock, log, intent } = harness({ dwell: 50, switchDelay: 10, hideDelay: 20 });
  intent.overTarget("A"); clock.tick(50);
  intent.leave(); clock.tick(20);
  assert.deepEqual(log, ["show:A", "hide"]);
});

// ── Position de la carte ──────────────────────────────────────────────────────────────────────────────────────────────────────
const VIEW = { w: 1280, h: 800 };
const SIZE = { w: 372, h: 300 };
const rect = (left, top, w = 160, h = 240) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });

test("position : à droite de l'affiche quand la place le permet, sinon à gauche, sinon par-dessus", () => {
  const right = placeCard(rect(100, 200), SIZE, VIEW);
  assert.deepEqual([right.side, right.x, right.y], ["right", 270, 200]);
  const left = placeCard(rect(1000, 200), SIZE, VIEW);
  assert.equal(left.side, "left");
  assert.equal(left.x, 1000 - 10 - SIZE.w);
  const narrow = placeCard(rect(60, 450), SIZE, { w: 500, h: 800 });
  assert.equal(narrow.side, "over");
  assert.ok(narrow.x >= 12 && narrow.x + SIZE.w <= 500 - 12, "entièrement visible en largeur");
  assert.equal(narrow.y, 450 - 10 - SIZE.h, "au-dessus de l'affiche quand il y a la place");
});

test("position : jamais sous l'en-tête (92 px) ni hors de la fenêtre, en bas comme en haut", () => {
  assert.equal(placeCard(rect(100, 20), SIZE, VIEW).y, 92);
  const low = placeCard(rect(100, 700), SIZE, VIEW);
  assert.equal(low.y, VIEW.h - SIZE.h - 12);
  const tiny = placeCard(rect(100, 300), { w: 372, h: 900 }, { w: 1280, h: 600 });
  assert.equal(tiny.y, 92, "carte plus haute que la fenêtre : on la cale sous l'en-tête");
  const flat = placeCard(rect(30, 100, 160, 240), SIZE, { w: 400, h: 800 });
  assert.equal(flat.side, "over");
  assert.ok(flat.y >= 92);
  const under = placeCard(rect(30, 120, 160, 240), SIZE, { w: 400, h: 800 });
  assert.equal(under.y, 120 + 240 + 10, "pas la place au-dessus : en dessous de l'affiche");
});

// ── Faits sur un animé ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test("durée : « 24 min per ep », « 1 hr 50 min », durée absente ou absurde", () => {
  assert.equal(episodeMinutes({ duration: "24 min per ep" }), 24);
  assert.equal(episodeMinutes({ duration: "1 hr 50 min" }), 110);
  assert.equal(episodeMinutes({ duration: "2 hr" }), 120);
  assert.equal(episodeMinutes({ duration: "Unknown" }), null);
  assert.equal(episodeMinutes({ duration: "0 min" }), null);
  assert.equal(episodeMinutes({ duration: "9 hr" }), null, "au-delà de 400 min : donnée aberrante");
  assert.equal(episodeMinutes(null), null);
  assert.equal(totalMinutes({ type: "TV", episodes: 12, duration: "24 min per ep" }), 288);
  assert.equal(totalMinutes({ type: "TV", episodes: 12 }), 12 * 24, "durée inconnue : 24 min par épisode");
  assert.equal(totalMinutes({ type: "Movie", episodes: 1 }), 100, "film sans durée : 100 min");
  assert.equal(totalMinutes({ type: "Movie", episodes: 12, duration: "1 hr 30 min" }), 90, "un film compte pour un épisode");
  assert.equal(totalMinutes({ type: "TV", episodes: null }), 0, "série en cours : on ne devine pas");
  assert.equal(totalMinutes(undefined), 0);
});

test("faits : genres, studios, année, décennie, popularité et affiche, quelle que soit la forme des données", () => {
  const raw = { genres: [{ name: "Action" }, { name: "Drame" }], studios: [{ name: "MAPPA" }], year: 2023, popularity: 120, large_image: "L", image_url: "S" };
  const jikan = { genres: ["Action"], studios: [], aired: { prop: { from: { year: 1999 } } }, images: { jpg: { image_url: "S2", large_image_url: "L2" } } };
  assert.deepEqual(genreNames(raw), ["Action", "Drame"]);
  assert.deepEqual(genreNames(jikan), ["Action"]);
  assert.deepEqual(studioNames(raw), ["MAPPA"]);
  assert.deepEqual(studioNames(jikan), []);
  assert.deepEqual(genreNames(null), []);
  assert.equal(yearOf(raw), 2023);
  assert.equal(yearOf(jikan), 1999);
  assert.equal(yearOf({ year: 0 }), null);
  assert.equal(yearOf({ year: 3000 }), null);
  assert.equal(decadeOf(2023), 2020);
  assert.equal(decadeOf(1999), 1990);
  assert.equal(decadeOf(null), null);
  assert.equal(popularityRank(raw), 120);
  assert.equal(popularityRank({ popularity: 0 }), null);
  assert.equal(posterOf(raw), "L");
  assert.equal(posterOf(jikan), "L2");
  assert.equal(posterOf({}), null);
});

test("heures : « 311 h » jusqu'à 48 h, puis « 13 j 7 h »", () => {
  assert.equal(formatHours(0), "—");
  assert.equal(formatHours(90), "2 h");
  assert.equal(formatHours(60 * 47), "47 h");
  assert.equal(formatHours(60 * 48), "2 j 0 h");
  assert.equal(formatHours(60 * 319), "13 j 7 h");
  assert.equal(formatHours(60 * 319, "en"), "13d 7h");
});

// ── Note dans user_votes ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test("user_votes : la note s'enregistre comme dans la fiche (fusion, humeurs conservées, points d'humeur jamais touchés) ; la retirer met score à null", () => {
  const now = new Date("2026-11-28T12:00:00Z");
  const set = userScoreRequest("brice", 42, 8, ["epic"], now);
  assert.equal(set.path, "user_votes?on_conflict=username,mal_id");
  assert.equal(set.method, "POST");
  assert.equal(set.prefer, "resolution=merge-duplicates");
  assert.deepEqual(set.body, { username: "brice", mal_id: 42, moods: ["epic"], score: 8, voted_at: "2026-11-28T12:00:00.000Z" });
  assert.equal("pts_added" in set.body, false);
  const clear = userScoreRequest("brice", 42, 0, ["epic"], now);
  assert.equal(clear.method, "PATCH");
  assert.equal(clear.path, "user_votes?username=eq.brice&mal_id=eq.42");
  assert.deepEqual(clear.body, { score: null });
  assert.equal(userScoreRequest("", 42, 8), null);
  assert.equal(userScoreRequest("brice", 0, 8), null);
  assert.equal(userScoreRequest("brice", "abc", 8), null);
  assert.equal(userScoreRequest("a b&c", 7, 0).path, "user_votes?username=eq.a%20b%26c&mal_id=eq.7", "le nom est encodé dans l'URL");
  assert.deepEqual(userScoreRequest("brice", 42, 5).body.moods, []);
});

// ── Branchement ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("marqueur d'affiche : posé dans l'appli de bureau seulement (le DOM du site web et de l'APK ne change pas)", () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    delete globalThis.window;
    assert.deepEqual(quickProps(5), {});
    globalThis.window = { animood: { isDesktop: false } };
    assert.deepEqual(quickProps(5), {});
    globalThis.window = { animood: { isDesktop: true } };
    assert.deepEqual(quickProps(5), { "data-quick-anime": "5" });
    assert.deepEqual(quickProps("12"), { "data-quick-anime": "12" });
    assert.deepEqual(quickProps(0), {});
    assert.deepEqual(quickProps(undefined), {});
    assert.deepEqual(quickProps("abc"), {});
  } finally {
    if (had) Object.defineProperty(globalThis, "window", had); else delete globalThis.window;
  }
});

test("branchement : les affiches de la recherche, du profil et du moodboard portent le marqueur ; l'hôte n'est monté que dans l'appli de bureau", () => {
  assert.equal((readLF("src/components/AnimeCard.jsx").match(/\.\.\.quickProps\(/g) || []).length, 2, "AnimeCard + AnimePoster");
  assert.match(readLF("src/views/MoodboardView.jsx"), /\.\.\.quickProps\(anime\.mal_id\)/);
  const app = readLF("src/App.jsx");
  assert.match(app, /\{desktop && <QuickCardHost onOpenDetail=\{openDetail\} \/>\}/);
  assert.match(app, /const QuickCardHost\s+= lazyNamed\(\(\) => import\("\.\/components\/QuickCardHost\.jsx"\), "QuickCardHost"\)/);
});

test("carte : îlot sombre lisible dans les deux thèmes, fenêtre qui ne déplace pas la fenêtre, sous l'en-tête, textes FR / EN complets", () => {
  const card = readLF("src/components/QuickCardHost.jsx");
  assert.match(card, /data-keep-bright=""/);
  assert.match(card, /\{\.\.\.overlayProps\(\)\}/);
  assert.match(card, /data-quick-card=""/);
  assert.match(card, /position: "fixed", zIndex: 400/);
  const css = readLF("src/index.css");
  assert.match(css, /html\[data-app="desktop"\] \.quick-card \{ animation: quick-pop/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*html\[data-app="desktop"\] \.quick-card \{ animation: none; \}/);
  const fr = QUICK_CARD_I18N.fr, en = QUICK_CARD_I18N.en;
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  for (const k of Object.keys(fr)) assert.equal(typeof fr[k], typeof en[k], k);
  assert.equal(fr.rateTitle(7), "Noter 7/10");
  assert.equal(en.rateTitle(7), "Rate 7/10");
  assert.equal(fr.inLists(1), "Dans 1 liste");
  assert.equal(fr.inLists(3), "Dans 3 listes");
  assert.equal(en.inLists(3), "In 3 lists");
});
