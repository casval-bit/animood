import { sb } from "../api/supabase.js";

// Points per game = 20 - guessCount (min 1, max 19)
// +1 streak bonus per consecutive day
// Solo pts accumulate in streak_wordle / streak_poster (used as cumulative pts)
// points_total = elo_chain + elo_timeline + streak_wordle + streak_poster (computed in frontend)

export async function awardSoloPoints(myUsername, gameKey, guessCount, won) {
  if(!won) return 0;

  const today = new Date().toISOString().split("T")[0];
  const ptsField    = `streak_${gameKey}`;   // cumulative pts (repurposed column)
  const lastField   = `last_${gameKey}_date`;
  const streakField = `${gameKey}_streak`;   // actual streak counter (separate)

  const rows = await sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`).catch(()=>[]);
  const row  = rows?.[0];

  // Base points: 20 - guesses (min 1)
  const base = Math.max(1, Math.min(19, 20 - guessCount));

  // Streak: consecutive days
  let streak = 1;
  if(row?.[lastField]) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    streak = row[lastField] === yesterday ? (row[streakField] || 0) + 1 : 1;
  }
  const streakBonus = Math.max(0, streak - 1);
  const earned = base + streakBonus;

  // Accumulate — never decreases
  const currentPts = Math.max(0, row?.[ptsField] || 0);
  const patch = {
    [ptsField]: currentPts + earned,
    [streakField]: streak,
    [lastField]: today,
    updated_at: new Date().toISOString(),
  };

  if(row) {
    sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify(patch),
    }).catch(()=>{});
  } else {
    sb.query("game_elo", {
      method: "POST",
      headers: { ...sb.headers, "Prefer": "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ username: myUsername, elo_chain:400, elo_timeline:400, points_total:0, ...patch }),
    }).catch(()=>{});
  }

  return earned;
}
