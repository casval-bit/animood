// Extracteur ZIP en Node pur : aucune dépendance, aucun outil externe (tar, unzip, PowerShell).
//
// Pourquoi : l'installateur d'Electron utilise « extract-zip », qui ne termine jamais sous Node 24 : le processus
// s'arrête sans erreur, avant d'avoir extrait quoi que ce soit, et laisse un dossier electron/dist à moitié vide
// (puis « Electron failed to install correctly »). Ce module sert à scripts/ensure-electron.mjs.
//
// Gère : fichiers « stored » et « deflate », dossiers, droits Unix (bit exécutable), liens symboliques (zip macOS),
// contrôle CRC-32, protection contre les chemins « ../ » (zip-slip). Ne gère pas zip64 (> 4 Go) ni le chiffrement.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

/** Lit le répertoire central d'un zip (Buffer) et renvoie la liste des entrées. */
export function readZipEntries(buf) {
  let eocd = -1;
  const lowest = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("fichier zip invalide (fin de fichier introuvable)");

  const total = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("zip64 non géré");
  }

  const entries = [];
  let p = centralOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new Error("fichier zip invalide (répertoire central abîmé)");
    }
    const madeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttr = buf.readUInt32LE(p + 38);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error(`zip64 non géré (${name})`);
    }
    // Octet haut de « version made by » = 3 → zip créé sous Unix : les droits sont dans les 16 bits hauts de externalAttr.
    const mode = (madeBy >> 8) === 3 ? (externalAttr >>> 16) : 0;
    entries.push({ name, flags, method, crc, compressedSize, size, localOffset, mode });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function isInside(root, target) {
  return target === root || target.startsWith(root + path.sep);
}

/**
 * Extrait zipPath dans destDir (créé si besoin). Renvoie le nombre de fichiers écrits.
 * Lève une Error claire si le zip est abîmé, incomplet ou dangereux.
 */
export function extractZip(zipPath, destDir) {
  const buf = fs.readFileSync(zipPath);
  const entries = readZipEntries(buf);

  fs.mkdirSync(destDir, { recursive: true });
  const root = path.resolve(destDir);
  const realRoot = fs.realpathSync(root);
  let written = 0;

  for (const e of entries) {
    if (e.flags & 1) throw new Error(`entrée chiffrée non gérée (${e.name})`);

    const target = path.resolve(root, e.name);
    if (!isInside(root, target)) throw new Error(`entrée dangereuse dans le zip : ${e.name}`);

    if (e.name.endsWith("/")) { fs.mkdirSync(target, { recursive: true }); continue; }

    // Le dossier parent ne doit pas sortir de la destination (ex. lien symbolique vers l'extérieur).
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!isInside(realRoot, fs.realpathSync(path.dirname(target)))) {
      throw new Error(`entrée dangereuse dans le zip : ${e.name}`);
    }

    if (e.localOffset + 30 > buf.length || buf.readUInt32LE(e.localOffset) !== SIG_LOCAL) {
      throw new Error(`fichier zip invalide (entrée ${e.name})`);
    }
    const dataStart = e.localOffset + 30 + buf.readUInt16LE(e.localOffset + 26) + buf.readUInt16LE(e.localOffset + 28);
    const raw = buf.subarray(dataStart, dataStart + e.compressedSize);
    if (raw.length !== e.compressedSize) throw new Error(`zip tronqué (${e.name})`);

    let data;
    if (e.method === 0) data = raw;
    else if (e.method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`méthode de compression ${e.method} non gérée (${e.name})`);

    if (data.length !== e.size) throw new Error(`taille incorrecte (${e.name})`);
    if (typeof zlib.crc32 === "function" && zlib.crc32(data) !== e.crc) {
      throw new Error(`contrôle CRC incorrect (${e.name}) : le zip est abîmé`);
    }

    if ((e.mode & S_IFMT) === S_IFLNK) {
      const linkTarget = data.toString("utf8");
      if (!isInside(realRoot, path.resolve(path.dirname(target), linkTarget))) {
        throw new Error(`lien symbolique dangereux dans le zip : ${e.name}`);
      }
      fs.rmSync(target, { force: true });
      fs.symlinkSync(linkTarget, target);
    } else {
      fs.rmSync(target, { force: true });
      fs.writeFileSync(target, data);
      const perm = e.mode & 0o777;
      if (perm && process.platform !== "win32") fs.chmodSync(target, perm);
    }
    written++;
  }
  return written;
}
