/**
 * castleRescueRanking.ts
 *
 * Ranking logic for Castle Rescue multiplayer competitions.
 *
 * Sort order (primary → tiebreak):
 *  1. Higher score → better rank.
 *  2. Fewer wrongAttempts → better rank (on score tie).
 *  3. Lower elapsedMs → better rank (on score + wrongAttempts tie).
 *  4. Lexicographic playerId ascending (fully deterministic, no random).
 */

import type { CastleRescueResult, CastleRescueRankedResult } from './castleRescueTypes';

/**
 * Rank an array of player results for Castle Rescue.
 *
 * Returns a new array of CastleRescueRankedResult sorted from best (1) to
 * worst.  The original array is not mutated.
 *
 * Tie-breaking is fully deterministic:
 *  score (desc) → wrongAttempts (asc) → elapsedMs (asc) → playerId (asc)
 *
 * @param results - Raw results, one per player.  May be empty (returns []).
 * @returns       Ranked results with placement numbers starting at 1.
 */
export function rankCastleRescueResults(
  results: CastleRescueResult[],
): CastleRescueRankedResult[] {
  const sorted = [...results].sort((a, b) => {
    // Primary: higher score is better
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break 1: fewer wrong attempts is better
    if (a.wrongAttempts !== b.wrongAttempts) return a.wrongAttempts - b.wrongAttempts;
    // Tie-break 2: faster completion is better
    if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
    // Tie-break 3: alphabetical by playerId for full determinism
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });

  return sorted.map((r, i) => ({ ...r, placement: i + 1 }));
}
