// ─── Palettes de couleurs (site, APK et appli de bureau) ─────────────────────────────────────────────────────────
// En plus du thème sombre / clair, l'appli propose des palettes qui remplacent le bleu / violet de la marque
// (Paramètres → Préférences → Couleurs). Les vraies couleurs de chaque palette sont dans src/palettes.css
// (fichier généré par `npm run palettes`, voir docs/PALETTES.md).
// Ici : les identifiants, les pastilles d'aperçu du sélecteur, et la lecture / l'application du choix mémorisé.
// Le choix est posé sur <html data-palette="…"> avant le premier rendu (src/main.jsx) ; sans choix, la palette d'origine s'applique.

export const PALETTE_STORAGE_KEY = "animood_palette";
export const DEFAULT_PALETTE = "default";

/**
 * swatch     : 3 couleurs d'aperçu (début, milieu, fin du dégradé de marque).
 * themeColor : couleur de la barre du navigateur sur mobile / PWA (<meta name="theme-color">) = le violet de la marque dans la palette.
 * Un test vérifie que ces couleurs collent au générateur (scripts/palettes).
 */
export const PALETTES = [
  { id: "default",   swatch: ["#6d5bff", "#8b5cf6", "#ec4899"], themeColor: "#7c3aed" },
  { id: "sunset",    swatch: ["#c87c00", "#e26b00", "#f43f65"], themeColor: "#de6800" },
  { id: "coral",     swatch: ["#fd4f12", "#f04841", "#f14281"], themeColor: "#dd2a2a" },
  { id: "garden",    swatch: ["#00a07e", "#00a16f", "#ec4899"], themeColor: "#0b9667" },
  { id: "ocean",     swatch: ["#0098cc", "#009bb3", "#009f8c"], themeColor: "#0093a9" },
  { id: "sakura",    swatch: ["#ec2fc9", "#e945b6", "#f04385"], themeColor: "#d226a1" },
  { id: "forest",    swatch: ["#00a174", "#00a260", "#5c9e00"], themeColor: "#009d5c" },
  { id: "graphite",  swatch: ["#828f9c", "#838f9a", "#838f9a"], themeColor: "#6c7783" },
  { id: "royal",     swatch: ["#b18700", "#b48600", "#8e5bf7"], themeColor: "#b48600" },
  { id: "cobalt",    swatch: ["#2b7fff", "#417ff5", "#e76700"], themeColor: "#1d62ea" },
  { id: "orchid",    swatch: ["#bf40ff", "#c34ef4", "#009e96"], themeColor: "#ad2cdf" },
  { id: "mocha",     swatch: ["#ba8150", "#b78258", "#bb805a"], themeColor: "#b78258" },
];
export const PALETTE_IDS = PALETTES.map((p) => p.id);

export function readStoredPalette() {
  try {
    const id = localStorage.getItem(PALETTE_STORAGE_KEY);
    return PALETTE_IDS.includes(id) ? id : DEFAULT_PALETTE;
  } catch { return DEFAULT_PALETTE; }
}

/** Pose (ou retire, pour la palette d'origine) la palette sur <html>. */
export function applyPalette(id, root = document.documentElement) {
  if (PALETTE_IDS.includes(id) && id !== DEFAULT_PALETTE) root.dataset.palette = id;
  else delete root.dataset.palette;
}

/** Couleur de la barre du navigateur (<meta name="theme-color">) assortie à la palette. Sans effet hors navigateur. */
export function applyThemeColor(id, doc = typeof document !== "undefined" ? document : null) {
  const meta = doc?.querySelector?.('meta[name="theme-color"]');
  const p = PALETTES.find((x) => x.id === id);
  if (meta && p) meta.setAttribute("content", p.themeColor);
}
