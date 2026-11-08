// Tests de l'extracteur ZIP (scripts/lib/zipExtract.mjs) : il remplace « extract-zip », qui plante sous Node 24.
// Lancer : npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { extractZip, readZipEntries } from "../scripts/lib/zipExtract.mjs";

// ── Mini-écrivain de zip, juste ce qu'il faut pour les tests ──────────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files : [{ name, data?: string|Buffer, deflate?: bool, mode?: number }] — un nom finissant par « / » est un dossier. */
function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const data = Buffer.from(f.data ?? "");
    const body = f.deflate ? zlib.deflateRawSync(data) : data;
    const method = f.deflate ? 8 : 0;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE((3 << 8) | 20, 4); // créé sous Unix → les droits sont dans externalAttr
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(((f.mode ?? 0o644) << 16) >>> 0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "animood-zip-"));
}
function writeZip(dir, files) {
  const zip = path.join(dir, "test.zip");
  fs.writeFileSync(zip, makeZip(files));
  return zip;
}

test("extrait fichiers stockés, compressés et sous-dossiers", () => {
  const dir = tmp();
  const big = "AniMood ".repeat(5000);
  const zip = writeZip(dir, [
    { name: "version", data: "32.3.3" },
    { name: "locales/", mode: 0o755 },
    { name: "locales/fr.pak", data: big, deflate: true },
    { name: "a/b/c.txt", data: "profond", deflate: true },
  ]);
  const out = path.join(dir, "dist");
  assert.equal(extractZip(zip, out), 3);
  assert.equal(fs.readFileSync(path.join(out, "version"), "utf8"), "32.3.3");
  assert.equal(fs.readFileSync(path.join(out, "locales", "fr.pak"), "utf8"), big);
  assert.equal(fs.readFileSync(path.join(out, "a", "b", "c.txt"), "utf8"), "profond");
});

test("lit le répertoire central", () => {
  const dir = tmp();
  const zip = writeZip(dir, [{ name: "x.txt", data: "1" }, { name: "y/", mode: 0o755 }]);
  const entries = readZipEntries(fs.readFileSync(zip));
  assert.deepEqual(entries.map((e) => e.name), ["x.txt", "y/"]);
});

test("garde le bit exécutable et les liens symboliques (Linux / macOS)", { skip: process.platform === "win32" }, () => {
  const dir = tmp();
  const zip = writeZip(dir, [
    { name: "electron", data: "#!/bin/sh\n", mode: 0o100755 },
    { name: "lib.so", data: "binaire", mode: 0o100644 },
    { name: "lib-link.so", data: "lib.so", mode: 0o120777 },
  ]);
  const out = path.join(dir, "dist");
  extractZip(zip, out);
  assert.ok(fs.statSync(path.join(out, "electron")).mode & 0o100, "exécutable conservé");
  assert.ok(!(fs.statSync(path.join(out, "lib.so")).mode & 0o100), "non exécutable conservé");
  assert.equal(fs.readlinkSync(path.join(out, "lib-link.so")), "lib.so");
});

test("refuse les chemins qui sortent du dossier (zip-slip)", () => {
  const dir = tmp();
  const zip = writeZip(dir, [{ name: "../evil.txt", data: "x" }]);
  assert.throws(() => extractZip(zip, path.join(dir, "dist")), /dangereuse/);
  assert.equal(fs.existsSync(path.join(dir, "evil.txt")), false);
});

test("refuse un lien symbolique qui pointe hors du dossier", { skip: process.platform === "win32" }, () => {
  const dir = tmp();
  const zip = writeZip(dir, [{ name: "link", data: "../../etc", mode: 0o120777 }]);
  assert.throws(() => extractZip(zip, path.join(dir, "dist")), /dangereux/);
});

test("détecte un zip abîmé (CRC) et un fichier qui n'est pas un zip", { skip: typeof zlib.crc32 !== "function" }, () => {
  const dir = tmp();
  const buf = makeZip([{ name: "a.bin", data: "contenu à protéger" }]);
  buf[30 + "a.bin".length + 3] ^= 0xff; // un octet des données change
  const zip = path.join(dir, "bad.zip");
  fs.writeFileSync(zip, buf);
  assert.throws(() => extractZip(zip, path.join(dir, "dist")), /CRC/);

  const junk = path.join(dir, "junk.zip");
  fs.writeFileSync(junk, "ceci n'est pas un zip");
  assert.throws(() => extractZip(junk, path.join(dir, "dist2")), /zip invalide/);
});
