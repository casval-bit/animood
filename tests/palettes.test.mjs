// Tests des palettes de couleurs (node --test tests/)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectKeys, buildCss, paletteColor, TAILWIND_FAMILIES } from "../scripts/palettes/generate.mjs";
import { PALETTES as SPECS } from "../scripts/palettes/spec.mjs";
import { parseHex, hex, rgbToOklch, oklchToRgb } from "../scripts/palettes/color.mjs";
import { mapOklch, contrastWhite } from "../scripts/palettes/map.mjs";
import { PALETTES, PALETTE_IDS, DEFAULT_PALETTE, readStoredPalette, applyPalette, PALETTE_STORAGE_KEY } from "../src/constants/palettes.js";
import { withAlpha } from "../src/utils/withAlpha.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const css = fs.readFileSync(path.join(src, "palettes.css"), "utf8");
const keys = collectKeys(src);
const block = (selector) => {
  const i = css.indexOf(selector + " {");
  assert.ok(i >= 0, `bloc introuvable : ${selector}`);
  return css.slice(i, css.indexOf("\n}", i));
};

// ── Fichier généré ────────────────────────────────────────────────────────────
test("src/palettes.css est à jour (npm run palettes)", () => {
  assert.equal(css, buildCss(keys));
});
test("chaque couleur --ac-xxxxxx utilisée dans le code est définie, avec sa valeur d'origine par défaut", () => {
  assert.ok(keys.length > 50);
  const root = block(":root");
  for (const k of keys) assert.ok(root.includes(`--ac-${k}: ${parseHex(k).join(", ")};`), `valeur par défaut de --ac-${k}`);
});
test("aucune variable --ac- mal formée dans le code", () => {
  const bad = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|css)$/.test(e.name) && e.name !== "palettes.css" && e.name !== "withAlpha.js" && /--ac-(?![0-9a-f]{6}\b)/.test(fs.readFileSync(p, "utf8"))) bad.push(path.relative(src, p));
    }
  })(src);
  assert.deepEqual(bad, []);
});
test("chaque palette redéfinit toutes les couleurs, en thème sombre et clair, plus les familles Tailwind", () => {
  for (const id of Object.keys(SPECS)) {
    for (const sel of [`html[data-app="desktop"][data-palette="${id}"]`, `html[data-app="desktop"][data-palette="${id}"][data-theme="light"]`]) {
      const b = block(sel);
      for (const k of keys) assert.ok(b.includes(`--ac-${k}:`), `${sel} : --ac-${k}`);
      for (const f of TAILWIND_FAMILIES) for (const s of [50, 300, 400, 500, 600, 950]) assert.ok(b.includes(`--color-${f}-${s}:`), `${sel} : ${f}-${s}`);
    }
    assert.ok(block(`html[data-app="desktop"][data-palette="${id}"]`).includes("--hud-h0:"));
  }
});
test("les palettes ne s'appliquent que dans l'appli de bureau", () => {
  for (const line of css.split("\n")) if (/data-palette=/.test(line) && line.includes("{")) assert.ok(line.startsWith('html[data-app="desktop"]'), line);
});

// ── Cohérence de la liste des palettes ────────────────────────────────────────
test("liste des palettes : identifiants et aperçus", () => {
  assert.deepEqual(PALETTE_IDS, [DEFAULT_PALETTE, ...Object.keys(SPECS)]);
  assert.deepEqual(PALETTES[0].swatch, ["#6d5bff", "#8b5cf6", "#ec4899"]);   // palette d'origine
  for (const p of PALETTES.slice(1)) assert.deepEqual(p.swatch, ["6d5bff", "8b5cf6", "ec4899"].map((k) => "#" + hex(paletteColor(k, p.id, "dark"))), `aperçu ${p.id}`);
});
test("les textes du sélecteur existent en français et en anglais", async () => {
  const { SETTINGS_I18N } = await import("../src/constants/settingsI18n.js");
  for (const lang of ["fr", "en"]) for (const id of PALETTE_IDS) assert.ok(SETTINGS_I18N[lang].paletteNames[id], `${lang}/${id}`);
});

