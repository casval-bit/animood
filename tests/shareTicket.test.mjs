// Tests des cartes « ticket » à partager (appli de bureau) : numéro et code-barres stables, taille du titre, textes coupés, durée d'un film,
// billet d'un animé (formes Jikan et anime_cache, note, humeurs, petit mot), genres préférés, billet de profil (chiffres, 5 favoris au plus),
// textes FR/EN et branchement (boutons réservés à l'appli de bureau, fenêtre chargée à la demande, hors de la fenêtre de la fiche animé).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NOTE_MAX, MOTTO_MAX, BAR_COUNT,
  hashString, ticketNumber, barcodeBars, titleFontSize, clipText, formatRuntime, formatTicketDate,
  buildAnimeTicket, topGenresOf, buildProfileTicket,
} from "../src/utils/shareTicket.js";
import { SHARE_TICKET_I18N } from "../src/constants/shareTicketI18n.js";
import { MOODS } from "../src/constants/moods.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readLF = (...p) => fs.readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");   // Windows : git peut écrire les fichiers en CRLF
const NOW = new Date(2026, 10, 28, 12, 0, 0);

// ── Nombres stables ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("hashString : FNV-1a 32 bits, identique sur tous les ordinateurs", () => {
  assert.equal(hashString(""), 2166136261);
  assert.equal(hashString("a"), 3826002220);
  assert.equal(hashString("foobar"), 3214735720);
  assert.equal(hashString(null), hashString(""));
  assert.equal(hashString(undefined), hashString(""));
  assert.equal(hashString(42), hashString("42"));
  for (const s of ["", "x", "bob", "été", "🎟️", "a".repeat(500)]) {
    const h = hashString(s);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, s);
  }
  assert.notEqual(hashString("bob"), hashString("bobby"));
});

test("ticketNumber : 5 chiffres (animé) + 4 chiffres (pseudo), toujours le même pour les mêmes entrées", () => {
  assert.match(ticketNumber(7, "bob"), /^\d{5}-\d{4}$/);
  assert.equal(ticketNumber(7, "bob"), ticketNumber(7, "bob"));
  assert.ok(ticketNumber(7, "bob").startsWith("00007-"));
  assert.equal(ticketNumber(7, "bob"), `00007-${String(hashString("7|bob") % 10000).padStart(4, "0")}`);
  assert.ok(ticketNumber(123456, "x").startsWith("23456-"), "l'identifiant est ramené à 5 chiffres");
  const suffixes = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((s) => ticketNumber(7, s).slice(6)));
  assert.ok(suffixes.size >= 4, "le pseudo change le numéro");
  for (const bad of [null, undefined, "abc", -5, NaN, Infinity]) assert.match(ticketNumber(bad), /^00000-\d{4}$/, String(bad));
});

test("barcodeBars : largeurs 1 à 3, stables, jamais toutes pareilles", () => {
  const a = barcodeBars("5|bob");
  assert.equal(a.length, BAR_COUNT);
  assert.deepEqual(a, barcodeBars("5|bob"));
  assert.notDeepEqual(a, barcodeBars("5|alice"));
  assert.equal(barcodeBars("x", 10).length, 10);
  assert.equal(barcodeBars("x", 0).length, 0);
  for (let i = 0; i < 300; i++) {
    const bars = barcodeBars(`seed-${i}`);
    assert.ok(bars.every((w) => w === 1 || w === 2 || w === 3), `seed-${i}`);
    assert.ok(new Set(bars).size >= 2, `seed-${i} : toutes les barres pareilles`);
  }
  assert.ok(new Set(barcodeBars("", 1)).size >= 1);          // un seul trait : pas de boucle infinie, pas d'erreur
});

