// ─── Lisibilité en thème clair : textes d'accent pâles ───────────────────────────────────────────────────────────
// Le code écrit beaucoup de textes d'accent pâles (violet clair, jaune, cyan, vert menthe…) pensés pour le fond sombre. Sur le fond
// clair du thème « Clair » leur contraste tombe à 1 – 1,5 : ils deviennent illisibles. Plutôt que de modifier des centaines d'endroits,
// on génère ici, pour chaque couleur de texte pâle trouvée dans src/, une règle qui la fonce quand <html data-theme="light"> :
// même teinte et même intensité (OKLCH), seule la clarté baisse, juste assez pour atteindre AIM_CONTRAST sur la surface claire la plus
// sombre. Quatre sortes de couleurs de texte sont traitées :
//   • les classes Tailwind `text-amber-400`, `text-indigo-300`… (la règle suit la palette choisie : on part de var(--color-…)), avec ou
//     sans opacité (`text-red-400/80`) ;
//   • les couleurs de marque `color: "rgb(var(--ac-c084fc))"` (idem : la règle part de la variable, donc de la palette) ;
//   • les couleurs écrites en dur `color: "#fbbf24"` (humeurs, jeux, plateformes…), reconnues dans l'attribut style="" du DOM ;
//   • les mêmes couleurs semi-transparentes, `color: "rgba(148,163,184,.7)"` ou `rgba(var(--ac-a78bfa),0.85)` : les légendes
//     « atténuées » du thème sombre ; en thème clair leur opacité est relevée à MIN_ALPHA (sinon elles disparaissent).
// Jamais assombris : les couleurs presque blanches (texte posé sur un bouton coloré) et celles qui contrastent déjà assez.
// Îlots sombres (cartes HUD du profil, scène du Moodboard, pastilles noires sur les affiches…) : `--lt-keep: 1` y annule
// l'assombrissement et le relèvement d'opacité ; voir ISLANDS.
import fs from "node:fs";
import path from "node:path";
import { rgbToOklch, oklchToRgb, parseHex } from "./color.mjs";
import { RAMPS, SHADES } from "./ramps.mjs";

/** Surface claire la plus sombre qui porte du texte (bas du dégradé de fond du thème clair) : c'est contre elle qu'on mesure. */
export const LIGHT_SURFACE = [205, 196, 230];
/** En dessous de ce contraste (WCAG AA, texte courant) une couleur de texte est « pâle » et sera assombrie. */
export const MIN_CONTRAST = 4.5;
/** Contraste visé après assombrissement (marge : le navigateur arrondit et gère le gamut autrement que nous). */
export const AIM_CONTRAST = 4.9;
/** Plus clair que ça (clarté OKLCH) : texte « sur couleur » (blanc sur un bouton…), jamais assombri. */
export const NEAR_WHITE = 0.93;
/** Opacité minimale d'un texte semi-transparent en thème clair (les légendes à 40 – 70 % du thème sombre y seraient illisibles). */
export const MIN_ALPHA = 0.8;
/** Facteur de clarté minimal (on ne fonce jamais en dessous : le texte virerait au noir). */
const MIN_FACTOR = 0.3;

/** Îlots sombres du thème clair : cartes HUD du profil (data-hud), scène du Moodboard et bandeau d'affiche (data-keep-bright), pastilles
 *  noires sur les affiches… (un fond `fixed` est un voile de fenêtre : exclu). src/index.css y rétablit aussi les gris du thème sombre
 *  pour data-hud et data-keep-bright. */
export const ISLANDS = [
  "[data-hud]", "[data-keep-bright]", ".bg-black", '[class*="bg-black/6"]', '[class*="bg-black/7"]', '[class*="bg-black/8"]', '[class*="bg-black/9"]',
].map((s) => `${s}:not(.fixed)`);

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Couleur vue par l'œil : `rgb` à l'opacité `a` posée sur la surface claire. */
const overSurface = (rgb, a) => rgb.map((v, i) => v * a + LIGHT_SURFACE[i] * (1 - a));

/** Couleur [r,g,b] obtenue en multipliant la clarté OKLCH par k (teinte et intensité conservées, intensité ramenée dans le sRGB si besoin). */
export function darkened(rgb, k) {
  const { L, C, h } = rgbToOklch(...rgb);
  return oklchToRgb(L * k, C, h);
}

