// ─── Palettes de couleurs (appli de bureau) ─────────────────────────────────────────────────────────────────────
// En plus du thème sombre / clair, l'appli de bureau propose des palettes qui remplacent le bleu / violet de la marque.
// Les vraies couleurs de chaque palette sont dans src/palettes.css (fichier généré par `npm run palettes`, voir docs/PALETTES.md).
// Ici : les identifiants, les pastilles d'aperçu du sélecteur, et la lecture / l'application du choix mémorisé.
// Le site web n'est jamais concerné : la palette n'est posée que si <html data-app="desktop"> (posé par main.jsx dans Electron).

export const PALETTE_STORAGE_KEY = "animood_palette";
export const DEFAULT_PALETTE = "default";

/** swatch : 3 couleurs d'aperçu (début, milieu, fin du dégradé de marque). Un test vérifie qu'elles collent au générateur. */
export const PALETTES = [
  { id: "default", swatch: ["#6d5bff", "#8b5cf6", "#ec4899"] },
  { id: "sunset",  swatch: ["#c87c00", "#e26b00", "#f43f65"] },
  { id: "coral",   swatch: ["#fd4f12", "#f04841", "#f14281"] },
  { id: "garden",  swatch: ["#00a07e", "#00a16f", "#ec4899"] },
];
export const PALETTE_IDS = PALETTES.map((p) => p.id);

export function readStoredPalette() {
  try {
    const id = localStorage.getItem(PALETTE_STORAGE_KEY);
    return PALETTE_IDS.includes(id) ? id : DEFAULT_PALETTE;
  } catch { return DEFAULT_PALETTE; }
}

/** Pose (ou retire) la palette sur <html>. Sans effet hors appli de bureau. */
export function applyPalette(id, root = document.documentElement) {
  if (root.dataset.app === "desktop" && PALETTE_IDS.includes(id) && id !== DEFAULT_PALETTE) root.dataset.palette = id;
  else delete root.dataset.palette;
}
