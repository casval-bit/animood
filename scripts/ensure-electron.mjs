#!/usr/bin/env node
// Vérifie qu'Electron est vraiment installé dans node_modules et le répare sinon.
//
// Le problème : l'installateur d'Electron (node_modules/electron/install.js) utilise « extract-zip », qui ne termine
// jamais sous Node 24. Il télécharge le zip puis s'arrête SANS erreur : electron/dist reste à moitié vide, il n'y a pas
// de path.txt, et « npm run electron:dev » plante avec « Electron failed to install correctly ».
//
// Ce script refait la fin de l'installation avec un extracteur en Node pur (scripts/lib/zipExtract.mjs) :
//   1. si Electron est déjà complet, il ne fait rien (et ne dit rien) ;
//   2. sinon il récupère le zip (cache d'Electron, ou téléchargement via @electron/get, comme l'installateur officiel) ;
//   3. il l'extrait dans node_modules/electron/dist et écrit path.txt.
//
// Lancé automatiquement par « npm run electron:dev » et run_desktop.bat. À la main : « npm run electron:fix ».
// Code de sortie : 0 = Electron utilisable, 1 = impossible de le réparer (le message explique pourquoi).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { extractZip } from "./lib/zipExtract.mjs";

const require = createRequire(import.meta.url);
const log = (m) => console.log(`[electron] ${m}`);

function fail(msg) {
  console.error(`[electron] ❌ ${msg}`);
  process.exit(1);
}

let electronDir;
try {
  electronDir = path.dirname(require.resolve("electron/package.json"));
} catch {
  fail("Le paquet « electron » est absent de node_modules. Lance d'abord : npm install");
}

const { version } = JSON.parse(fs.readFileSync(path.join(electronDir, "package.json"), "utf8"));
const platform = process.env.npm_config_platform || process.platform;
const arch = process.env.npm_config_arch || process.arch;

function getPlatformPath() {
  switch (platform) {
    case "mas":
    case "darwin": return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux": return "electron";
    case "win32": return "electron.exe";
    default: return fail(`Electron n'existe pas pour la plateforme « ${platform} ».`);
  }
}
const platformPath = getPlatformPath();
const distDir = path.join(electronDir, "dist");

// Même test que l'installateur officiel (node_modules/electron/install.js).
function isInstalled() {
  try {
    if (fs.readFileSync(path.join(distDir, "version"), "utf8").replace(/^v/, "") !== version) return false;
    if (fs.readFileSync(path.join(electronDir, "path.txt"), "utf8") !== platformPath) return false;
  } catch {
    return false;
  }
  return fs.existsSync(process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(distDir, platformPath));
}

// Dernier recours si l'extracteur intégré échoue : un outil du système.
function extractWithSystemTool(zipPath) {
  fs.mkdirSync(distDir, { recursive: true });
  const q = (s) => s.replace(/'/g, "''");
  const tries = process.platform === "win32"
    ? [
        ["tar", ["-xf", zipPath, "-C", distDir]],
        ["powershell", ["-NoProfile", "-NonInteractive", "-Command",
          `Expand-Archive -LiteralPath '${q(zipPath)}' -DestinationPath '${q(distDir)}' -Force`]],
      ]
    : [
        ["unzip", ["-q", "-o", zipPath, "-d", distDir]],
        ["tar", ["-xf", zipPath, "-C", distDir]],
      ];
  for (const [cmd, args] of tries) {
    const r = spawnSync(cmd, args, { stdio: "ignore" });
    if (r.status === 0) return cmd;
  }
  throw new Error("aucun outil d'extraction du système n'a fonctionné");
}

async function getDownloader() {
  const file = require.resolve("@electron/get", { paths: [electronDir] });
  const mod = await import(pathToFileURL(file).href);
  const fn = mod.downloadArtifact || mod.default?.downloadArtifact;
  if (!fn) throw new Error("@electron/get introuvable");
  return fn;
}

async function repair() {
  log(`Electron ${version} n'est pas complètement installé (bug connu de l'installateur d'Electron avec Node ${process.versions.node}). Réparation…`);
  const downloadArtifact = await getDownloader();
  const checksums = process.env.electron_use_remote_checksums
    ? undefined
    : require(path.join(electronDir, "checksums.json"));

  let lastError;
  // 1er essai avec le cache ; si le zip en cache est abîmé, 2e essai avec un téléchargement neuf.
  for (const force of [process.env.force_no_cache === "true", true]) {
    let zipPath;
    try {
      zipPath = await downloadArtifact({
        version,
        artifactName: "electron",
        force,
        cacheRoot: process.env.electron_config_cache,
        checksums,
        platform,
        arch,
      });
    } catch (e) {
      fail(`Téléchargement d'Electron impossible (${e.message}).\n` +
        "           Vérifie ta connexion internet, un proxy ou un antivirus qui bloquerait github.com, puis relance.");
    }

    fs.rmSync(distDir, { recursive: true, force: true });
    try {
      const n = extractZip(zipPath, distDir);
      log(`${n} fichiers extraits.`);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      log(`Extraction intégrée impossible (${e.message}).`);
      try {
        log(`Extraction avec « ${extractWithSystemTool(zipPath)} »…`);
        lastError = null;
        break;
      } catch (e2) {
        lastError = e2;
        if (!force) log("Le zip en cache semble abîmé : nouveau téléchargement…");
      }
    }
  }
  if (lastError) fail(`Extraction d'Electron impossible : ${lastError.message}`);

  // Comme l'installateur officiel : le fichier de types remonte d'un cran, puis path.txt est écrit en dernier.
  const dts = path.join(distDir, "electron.d.ts");
  if (fs.existsSync(dts)) fs.renameSync(dts, path.join(electronDir, "electron.d.ts"));
  fs.writeFileSync(path.join(electronDir, "path.txt"), platformPath);

  if (!isInstalled()) {
    fail("Electron est extrait mais l'exécutable reste introuvable. Un antivirus l'a peut-être mis en quarantaine : " +
      `regarde si « ${path.join(distDir, platformPath)} » existe et ajoute le dossier du projet aux exclusions.`);
  }
  log("✅ Electron est prêt.");
}

if (!isInstalled()) await repair();
