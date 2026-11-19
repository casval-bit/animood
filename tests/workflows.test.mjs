// Workflows GitHub (.github/workflows) : l'étape « Write summary » doit réussir même quand le journal d'une étape manque
// (étape ignorée ou annulée, par exemple quand le job dépasse sa limite de temps) ; chaque étape de synchro a sa propre limite de temps.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");

/** Texte du script (`run: |`) de l'étape « Write summary ». */
function summaryScript(text) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trim() === "- name: Write summary");
  assert.ok(i >= 0, "étape « Write summary » introuvable");
  const j = lines.findIndex((l, k) => k > i && l.trim() === "run: |");
  assert.ok(j >= 0, "« run: | » introuvable");
  const indent = lines[j].length - lines[j].trimStart().length;
  const out = [];
  for (const l of lines.slice(j + 1)) {
    if (l.trim() === "") { out.push(""); continue; }
    if (l.length - l.trimStart().length <= indent) break;
    out.push(l);
  }
  return out.join("\n");
}

for (const f of ["sync-anime.yml", "sync-daily.yml", "sync-monthly.yml"]) {
  test(`${f} : « Write summary » réussit même sans aucun journal (bash -e -o pipefail, comme sur GitHub)`, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "summary-"));
    const script = summaryScript(read(f))
      .replace(/\$\{\{[^}]*\}\}/g, "skipped")             // ${{ steps.x.outcome }}
      .replaceAll("/tmp/", `${tmp}/`);                    // journaux : aucun n'existe
    const summary = path.join(tmp, "summary.md");
    const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], { env: { ...process.env, GITHUB_STEP_SUMMARY: summary }, encoding: "utf8" });
    assert.equal(r.status, 0, `code ${r.status} — ${r.stderr}`);
    const out = fs.readFileSync(summary, "utf8");
    assert.match(out, /pas de journal/);
    assert.match(out, /AniMood/);
  });
}

test("sync-anime.yml : chaque étape de synchro a sa limite de temps, le total reste sous celle du job", () => {
  const text = read("sync-anime.yml");
  const job = Number(text.match(/^\s{4}timeout-minutes:\s*(\d+)/m)?.[1]);
  const steps = [...text.matchAll(/- name: ([^\n]+)\n(?:(?!\n\s{6}- name:)[\s\S])*?\n\s{8}timeout-minutes:\s*(\d+)/g)].map((m) => ({ name: m[1], min: Number(m[2]) }));
  assert.ok(steps.length >= 6, `étapes avec limite trouvées : ${steps.map((s) => s.name).join(" | ")}`);
  const total = steps.reduce((n, s) => n + s.min, 0);
  assert.ok(total < job, `total des limites ${total} min < limite du job ${job} min`);
});

test("plus aucune étape ne nomme Jikan (service arrêté)", () => {
  for (const f of ["sync-anime.yml", "sync-daily.yml", "sync-monthly.yml"]) assert.doesNotMatch(read(f), /- name:[^\n]*Jikan/i, f);
});

test("sync-anime.yml : le Quiz OP et les artistes (AnimeThemes : 90 requêtes/min) ont un budget de temps", () => {
  const text = read("sync-anime.yml");
  for (const script of ["sync_opquiz_pool.mjs", "sync_artists.mjs"]) {
    const block = text.slice(text.lastIndexOf("- name:", text.indexOf(script)), text.indexOf(script));
    assert.match(block, /SYNC_BUDGET_MIN/, script);
  }
});
