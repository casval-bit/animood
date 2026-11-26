// ─── Affiche d'animé (tierlist, grille et top 3 AniMood 2026) ────────────────────────────────────────────────────────────────
// Essaie image_url puis large_image ; si rien ne charge, écrit le titre sur la case. L'attribut data-raw donne l'adresse d'origine
// à l'export en image (voir utils/posterExport.js), qui relit les affiches via un proxy.
import { useState } from "react";

export function Poster({ anime, name, w = 62 }) {
  const sources = [anime?.image_url, anime?.large_image].filter(Boolean);
  const id = sources.join("|");
  const [failed, setFailed] = useState({ id, n: 0 });
  const i = failed.id === id ? failed.n : 0;             // autre affiche dans la même case (ex. case de la grille changée) : on repart de la 1re adresse
  const src = sources[i];
  if(!src) return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
      fontSize: Math.max(7, w / 8), lineHeight: 1.1, padding: 2, color: "rgba(255,255,255,.7)", background: "linear-gradient(160deg,rgb(var(--ac-2a1850)),rgb(var(--ac-150c30)))", overflow: "hidden" }}>{name}</div>
  );
  return <img key={i} src={src} data-raw={src} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false}
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
    onError={() => setFailed({ id, n: i + 1 })} />;
}
