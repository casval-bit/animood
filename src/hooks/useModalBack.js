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
 */
export function useModalBack(onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
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

  const requestClose = useCallback(() => {
    if (backRequestedRef.current) return;
    backRequestedRef.current = true;
    window.history.back();
  }, []);

  return requestClose;
}