// ── Mise en page ────────────────────────────────────────────────────────────────────────────────────────────────────────
test("titleFontSize : le titre rétrécit quand il s'allonge, entre 16 et 30 px", () => {
  let last = Infinity;
  for (let n = 0; n <= 120; n++) {
    const s = titleFontSize("x".repeat(n));
    assert.ok(s <= last, `n=${n}`); assert.ok(s >= 16 && s <= 30, `n=${n}`);
    last = s;
  }
  assert.equal(titleFontSize("Mushishi"), 30);
  assert.equal(titleFontSize(null), 30);
  assert.equal(titleFontSize("x".repeat(100)), 16);
});

test("clipText : espaces nettoyés, « … » à la fin, jamais plus long que le maximum", () => {
  assert.equal(clipText("  bonjour   le\n monde  ", 50), "bonjour le monde");
  assert.equal(clipText(null, 10), ""); assert.equal(clipText(undefined, 10), "");
  assert.equal(clipText("abcdef", 6), "abcdef");
  assert.equal(clipText("abcdefg", 6), "abcde…");
  assert.equal(clipText("ab cdefghij", 4), "ab…", "pas d'espace avant « … »");
  for (const max of [1, 2, 5, 40]) assert.ok(clipText("x".repeat(100), max).length <= max, `max=${max}`);
});

test("formatRuntime : durée d'un film en français et en anglais", () => {
  assert.equal(formatRuntime(110, "fr"), "1 h 50"); assert.equal(formatRuntime(110, "en"), "1h 50m");
  assert.equal(formatRuntime(120, "fr"), "2 h"); assert.equal(formatRuntime(120, "en"), "2h");
  assert.equal(formatRuntime(65, "fr"), "1 h 05");
  assert.equal(formatRuntime(45), "45 min");
  for (const none of [0, -3, null, undefined, "x", NaN]) assert.equal(formatRuntime(none), null, String(none));
});

test("formatTicketDate : jour, mois, année dans la langue de l'appli", () => {
  const fr = formatTicketDate(NOW, "fr"), en = formatTicketDate(NOW, "en");
  assert.match(fr, /28/); assert.match(fr, /2026/); assert.match(en, /28/); assert.match(en, /2026/);
  assert.notEqual(fr, en);
  assert.ok(formatTicketDate(undefined, "fr").length > 0, "sans date : aujourd'hui");
});

// ── Billet d'un animé ───────────────────────────────────────────────────────────────────────────────────────────────────
const JIKAN = {
  mal_id: 1, title: "Cowboy Bebop", title_english: "Cowboy Bebop", type: "TV", episodes: 26, score: 8.5,
  genres: [{ name: "Action" }, { name: "Sci-Fi" }, { name: "Drama" }, { name: "Comedy" }], studios: [{ name: "Sunrise" }],
  aired: { prop: { from: { year: 1998 } } }, images: { jpg: { image_url: "small.jpg", large_image_url: "large.jpg" } },
};
const CACHE_ROW = {
  mal_id: 52991, title: "Sousou no Frieren", title_en: "Frieren: Beyond Journey's End", type: "TV", episodes: 28, year: 2023, score: 9.3,
  genres: [{ name: "Adventure" }, { name: "Drama" }], studios: [{ name: "Madhouse" }], image_url: "s.jpg", large_image: "l.jpg",
};

test("billet d'un animé (objet Jikan) : titre, repères, genres, studio, note MAL, affiche", () => {
  const tk = buildAnimeTicket({ anime: JIKAN, score: 9, statusId: "completed", seed: "bob", now: NOW });
  assert.equal(tk.id, 1);
  assert.equal(tk.title, "Cowboy Bebop"); assert.equal(tk.romaji, null, "même titre : pas de ligne en plus");
  assert.equal(tk.titleSize, titleFontSize("Cowboy Bebop"));
  assert.deepEqual(tk.meta, ["TV", "26 ép.", 1998]);
  assert.deepEqual(tk.genres, ["Action", "Sci-Fi", "Drama"], "3 genres au plus");
  assert.equal(tk.studio, "Sunrise"); assert.equal(tk.malScore, "8.5");
  assert.deepEqual(tk.poster, { image_url: "small.jpg", large_image: "large.jpg" });
  assert.equal(tk.statusId, "completed");
  assert.equal(tk.number, ticketNumber(1, "bob")); assert.deepEqual(tk.bars, barcodeBars("1|bob"));
  assert.equal(tk.date, formatTicketDate(NOW, "fr"));
  assert.deepEqual(buildAnimeTicket({ anime: JIKAN, score: 9, lang: "en", now: NOW }).meta, ["TV", "26 eps", 1998]);
});

