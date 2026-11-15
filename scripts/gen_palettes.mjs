// Régénère src/palettes.css à partir de scripts/palettes/spec.mjs et des couleurs --ac-* utilisées dans src/.
//   npm run palettes          → écrit src/palettes.css
//   npm run palettes -- --check → vérifie que le fichier est à jour (code de sortie 1 sinon)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectKeys, buildCss } from "./palettes/generate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "src", "palettes.css");
const css = buildCss(collectKeys(path.join(root, "src")));

if (process.argv.includes("--check")) {
  const same = fs.existsSync(target) && fs.readFileSync(target, "utf8") === css;
  console.log(same ? "src/palettes.css est à jour." : "src/palettes.css est périmé : lance « npm run palettes ».");
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(target, css);
console.log(`src/palettes.css écrit (${css.split("\n").length} lignes).`);
