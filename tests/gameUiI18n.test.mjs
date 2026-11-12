// Les écrans de jeu lisent leurs textes dans gameUiI18n.js : une clé oubliée, ou présente dans une seule langue, afficherait
// « undefined » (ou ferait planter l'écran). Ce test relève toutes les clés utilisées dans le code et vérifie les deux langues.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { GAME_UI_I18N } from "../src/constants/gameUiI18n.js";
import { collectUiKeys } from "./helpers/uiKeys.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const used = collectUiKeys(root);

test("le relevé des clés trouve bien les écrans (garde-fou du test lui-même)", () => {
  assert.ok(used.size > 150, `seulement ${used.size} clés relevées`);
  for (const id of ["common.you", "end.saving", "duel.quitTitle", "chain.round", "timeline.rightSpot", "uc.pts", "cluescale.vote", "lobby.ranked", "friends.title", "party.start"]) {
    assert.ok(used.has(id), `clé attendue non relevée : ${id}`);
  }
});

for (const lang of ["fr", "en"]) {
  test(`${lang} : toutes les clés utilisées par les écrans existent`, () => {
    const missing = [];
    for (const [id] of used) {
      const [ns, key] = id.split(".");
      if (GAME_UI_I18N[lang]?.[ns]?.[key] === undefined) missing.push(id);
    }
    assert.deepEqual(missing, []);
  });

  test(`${lang} : les fonctions de texte acceptent le nombre d'arguments passés`, () => {
    const bad = [];
    for (const [id, info] of used) {
      const [ns, key] = id.split(".");
      const v = GAME_UI_I18N[lang]?.[ns]?.[key];
      for (const n of info.arities) {
        if (typeof v !== "function") bad.push(`${id} appelée avec ${n} argument(s) mais ce n'est pas une fonction`);
        else if (v.length < n) bad.push(`${id} : ${n} argument(s) passés, ${v.length} attendus`);
      }
    }
    assert.deepEqual(bad, []);
  });
}

function shape(v) {
  if (typeof v === "function") return `fn/${v.length}`;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}

test("fr et en ont exactement les mêmes clés, du même type, avec les mêmes arguments", () => {
  assert.deepEqual(shape(GAME_UI_I18N.en), shape(GAME_UI_I18N.fr));
});

test("les fonctions de texte renvoient du texte (aucun « undefined » dans une phrase)", () => {
  const sample = { w: 2, l: 1, d: 1 };
  const walk = (obj, path, lang) => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "function") {
        const out = v(...Array.from({ length: v.length }, (_, i) => (k === "record" ? sample : ["Alice", 2, 3][i % 3])));
        assert.equal(typeof out, "string", `${lang} ${path}.${k}`);
        assert.ok(!/undefined|NaN|\[object/.test(out), `${lang} ${path}.${k} → ${out}`);
      } else if (v && typeof v === "object") walk(v, `${path}.${k}`, lang);
    }
  };
  for (const lang of ["fr", "en"]) walk(GAME_UI_I18N[lang], "", lang);
});