test("billet d'un animé (ligne anime_cache) : titre anglais, titre d'origine en dessous, affiche", () => {
  const tk = buildAnimeTicket({ anime: CACHE_ROW, score: 10, now: NOW });
  assert.equal(tk.title, "Frieren: Beyond Journey's End");
  assert.equal(tk.romaji, "Sousou no Frieren");
  assert.equal(tk.titleSize, titleFontSize(tk.title));
  assert.deepEqual(tk.meta, ["TV", "28 ép.", 2023]);
  assert.deepEqual(tk.poster, { image_url: "s.jpg", large_image: "l.jpg" });
  assert.equal(tk.malScore, "9.3"); assert.equal(tk.studio, "Madhouse");
});

test("film : la durée remplace le nombre d'épisodes ; sans durée connue, rien n'est inventé", () => {
  const movie = { mal_id: 199, title: "Sen to Chihiro", title_english: "Spirited Away", type: "Movie", episodes: 1, duration: "2 hr 5 min", year: 2001 };
  assert.deepEqual(buildAnimeTicket({ anime: movie, now: NOW }).meta, ["Movie", "2 h 05", 2001]);
  assert.deepEqual(buildAnimeTicket({ anime: movie, lang: "en", now: NOW }).meta, ["Movie", "2h 5m", 2001]);
  assert.deepEqual(buildAnimeTicket({ anime: { ...movie, duration: undefined }, now: NOW }).meta, ["Movie", 2001]);
  assert.deepEqual(buildAnimeTicket({ anime: { mal_id: 3, title: "Ongoing", type: "TV", episodes: null }, now: NOW }).meta, ["TV"]);
});

test("ma note : entier de 1 à 10, 10 pastilles allumées dans l'ordre, sinon « pas encore noté »", () => {
  const pipsOf = (score) => buildAnimeTicket({ anime: JIKAN, score, now: NOW });
  for (let n = 1; n <= 10; n++) {
    const tk = pipsOf(n);
    assert.equal(tk.score, n); assert.equal(tk.pips.length, 10);
    assert.deepEqual(tk.pips, Array.from({ length: 10 }, (_, i) => i < n), `note ${n}`);
  }
  assert.equal(pipsOf(7.6).score, 8, "arrondie"); assert.equal(pipsOf("8").score, 8);
  for (const none of [null, undefined, 0, -1, 11, NaN, "abc"]) {
    const tk = pipsOf(none);
    assert.equal(tk.score, null, String(none)); assert.ok(tk.pips.every((p) => p === false), String(none));
  }
});

test("humeurs : connues seulement, sans doublon, 3 au plus ; petit mot coupé à la bonne longueur ; statut transmis", () => {
  const moods = buildAnimeTicket({ anime: JIKAN, moods: ["happy", "happy", "bogus", "dark", "chill", "hype"], now: NOW }).moods;
  assert.deepEqual(moods, ["happy", "dark", "chill"]);
  assert.deepEqual(buildAnimeTicket({ anime: JIKAN, moods: null, now: NOW }).moods, []);
  assert.ok(moods.every((m) => MOODS.some((x) => x.id === m)));
  const note = buildAnimeTicket({ anime: JIKAN, note: `   un   très\n  beau   ${"mot ".repeat(60)}`, now: NOW }).note;
  assert.ok(note.length <= NOTE_MAX && note.endsWith("…") && note.startsWith("un très beau mot"), note);
  assert.equal(buildAnimeTicket({ anime: JIKAN, note: "ok", now: NOW }).note, "ok");
  assert.equal(buildAnimeTicket({ anime: JIKAN, statusId: "", now: NOW }).statusId, null);
  assert.equal(buildAnimeTicket({ anime: JIKAN, statusId: "watching", now: NOW }).statusId, "watching");
});

