// ─── Génération de src/palettes.css ────────────────────────────────────────────────────────────────────────────
// Tout le code de l'appli écrit ses couleurs de marque sous la forme rgb(var(--ac-6d5bff)) / rgba(var(--ac-6d5bff),.4) : la variable
// --ac-<hex> contient les 3 composantes « r, g, b » de la couleur d'origine (le rendu par défaut est donc identique à avant).
// Pour chaque palette, ce fichier redéfinit ces variables (et les familles Tailwind violet / indigo / purple / fuchsia / pink / rose)
// quand <html data-app="desktop" data-palette="…"> est posé (appli de bureau seulement).
import fs from "node:fs";
import path from "node:path";
import { parseHex } from "./color.mjs";
import { mapRgb, mapOklchToRgb } from "./map.mjs";
import { RAMPS, SHADES } from "./ramps.mjs";
import { PALETTES } from "./spec.mjs";
import { hex } from "./color.mjs";

export const TAILWIND_FAMILIES = ["violet", "indigo", "purple", "fuchsia", "pink", "rose"];
const KEY_RE = /--ac-([0-9a-f]{6})\b/g;

/** Toutes les clés --ac-<hex> utilisées dans le code (hors fichier généré), triées. */
export function collectKeys(srcDir) {
  const keys = new Set();
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|mjs|css)$/.test(e.name) && e.name !== "palettes.css") for (const m of fs.readFileSync(p, "utf8").matchAll(KEY_RE)) keys.add(m[1]);
    }
  })(srcDir);
  return [...keys].sort();
}

const trip = (rgb) => rgb.join(", ");
const familyVars = (spec, theme) => TAILWIND_FAMILIES.flatMap((f) => SHADES.map((s, i) => {
  const [L, C, h] = RAMPS[f][i];
  return `  --color-${f}-${s}: #${hex(mapOklchToRgb({ L: L / 100, C, h }, spec, theme))};`;
}));

/** Couleur d'une clé pour une palette et un thème (tient compte des réglages « overrides » de la palette). */
export function paletteColor(key, id, theme = "dark") {
  const spec = PALETTES[id];
  return mapRgb(parseHex(key), spec, theme, spec.overrides?.[key]?.[theme] ? parseHex(spec.overrides[key][theme]) : null);
}

export function buildCss(keys) {
  const out = [];
  out.push(`/* ─── GÉNÉRÉ par scripts/gen_palettes.mjs (npm run palettes) — ne pas modifier à la main ─────────────────────────
   --ac-<hex> : couleur de marque d'origine (valeur par défaut = couleur écrite dans le code, rendu inchangé).
   Palettes : ${Object.keys(PALETTES).join(", ")} — actives seulement dans l'appli de bureau (<html data-app="desktop" data-palette="…">). */`);
  out.push(":root {");
  for (const k of keys) out.push(`  --ac-${k}: ${trip(parseHex(k))};`);
  out.push("  --hud-h0: 262;", "  --hud-hs: 1;", "}");
  for (const [id, spec] of Object.entries(PALETTES)) {
    for (const theme of ["dark", "light"]) {
      out.push("", `/* ${id} — thème ${theme === "dark" ? "sombre" : "clair"} */`);
      out.push(`html[data-app="desktop"][data-palette="${id}"]${theme === "light" ? '[data-theme="light"]' : ""} {`);
      for (const k of keys) out.push(`  --ac-${k}: ${trip(paletteColor(k, id, theme))};`);
      out.push(...familyVars(spec, theme));
      if (theme === "dark") out.push(`  --hud-h0: ${spec.hud.h0};`, `  --hud-hs: ${spec.hud.hs};`);
      out.push("}");
    }
  }
  return out.join("\n") + "\n";
}
