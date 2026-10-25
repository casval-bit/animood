// Animations du style HUD (injectées une seule fois dans <head>) — partagées par la page principale du profil et ses onglets.
import { useEffect } from "react";

const HUD_CSS = `
@keyframes hud-scan {
  0%   { transform: translateY(-100%); opacity: 0; }
  10%  { opacity: 0.6; }
  90%  { opacity: 0.6; }
  100% { transform: translateY(100%); opacity: 0; }
}
@keyframes hud-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
@keyframes hud-glow-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); }
  50%       { box-shadow: 0 0 0 6px rgba(139,92,246,0.08); }
}
@keyframes counter-up {
  0%   { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes bar-fill {
  0%   { width: 0; }
}
@keyframes hg-rise {
  0%   { transform: scaleY(0); opacity: 0; }
  100% { transform: scaleY(1); opacity: 1; }
}
@keyframes hud-flicker {
  0%, 95%, 100% { opacity: 1; }
  96% { opacity: 0.85; }
  97% { opacity: 0.95; }
  98% { opacity: 0.8; }
}
@keyframes hud-corner-pulse {
  0%, 100% { opacity: 0.5; width: 12px; height: 12px; }
  50% { opacity: 1; width: 16px; height: 16px; box-shadow: 0 0 6px rgba(139,92,246,0.6); }
}
@keyframes hud-data-stream {
  0% { transform: translateY(0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-100%); opacity: 0; }
}
@keyframes counter-cascade {
  0% { opacity: 0; transform: translateY(14px) scale(0.8); filter: blur(4px); }
  60% { filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes bd-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2.5px); }
}
@keyframes bd-shine {
  0%, 70%, 100% { opacity: 0; transform: translateX(-120%) skewX(-20deg); }
  85%           { opacity: .9; }
  95%           { opacity: 0; transform: translateX(220%) skewX(-20deg); }
}
@keyframes bd-halo {
  0%, 100% { opacity: .55; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.12); }
}
@keyframes border-glow-sweep {
  0% { box-shadow: 0 0 0 0 transparent, 0 0 15px rgba(139,92,246,0); }
  25% { box-shadow: 0 -1px 0 0 rgba(168,85,247,0.6), 0 0 20px rgba(139,92,246,0.15); }
  75% { box-shadow: 0 0 0 0 transparent, 0 0 10px rgba(139,92,246,0.08); }
  100% { box-shadow: 0 0 0 0 transparent, 0 0 15px rgba(139,92,246,0); }
}
`;

// Animations ajoutées pour les graphes des onglets
const HUD_EXTRA_CSS = `
@keyframes hg-draw {
  0%   { stroke-dashoffset: 1; }
  100% { stroke-dashoffset: 0; }
}
@keyframes hg-fade {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes hg-grow {
  0%   { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}
@keyframes hg-pop {
  0%   { opacity: 0; transform: translateY(8px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
`;

// Injecte les animations une seule fois (la page principale et les onglets partagent le même <style>)
export function useHudCss() {
  useEffect(() => {
    const id = "animood-hud-css";
    let el = document.getElementById(id);
    if (!el) { el = document.createElement("style"); el.id = id; document.head.appendChild(el); }
    el.textContent = HUD_CSS + HUD_EXTRA_CSS;
  }, []);
}