test("le numéro et le code-barres dépendent de l'animé ET du pseudo, pas de la note ni de l'heure", () => {
  const a = buildAnimeTicket({ anime: JIKAN, seed: "bob", now: NOW }), b = buildAnimeTicket({ anime: JIKAN, seed: "bob", score: 3, note: "x", now: new Date(2020, 0, 1) });
  assert.equal(a.number, b.number); assert.deepEqual(a.bars, b.bars);
  const c = buildAnimeTicket({ anime: JIKAN, seed: "alice", now: NOW });
  assert.ok(a.number !== c.number || JSON.stringify(a.bars) !== JSON.stringify(c.bars));
  const d = buildAnimeTicket({ anime: { ...JIKAN, mal_id: 2 }, seed: "bob", now: NOW });
  assert.notEqual(a.number, d.number);
});

test("données absentes ou bizarres : aucun plantage, rien d'inventé", () => {
  for (const anime of [undefined, null, {}, { mal_id: "abc" }, { mal_id: 9, genres: "Action", studios: null, score: "x", episodes: "12" }]) {
    const tk = buildAnimeTicket({ anime, now: NOW });
    assert.ok(typeof tk.title === "string" && tk.title.length > 0);
    assert.ok(Array.isArray(tk.genres) && Array.isArray(tk.meta) && Array.isArray(tk.pips) && Array.isArray(tk.bars));
    assert.ok(tk.malScore === null || /^\d+\.\d$/.test(tk.malScore));
    assert.match(tk.number, /^\d{5}-\d{4}$/);
  }
  assert.equal(buildAnimeTicket({ anime: { mal_id: 12 }, now: NOW }).title, "#12");
  assert.equal(buildAnimeTicket({ now: NOW }).title, "—");
  assert.deepEqual(buildAnimeTicket({ anime: { mal_id: 9, episodes: "12", type: "TV" }, now: NOW }).meta, ["TV", "12 ép."]);
});

// ── Genres préférés ──────────────────────────────────────────────────────────────────────────────────────────────────────
test("topGenresOf : les animés notés 8+ comptent double, égalités par ordre alphabétique, limite respectée", () => {
  const meta = {
    1: { genres: [{ name: "Z" }] }, 2: { genres: [{ name: "A" }, { name: "Z" }] }, 3: { genres: [{ name: "B" }] }, 4: { genres: [{ name: "C" }] },
  };
  assert.deepEqual(topGenresOf({ ids: [1, 2, 3], ratings: { 1: 9, 2: 5 } }, meta), ["Z", "A", "B"]);   // Z : 2+1 ; A : 1 ; B : 1
  assert.deepEqual(topGenresOf({ ids: [1, 2, 3, 4], ratings: {} }, meta, 2), ["Z", "A"]);               // Z : 2 ; puis A, B, C à égalité → alphabétique
  assert.deepEqual(topGenresOf({ ids: [3, 4], ratings: { 3: 8, 4: 7 } }, meta, 1), ["B"]);
  assert.deepEqual(topGenresOf({ ids: [1, 2, 99], ratings: {} }, meta, 5), ["Z", "A"], "fiche inconnue ignorée");
  assert.deepEqual(topGenresOf(), []); assert.deepEqual(topGenresOf({ ids: [1] }, {}), []);
  assert.deepEqual(topGenresOf({ ids: [1], ratings: { 1: 9 } }, { 1: { genres: ["Drama", { name: "Drama" }, { nom: "?" }] } }), ["Drama"]);
});

