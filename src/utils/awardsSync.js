// ─── Prévenir le reste de l'appli que les votes AniMood 2026 viennent de changer ──────────────────────────────────────────────────
// Le bloc de fin d'année (qui affiche le podium de la communauté) et la fenêtre AniMood 2026 sont deux endroits séparés de l'appli :
// quand je vote ou que je retire mon vote dans la fenêtre, le podium du bloc se recalcule tout de suite, sans attendre la prochaine
// actualisation automatique (voir components/awards/useCommunityPodium.js).
const listeners = new Set();

/** S'abonner aux changements de votes. Renvoie la fonction qui désabonne. */
export function onAwardsChanged(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** À appeler une fois un vote enregistré ou retiré avec succès. Un abonné défaillant n'empêche pas les autres d'être prévenus. */
export function notifyAwardsChanged() {
  for(const fn of [...listeners]) {
    try { fn(); } catch { /* ignoré */ }
  }
}
