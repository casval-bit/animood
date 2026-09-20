// Self-learning difficulty for the "Quiz OP" mini-game — backed by
// supabase/opquiz_stats_schema.sql (opquiz_stats = community-wide per-opening
// aggregate, opquiz_user_stats = per-player per-opening history).
//
// No Postgres functions are used anywhere else in this codebase (every write
// in src/api/supabase.js is a plain PostgREST call), so this follows the same
// read-then-upsert pattern already used by toggleLike/upsertUserVote — good
// enough at this app's scale, and consistent with the rest of the code.

import { sb } from "../api/supabase.js";

// Below this many community attempts we don't trust difficulty_score yet and
// fall back to the opening's hand-picked tag — otherwise the very first
// person to play a fresh opening could flip it to "hard" off one wrong guess.
export const OPQUIZ_MIN_ATTEMPTS_FOR_TRUST = 8;

export function difficultyFromScore(score) {
  if(score < 0.3) return "easy";
  if(score > 0.7) return "hard";
  return "medium";
}

// Tags each pool entry with `communityDifficulty` (re-bucketed from real
// answers once enough people have played it) and `stats` (raw counts, for
// UI/debugging). Falls back silently if the table doesn't exist yet.
export async function attachCommunityDifficulty(entries) {
  if(!entries.length) return entries;
  let statRows = [];
  try {
    const ids = entries.map(e => e.mal_id);
    statRows = await sb.query(`opquiz_stats?mal_id=in.(${ids.join(",")})&select=mal_id,total_attempts,correct_count,difficulty_score`) || [];
  } catch { /* table missing/unreachable — curated tags still work */ }
  const byId = new Map(statRows.map(s => [s.mal_id, s]));
  return entries.map(e => {
    const s = byId.get(e.mal_id);
    const trusted = s && s.total_attempts >= OPQUIZ_MIN_ATTEMPTS_FOR_TRUST;
    return {
      ...e,
      communityDifficulty: trusted ? difficultyFromScore(s.difficulty_score) : e.difficulty,
      stats: s ? { totalAttempts: s.total_attempts, correctCount: s.correct_count, difficultyScore: s.difficulty_score } : null,
    };
  });
}

// This player's attempt history for a set of openings, keyed by mal_id.
export async function getUserStats(username, malIds) {
  if(!username || !malIds.length) return new Map();
  try {
    const rows = await sb.query(`opquiz_user_stats?username=eq.${encodeURIComponent(username)}&mal_id=in.(${malIds.join(",")})&select=mal_id,attempts,correct`) || [];
    return new Map(rows.map(r => [r.mal_id, r]));
  } catch { return new Map(); }
}

// Bumps both the community and per-player counters for one round. Fire-and-forget
// from the caller — a lost update here just means slightly stale stats, not a
// broken game, so it isn't worth blocking the UI on.
export async function recordOpQuizAttempt(username, mal_id, correct, responseMs = 0) {
  const bumpCommunity = async () => {
    try {
      const rows = await sb.query(`opquiz_stats?mal_id=eq.${mal_id}&select=total_attempts,correct_count,total_response_ms&limit=1`);
      const prev = rows?.[0] || { total_attempts: 0, correct_count: 0, total_response_ms: 0 };
      await sb.query("opquiz_stats?on_conflict=mal_id", {
        method: "POST",
        headers: { ...sb.headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          mal_id,
          total_attempts: prev.total_attempts + 1,
          correct_count: prev.correct_count + (correct ? 1 : 0),
          total_response_ms: prev.total_response_ms + Math.max(0, responseMs | 0),
          updated_at: new Date().toISOString(),
        }),
      });
    } catch { /* stats table unreachable — game keeps working without it */ }
  };
  const bumpUser = async () => {
    if(!username) return;
    try {
      const rows = await sb.query(`opquiz_user_stats?username=eq.${encodeURIComponent(username)}&mal_id=eq.${mal_id}&select=attempts,correct&limit=1`);
      const prev = rows?.[0] || { attempts: 0, correct: 0 };
      await sb.query("opquiz_user_stats?on_conflict=username,mal_id", {
        method: "POST",
        headers: { ...sb.headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          username, mal_id,
          attempts: prev.attempts + 1,
          correct: prev.correct + (correct ? 1 : 0),
          last_seen: new Date().toISOString(),
        }),
      });
    } catch {}
  };
  await Promise.all([bumpCommunity(), bumpUser()]);
}

function seededRandLocal(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

// Fast string hash (djb2) so a username can seed the picker deterministically
// without pulling in a crypto/hash dependency.
export function hashSeed(str) {
  let h = 5381;
  for(let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0xffffffff;
  return h >>> 0;
}

// Weighted pick without replacement, deterministic for a given seed (so a page
// refresh mid-day doesn't reshuffle the day's rounds once saved to
// localStorage). Openings the player tends to miss are weighted highest so
// they resurface for practice, never-seen ones sit in the middle so the pool
// keeps introducing new material, and mastered ones fade toward a small floor
// rather than disappearing outright.
export function pickAdaptiveRounds(pool, userStatsById, seed, count) {
  const rand = seededRandLocal(seed);
  const weightOf = (entry) => {
    const s = userStatsById.get(entry.mal_id);
    if(!s || s.attempts === 0) return 0.65;
    const successRate = s.correct / s.attempts;
    return Math.max(0.05, 1 - successRate);
  };
  const remaining = pool.map(entry => ({ entry, weight: weightOf(entry) }));
  const picks = [];
  const n = Math.min(count, remaining.length);
  for(let i = 0; i < n; i++) {
    const total = remaining.reduce((sum, r) => sum + r.weight, 0);
    let target = rand() * total;
    let idx = 0;
    for(; idx < remaining.length - 1; idx++) {
      target -= remaining[idx].weight;
      if(target <= 0) break;
    }
    picks.push(remaining[idx].entry);
    remaining.splice(idx, 1);
  }
  return picks;
}
