// ─── Cluescale : thèmes et état de départ d'une partie (sans React, donc réutilisable par le salon et par le jeu) ───
export const CLUESCALE_THEMES = [
  "Art manga 🎨", "Combat mythique ⚔️", "OST iconique 🎵", "Premier arc 📖",
  "Transformation de perso ✨", "Entrée d'un perso 🚪", "Studio d'animation 🏢",
  "Webtoon 📱", "Opening mémorable 🎤", "Antagoniste charismatique 😈",
  "Scène de fin d'arc 🌅", "Pouvoir unique 💫", "Duo de persos 👥",
  "Arme signature 🗡️", "Monde/univers 🌍", "Histoire d'amour 💕",
  "Révélation choc 😱", "Sacrifice héroïque 💀", "Humour décalé 😂",
  "Dessin de couverture 📚",
];

export const pickRandom = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];

/** Note secrète d'une manche : un entier de 1 à 20. */
export const randomScore = (rand = Math.random) => Math.floor(rand() * 20) + 1;

/** État de départ d'une partie de Cluescale pour ces joueurs (le premier est le premier juge). */
export function cluescaleInitialState(list, rand = Math.random) {
  return {
    phase: "clue", judgeRound: 1, judge: list[0], theme: pickRandom(CLUESCALE_THEMES, rand), score: randomScore(rand),
    clue: null, guesses: {}, scores: Object.fromEntries(list.map((p) => [p, 0])), history: [], players: list,
  };
}
