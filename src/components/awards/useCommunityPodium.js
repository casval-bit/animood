// ─── Podium de la communauté (bloc de fin d'année) : lecture + actualisation ─────────────────────────────────────────────────────────
// Le podium suit les points : il est relu
//   • à l'affichage du bloc ;
//   • toutes les 90 s tant que la page est visible (PODIUM_POLL_MS) : les votes des autres membres arrivent ainsi sans recharger ;
//   • quand on revient sur l'onglet / la fenêtre (focus, page de nouveau visible) si la dernière lecture date de plus de 20 s ;
//   • tout de suite (≈ 0,3 s) quand JE vote ou retire mon vote dans la fenêtre AniMood 2026 (utils/awardsSync.js).
// Le dernier podium lu est gardé en mémoire : quand on quitte puis retrouve le Forum, il s'affiche aussitôt (puis se met à jour s'il a changé).
// Pas de table de votes (`missing`) ou panne au tout premier chargement : le bloc se passe de podium, sans message d'erreur.
import { useState, useEffect } from "react";
import { fetchCommunityPodium } from "../../api/awards2026.js";
import { onAwardsChanged } from "../../utils/awardsSync.js";
import { samePodium, PODIUM_POLL_MS } from "../../utils/awards2026.js";

const LOADING = { status: "loading", voters: 0, top: [] };
const REFRESH_AFTER_MS = 20_000;       // retour sur la page : on ne relit pas si la dernière lecture est plus récente que ça
const AFTER_MY_VOTE_MS = 300;          // laisse à Supabase le temps d'enregistrer mon vote avant de relire

let lastKnown = null;                  // dernier podium lu dans cette session de la page

export function useCommunityPodium(enabled = true) {
  const [podium, setPodium] = useState(() => lastKnown || LOADING);

  useEffect(() => {
    if(!enabled) return undefined;
    let stopped = false, busy = false, again = false, last = 0;

    const run = async () => {
      if(busy) { again = true; return; }                    // une lecture est déjà en cours : on en refera une juste après (elle a pu partir avant le changement)
      busy = true;
      try {
        const res = await fetchCommunityPodium();
        lastKnown = res;
        if(!stopped) setPodium(prev => (samePodium(prev, res) ? prev : res));
      } catch {
        if(!stopped) setPodium(prev => (prev.status === "loading" ? { status: "error", voters: 0, top: [] } : prev));   // panne : on garde le dernier podium connu
      } finally {
        busy = false; last = Date.now();
        if(again && !stopped) { again = false; run(); }
      }
    };

    run();
    const timer = setInterval(() => { if(!document.hidden) run(); }, PODIUM_POLL_MS);
    const wake = () => { if(!document.hidden && Date.now() - last > REFRESH_AFTER_MS) run(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    let afterVote = null;
    const off = onAwardsChanged(() => { clearTimeout(afterVote); afterVote = setTimeout(() => { if(!stopped) run(); }, AFTER_MY_VOTE_MS); });

    return () => {
      stopped = true;
      clearInterval(timer); clearTimeout(afterVote); off();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [enabled]);

  return podium;
}
