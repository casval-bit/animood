# Palettes de couleurs (site, APK et appli de bureau)

Le site (animood.me), l'APK (c'est le site, empaqueté en TWA) et l'appli de bureau proposent, dans **Paramètres → Préférences → Couleurs**,
12 palettes qui remplacent le bleu / violet de la marque (en plus du thème sombre / clair, qui reste indépendant) :

| id         | nom (FR)         | dégradé de marque                              |
|------------|------------------|------------------------------------------------|
| `default`  | Bleu / violet    | indigo → violet → rose (d'origine)             |
| `sunset`   | Jaune / orange   | ambre → orange → rouge-rosé                    |
| `coral`    | Rouge / saumon   | orangé → rouge → rose                          |
| `garden`   | Vert / rose      | turquoise → vert → rose                        |
| `ocean`    | Cyan / turquoise | bleu → cyan → turquoise                        |
| `sakura`   | Rose / magenta   | fuchsia → rose → rose-rouge                    |
| `forest`   | Émeraude / vert  | turquoise → émeraude → vert franc              |
| `graphite` | Gris / argent    | acier très peu intense (barres du profil grises) |
| `royal`    | Or / violet      | jaune doré → or → violet franc (le jaune glisse vers le violet) |
| `cobalt`   | Bleu / orange    | bleu franc → bleu → orange (couleurs complémentaires) |
| `orchid`   | Violet / turquoise | violet vif → violet → turquoise                |
| `mocha`    | Marron / caramel | brun chaud peu intense (barres du profil brunes) |

Le choix est mémorisé dans `localStorage` (`animood_palette`) et posé sur `<html data-palette="…">` **avant le premier rendu**
(`src/main.jsx`), partout : site, APK, Electron. `<meta name="theme-color">` (barre du navigateur sur mobile / PWA) prend la couleur de la
palette (`themeColor` dans `src/constants/palettes.js`). Sans choix, la palette d'origine s'applique : le rendu est celui d'avant.
L'APK affiche le site : un changement de palette arrive avec le prochain déploiement Vercel, sans nouvelle version de l'APK.

## Comment ça marche

Les couleurs « de marque » (bleu, indigo, violet, fuchsia, rose) ne sont plus écrites en dur dans le code, mais sous forme de variables CSS :

```jsx
style={{ background: "rgba(var(--ac-8b5cf6),0.18)", color: "rgb(var(--ac-c4b5fd))" }}   // avant : "rgba(139,92,246,.18)" / "#c4b5fd"
```

`--ac-<hex>` contient les trois composantes `r, g, b` de la couleur d'origine : **sans palette, le thème sombre est strictement identique à
avant** (vérifié sur des captures, écran par écran). `src/palettes.css` redéfinit ces variables pour chaque palette (et les familles Tailwind
`violet-*`, `indigo-*`, `purple-*`, `fuchsia-*`, `pink-*`, `rose-*`, utilisées telles quelles dans les `className`), en thème sombre et en
thème clair. Les règles ne dépendent d'aucune plateforme (pas de `data-app`) : le site et l'appli de bureau lisent le même fichier.

`src/palettes.css` est **généré** — ne pas le modifier à la main :

```
npm run palettes            # régénère src/palettes.css
npm run palettes -- --check # vérifie qu'il est à jour (c'est aussi un test de `npm test`)
```

La conversion (dans `scripts/palettes/`) travaille en OKLCH : pour chaque couleur d'origine, on garde sa « place » dans sa famille Tailwind
(nuance 50 … 950, repérée par sa clarté), on change la teinte selon des points d'ancrage, puis on reprend la clarté et l'intensité de la même
nuance dans la famille d'arrivée. Un violet moyen devient donc un orange moyen (pas un marron), un fond très sombre reste très sombre.

**Garde-fou de lisibilité du texte blanc** : les jaunes et les oranges sont naturellement bien plus clairs que les bleus / violets, et beaucoup
de couleurs de marque servent de fond à du texte blanc (boutons, pastilles). Une couleur qui tenait au moins 3 de contraste avec le blanc le
garde donc (plafonné à `whiteContrast`, 3,3 par défaut dans `spec.mjs`) : le générateur la fonce juste ce qu'il faut, sans changer sa teinte.
Les couleurs pâles d'origine (textes d'accent, lueurs…) ne sont pas touchées par cette étape : elles restent bien claires en thème sombre.
Un test (`tests/palettes.test.mjs`) vérifie ce contraste pour toutes les palettes, en sombre et en clair.

## Lisibilité en thème clair

