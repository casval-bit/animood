import { sb } from "../api/supabase.js";

// Points per game = 20 - guessCount (min 1, max 19)
// +1 streak bonus per consecutive day
// streak_wordle / streak_poster = cumulative pts (never decreases)
// last_wordle_date / last_poster_date = last win date for streak tracking

export async function awardSoloPoints(myUsername, gameKey, guessCount, won) {
  if(!won) return 0;

  const today     = new Date().toISOString().split("T")[0];
  const ptsField  = `streak_${gameKey}`;    // e.g. streak_wordle
  const lastField = `last_${gameKey}_date`; // e.g. last_wordle_date

  const rows = await sb.query(
    `game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`
  ).catch(()=>[]);
  const row = rows?.[0];

  // Base: 20 - guesses (min 1, max 19 since at least 1 guess needed)
  const base = Math.max(1, Math.min(19, 20 - guessCount));

  // Streak bonus: +1 if won yesterday too
  let streakBonus = 0;
  if(row?.[lastField]) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if(row[lastField] === yesterday) streakBonus = 1;
  }

  const earned = base + streakBonus;

  // Accumulate pts — never decreases
  const currentPts = Math.max(0, row?.[ptsField] || 0);
  const patch = {
    [ptsField]:  currentPts + earned,
    [lastField]: today,
    updated_at:  new Date().toISOString(),
  };

  if(row) {
    await sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}`, {
      method: "PATCH",
      headers: { ...sb.headers, "Prefer": "return=minimal" },
      body: JSON.stringify(patch),
    }).catch(()=>{});
  } else {
    await sb.query("game_elo", {
      method: "POST",
      headers: { ...sb.headers, "Prefer": "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        username: myUsername,
        elo_chain: 400,
        elo_timeline: 400,
        points_total: 0,
        ...patch,
      }),
    }).catch(()=>{});
  }

  return earned;
}
