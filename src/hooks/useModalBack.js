import { useCallback, useEffect, useRef } from "react";

// Tracks currently-open modals in mount order so that, when several are
// stacked (e.g. an anime detail modal opening a studio modal on top), a
// single back press only closes the top-most one instead of all of them.
let modalStack = [];
let nextModalId = 0;

/**
 * Pushes a browser history entry while an overlay/modal is mounted so the
 * device or browser back button closes it instead of leaving the page
 * underneath (e.g. jumping back to the home tab or exiting the app).
 *
 * Returns `requestClose`: call it from close buttons / backdrop clicks
 * instead of `onClose` directly — it triggers history.back(), and the
 * resulting popstate event calls `onClose`, so both paths converge.
 * It returns false when the close was vetoed (see below), true otherwise.
 *
 * Optional `canClose()` : return false to refuse the close (a game in progress
 * that wants to ask "leave the game?" first). The overlay stays open, and the
 * history entry consumed by the back press is pushed again so the next back
 * press still reaches this overlay. Without `canClose` nothing changes.
 * `requestClose(true)` closes without asking `canClose` (the game's own
 * "Leave" button, once the player has already confirmed inside the game).
 */
export function useModalBack(onClose, canClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const canCloseRef = useRef(canClose);
  useEffect(() => { canCloseRef.current = canClose; });
  const backRequestedRef = useRef(false);
  const idRef = useRef(null);

  useEffect(() => {
    const id = ++nextModalId;
    idRef.current = id;
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
      modalStack.pop();
      onCloseRef.current();
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
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
    return true;
  }, []);

  return requestClose;
}
