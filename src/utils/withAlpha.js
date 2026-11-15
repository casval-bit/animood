// Ajoute de la transparence à une couleur CSS sans coller de suffixe hexadécimal à la main.
// Avant : `${couleur}33` — ne marche qu'avec un « #rrggbb ». Les couleurs de palette sont des variables (rgb(var(--ac-…))),
// donc withAlpha(couleur, "33") fait le bon calcul selon la forme de la couleur et donne le même résultat à l'écran :
//   « #rrggbb »              → « #rrggbb33 » (comme avant)
//   « rgb(var(--ac-rrggbb)) » → « rgba(var(--ac-rrggbb),0.2) » (couleur de palette)
//   toute autre couleur CSS   → color-mix(…) (hsl, nom de couleur, etc.)
export function withAlpha(color, hex2) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color + hex2;
  const alpha = parseInt(hex2, 16) / 255;
  const v = /^rgb\((var\(--ac-[0-9a-f]{6}\))\)$/.exec(color);
  if (v) return `rgba(${v[1]},${+alpha.toFixed(9)})`;
  return `color-mix(in srgb, ${color} ${+(alpha * 100).toFixed(4)}%, transparent)`;
}
