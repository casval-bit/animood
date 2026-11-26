import { useCallback, useEffect, useRef } from "react";

// Tracks currently-open modals in mount order so that, when several are
// stacked (e.g. an anime detail modal opening a studio modal on top), a
// single back press only closes the top-most one instead of all of them.
let modalStack = [];
let nextModalId = 0;

// Délai de grâce avant le secours de fermeture (voir requestClose) : un « retour » normal répond en quelques ms.
export const BACK_FALLBACK_MS = 450;

/**
 * Pushes a browser history entry while an overlay/modal is mounted so the
 * device or browser back button closes it instead of leaving the page
 * underneath (e.g. jumping back to the home tab or exiting the app).
 *
 * Returns `requestClose`: call it from close buttons / backdrop clicks
 * instead of `onClose` directly — it triggers history.back(), and the
 * resulting popstate event calls `onClose`, so both paths converge.
 * It returns false when the close was vetoed (see below), true otherwise.
 * Secours : si le navigateur n'envoie jamais « popstate » (entrée d'historique perdue ou ignorée), la fenêtre se fermerait… jamais,
 * et le bouton « ← » ne ferait rien. Au bout de BACK_FALLBACK_MS sans retour, on ferme donc quand même (une seule fois).
 *
 * Optional `canClose()` : return false to refuse the close (a game in progress
 * that wants to ask "leave the game?" first). The overlay stays open, and the
 * history entry consumed by the back press is pushed again so the next back
 * press still reaches this overlay. Without `canClose` nothing changes.
 * `requestClose(true)` closes without asking `canClose` (the game's own
 * "Leave" button, once the player has already confirmed inside the game).
 *
 * Optional `{ escape: true }` : la touche Échap ferme aussi la fenêtre (seulement celle du dessus quand plusieurs sont empilées).
 * Désactivé par défaut : certains jeux se servent d'Échap pour autre chose.
 */
export function useModalBack(onClose, canClose, options) {
  const escape = !!options?.escape;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const canCloseRef = useRef(canClose);
  useEffect(() => { canCloseRef.current = canClose; });
  const backRequestedRef = useRef(false);
  const idRef = useRef(null);
  const closedRef = useRef(false);          // onClose déjà appelé (par « retour » ou par le secours) : jamais deux fois
  const fallbackRef = useRef(null);

  useEffect(() => {
    const id = ++nextModalId;
    idRef.current = id;
    closedRef.current = false;
    modalStack.push(id);
    window.history.pushState({ animoodOverlay: true, id }, "");

    const handlePopState = () => {
      // Only the top-most still-open modal reacts to a given back navigation.
      if (modalStack[modalStack.length - 1] !== id) return;
      // Retour lancé par requestClose() : la fermeture a déjà été acceptée (ou forcée), on ne redemande pas
      if (!backRequestedRef.current && canCloseRef.current && canCloseRef.current() === false) {
        window.history.pushState({ animoodOverlay: true, id }, "");   // fermeture refusée : on garde le bouton « retour » armé
        backRequestedRef.current = false;
        return;
      }
      clearTimeout(fallbackRef.current);
      if (closedRef.current) return;
      closedRef.current = true;
      modalStack.pop();
      onCloseRef.current();
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      clearTimeout(fallbackRef.current);
      window.removeEventListener("popstate", handlePopState);
      const idx = modalStack.indexOf(id);
      if (idx !== -1) modalStack.splice(idx, 1);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requestClose = useCallback((force) => {
    if (backRequestedRef.current) return true;
    if (force !== true && canCloseRef.current && canCloseRef.current() === false) return false;
    backRequestedRef.current = true;
    window.history.back();
    clearTimeout(fallbackRef.current);
    fallbackRef.current = setTimeout(() => {
      if (closedRef.current) return;           // « retour » est bien arrivé entre-temps
      closedRef.current = true;
      const idx = modalStack.indexOf(idRef.current);
      if (idx !== -1) modalStack.splice(idx, 1);
      onCloseRef.current();
    }, BACK_FALLBACK_MS);
    return true;
  }, []);

  useEffect(() => {
    if (!escape) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (modalStack[modalStack.length - 1] !== idRef.current) return;   // une fenêtre est ouverte par-dessus : c'est à elle de réagir
      e.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [escape, requestClose]);

  return requestClose;
}
