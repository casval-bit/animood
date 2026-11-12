// Fermer la fenêtre d'une partie (croix, fond sombre, bouton « retour »).
//
// Une partie en cours ne se ferme pas d'un clic : le jeu affiche sa propre fenêtre « Abandonner ? » (avec le coût en
// ELO) et c'est lui qui rappelle `onClose` une fois la partie finie. Le parent branche donc `canLeaveGame` sur la
// prop `canClose` de <GameModal> : tant que la partie est en cours, la fermeture est refusée et la fenêtre d'abandon
// s'ouvre à la place.
//
// `fn` est la fonction transmise par le jeu via `onReady(fn)` (voir `useQuitGate` dans gameUi.jsx) :
//   fn()              → abandonner tout de suite (ancien comportement)
//   fn.isOver()       → la partie est-elle terminée ?
//   fn.requestQuit()  → ouvre la fenêtre « Abandonner ? » ; renvoie false si la partie est déjà finie

/** true → la fenêtre peut se fermer ; false → refusé (le jeu demande confirmation lui-même). */
export function canLeaveGame(fn) {
  if (!fn || typeof fn.requestQuit !== "function") return true;   // pas de fenêtre intégrée : l'ancien chemin (confirm) s'applique
  return !fn.requestQuit();
}