// ── Billet d'un profil ───────────────────────────────────────────────────────────────────────────────────────────────────
test("billet de profil : nom, pseudo en minuscules, chiffres, note moyenne, 5 favoris au plus", () => {
  const favorites = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, title: `Titre ${id}`, row: { image_url: `s${id}.jpg`, large_image: `l${id}.jpg` } })).concat([{ id: null, title: "?" }, null]);
  const tk = buildProfileTicket({
    name: "Brice", username: "BRICE", avatar: "https://x/y.png", bio: "  Fan de   Mushishi ", badge: { label: "Otaku", emoji: "🔥" },
    watched: [1, 2, 3, 4], ratings: { 1: { score: 9 }, 2: { score: 7 }, 3: { score: null }, 4: { score: 12 }, 5: {} },
    favorites, topGenres: ["A", "B", "C", "D"], now: NOW,
  });
  assert.equal(tk.name, "Brice"); assert.equal(tk.username, "brice"); assert.equal(tk.avatar, "https://x/y.png"); assert.equal(tk.motto, "Fan de Mushishi");
  assert.deepEqual(tk.badge, { label: "Otaku", emoji: "🔥" });
  assert.deepEqual(tk.stats, { watched: 4, rated: 2, avg: 8 });
  assert.equal(tk.favorites.length, 5); assert.deepEqual(tk.favorites.map((f) => f.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(tk.favorites[0], { id: 1, title: "Titre 1", poster: { image_url: "s1.jpg", large_image: "l1.jpg" } });
  assert.deepEqual(tk.topGenres, ["A", "B", "C"]);
  assert.equal(tk.number, buildProfileTicket({ name: "x", username: "brice", now: NOW }).number, "le numéro ne dépend que du pseudo");
  assert.match(tk.number, /^\d{5}-\d{4}$/); assert.equal(tk.bars.length, BAR_COUNT);
});

test("billet de profil : moyenne arrondie à une décimale, bio coupée, badge sans nom ignoré, profil vide sans plantage", () => {
  const avg = (scores) => buildProfileTicket({ username: "u", ratings: Object.fromEntries(scores.map((s, i) => [i + 1, { score: s }])), now: NOW }).stats.avg;
  assert.equal(avg([8, 7, 7]), 7.3); assert.equal(avg([10]), 10); assert.equal(avg([]), null);
  const long = buildProfileTicket({ username: "u", bio: "mot ".repeat(80), now: NOW }).motto;
  assert.ok(long.length <= MOTTO_MAX && long.endsWith("…"));
  assert.equal(buildProfileTicket({ username: "u", badge: { emoji: "🔥" }, now: NOW }).badge, null);
  assert.deepEqual(buildProfileTicket({ username: "u", badge: { label: "Sans emoji" }, now: NOW }).badge, { label: "Sans emoji", emoji: null });
  const empty = buildProfileTicket({ now: NOW });
  assert.equal(empty.name, "—"); assert.equal(empty.username, ""); assert.equal(empty.avatar, null); assert.equal(empty.motto, "");
  assert.deepEqual(empty.stats, { watched: 0, rated: 0, avg: null }); assert.deepEqual(empty.favorites, []); assert.deepEqual(empty.topGenres, []);
  assert.equal(buildProfileTicket({ username: "zed", now: NOW }).name, "zed", "sans nom : le pseudo");
  assert.equal(buildProfileTicket({ name: "A", watched: null, ratings: null, favorites: null, topGenres: null, now: NOW }).stats.watched, 0);
});

// ── Textes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("textes FR / EN : mêmes clés et mêmes types, une humeur par axe, fonctions qui rendent du texte", () => {
  const fr = SHARE_TICKET_I18N.fr, en = SHARE_TICKET_I18N.en;
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  for (const k of Object.keys(fr)) assert.equal(typeof fr[k], typeof en[k], k);
  for (const lang of [fr, en]) {
    assert.deepEqual(Object.keys(lang.moodLabels).sort(), MOODS.map((m) => m.id).sort());
    assert.ok(Object.values(lang.moodLabels).every((s) => typeof s === "string" && s.length > 0));
    for (const [k, v] of Object.entries(lang)) {
      if (k === "moodLabels") continue;
      const out = typeof v === "function" ? v("Frieren") : v;
      assert.ok(typeof out === "string" && out.length > 0 && !/undefined|NaN|\[object/.test(out), `${k} → ${out}`);
    }
    assert.match(lang.shareTextAnime("Frieren"), /Frieren/); assert.match(lang.shareTextProfile("Brice"), /Brice/);
  }
  assert.notEqual(fr.titleAnime, en.titleAnime);
});