Beaucoup de textes d'accent sont pensés pour un fond sombre (`text-indigo-300`, `text-amber-400`, `#fbbf24`, `rgba(148,163,184,.7)`…) : tels
quels sur les cartes claires du thème clair, ils deviennent presque invisibles. Trois mécanismes, tous limités à `:root[data-theme="light"]`
(le thème sombre n'est pas touché, un test le vérifie) :

1. **Gris du thème clair** (`src/index.css`) : `--text-3`, `--text-4`, `.text-slate-*`, `.bg-white/*`, `.border-white/*` sont repointés vers des
   tons choisis pour la surface claire (les textes gris atteignent un contraste d'au moins 4,5 sur les cartes) ; `--surface-1-strong` (fenêtres, menus) est presque opaque
   (un voile blanc à 62 % sur le fond noir des fenêtres donnait un gris délavé) ; `--accent-label` sert aux petites étiquettes d'accent.
2. **Textes colorés assombris automatiquement** (`scripts/palettes/lighttext.mjs`, section « LISIBILITÉ EN THÈME CLAIR » de `src/palettes.css`) :
   le générateur lit `src/`, repère les couleurs de texte pâles — classes Tailwind `text-<teinte>-<nuance>` (avec `/NN`), `rgb(var(--ac-…))`,
   valeurs en dur dans `style={{ color }}`, y compris semi-transparentes — et écrit pour chacune une règle qui multiplie sa clarté OKLCH par un
   facteur (même teinte, même intensité) jusqu'à un contraste d'au moins 4,5 (`MIN_CONTRAST`, visé : 4,9) avec la surface claire. Pour les
   classes Tailwind la règle part de la variable de la palette (`--color-indigo-300`…) : elle suit donc la palette choisie. Un texte
   semi-transparent voit son opacité relevée à 0,8 au moins (`MIN_ALPHA`). Les couleurs presque blanches (clarté OKLCH ≥ 0,93 : texte posé sur un
   bouton coloré) et les couleurs déjà foncées ne sont jamais modifiées.
3. **Îlots qui restent sombres en thème clair** : les cartes du profil (style HUD, `data-hud`), l'en-tête du bureau, la scène du Moodboard et
   le bandeau d'affiche de la fiche animé (`data-keep-bright`), les pastilles noires posées sur les affiches (`bg-black/60…90`). Dedans,
   `--lt-keep: 1` annule l'assombrissement et le relèvement d'opacité, et `src/index.css` y rétablit les gris du thème sombre. Les voiles de
   fenêtre (`.fixed`) ne sont pas des îlots.

Les règles utilisent la syntaxe de couleur relative CSS (`oklch(from … calc(l * k) c h)`) : Chromium ≥ 119, Safari ≥ 16.4, Firefox ≥ 128
(Electron 32 : ok). Sur un navigateur plus ancien, les textes gardent simplement leur couleur d'origine (plus pâle, mais jamais cassée).

À retenir en écrivant du code :
- Un texte d'accent pâle (indigo-300, amber-400, `#fbbf24`…) est géré tout seul : relancer `npm run palettes` après l'avoir ajouté (le test
  `tests/lighttext.test.mjs` le rappelle).
- Un texte **presque blanc** posé sur un fond clair en thème clair (légende sur une carte, par exemple) ne serait pas assombri : utiliser une
  classe `text-slate-*` (repointée par le thème clair) plutôt qu'une couleur en dur. Sur un fond toujours sombre, ajouter `data-keep-bright`
  (ou `data-hud`) au conteneur.
- Un fond sombre posé en dur (`bg-black/80`, `rgba(0,0,0,.7)`) fait de son contenu un îlot : les textes clairs y restent clairs.

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
3. `src/constants/palettes.js` : ajouter `{ id, swatch, themeColor }` (les 3 pastilles d'aperçu et la couleur de la barre du navigateur — le
   test les compare au générateur) ; `src/constants/settingsI18n.js` : ajouter le nom FR / EN dans `paletteNames`.
4. `tests/palettes.test.mjs` : ajouter un test de teinte pour la nouvelle palette (sur le modèle des autres).

Conseils de choix :
- Une palette doit se distinguer des autres : le test « deux palettes ne se ressemblent pas trop » compare les trois pastilles d'aperçu
  (indigo `6d5bff`, violet `8b5cf6`, rose `ec4899`) en OKLab et exige au moins un écart de 0,1 sur l'une d'elles. Un vert-turquoise de plus
  à côté de « Vert / rose » ou « Cyan / turquoise » échoue : mieux vaut une teinte dominante inédite, ou un autre bout de dégradé
  (jaune → violet, bleu → orange, violet → turquoise…).
- Le sélecteur affiche 4 palettes par rangée sur grand écran (2 sur mobile) : viser un nombre de palettes multiple de 4 pour ne pas laisser de
  rangée à moitié vide (12 aujourd'hui).
- Les jaunes et les oranges deviennent des ors / moutardes foncés à cause du garde-fou du texte blanc : c'est voulu (le texte blanc des boutons
  reste lisible) ; regarder le rendu en sombre **et** en clair avant de valider.