/**
 * Facteur de clarté (0,3 – 1) qui amène une couleur à AIM_CONTRAST sur LIGHT_SURFACE ; null si elle n'a pas besoin d'être assombrie.
 * `alpha` : opacité du texte (le contraste se mesure sur la couleur vue, pas sur la couleur seule).
 */
export function darkenFactor(rgb, alpha = 1) {
  const { L } = rgbToOklch(...rgb);
  const seen = (k) => overSurface(k === 1 ? rgb : darkened(rgb, k), alpha);
  if (L >= NEAR_WHITE || contrast(seen(1), LIGHT_SURFACE) >= MIN_CONTRAST) return null;
  if (contrast(seen(MIN_FACTOR), LIGHT_SURFACE) < AIM_CONTRAST) return MIN_FACTOR;
  let lo = MIN_FACTOR, hi = 1;                                    // lo : contraste suffisant ; hi : insuffisant
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (contrast(seen(mid), LIGHT_SURFACE) >= AIM_CONTRAST) lo = mid; else hi = mid; }
  return Math.floor(lo * 100) / 100;
}

const HUES = Object.keys(RAMPS);
const CLASS_RE = new RegExp(`(?<![\\w:-])text-(${HUES.join("|")})-(\\d{2,3})(?:/(\\d{1,3}))?(?![\\w-])`, "g");
// Toute couleur écrite dans le code est candidate (le nom de la propriété varie : color, tone, accent…) : une règle ne s'applique que si
// l'attribut style="" du DOM contient exactement « color: <cette couleur> », donc seulement aux vrais textes.
const HEX_RE = /#([0-9a-fA-F]{6})\b/g;
const KEY_RE = /--ac-([0-9a-f]{6})\b/g;
// Couleurs semi-transparentes : on ne les cherche que sur les lignes qui écrivent « color: » (sinon on lirait tous les fonds et bordures).
const COLOR_LINE_RE = /\bcolor\s*:/;
const RGBA_KEY_RE = /rgba\(var\(--ac-([0-9a-f]{6})\),\s*([0-9.]+)\)/g;
const RGBA_LIT_RE = /rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*([0-9.]+)\)/g;

/** Couleurs de texte écrites dans src/ : { hexes, keys, classes, alphas } (ensembles de chaînes ; alphas : Map id → couleur semi-transparente). */
export function collectTextColors(srcDir) {
  const out = { hexes: new Set(), keys: new Set(), classes: new Set(), alphas: new Map() };
  const addAlpha = (id, selectorText, rgb, from, a) => { if (a > 0 && a < 1 && !out.alphas.has(id)) out.alphas.set(id, { id, text: selectorText, rgb, from, a }); };
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "frames") walk(p); continue; }    // frames/ : dessins SVG des cadres de profil, pas du texte
      if (!/\.jsx?$/.test(e.name)) continue;
      const text = fs.readFileSync(p, "utf8");
      for (const m of text.matchAll(HEX_RE)) out.hexes.add(m[1].toLowerCase());
      for (const m of text.matchAll(KEY_RE)) out.keys.add(m[1]);
      for (const m of text.matchAll(CLASS_RE)) out.classes.add(`${m[1]}-${m[2]}${m[3] ? `/${m[3]}` : ""}`);
      for (const line of text.split("\n")) {
        if (!COLOR_LINE_RE.test(line)) continue;
        // `rgba(var(--ac-xxx), a)` : le navigateur garde le texte tel qu'écrit dans l'attribut style
        for (const m of line.matchAll(RGBA_KEY_RE)) addAlpha(m[0], m[0], parseHex(m[1]), `rgb(var(--ac-${m[1]}))`, Number(m[2]));
        // `rgba(r,g,b,a)` : le navigateur le réécrit « rgba(r, g, b, a) »
        for (const m of line.matchAll(RGBA_LIT_RE)) {
          const rgb = [m[1], m[2], m[3]].map(Number), a = Number(m[4]);
          if (rgb.some((v) => v > 255)) continue;
          const lit = `rgba(${rgb.join(", ")}, ${a})`;
          addAlpha(lit, lit, rgb, `rgb(${rgb.join(" ")})`, a);
        }
      }
    }
  })(srcDir);
  return out;
}

