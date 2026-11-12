// ─── Crochets partagés par les écrans de jeu ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from "react";
import { useLang } from "../context/useLang.js";
import { GAME_UI_I18N } from "../constants/gameUiI18n.js";

/** Textes des écrans de jeu : `g` (voir src/constants/gameUiI18n.js), `lang` = "fr" | "en". */
export function useGameText() {
  const { lang } = useLang();
  return { lang, g: GAME_UI_I18N[lang] || GAME_UI_I18N.fr };
}

/**
 * Fermeture d'une partie en cours : enregistre auprès du parent (GamesView / ForumView) une fonction `fn` avec
 *   fn()              → abandonner (ancien comportement, conservé)      fn.isOver() → la partie est-elle terminée ?
 *   fn.requestQuit()  → ouvre la fenêtre « Abandonner ? » du jeu (renvoie false si la partie est déjà finie)
 * Le parent appelle fn.requestQuit() quand le joueur ferme la fenêtre (croix, fond, bouton retour) pendant la partie
 * (voir src/utils/gameClose.js). Renvoie { open, ask, stay } pour piloter <QuitDialog>.
 */
export function useQuitGate(onReady, isOver, forfeit) {
  const [open, setOpen] = useState(false);
  const isOverRef = useRef(isOver);
  const forfeitRef = useRef(forfeit);
  useEffect(() => { isOverRef.current = isOver; forfeitRef.current = forfeit; });
  useEffect(() => {
    const fn = () => forfeitRef.current?.();
    fn.isOver = () => !!isOverRef.current?.();
    fn.requestQuit = () => { if (isOverRef.current?.()) return false; setOpen(true); return true; };
    onReady?.(fn);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { open, ask: () => setOpen(true), stay: () => setOpen(false) };
}
