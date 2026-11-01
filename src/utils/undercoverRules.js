// ─── Règles de l'Imposteur : comparaison de mots, indices interdits, tirage — fonctions pures ───────────────

/** Minuscules, sans accents ni ponctuation, espaces simples : « Steins;Gate » → « steins gate ». */
export function normalizeWord(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const forms = (entry) => [entry.word, ...(entry.aliases || [])].map(normalizeWord).filter(Boolean);

/** La tentative de l'imposteur est-elle bonne ? Accepte les variantes d'écriture et une faute de frappe sur les noms longs. */
export function isGuessCorrect(guess, entry) {
  const g = normalizeWord(guess);
  if (!g) return false;
  return forms(entry).some((f) => {
    if (g === f) return true;
    if (f.length < 6 || Math.abs(g.length - f.length) > 2) return false; // noms de 5 lettres ou moins : orthographe exacte
    return editDistance(g, f) <= (f.length >= 9 ? 2 : 1);
  });
}

/** Un joueur qui connaît le mot n'a pas le droit de le dire (ni une de ses variantes) comme indice. */
export function isClueForbidden(clue, entry) {
  const c = normalizeWord(clue);
  if (!c) return false;
  const padded = ` ${c} `;
  return forms(entry).some((f) => c === f || (f.length >= 4 && padded.includes(` ${f} `)));
}

/** Tire un mot en évitant les plus récents (liste d'indices de `recent`, du plus ancien au plus récent). */
export function pickEntry(bank, recent = [], rand = Math.random) {
  const keep = Math.min(recent.length, Math.max(0, bank.length - 5)); // toujours au moins 5 mots possibles
  const banned = new Set(recent.slice(-keep));
  const candidates = bank.map((_, i) => i).filter((i) => !banned.has(bank[i].word));
  const idx = candidates[Math.floor(rand() * candidates.length)];
  return bank[idx];
}

/** Points de fin de partie. Imposteur non démasqué : 5 pour lui ; démasqué mais devine le mot : 2 pour lui et 1 pour les autres ;
 *  démasqué : 3 pour chaque membre de l'équipage. */
export function undercoverPoints(players, impostorFound, impostorGuessed) {
  const pts = {};
  if (!impostorFound) { const imp = players.find((p) => p.isImpostor); if (imp) pts[imp.username] = 5; }
  else if (impostorGuessed) players.forEach((p) => { pts[p.username] = p.isImpostor ? 2 : 1; });
  else players.forEach((p) => { if (!p.isImpostor) pts[p.username] = 3; });
  return pts;
}

/** Résultat du vote : l'imposteur n'est démasqué que s'il est seul en tête. */
export function tallyVotes(votes, impostorName) {
  const counts = {};
  Object.values(votes).forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  const max = Math.max(...Object.values(counts));
  const top = Object.keys(counts).filter((k) => counts[k] === max);
  return { counts, top, impostorFound: top.length === 1 && top[0] === impostorName };
}