/** Valeur sRGB d'une nuance Tailwind (clé « amber-400 »). */
export function shadeRgb(key) {
  const [hue, shade] = key.split("-");
  const i = SHADES.indexOf(Number(shade));
  if (!RAMPS[hue] || i < 0) return null;
  const [L, C, h] = RAMPS[hue][i];
  return oklchToRgb(L / 100, C, h);
}

const attr = (lit) => `[style^="color: ${lit}"],[style*=" color: ${lit}"]`;

/** Règles : [{ id, selector, from, k, alpha?, alphaUsed? }] triées, pour les couleurs qui ont besoin d'être assombries. */
export function lightTextRules(srcDir) {
  const { hexes, keys, classes, alphas } = collectTextColors(srcDir);
  const rules = [];
  for (const h of [...hexes].sort()) {
    const rgb = parseHex(h), k = darkenFactor(rgb);
    if (k == null) continue;
    const lit = `rgb(${rgb.join(", ")})`;                        // façon dont le navigateur écrit #rrggbb dans l'attribut style
    rules.push({ id: `#${h}`, selector: attr(lit), from: `rgb(${rgb.join(" ")})`, k });
  }
  for (const key of [...keys].sort()) {
    const k = darkenFactor(parseHex(key));
    if (k == null) continue;
    const v = `rgb(var(--ac-${key}))`;
    rules.push({ id: `--ac-${key}`, selector: attr(v), from: v, k });
  }
  for (const c of [...classes].sort()) {
    const [shade, pct] = c.split("/");
    const rgb = shadeRgb(shade);
    if (!rgb) continue;
    const a = pct == null ? 1 : Number(pct) / 100;
    const alphaUsed = Math.max(a, MIN_ALPHA);
    const k = darkenFactor(rgb, a < 1 ? alphaUsed : 1);
    if (k == null) continue;
    const sel = `.text-${shade}${pct == null ? "" : `\\/${pct}`}`;
    rules.push({ id: `text-${c}`, selector: sel, from: `var(--color-${shade})`, k, ...(a < 1 ? { alpha: a, alphaUsed } : {}) });
  }
  for (const al of [...alphas.values()].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const alphaUsed = Math.max(al.a, MIN_ALPHA);
    const k = darkenFactor(al.rgb, alphaUsed);
    if (k == null) continue;
    rules.push({ id: al.id, selector: attr(al.text), from: al.from, k, alpha: al.a, alphaUsed });
  }
  return rules;
}

/** Bloc CSS à ajouter à src/palettes.css. */
export function buildLightTextCss(srcDir) {
  const rules = lightTextRules(srcDir);
  const out = [];
  out.push(`/* ─── LISIBILITÉ EN THÈME CLAIR — textes d'accent pâles assombris ───────────────────────────────────────────────
   Généré par scripts/palettes/lighttext.mjs : ${rules.length} couleurs de texte pâles (contraste < ${MIN_CONTRAST} sur le fond clair) sont assombries
   (même teinte, clarté réduite pour atteindre ${AIM_CONTRAST} ; opacité relevée à ${MIN_ALPHA} au moins pour les textes semi-transparents)
   quand <html data-theme="light"> ; le thème sombre n'est pas touché.
   --lt-keep: 1 (hérité) désactive tout cela à l'intérieur d'un îlot sombre. */`);
  out.push(`:root[data-theme="light"] :is(${ISLANDS.join(", ")}) { --lt-keep: 1; }`);
  for (const r of rules) {
    const light = `calc(l * (${r.k} + ${+(1 - r.k).toFixed(2)} * var(--lt-keep, 0)))`;
    const alpha = r.alpha != null ? ` / calc(${r.alphaUsed} + ${+(r.alpha - r.alphaUsed).toFixed(2)} * var(--lt-keep, 0))` : "";
    out.push(`/* ${r.id} */`);
    out.push(`:root[data-theme="light"] :is(${r.selector}) { color: oklch(from ${r.from} ${light} c h${alpha}) !important; }`);
  }
  return out.join("\n") + "\n";
}
