// ─── Export en image (tierlist, grille AniMood 2026) : lecture fiable des affiches, PNG, presse-papiers, partage ──────────────────────
// Les serveurs d'images n'envoient pas toujours l'en-tête CORS : le navigateur sait les afficher mais pas les « lire » pour les
// dessiner dans le PNG (résultat : des affiches toutes noires). On essaie donc, dans l'ordre :
//   1. la lecture directe (marche quand le serveur d'images autorise le CORS) ;
//   2. notre proxy /api/img (fonction Vercel / serveur de développement), qui renvoie l'image depuis notre propre domaine ;
//   3. images.weserv.nl, un proxy public, en dernier secours.
// Si rien ne marche pour une affiche, l'export y écrit le titre (comme à l'écran) au lieu d'un carré noir.
const IMAGE_SOURCES = [
  (s) => s,
  (s) => `/api/img?u=${encodeURIComponent(s)}`,
  (s) => `https://images.weserv.nl/?url=${encodeURIComponent(String(s).replace(/^https?:\/\//, ""))}&w=260&output=jpg`,
];
const blobToDataUrl = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });

export async function posterToDataUrl(src) {
  if(String(src).startsWith("data:")) return src;
  for(const build of IMAGE_SOURCES) {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(build(src), { signal: ctrl.signal, ...(build === IMAGE_SOURCES[0] ? { mode: "cors", referrerPolicy: "no-referrer" } : {}) });
      if(!r.ok) continue;
      const blob = await r.blob();
      if(blob.size < 64 || !String(blob.type).startsWith("image/")) continue;   // page d'erreur / réponse vide
      return await blobToDataUrl(blob);
    } catch { /* source suivante */ } finally { clearTimeout(to); }
  }
  return null;
}

/** Charge toutes les adresses avec au plus `n` requêtes en parallèle (évite de saturer le serveur avec 150 affiches d'un coup). */
export async function loadPosters(srcs, n = 8) {
  const out = {}; let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, srcs.length) }, async () => {
    while(next < srcs.length) { const s = srcs[next++]; out[s] = await posterToDataUrl(s); }
  }));
  return out;
}

/**
 * html2canvas place le texte d'après une « ligne de base » qu'il mesure avec un petit GIF 1×1 (<img>) glissé dans la VRAIE page, à côté d'un
 * texte d'essai. Or le CSS de base de Tailwind passe toutes les <img> en « display:block » : le GIF tombe sous le texte au lieu d'être posé sur
 * sa ligne, la mesure se trompe de 5 à 7 px, et TOUT le texte de l'image sortait trop bas (les noms de cases sur deux lignes de la grille
 * étaient coupés en deux). On remet ce GIF-là, et lui seul (reconnu à son adresse), en « inline ».
 */
export const MEASURE_IMG_FIX_CSS = 'img[src^="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"]{display:inline!important;width:1px!important;height:1px!important}';
function fixTextBaseline() {
  if(document.getElementById("h2c-measure-fix")) return;
  const st = document.createElement("style");
  st.id = "h2c-measure-fix";
  st.textContent = MEASURE_IMG_FIX_CSS;
  document.head.appendChild(st);
}

/**
 * Dessine un bloc de la page dans un canvas. Les affiches (img[data-raw]) sont relues via loadPosters puis écrites en « data URL » ;
 * les éléments marqués data-no-export="1" ne sont pas dessinés.
 * L'image est toujours dessinée en thème SOMBRE, quel que soit le thème de l'écran : les cartes exportées ont un fond sombre fixe, et les
 * règles du thème clair (src/palettes.css) écrivent des couleurs en oklch() que html2canvas ne sait pas lire : sans cela, l'export
 * échouait en thème clair (« Attempting to parse an unsupported color function "oklch" »).
 */
export async function renderToCanvas(node, { backgroundColor = "#0f0a1e", scale = 2 } = {}) {
  const { default: html2canvas } = await import("html2canvas");
  fixTextBaseline();
  const imgs = [...node.querySelectorAll("img[data-raw]")];
  const data = await loadPosters([...new Set(imgs.map(i => i.dataset.raw))]);
  return html2canvas(node, {
    backgroundColor, scale, useCORS: true, ignoreElements: (el) => el.dataset?.noExport === "1",
    onclone: (doc) => {
      doc.documentElement.setAttribute("data-theme", "dark");
      doc.querySelectorAll("img[data-raw]").forEach(img => {
        const d = data[img.dataset.raw];
        if(d) { img.removeAttribute("loading"); img.src = d; return; }
        // Affiche introuvable : on écrit le titre, comme à l'écran (jamais de carré noir)
        const box = doc.createElement("div");
        box.textContent = img.alt || "";
        Object.assign(box.style, { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
          boxSizing: "border-box", padding: "2px", overflow: "hidden", fontSize: "8px", lineHeight: "1.1", color: "rgba(255,255,255,.75)",
          background: "linear-gradient(160deg,#2a1850,#150c30)" });
        img.replaceWith(box);
      });
    },
  });
}

/** Nom de fichier sûr (lettres, chiffres, tirets) : « Ma grille 2026 ! » → « Ma_grille_2026_ ». */
export const safeFileName = (name, fallback = "animood") => (String(name || "").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || fallback);

export const canvasToBlob = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("canvas vide"))), "image/png"));

export function downloadCanvas(canvas, fileName) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function copyCanvas(canvas) {
  const blob = await canvasToBlob(canvas);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Le navigateur sait-il partager un fichier image (feuille de partage du téléphone, de Windows, de macOS) ? */
export function canShareImages() {
  try {
    if(typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || typeof File === "undefined") return false;
    return navigator.canShare({ files: [new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" })] });
  } catch { return false; }
}

/** Ouvre la feuille de partage avec l'image. Renvoie "shared", ou "cancelled" si la personne a fermé la feuille. */
export async function shareCanvas(canvas, { fileName, title, text }) {
  const blob = await canvasToBlob(canvas);
  const file = new File([blob], fileName, { type: "image/png" });
  try {
    await navigator.share({ files: [file], title, text });
    return "shared";
  } catch(e) {
    if(e?.name === "AbortError") return "cancelled";
    throw e;
  }
}
