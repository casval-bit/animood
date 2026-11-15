// ─── Définition des palettes (réglages de teinte) ───────────────────────────────────────────────────────────────
// `hue` : points d'ancrage [teinte d'origine, teinte d'arrivée] en degrés OKLCH.
//   Origine : bleu ≈ 260, indigo ≈ 277, violet ≈ 293, violet clair ≈ 304, fuchsia ≈ 322, rose ≈ 354, rouge-rose ≈ 376 (16°).
//   Arrivée : rouge ≈ 25, orange ≈ 48, ambre ≈ 70, jaune ≈ 86, vert ≈ 150, émeraude ≈ 162, turquoise ≈ 183, rose ≈ 354.
// `lift`  : part de l'écart de clarté de la famille d'arrivée appliquée au thème sombre / clair (1 = rampe complète).
// `chroma`: coefficient d'intensité des couleurs.
// `whiteContrast` (facultatif, 3,3 par défaut) : contraste minimal avec le blanc des couleurs qui servaient de fond à du texte blanc
//   (boutons…) : on les fonce juste ce qu'il faut pour que le texte reste lisible (les jaunes / oranges sont naturellement très clairs).
// `hud`   : teinte HSL de départ et sens/amplitude des barres brillantes du profil (défaut : 262 et 1 = violet → fuchsia).
// `overrides` (facultatif) : couleur imposée pour une clé précise, par thème : { "6d5bff": { dark: "f59e0b", light: "b45309" } }.
export const PALETTES = {
  // jaune / orange : indigo → ambre, violet → orange, rose → rouge-rosé (dégradé « coucher de soleil »)
  sunset: { hue: [[225, 100], [260, 84], [277, 74], [293, 50], [304, 38], [322, 27], [354, 14], [376, 8]], lift: { dark: 1, light: 0.4 }, chroma: 1, hud: { h0: 40, hs: -0.7 } },
  // rouge / saumon : indigo → saumon-orangé, violet → rouge, rose → rouge-rosé
  coral: { hue: [[225, 58], [260, 48], [277, 40], [293, 27], [304, 20], [322, 12], [354, 4], [376, 0]], lift: { dark: 1, light: 0.4 }, chroma: 1, hud: { h0: 14, hs: -0.55 } },
  // vert / rose : bleu, indigo, violet → verts ; fuchsia, rose restent roses
  garden: { hue: [[225, 215], [260, 195], [277, 174], [293, 162], [304, 154], [313, 150], [316, 345], [322, 345], [354, 354], [376, 376]], lift: { dark: 1, light: 0.4 }, chroma: 1, hud: { h0: 135, hs: 0.8 } },
};
export const PALETTE_IDS = Object.keys(PALETTES);
