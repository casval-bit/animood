// ─── Solo game points — Wordle, Poster, OP Quiz ───────────────────────────────
// Columns used per game:
//   pts_<gameKey>        — cumulative points (never decreases)
//   streak_days_<gameKey>— consecutive day streak (for bonus)
//   last_<gameKey>_date  — "YYYY-MM-DD" of last win (for streak check)
//
// Points formula:
//   Wordle/Poster : base = 20 - guessCount (min 1)
//   OpQuiz        : base = correctCount * 4 (5/5 = 20)
//   Streak bonus  : +1 per consecutive day beyond 1
//
// Total shown in UI = pts_wordle + pts_poster + pts_opquiz + pts_cluescale
//                   + elo_chain + elo_timeline

import { sb } from "../api/supabase.js";

async function applyPoints(myUsername, gameKey, basePoints) {
  const today     = new Date().toISOString().split("T")[0];
  const ptsField    = `pts_${gameKey}`;          // e.g. pts_wordle
  const streakField = `streak_days_${gameKey}`;  // e.g. streak_days_wordle
  const lastField   = `last_${gameKey}_date`;    // e.g. last_wordle_date

  const rows = await sb.query(
    `game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`
  ).catch(()=>[]);
  const row = rows?.[0];

  // Streak: +1 if last win was yesterday, else reset to 1
  let streakDays = 1;
  if(row?.[lastField]) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if(row[lastField] === yesterday) {
      streakDays = (row[streakField] || 0) + 1;
    }
    // If today already played — don't award again
    if(row[lastField] === today) return 0;
  }

  const bonusStreak = Math.max(0, streakDays - 1);
  const earned      = basePoints + bonusStreak;

  const patch = {
    [ptsField]:    (row?.[ptsField] || 0) + earned,
    [streakField]: streakDays,
    [lastField]:   today,
    // Also keep old streak_<gameKey> field for backward compat display
    [`streak_${gameKey}`]: streakDays,
    updated_at: new Date().toISOString(),
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
        elo_chain: 400, elo_timeline: 400,
        pts_wordle: 0, pts_poster: 0, pts_opquiz: 0, pts_cluescale: 0,
        ...patch,
      }),
    }).catch(()=>{});
  }

  return earned;
}

// Wordle / Poster
export async function awardSoloPoints(myUsername, gameKey, guessCount, won) {
  if(!won) return 0;
  const base = Math.max(1, 20 - guessCount);
  return applyPoints(myUsername, gameKey, base);
}

// OP Quiz
export async function awardOpQuizPoints(myUsername, correctCount) {
  if(correctCount <= 0) return 0;
  const base = correctCount * 4; // 5/5 → 20 pts
  return applyPoints(myUsername, "opquiz", base);
}
