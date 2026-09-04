// Helper used by Wordle, Poster and the OP Quiz solo games to update points/streaks
// on game_elo. gameKey selects which streak_<gameKey>/last_<gameKey>_date pair to use.

import { sb } from "../api/supabase.js";

async function applyPoints(myUsername, gameKey, basePoints) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const streakField = `streak_${gameKey}`;
  const lastField   = `last_${gameKey}_date`;

  const rows = await sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`).catch(()=>[]);
  const row  = rows?.[0];

  let streak = 1;
  if(row) {
    const lastDate = row[lastField];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    // Streak continues if last win was yesterday
    streak = lastDate === yesterday ? (row[streakField] || 0) + 1 : 1;
  }

  // +1 bonus per streak day beyond 1
  const bonusStreak = Math.max(0, streak - 1);
  const totalPts = basePoints + bonusStreak;

  const current = row?.points_total || 0;
  const patch = {
    points_total: current + totalPts,
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
      body: JSON.stringify({ username: myUsername, elo_chain:400, elo_timeline:400, ...patch }),
    }).catch(()=>{});
  }

  return totalPts;
}

// gameKey: "wordle" | "poster"
// guessCount: number of guesses taken
// won: boolean
export async function awardSoloPoints(myUsername, gameKey, guessCount, won) {
  if(!won) return 0;
  const base = Math.max(1, 20 - guessCount); // Base points: 20 - guesses (min 1)
  return applyPoints(myUsername, gameKey, base);
}

// correctCount: how many of the 5 daily OP rounds were answered correctly
export async function awardOpQuizPoints(myUsername, correctCount) {
  if(correctCount <= 0) return 0;
  const base = correctCount * 4; // 0/5→0, 5/5→20, same scale as Wordle/Poster
  return applyPoints(myUsername, "opquiz", base);
}
