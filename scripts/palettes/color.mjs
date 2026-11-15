// ─── Couleurs : conversions sRGB ⇄ OKLCH et changement de teinte ────────────────────────────────────────────────
// OKLCH = clarté (L), intensité (C) et teinte (h) « perceptuelles » : on peut changer la teinte d'une couleur (violet → orange)
// sans que sa clarté change, donc sans perdre le contraste texte / fond prévu à l'origine.

const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const fromLin = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

export function rgbToOklch(r, g, b) {
  const [R, G, B] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  return { L, C, h: C < 1e-4 ? 0 : (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360 };
}

const oklchToLinear = (L, C, h) => {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
};
const inGamut = (lin) => lin.every((v) => v >= -0.0005 && v <= 1.0005);

/** OKLCH → [r,g,b] entiers 0-255. Si la couleur sort du « sRGB », on baisse l'intensité jusqu'à ce qu'elle y rentre. */
export function oklchToRgb(L, C, h) {
  L = Math.min(1, Math.max(0, L));
  let lin = oklchToLinear(L, C, h);
  if (!inGamut(lin)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; (inGamut(oklchToLinear(L, mid, h)) ? (lo = mid) : (hi = mid)); }
    lin = oklchToLinear(L, lo, h);
  }
  return lin.map((v) => Math.min(255, Math.max(0, Math.round(fromLin(Math.min(1, Math.max(0, v)))))));
}

export const hex = ([r, g, b]) => [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
export const parseHex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Teinte d'arrivée pour une teinte d'origine : interpolation linéaire entre des points d'ancrage [origine, arrivée] triés. */
export function mapHue(h, anchors) {
  if (h < anchors[0][0] && h + 360 <= anchors[anchors.length - 1][0] + 20) h += 360;   // teintes « rouges » juste après 360° : 0-20° → 360-380°
  const a = anchors;
  if (h <= a[0][0]) return ((h + a[0][1] - a[0][0]) % 360 + 360) % 360;
  if (h >= a[a.length - 1][0]) return ((h + a[a.length - 1][1] - a[a.length - 1][0]) % 360 + 360) % 360;
  for (let i = 1; i < a.length; i++) if (h <= a[i][0]) {
    const [x0, y0] = a[i - 1], [x1, y1] = a[i], t = (h - x0) / (x1 - x0);
    return ((y0 + t * (y1 - y0)) % 360 + 360) % 360;
  }
  return h;
}
