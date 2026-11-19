// Tests de la lisibilité en thème clair (scripts/palettes/lighttext.mjs → src/palettes.css) :
// les textes d'accent pâles sont assombris pour atteindre le contraste visé, jamais les textes « sur couleur » (blanc…), et le thème sombre n'est pas touché.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { darkenFactor, darkened, contrast, collectTextColors, lightTextRules, shadeRgb, ISLANDS, LIGHT_SURFACE, MIN_CONTRAST, AIM_CONTRAST, MIN_ALPHA } from "../scripts/palettes/lighttext.mjs";
import { parseHex, rgbToOklch } from "../scripts/palettes/color.mjs";
import { luminance as luminanceOf } from "../scripts/palettes/lighttext.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const css = fs.readFileSync(path.join(src, "palettes.css"), "utf8");
const section = css.slice(css.indexOf("LISIBILITÉ EN THÈME CLAIR"));

test("une couleur pâle est assombrie jusqu'au contraste visé, avec la même teinte", () => {
  for (const h of ["c084fc", "fbbf24", "22d3ee", "f472b6", "a3e635", "818cf8", "ffd93d"]) {
    const rgb = parseHex(h), k = darkenFactor(rgb);
    assert.ok(k > 0 && k < 1, `#${h} : facteur ${k}`);
    const dark = darkened(rgb, k);
    assert.ok(contrast(dark, LIGHT_SURFACE) >= MIN_CONTRAST, `#${h} → ${dark} : contraste ${contrast(dark, LIGHT_SURFACE).toFixed(2)}`);
    const a = rgbToOklch(...rgb), b = rgbToOklch(...dark);
    if (b.C > 0.03) assert.ok(Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h)) < 8, `#${h} : teinte ${a.h.toFixed(0)}° → ${b.h.toFixed(0)}°`);
  }
});

test("jamais assombries : le blanc et les couleurs presque blanches (texte posé sur un bouton coloré), ni les couleurs déjà assez foncées", () => {
  for (const h of ["ffffff", "f5f3ff", "fff7d6", "e0f2fe", "fef3c7"]) assert.equal(darkenFactor(parseHex(h)), null, `#${h}`);
  for (const h of ["1e1b4b", "4c1d95", "14532d", "7f1d1d", "120f24"]) assert.equal(darkenFactor(parseHex(h)), null, `#${h}`);
  assert.equal(contrast([255, 255, 255], [0, 0, 0]), 21);
  assert.ok(AIM_CONTRAST > MIN_CONTRAST);
});

test("le facteur reste borné : on ne fonce jamais jusqu'au noir", () => {
  for (const h of ["ffd93d", "a5f3fc", "fde68a", "86efac"]) assert.ok(darkenFactor(parseHex(h)) >= 0.3, `#${h}`);
});

test("les couleurs de texte du code sont trouvées : classes Tailwind, clés --ac-, valeurs en dur (hors dessins de cadres)", () => {
  const { hexes, keys, classes } = collectTextColors(src);
  assert.ok(classes.has("indigo-300") && classes.has("amber-400") && classes.has("violet-300"), [...classes].join(" "));
  assert.ok(keys.has("c084fc") && keys.has("818cf8"));
  assert.ok(hexes.has("fbbf24") && hexes.has("22d3ee"));
});

