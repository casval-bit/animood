# Palettes de couleurs (appli de bureau)

L'appli de bureau propose, dans **Paramètres → Préférences → Couleurs**, des palettes qui remplacent le bleu / violet de la marque
(en plus du thème sombre / clair, qui reste indépendant) :

| id        | nom (FR)        | dégradé de marque                  |
|-----------|-----------------|------------------------------------|
| `default` | Bleu / violet   | indigo → violet → rose (d'origine) |
| `sunset`  | Jaune / orange  | ambre → orange → rouge-rosé        |
| `coral`   | Rouge / saumon  | orangé → rouge → rose              |
| `garden`  | Vert / rose     | turquoise → vert → rose            |

Le choix est mémorisé dans `localStorage` (`animood_palette`) et posé sur `<html data-palette="…">` **avant le premier rendu**
(`src/main.jsx`), uniquement quand `<html data-app="desktop">` est présent (Electron). Le site web ne lit ni n'écrit rien de tout ça :
il garde exactement ses couleurs d'origine.

## Comment ça marche

Les couleurs « de marque » (bleu, indigo, violet, fuchsia, rose) ne sont plus écrites en dur dans le code, mais sous forme de variables CSS :

```jsx
style={{ background: "rgba(var(--ac-8b5cf6),0.18)", color: "rgb(var(--ac-c4b5fd))" }}   // avant : "rgba(139,92,246,.18)" / "#c4b5fd"
```

`--ac-<hex>` contient les trois composantes `r, g, b` de la couleur d'origine : **sans palette, le rendu est strictement identique à avant**
(vérifié pixel par pixel). `src/palettes.css` redéfinit ces variables pour chaque palette (et les familles Tailwind `violet-*`, `indigo-*`,
`purple-*`, `fuchsia-*`, `pink-*`, `rose-*`, utilisées telles quelles dans les `className`), en thème sombre et en thème clair.

`src/palettes.css` est **généré** — ne pas le modifier à la main :

```
npm run palettes            # régénère src/palettes.css
npm run palettes -- --check # vérifie qu'il est à jour (c'est aussi un test de `npm test`)
```

La conversion (dans `scripts/palettes/`) travaille en OKLCH : pour chaque couleur d'origine, on garde sa « place » dans sa famille Tailwind
(nuance 50 … 950, repérée par sa clarté), on change la teinte selon des points d'ancrage, puis on reprend la clarté et l'intensité de la même
nuance dans la famille d'arrivée. Un violet moyen devient donc un orange moyen (pas un marron), un fond très sombre reste très sombre.

**Garde-fou de lisibilité** : les jaunes et les oranges sont naturellement bien plus clairs que les bleus / violets, et beaucoup de couleurs de
marque servent de fond à du texte blanc (boutons, pastilles). Une couleur qui tenait au moins 3 de contraste avec le blanc le garde donc
(plafonné à `whiteContrast`, 3,3 par défaut dans `spec.mjs`) : le générateur la fonce juste ce qu'il faut, sans changer sa teinte. Les couleurs
pâles d'origine (textes d'accent, lueurs…) ne sont pas touchées : elles restent bien claires, par exemple un vrai jaune pour les accents du
thème sombre. Un test (`tests/palettes.test.mjs`) vérifie ce contraste pour toutes les palettes, en sombre et en clair.

## Écrire de nouvelles couleurs dans le code

- Couleur d'interface (bouton, bordure, lueur, dégradé, SVG…) dans la gamme bleu → violet → rose : `rgb(var(--ac-xxxxxx))` ou
  `rgba(var(--ac-xxxxxx),0.3)`, où `xxxxxx` est l'hexadécimal minuscule de la couleur voulue. Le générateur prend automatiquement toutes les
  clés utilisées dans `src/` ; relancer `npm run palettes` (le test `npm test` le rappelle si on l'oublie).
- Besoin d'un « `${couleur}33` » (suffixe hexadécimal d'opacité) : utiliser `withAlpha(couleur, "33")` (`src/utils/withAlpha.js`).
- **Couleurs de données** (humeurs, catégories de graphiques, couleurs des plateformes de streaming, statuts, confettis, export d'image
  de la Tierlist, cadres et badges) : à laisser en hexadécimal, elles ne doivent pas changer avec la palette.
- Canvas (`ctx.fillStyle`, `html2canvas`) : `var()` n'y fonctionne pas, garder une couleur fixe.

## Ajouter ou régler une palette

1. `scripts/palettes/spec.mjs` : ajouter l'entrée (points d'ancrage de teinte, `lift`, `chroma`, `hud`, éventuellement `whiteContrast`) ou
   ajuster une existante ; une couleur précise peut être imposée avec `overrides`.
2. `npm run palettes`.
3. `src/constants/palettes.js` : ajouter `{ id, swatch }` (les 3 pastilles d'aperçu — le test les compare au générateur) ;
   `src/constants/settingsI18n.js` : ajouter le nom FR / EN dans `paletteNames`.
