// Outil de test : relève, dans le code des écrans de jeu, toutes les clés de texte lues dans `g` (gameUiI18n).
// Méthode : on découpe chaque fichier par fonction de premier niveau ; dans chaque fonction on repère les alias
// (`const t = g.friends`) puis les usages (`t.title`, `g.common.you`, `u.pts(…)`). Renvoie Map "namespace.clé" → { arity?: nombre d'arguments }.
import { readFileSync } from "node:fs";

const FILES = ["gameUi.jsx", "GameLobby.jsx", "PartyGames.jsx", "DuelGames.jsx"];
// Alias passés en paramètre à des petites fonctions (donc non déclarés dans leur corps) : DuelGames passe `d` = g.duel.
const DEFAULT_ALIASES = { "DuelGames.jsx": { d: "duel" } };

function splitTopLevel(src) {
  const lines = src.split("\n");
  const chunks = [];
  let cur = [];
  for (const line of lines) {
    if (/^(export\s+)?(async\s+)?function\s/.test(line) && cur.length) { chunks.push(cur.join("\n")); cur = []; }
    cur.push(line);
  }
  if (cur.length) chunks.push(cur.join("\n"));
  return chunks;
}

/** Nombre d'arguments passés à un appel `alias.clé(…)` (profondeur de parenthèses respectée). null si ce n'est pas un appel. */
function callArity(text, from) {
  if (text[from] !== "(") return null;
  let depth = 0, args = 0, any = false, inStr = null;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (ch === inStr && text[i - 1] !== "\\") inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; any = true; continue; }
    if ("([{".includes(ch)) { depth++; if (depth > 1) any = true; continue; }
    if (")]}".includes(ch)) { depth--; if (depth === 0) return any ? args + 1 : 0; continue; }
    if (ch === "," && depth === 1) { args++; continue; }
    if (!/\s/.test(ch)) any = true;
  }
  return null;
}

export function collectUiKeys(root) {
  const found = new Map();
  const add = (ns, key, arity, file) => {
    const id = `${ns}.${key}`;
    const prev = found.get(id) || { arities: new Set(), files: new Set() };
    if (arity !== null && arity !== undefined) prev.arities.add(arity);
    prev.files.add(file);
    found.set(id, prev);
  };
  for (const f of FILES) {
    const src = readFileSync(`${root}/src/components/${f}`, "utf8");
    for (const chunk of splitTopLevel(src)) {
      const aliases = new Map(Object.entries(DEFAULT_ALIASES[f] || {}));   // alias → namespace
      for (const m of chunk.matchAll(/(?:const|let|,)\s*(\w+)\s*=\s*g\.(\w+)\s*(?=[,;\n])/g)) aliases.set(m[1], m[2]);
      for (const m of chunk.matchAll(/\bg\.(\w+)\.(\w+)/g)) add(m[1], m[2], callArity(chunk, m.index + m[0].length), f);
      for (const [alias, ns] of aliases) {
        for (const m of chunk.matchAll(new RegExp(`(?<![\\w.])${alias}\\.(\\w+)`, "g"))) add(ns, m[1], callArity(chunk, m.index + m[0].length), f);
      }
    }
  }
  return found;
}
