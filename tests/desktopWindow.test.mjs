// Appli de bureau (fenêtre sans cadre) : la zone « déplacer la fenêtre » de l'en-tête (84 px) reste active sous une fenêtre ouverte, et un bouton placé
// dans ces 84 px (le « ← » des Paramètres, le « Retour » des pages du pied de page) recevait le clic comme un début de déplacement : il ne répondait pas.
// Ces tests vérifient le correctif (marqueurs data-overlay / data-titlebar + règles de index.css) ; le comportement réel sous la souris est vérifié dans Electron.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const readLF = (...p) => fs.readFileSync(path.join(...p), "utf8").replace(/\r\n/g, "\n");   // Windows : git peut écrire les fichiers en CRLF

test("marqueurs : posés dans l'appli de bureau, absents sur le site web et l'APK (leur DOM ne change pas)", async () => {
  const { overlayProps, titleBarProps } = await import("../src/utils/desktopWindow.js");
  const had = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    delete globalThis.window;                                          // hors navigateur
    assert.deepEqual(overlayProps(), {});
    assert.deepEqual(titleBarProps(), {});
    globalThis.window = { animood: { isDesktop: false } };             // site web / APK : pas de pont Electron
    assert.deepEqual(overlayProps(), {});
    assert.deepEqual(titleBarProps(), {});
    globalThis.window = {};
    assert.deepEqual(overlayProps(), {});
    globalThis.window = { animood: { isDesktop: true } };              // appli de bureau
    assert.deepEqual(overlayProps(), { "data-overlay": "" });
    assert.deepEqual(titleBarProps(), { "data-titlebar": "" });
  } finally {
    if (had) Object.defineProperty(globalThis, "window", had); else delete globalThis.window;
  }
});

test("index.css : fenêtre = plus de zone de déplacement sous elle ; barre de titre = déplaçable, boutons exceptés ; rien hors de l'appli de bureau", () => {
  const css = readLF(src, "index.css");
  assert.match(css, /html\[data-app="desktop"\] \[data-overlay\]\s*\{\s*-webkit-app-region:\s*no-drag;\s*\}/);
  assert.match(css, /html\[data-app="desktop"\] \[data-titlebar\]\s*\{\s*-webkit-app-region:\s*drag;\s*\}/);
  assert.match(css, /html\[data-app="desktop"\] \[data-titlebar\] :is\(button, a, input, select, textarea, \[role="button"\]\)\s*\{\s*-webkit-app-region:\s*no-drag;\s*\}/);
  // le site web n'est jamais concerné : toute règle « app-region » commence par html[data-app="desktop"]
  for (const line of css.split("\n")) {
    if (/-webkit-app-region/.test(line) && /\{/.test(line)) assert.ok(line.startsWith('html[data-app="desktop"]'), line);
  }
});

// Calques « fixed » dont le z-index (≥ 300) est au-dessus de l'en-tête (200) : ils le recouvrent, mais sa zone de déplacement reste active en dessous.
const OVERLAYS = {                               // fenêtres : leur racine doit porter {...overlayProps()}
  "components/Modal.jsx": 2,                     // Modal + GameModal (fiches anime, salons de jeu, fenêtres…)
  "views/SettingsView.jsx": 1,
  "App.jsx": 1,                                  // PageWrapper : À propos, FAQ, Contact, Catégories & Moods, Modération, mentions légales, confidentialité
  "components/CustomPlatformsModal.jsx": 1,
};
const OTHERS = {                                 // pas des fenêtres plein écran : boutons de fenêtre, bandeau de mise à jour, notifications
  "components/DesktopWindowControls.jsx": 1,
  "components/DesktopUpdateBanner.jsx": 1,
  "components/QuickCardHost.jsx": 1,             // carte de survol des affiches : jamais sous les 92 px de l'en-tête, ne recouvre pas la zone de déplacement
  "views/GamesView.jsx": 1,
  "views/ForumView.jsx": 1,
};

function jsxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? jsxFiles(path.join(dir, e.name)) : e.name.endsWith(".jsx") ? [path.join(dir, e.name)] : []);
}
/** Lignes qui posent un calque « fixed » avec un z-index d'au moins 300 (style en ligne ou classes Tailwind). */
function layersAboveHeader(text) {
  return text.split("\n").filter((l) => {
    if (!/position:\s*"fixed"|(^|[\s"'`{])fixed([\s"'`}]|$)/.test(l)) return false;
    const z = /zIndex:\s*(\d+)/.exec(l) || /\bz-\[?(\d+)\]?/.exec(l);
    return z && Number(z[1]) >= 300;
  }).length;
}

test("garde-fou : chaque calque plein écran posé au-dessus de l'en-tête est une fenêtre marquée (overlayProps) ou une exception connue", () => {
  const found = {};
  for (const f of jsxFiles(src)) {
    const n = layersAboveHeader(readLF(f));
    if (n) found[path.relative(src, f).split(path.sep).join("/")] = n;
  }
  const expected = { ...OVERLAYS, ...OTHERS };
  assert.deepEqual(found, expected, "Calque plein écran nouveau, déplacé ou retiré. Si c'est une fenêtre qui recouvre l'en-tête : pose {...overlayProps()} sur sa racine "
    + "(src/utils/desktopWindow.js), puis mets à jour OVERLAYS dans tests/desktopWindow.test.mjs ; sinon, ajoute-le à OTHERS.");
});

test("les fenêtres portent bien le marqueur, les barres de titre des pages plein écran aussi", () => {
  for (const [file, n] of Object.entries(OVERLAYS)) {
    const text = readLF(src, file);
    assert.match(text, /from "\.{1,2}\/(?:utils\/)?desktopWindow\.js"/, `${file} : import de desktopWindow.js`);
    assert.ok((text.match(/\{\.\.\.overlayProps\(\)\}/g) || []).length >= n, `${file} : ${n} racine(s) avec {...overlayProps()}`);
  }
  for (const file of ["views/SettingsView.jsx", "App.jsx"]) {
    assert.match(readLF(src, file), /\{\.\.\.titleBarProps\(\)\}/, `${file} : barre de titre`);
  }
});

test("la bande de déplacement du haut et les boutons de fenêtre restent en place (on peut toujours déplacer la fenêtre sous une fenêtre ouverte)", () => {
  const ctl = readLF(src, "components", "DesktopWindowControls.jsx");
  assert.match(ctl, /height: 20, zIndex: 150, WebkitAppRegion: "drag"/);
  assert.match(ctl, /WebkitAppRegion: "no-drag"/);
  // rendue après l'appli (main.jsx) : dans l'ordre du document, elle passe après les fenêtres et garde ses 20 px de déplacement
  const main = readLF(src, "main.jsx");
  assert.ok(main.indexOf("<AniMoodApp />") < main.indexOf("<DesktopWindowControls />"));
});
