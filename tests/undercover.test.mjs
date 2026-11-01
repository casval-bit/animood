import test from "node:test";
import assert from "node:assert/strict";
import { UNDERCOVER_WORDS as BANK } from "../src/constants/undercoverWords.js";
import { normalizeWord, isGuessCorrect, isClueForbidden, pickEntry, undercoverPoints, tallyVotes } from "../src/utils/undercoverRules.js";

const find = (w) => BANK.find((e) => e.word === w);

test("Banque de mots : complète, sans doublon, deux langues", () => {
  assert.ok(BANK.length >= 60, "au moins 60 mots");
  const seen = new Set();
  for (const e of BANK) {
    assert.ok(e.word && e.hint.fr && e.hint.en, `entrée incomplète : ${e.word}`);
    const k = normalizeWord(e.word);
    assert.ok(!seen.has(k), `doublon : ${e.word}`); seen.add(k);
    assert.ok(e.hint.fr.length >= 15 && e.hint.en.length >= 15, `indice trop court : ${e.word}`);
  }
});
test("Aucun indice ne contient le mot ni une de ses variantes (sauf initiales d'une lettre)", () => {
  for (const e of BANK) for (const lang of ["fr", "en"]) {
    const h = ` ${normalizeWord(e.hint[lang])} `;
    for (const f of [e.word, ...e.aliases].map(normalizeWord)) {
      if (f.length < 4) continue;
      assert.ok(!h.includes(` ${f} `), `l'indice ${lang} de « ${e.word} » contient « ${f} »`);
      // pas non plus un mot entier du nom (« Light », « Zoro »…) pour les noms courts à un mot
    }
  }
});
test("Comparaison de réponses : accents, ponctuation, variantes, fautes légères", () => {
  assert.equal(isGuessCorrect("steins gate", find("Steins;Gate")), true);
  assert.equal(isGuessCorrect("STEINS;GATE", find("Steins;Gate")), true);
  assert.equal(isGuessCorrect("re zero", find("Re:Zero")), true);
  assert.equal(isGuessCorrect("Shingeki no Kyojin", find("Attack on Titan")), true);
  assert.equal(isGuessCorrect("attack on titans", find("Attack on Titan")), true);    // faute légère
  assert.equal(isGuessCorrect("hunter hunter", find("Hunter x Hunter")), true);
  assert.equal(isGuessCorrect("Le Voyage de Chihiro", find("Spirited Away")), true);
  assert.equal(isGuessCorrect("l", find("L Lawliet")), true);
  assert.equal(isGuessCorrect("naruto", find("Naruto")), true);
  assert.equal(isGuessCorrect("narto", find("Naruto")), true);                      // une faute de frappe sur un nom de 6 lettres
  assert.equal(isGuessCorrect("akia", find("Akira")), false);                       // nom court : orthographe exacte
  assert.equal(isGuessCorrect("bleach", find("Naruto")), false);
  assert.equal(isGuessCorrect("   ", find("Naruto")), false);
  assert.equal(isGuessCorrect("", find("Naruto")), false);
  assert.equal(isGuessCorrect("m", find("L Lawliet")), false);
});
test("Indice interdit : le mot secret ou une variante", () => {
  const aot = find("Attack on Titan");
  assert.equal(isClueForbidden("Attack on Titan", aot), true);
  assert.equal(isClueForbidden("c'est shingeki no kyojin", aot), true);
  assert.equal(isClueForbidden("murailles", aot), false);
  assert.equal(isClueForbidden("L", find("L Lawliet")), true);                          // égalité stricte pour les initiales
  assert.equal(isClueForbidden("lait", find("L Lawliet")), false);
  assert.equal(isClueForbidden("naruto", find("Naruto")), true);
  assert.equal(isClueForbidden("narutomaki", find("Naruto")), false);                  // mot entier uniquement
});
test("Tirage : n'enchaîne pas deux fois le même mot", () => {
  const recent = BANK.slice(0, 10).map((e) => e.word);
  for (let i = 0; i < 200; i++) assert.ok(!recent.includes(pickEntry(BANK, recent).word));
  assert.ok(pickEntry(BANK.slice(0, 6), BANK.slice(0, 6).map((e) => e.word))); // petite banque : ne plante pas
});
test("Points et vote", () => {
  const players = [{ username: "a", isImpostor: false }, { username: "b", isImpostor: true }, { username: "c", isImpostor: false }];
  assert.deepEqual(undercoverPoints(players, false, false), { b: 5 });
  assert.deepEqual(undercoverPoints(players, true, false), { a: 3, c: 3 });
  assert.deepEqual(undercoverPoints(players, true, true), { a: 1, b: 2, c: 1 });
  assert.equal(tallyVotes({ a: "b", b: "a", c: "b" }, "b").impostorFound, true);
  assert.equal(tallyVotes({ a: "b", b: "c", c: "a" }, "b").impostorFound, false);      // égalité : il s'échappe
  assert.equal(tallyVotes({ a: "c", b: "c", c: "a" }, "b").impostorFound, false);      // mauvaise cible
});