test("chaque couleur pâle du code a sa règle dans src/palettes.css, et les règles ne s'appliquent qu'au thème clair", () => {
  const rules = lightTextRules(src);
  assert.ok(rules.length > 60, `${rules.length} règles`);
  for (const r of rules) {
    assert.ok(section.includes(`/* ${r.id} */`), `règle de ${r.id}`);
    assert.ok(section.includes(`:root[data-theme="light"] :is(${r.selector})`), `sélecteur de ${r.id}`);
  }
  for (const line of section.split("\n")) if (/\{ color:|\{ --lt-keep/.test(line)) assert.ok(line.startsWith(':root[data-theme="light"]'), line);
  assert.match(section, /--lt-keep: 1/);
});

test("classes Tailwind : la règle part de la variable de la palette (elle suit donc le choix de couleurs)", () => {
  assert.match(section, /\.text-indigo-300\) \{ color: oklch\(from var\(--color-indigo-300\)/);
  assert.match(section, /\.text-amber-400\) \{ color: oklch\(from var\(--color-amber-400\)/);
});

test("couleurs de marque --ac- : la règle part de la variable (palette) ; valeurs en dur : forme « rgb(r, g, b) » telle que le navigateur l'écrit", () => {
  assert.match(section, /\[style\^="color: rgb\(var\(--ac-c084fc\)\)"\],\[style\*=" color: rgb\(var\(--ac-c084fc\)\)"\]\) \{ color: oklch\(from rgb\(var\(--ac-c084fc\)\)/);
  assert.match(section, /\[style\^="color: rgb\(251, 191, 36\)"\],\[style\*=" color: rgb\(251, 191, 36\)"\]\)/);
});

test("textes semi-transparents : une règle par couleur pâle + opacité ; l'opacité est relevée à MIN_ALPHA en thème clair (sauf dans un îlot sombre)", () => {
  const { alphas, classes } = collectTextColors(src);
  assert.ok(alphas.has("rgba(148, 163, 184, 0.7)"), "rgba littéral, tel que le navigateur l'écrit dans style=\"\"");
  assert.ok(alphas.has("rgba(var(--ac-a78bfa),0.85)"), "rgba(var(--ac-…), a), tel qu'écrit dans le code");
  assert.ok(classes.has("red-400/80"), "classe Tailwind avec opacité");
  const rules = lightTextRules(src).filter((r) => r.alpha != null);
  assert.ok(rules.length > 30, `${rules.length} règles`);
  for (const r of rules) assert.ok(r.alphaUsed >= MIN_ALPHA && r.alphaUsed >= r.alpha, r.id);
  // la couleur vue (assombrie + opacité relevée) atteint le contraste minimal sur la surface claire
  const r = rules.find((x) => x.id === "rgba(148, 163, 184, 0.7)");
  assert.equal(r.alphaUsed, MIN_ALPHA);
  const dark = darkened([148, 163, 184], r.k), seen = dark.map((v, i) => v * r.alphaUsed + LIGHT_SURFACE[i] * (1 - r.alphaUsed));
  assert.ok(contrast(seen, LIGHT_SURFACE) >= MIN_CONTRAST, `contraste ${contrast(seen, LIGHT_SURFACE).toFixed(2)}`);
  assert.match(section, /\[style\^="color: rgba\(148, 163, 184, 0\.7\)"\],\[style\*=" color: rgba\(148, 163, 184, 0\.7\)"\]\) \{ color: oklch\(from rgb\(148 163 184\) calc\(l \* \([0-9.]+ \+ [0-9.]+ \* var\(--lt-keep, 0\)\)\) c h \/ calc\(0\.8 \+ -0\.1 \* var\(--lt-keep, 0\)\)\) !important/);
  assert.match(section, /\.text-red-400\\\/80\) \{ color: oklch\(from var\(--color-red-400\)/);
  // un texte plein (opacité 1) n'a aucune clause d'opacité
  assert.ok(lightTextRules(src).filter((x) => x.alpha == null).every((x) => !section.includes(`/* ${x.id} */\n:root[data-theme="light"] :is(${x.selector}) { color: oklch(from ${x.from} calc(l * (${x.k} + ${+(1 - x.k).toFixed(2)} * var(--lt-keep, 0))) c h /`)));
});

test("fenêtres et menus du thème clair : fond quasi opaque (62 % de blanc sur le voile sombre donnait une fenêtre grise et délavée)", () => {
  const index = fs.readFileSync(path.join(src, "index.css"), "utf8");
  const light = index.slice(index.indexOf(':root[data-theme="light"] {'), index.indexOf("/* Smoked-glass boost"));
  const m = /--surface-1-strong:\s*rgba\(var\(--ac-([0-9a-f]{6})\),\s*([0-9.]+)\)/.exec(light);
  assert.ok(m, "--surface-1-strong du thème clair");
  assert.ok(Number(m[2]) >= 0.95, `opacité ${m[2]}`);
  assert.ok(luminanceOf(parseHex(m[1])) > 0.8, "fond clair");
  // bandeau d'affiche de la fiche animé : reste sombre
  assert.match(fs.readFileSync(path.join(src, "components", "AnimeDetailModal.jsx"), "utf8"), /data-keep-bright=""[^>]*rounded-t-3xl/);
});

test("îlots sombres : pastilles noires sur affiches et scène du Moodboard gardent leurs textes clairs ; les voiles de fenêtre (fixed) non", () => {
  assert.ok(ISLANDS.every((s) => s.endsWith(":not(.fixed)")));
  assert.match(section, /\[data-keep-bright\]:not\(\.fixed\)/);
  assert.match(section, /\[data-hud\]:not\(\.fixed\)/);
  assert.match(section, /\[class\*="bg-black\/8"\]:not\(\.fixed\)/);
  assert.match(fs.readFileSync(path.join(src, "components", "MoodStage.jsx"), "utf8"), /data-keep-bright/);
});

test("cartes HUD du profil (bureau) : repérées par data-hud, fond sombre opaque et gris du thème sombre rétablis dans le thème clair", () => {
  const hud = fs.readFileSync(path.join(src, "views", "profileHud.jsx"), "utf8");
  assert.equal((hud.match(/data-hud=""/g) || []).length, 2, "HudCard et HudTabs portent data-hud");
  assert.match(fs.readFileSync(path.join(src, "views", "ProfileView.jsx"), "utf8"), /data-hud=/);
  const index = fs.readFileSync(path.join(src, "index.css"), "utf8");
  assert.match(index, /:root\[data-theme="light"\] \[data-hud\] \{ background-color: rgb\(var\(--ac-0a061e\)\) !important; \}/);
  const reset = index.slice(index.indexOf(':root[data-theme="light"] :is([data-hud], [data-keep-bright]) {'));
  for (const token of ["--text-1: #f8fafc", "--text-3: #64748b", "--fg-rgb: 255,255,255"]) assert.ok(reset.includes(token), token);
  // les valeurs rétablies sont bien celles du thème sombre (:root)
  const root = index.slice(index.indexOf(":root {"), index.indexOf(':root[data-theme="light"] {'));
  for (const token of ["--text-1: #f8fafc", "--text-2: #94a3b8", "--text-3: #64748b", "--text-4: #475569", "--fg-rgb: 255,255,255"]) assert.ok(root.includes(token), `:root ${token}`);
});

test("nuances Tailwind : rampe lue correctement", () => {
  const [r, g, b] = shadeRgb("amber-400");                                // Tailwind 4 : oklch(82.8% 0.189 84.4) ≈ #fcbb00
  assert.ok(r > 240 && g > 170 && g < 200 && b < 40, `amber-400 = ${[r, g, b]}`);
  assert.equal(shadeRgb("nope-400"), null);
});

test("thème sombre : aucune règle de lisibilité n'est écrite hors du thème clair", () => {
  const head = css.slice(0, css.indexOf("LISIBILITÉ EN THÈME CLAIR"));
  assert.ok(!/--lt-keep/.test(head));
});