// ── Branchement ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test("fiche animé : bouton Ticket seulement dans la barre d'actions de l'appli de bureau ; fenêtre chargée à la demande, hors de la fenêtre de la fiche", () => {
  const src = readLF("src", "components", "AnimeDetailModal.jsx");
  assert.match(src, /const ShareTicketModal = lazy\(\(\) => import\("\.\/ShareTicketModal\.jsx"\)/, "chargée à la demande : html2canvas ne pèse pas sur le site");
  const bar = src.search(/\{desktop && \(\s*<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white\/6 px-6 py-3\.5">/);
  const btn = src.indexOf('data-ticket-open="anime"');
  assert.ok(bar > 0 && btn > bar && btn < src.indexOf("<button onClick={toggleWatched}"), "bouton dans la barre d'actions du bureau, avant « Vu »");
  assert.equal(src.split('data-ticket-open="anime"').length - 1, 1, "un seul bouton");
  assert.match(src, /\{showTicket && desktop && \(\s*<Suspense fallback=\{null\}>\s*<ShareTicketModal kind="anime" anime=\{a\}/);
  assert.ok(src.indexOf("<ShareTicketModal") > src.lastIndexOf("</Modal>"), "hors du <Modal> animé (transform → position:fixed piégée)");
});

test("profil : bouton Ticket seulement dans l'appli de bureau ; la fenêtre reçoit le badge actif", () => {
  const src = readLF("src", "views", "ProfileView.jsx");
  assert.match(src, /const ShareTicketModal = lazy\(\(\) => import\("\.\.\/components\/ShareTicketModal\.jsx"\)/);
  assert.match(src, /\{desktop && \(\s*<>\s*<div className="w-px h-3 bg-white\/10"\/>\s*<button type="button" onClick=\{[^}]*\}[^>]*data-ticket-open="profile"/);
  assert.equal(src.split('data-ticket-open="profile"').length - 1, 1);
  assert.match(src, /\{ticketOpen && desktop && \(\s*<Suspense fallback=\{null\}>\s*<ShareTicketModal kind="profile" badge=\{activeBadge\}/);
});

test("la fenêtre : un seul export (composant), carte à couleurs fixes, aucune couche flottante en plus, export via posterExport", () => {
  const src = readLF("src", "components", "ShareTicketModal.jsx");
  assert.deepEqual([...src.matchAll(/^export (?:default )?(?:function|const|class) (\w+)/gm)].map((m) => m[1]), ["ShareTicketModal"]);
  assert.ok(!/position:\s*["']?fixed/.test(src), "la couche flottante est celle de <Modal> (déjà gardée par desktopWindow.test.mjs)");
  assert.match(src, /data-keep-bright=""/, "carte sombre aussi en thème clair");
  assert.match(src, /renderToCanvas\(ref\.current, \{ backgroundColor: PAPER, scale: 2 \}\)/);
  for (const fn of ["downloadCanvas", "copyCanvas", "shareCanvas", "canShareImages"]) assert.ok(src.includes(fn), fn);
  assert.match(src, /data-ticket-download/); assert.match(src, /data-ticket-copy/);
  assert.match(src, /maxLength=\{NOTE_MAX\}/, "la zone de texte respecte la longueur du billet");
  // chaque affiche passe par <Poster> (data-raw → relue via le proxy à l'export) et l'avatar par data-raw aussi
  assert.ok((src.match(/<Poster /g) || []).length >= 2);
  assert.match(src, /<img src=\{tk\.avatar\} data-raw=\{tk\.avatar\}/);
});
