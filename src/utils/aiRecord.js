// ─── Bilan contre l'IA, gardé sur cet appareil (localStorage) ─────────────────────────────────────────────
// Une partie contre l'IA ne rapporte ni ELO ni points ; ce petit bilan (victoires / défaites par jeu et par niveau)
// donne quand même un objectif : battre Sensei. Tout est enveloppé dans try/catch (stockage bloqué = on ignore).

const KEY = "animood:ai-record:v1";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch { return {}; }
}

/** { w, l, d } pour un jeu ("chain" | "timeline") et un niveau ("easy" | "medium" | "hard"). */
export function aiRecordFor(game, level) {
  const r = load()[`${game}:${level}`] || {};
  return { w: r.w | 0, l: r.l | 0, d: r.d | 0 };
}

/** Enregistre une partie : outcome = "win" | "loss" | "draw". Renvoie le bilan mis à jour. */
export function recordAiResult(game, level, outcome) {
  const all = load();
  const k = `${game}:${level}`;
  const r = { w: 0, l: 0, d: 0, ...(all[k] || {}) };
  if (outcome === "win") r.w += 1; else if (outcome === "loss") r.l += 1; else if (outcome === "draw") r.d += 1;
  all[k] = r;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* stockage indisponible */ }
  return { w: r.w, l: r.l, d: r.d };
}
