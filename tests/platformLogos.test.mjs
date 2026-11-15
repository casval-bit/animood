// Page « Télécharger l'appli » : vrais logos des plateformes (node --test tests/)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const logos = fs.readFileSync(path.join(src, "components", "PlatformLogos.jsx"), "utf8");
const app = fs.readFileSync(path.join(src, "App.jsx"), "utf8");
const css = fs.readFileSync(path.join(src, "index.css"), "utf8");

/** Tracé SVG (attribut d) du composant `name`. */
const pathOf = (name) => {
  const m = logos.match(new RegExp(`export function ${name}\\(.*?<path d="([^"]+)"`, "s"));
  assert.ok(m, `${name} : tracé introuvable`);
  return m[1];
};

test("les quatre logos de système et la pastille sont exportés", () => {
  for (const n of ["AppleLogo", "AndroidLogo", "LinuxLogo", "WindowsLogo", "PlatformBadge"]) assert.match(logos, new RegExp(`export function ${n}\\b`), n);
});

test("logo Windows : quatre carreaux, bleu officiel", () => {
  const d = pathOf("WindowsLogo");
  assert.equal((d.match(/z/gi) || []).length, 4, "quatre sous-tracés fermés");
  assert.match(logos, /WindowsLogo\(\{ size = 28, color = "#0078D4" \}\)/);
});

test("Apple, Android et Linux gardent leurs vrais tracés (pas de dessin maison)", () => {
  assert.ok(pathOf("AppleLogo").length > 400, "pomme");
  assert.ok(pathOf("AndroidLogo").length > 800, "robot Android");
  assert.ok(pathOf("LinuxLogo").length > 4000, "Tux");
});

test("Tux : jaune officiel, mais foncé en thème clair (variable --logo-linux)", () => {
  assert.match(logos, /var\(--logo-linux, #FCC624\)/);
  assert.match(css, /:root\[data-theme="light"\][^}]*--logo-linux:/s);
});

test("la page n'utilise plus d'emoji pour désigner les systèmes", () => {
  assert.doesNotMatch(app, /id: "(win|mac|linux|android|ios)",\s*icon: "/);
  assert.match(app, /icon: <WindowsLogo \/>/);
  assert.match(app, /icon: <AndroidLogo \/>/);
});

test("la licence du robot Android et les marques sont mentionnées sur la page", () => {
  assert.match(app, /Creative Commons Attribution 3\.0/);
  assert.match(app, /Creative Commons 3\.0 Attribution License/);
});

test("les pages (À propos, FAQ, Télécharger l'appli…) ont un fond opaque", () => {
  const wrapper = app.slice(app.indexOf("function PageWrapper"), app.indexOf("function AboutPage"));
  assert.match(wrapper, /background:"var\(--page-bg/);
  assert.doesNotMatch(wrapper, /--surface-1-strong/);
});
