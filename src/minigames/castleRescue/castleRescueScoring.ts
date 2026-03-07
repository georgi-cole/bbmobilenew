/**
 * castleRescueScoring.ts
 *
 * Scoring formula for Castle Rescue.
 *
 * Formula:
 *   score = MAX_SCORE
 *         − floor(elapsedSeconds) × TIME_PENALTY_PER_SECOND
 *         − wrongAttempts       × RESPAWN_PENALTY
 *   score = clamp(score, SCORE_FLOOR, MAX_SCORE)
 *
 * Design notes:
 *  - Faster completions yield higher scores.
 *  - Each wrong pipe click deducts a flat RESPAWN_PENALTY.
 *  - The score can never go below SCORE_FLOOR (0) or above MAX_SCORE (1000).
 *  - The formula is deterministic and stateless: same inputs → same output.
 */

import type { RunState } from './castleRescueTypes';
import {
  MAX_SCORE,
  TIME_PENALTY_PER_SECOND,
  RESPAWN_PENALTY,
  SCORE_FLOOR,
} from './castleRescueConstants';

/**
 * Compute the final score for a completed run.
 *
 * @param elapsedMs    - Milliseconds from run start to completion.
 * @param wrongAttempts - Number of wrong pipe clicks made during the run.
 * @returns            An integer score in [SCORE_FLOOR, MAX_SCORE].
 */
export function computeScore(elapsedMs: number, wrongAttempts: number): number {
  const elapsedSeconds = elapsedMs / 1000;
  const timePenalty = Math.floor(elapsedSeconds) * TIME_PENALTY_PER_SECOND;
  const respawnPenalty = wrongAttempts * RESPAWN_PENALTY;
  const raw = MAX_SCORE - timePenalty - respawnPenalty;
  return Math.max(SCORE_FLOOR, Math.min(MAX_SCORE, raw));
}

/**
 * Compute the score from a fully-completed RunState.
 * The state must have status === 'complete' with non-null endTimeMs.
 *
 * Edge-cases:
 *  - If endTimeMs is null (run not finished), returns SCORE_FLOOR (0).
 *  - If endTimeMs < startTimeMs (clock anomaly), elapsed defaults to 0.
 */
export function computeScoreFromState(state: RunState): number {
  if (state.endTimeMs === null) return SCORE_FLOOR;
  const elapsedMs = Math.max(0, state.endTimeMs - state.startTimeMs);
  return computeScore(elapsedMs, state.wrongAttempts);
}
