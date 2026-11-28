// ─── Intention de survol : quand ouvrir et quand fermer la carte d'un animé ───────────────────────────────────────────────────
// Petite machine à états sans DOM : le composant lui dit ce que fait le pointeur, elle décide quand appeler onShow / onHide.
//   · il faut marquer l'arrêt sur une affiche (dwell, ~380 ms) pour que la carte s'ouvre : traverser une grille ne déclenche rien ;
//   · carte déjà ouverte : passer d'une affiche à l'autre la change après un court délai (switchDelay, ~120 ms), sans la fermer entre les deux ;
//   · quitter l'affiche pour aller sur la carte (ou l'inverse) ne la ferme pas : un délai de grâce (hideDelay, ~180 ms) laisse traverser l'interstice.
// `target` est n'importe quelle valeur comparable avec === (en pratique l'élément du DOM de l'affiche : deux affiches du même animé restent distinctes).
// `timers` est injectable (tests) ; par défaut setTimeout / clearTimeout.

const realTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };

export function createHoverIntent({ onShow, onHide, dwell = 380, switchDelay = 120, hideDelay = 180, timers = realTimers } = {}) {
  let shown = null;          // cible dont la carte est ouverte
  let pending = null;        // cible en attente d'ouverture
  let showTimer = null;
  let hideTimer = null;

  const cancelShow = () => { if (showTimer !== null) { timers.clear(showTimer); showTimer = null; } pending = null; };
  const cancelHide = () => { if (hideTimer !== null) { timers.clear(hideTimer); hideTimer = null; } };
  const close = () => { if (shown !== null) { shown = null; onHide?.(); } };

  return {
    /** Le pointeur est sur une affiche. */
    overTarget(target) {
      cancelHide();
      if (target === shown) { cancelShow(); return; }
      if (target === pending) return;
      cancelShow();
      pending = target;
      showTimer = timers.set(() => {
        showTimer = null;
        const t = pending;
        pending = null;
        shown = t;
        onShow?.(t);
      }, shown !== null ? switchDelay : dwell);
    },
    /** Le pointeur est sur la carte ouverte : elle reste, rien d'autre ne s'ouvre. */
    overCard() { cancelHide(); cancelShow(); },
    /** Le pointeur n'est ni sur une affiche ni sur la carte (ou a quitté la fenêtre). */
    leave() {
      cancelShow();
      if (shown !== null && hideTimer === null) hideTimer = timers.set(() => { hideTimer = null; close(); }, hideDelay);
    },
    /** Fermeture immédiate (défilement, clic, Échap, fenêtre qui perd le focus…). */
    hideNow() { cancelShow(); cancelHide(); close(); },
    /** Arrêt définitif (démontage) : plus aucun minuteur, plus d'appel. */
    dispose() { cancelShow(); cancelHide(); shown = null; },
    isOpen: () => shown !== null,
    current: () => shown,
  };
}