// ── Les palettes changent vraiment la couleur de marque ───────────────────────
const hue = (key, id, theme = "dark") => rgbToOklch(...paletteColor(key, id, theme)).h;
const between = (h, a, b) => (a <= b ? h >= a && h <= b : h >= a || h <= b);
test("jaune / orange : le violet de la marque devient orange, le rose devient rouge", () => {
  assert.ok(between(hue("8b5cf6", "sunset"), 35, 65));
  assert.ok(between(hue("6d5bff", "sunset"), 55, 95));
  assert.ok(between(hue("ec4899", "sunset"), 5, 30));
});
test("rouge / saumon : tout tourne autour du rouge", () => {
  for (const k of ["6d5bff", "8b5cf6", "ec4899", "7c3aed"]) assert.ok(between(hue(k, "coral"), 340, 50), `${k} → ${hue(k, "coral").toFixed(0)}°`);
});
test("vert / rose : le bleu et le violet deviennent verts, le rose reste rose", () => {
  for (const k of ["6d5bff", "8b5cf6", "7c3aed", "4f46e5"]) assert.ok(between(hue(k, "garden"), 140, 200), `${k} → ${hue(k, "garden").toFixed(0)}°`);
  assert.ok(between(hue("ec4899", "garden"), 340, 10));
});
test("texte blanc lisible : les couleurs qui servaient de fond à du texte blanc gardent un contraste d'au moins 3,2", () => {
  const FILLS = ["6d5bff", "8b5cf6", "ec4899", "a855f7", "7c3aed", "6366f1", "4f46e5", "3b82f6", "2563eb"];
  for (const id of Object.keys(SPECS)) for (const theme of ["dark", "light"]) for (const k of FILLS) {
    const c = contrastWhite(paletteColor(k, id, theme));
    assert.ok(c >= 3.2, `${id}/${theme}/${k} : contraste ${c.toFixed(2)}`);
  }
});
test("garde-fou : une couleur d'origine pâle (contraste < 3 avec le blanc) n'est pas assombrie", () => {
  for (const id of Object.keys(SPECS)) for (const k of ["c084fc", "a78bfa", "818cf8", "60a5fa", "e879f9"]) {
    const m = mapOklch(rgbToOklch(...parseHex(k)), SPECS[id], "dark");
    assert.deepEqual(paletteColor(k, id, "dark"), oklchToRgb(m.L, m.C, m.h), `${id}/${k}`);
  }
});

// ── Choix mémorisé et application sur <html> ──────────────────────────────────
function fakeStorage(value) {
  globalThis.localStorage = { getItem: (k) => (k === PALETTE_STORAGE_KEY ? value : null) };
}
test("readStoredPalette : valeur valide, inconnue ou absente", () => {
  fakeStorage("garden"); assert.equal(readStoredPalette(), "garden");
  fakeStorage("n'importe quoi"); assert.equal(readStoredPalette(), DEFAULT_PALETTE);
  fakeStorage(null); assert.equal(readStoredPalette(), DEFAULT_PALETTE);
  delete globalThis.localStorage; assert.equal(readStoredPalette(), DEFAULT_PALETTE);
});
test("applyPalette : posée seulement dans l'appli de bureau, retirée pour la palette d'origine", () => {
  const web = { dataset: {} };
  applyPalette("sunset", web); assert.equal(web.dataset.palette, undefined);
  const desktop = { dataset: { app: "desktop" } };
  applyPalette("sunset", desktop); assert.equal(desktop.dataset.palette, "sunset");
  applyPalette("coral", desktop); assert.equal(desktop.dataset.palette, "coral");
  applyPalette("default", desktop); assert.equal(desktop.dataset.palette, undefined);
  applyPalette("inconnue", desktop); assert.equal(desktop.dataset.palette, undefined);
});

// ── withAlpha ─────────────────────────────────────────────────────────────────
test("withAlpha ≡ suffixe hexadécimal", () => {
  assert.equal(withAlpha("#a855f7", "33"), "#a855f733");
  assert.equal(withAlpha("rgb(var(--ac-a855f7))", "33"), "rgba(var(--ac-a855f7),0.2)");
  assert.equal(withAlpha("rgb(var(--ac-a855f7))", "ff"), "rgba(var(--ac-a855f7),1)");
  assert.equal(withAlpha("rgb(var(--ac-a855f7))", "00"), "rgba(var(--ac-a855f7),0)");
  assert.match(withAlpha("hsl(262 90% 60%)", "80"), /^color-mix\(in srgb, hsl\(262 90% 60%\) 50\.1961%, transparent\)$/);
  // l'opacité calculée retombe exactement sur le même octet que le suffixe hexadécimal
  for (let n = 0; n < 256; n++) {
    const h = n.toString(16).padStart(2, "0");
    const a = Number(/,([\d.]+)\)$/.exec(withAlpha("rgb(var(--ac-a855f7))", h))[1]);
    assert.equal(Math.round(a * 255), n, h);
  }
});
