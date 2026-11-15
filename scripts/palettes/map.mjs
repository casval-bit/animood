// ─── Conversion d'une couleur « bleu / violet » vers une autre palette ───────────────────────────────────────────
// Principe : on garde la « place » de la couleur dans sa famille Tailwind (nuance 50 … 950, repérée par sa clarté), on change la
// teinte selon des points d'ancrage, puis on prend la clarté et l'intensité de la même nuance dans la famille d'arrivée.
// Ainsi un violet moyen devient un orange moyen (et pas un marron foncé), un fond très sombre reste très sombre, une teinte
// très claire reste très claire. Le texte blanc sur un bouton garde à peu près le même contraste qu'avant.
import { rgbToOklch, oklchToRgb, mapHue } from "./color.mjs";
import { RAMPS } from "./ramps.mjs";

const U_MAX = 10;   // 11 nuances → positions fractionnaires 0 … 10
const famHue = (f) => RAMPS[f][5][2];                         // teinte « représentative » = celle de la nuance 500
const SORTED = Object.keys(RAMPS).sort((a, b) => famHue(a) - famHue(b));
const HUES = SORTED.map(famHue);

/** Deux familles voisines (par teinte, en cercle) et le poids de la seconde. */
function bracket(h) {
  const n = SORTED.length;
  if (h < HUES[0]) { const h0 = HUES[n - 1] - 360; return [SORTED[n - 1], SORTED[0], (h - h0) / (HUES[0] - h0)]; }
  for (let i = 0; i < n - 1; i++) if (h <= HUES[i + 1]) return [SORTED[i], SORTED[i + 1], (h - HUES[i]) / (HUES[i + 1] - HUES[i])];
  const h1 = HUES[0] + 360;
  return [SORTED[n - 1], SORTED[0], (h - HUES[n - 1]) / (h1 - HUES[n - 1])];
}

function sampleFamily(f, u) {
  const i = Math.min(U_MAX - 1, Math.max(0, Math.floor(u))), t = u - i;
  const a = RAMPS[f][i], b = RAMPS[f][i + 1];
  return { L: (a[0] + (b[0] - a[0]) * t) / 100, C: a[1] + (b[1] - a[1]) * t };
}

/** Clarté et intensité de la rampe « virtuelle » de teinte h à la position u (mélange des deux familles voisines). */
export function rampAt(h, u) {
  const [lo, hi, w] = bracket(((h % 360) + 360) % 360);
  const A = sampleFamily(lo, u), B = sampleFamily(hi, u);
  return { L: A.L + (B.L - A.L) * w, C: A.C + (B.C - A.C) * w };
}

/** Position u (0 = nuance 50, 10 = nuance 950) où la rampe de teinte h a la clarté L (bornée aux extrémités). */
function positionOf(h, L) {
  if (L >= rampAt(h, 0).L) return 0;
  if (L <= rampAt(h, U_MAX).L) return U_MAX;
  let lo = 0, hi = U_MAX;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; (rampAt(h, mid).L > L ? (lo = mid) : (hi = mid)); }
  return (lo + hi) / 2;
}

/**
 * Couleur {L, C, h} → couleur {L, C, h} de la palette `spec` (thème "dark" ou "light").
 *   spec.hue    : points d'ancrage [teinte d'origine, teinte d'arrivée]
 *   spec.lift   : { dark, light } part (0…1) de l'écart de clarté « famille d'arrivée » appliquée (1 = rampe complète)
 *   spec.chroma : coefficient d'intensité (1 = identique à la rampe)
 */
export function mapOklch({ L, C, h }, spec, theme = "dark") {
  if (C < 0.004) return { L, C, h };                         // gris purs : inchangés
  const h2 = mapHue(h, spec.hue);
  const u = positionOf(h, L);
  const src = rampAt(h, u), dst = rampAt(h2, u);
  const resid = L - src.L;                                    // ≠ 0 seulement au-delà des extrémités de la rampe (très sombre / très clair)
  const ratio = src.C > 1e-4 ? Math.min(C / src.C, 1.5) : 1;
  const lift = spec.lift?.[theme] ?? 1;
  const Lramp = dst.L + resid;
  return { L: L + lift * (Lramp - L), C: dst.C * ratio * (spec.chroma ?? 1), h: h2 };
}

// ── Garde-fou « texte blanc » ─────────────────────────────────────────────────────────────────────────────────────
// Beaucoup de couleurs de marque servent de fond à du texte blanc (boutons, pastilles). Les jaunes et les oranges sont
// naturellement bien plus clairs que les bleus / violets : sans précaution, le texte blanc devient illisible. Si la couleur
// d'origine tenait un contraste d'au moins 3 avec le blanc, la couleur d'arrivée garde ce contraste (plafonné à `whiteContrast`,
// 3,3 par défaut) : on la fonce juste ce qu'il faut, sans changer sa teinte.
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const contrastWhite = ([r, g, b]) => 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05);

function guardWhite(srcRgb, m, spec) {
  const need = Math.min(contrastWhite(srcRgb), spec.whiteContrast ?? 3.3);
  if (need < 3 || contrastWhite(oklchToRgb(m.L, m.C, m.h)) >= need) return m;
  let lo = 0, hi = m.L;                                         // plus grande clarté qui respecte encore le contraste
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; (contrastWhite(oklchToRgb(mid, m.C, m.h)) >= need ? (lo = mid) : (hi = mid)); }
  return { ...m, L: lo };
}

/** [r,g,b] (0-255) → [r,g,b] de la palette. `override` = [r,g,b] imposé pour cette couleur précise. */
export function mapRgb(rgb, spec, theme = "dark", override = null) {
  if (override) return override;
  const m = guardWhite(rgb, mapOklch(rgbToOklch(...rgb), spec, theme), spec);
  return oklchToRgb(m.L, m.C, m.h);
}

/** Même chose pour une couleur déjà en OKLCH (valeurs Tailwind d'origine, avant écrêtage sRGB). */
export function mapOklchToRgb(oklch, spec, theme = "dark") {
  const m = guardWhite(oklchToRgb(oklch.L, oklch.C, oklch.h), mapOklch(oklch, spec, theme), spec);
  return oklchToRgb(m.L, m.C, m.h);
}
