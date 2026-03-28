/**
 * estimationGameUtils — pure helpers shared by EstimationGame and its tests.
 *
 * Kept in a separate module so EstimationGame.tsx satisfies the
 * react-refresh/only-export-components lint rule.
 */

/** Penalty per item off from the actual count. */
const PENALTY_PER_ITEM = 3;

/** Maximum score per round. */
const MAX_ROUND_SCORE = 100;

/** Total number of rounds in one Estimation game. */
export const NUM_ROUNDS = 5;

/**
 * Compute the score for a single round given the true count and the player's guess.
 * Returns a value in [0, MAX_ROUND_SCORE].
 */
export function computeRoundScore(actual: number, guess: number): number {
  const diff = Math.abs(actual - guess);
  return Math.max(0, Math.round(MAX_ROUND_SCORE - diff * PENALTY_PER_ITEM));
}

/**
 * Compute the average accuracy across all completed rounds.
 * Returns a value in [0, 100] (higher is better).
 * If no rounds have been played, returns 0.
 */
export function computeAverageAccuracy(roundScores: number[]): number {
  if (roundScores.length === 0) return 0;
  const sum = roundScores.reduce((s, r) => s + r, 0);
  return Math.round(sum / roundScores.length);
}

/**
 * Given a full scores record and an ordered participant list, compute the
 * authoritative last-place player ID.
 * The winner is excluded from last-place consideration.
 */
export function deriveLastPlaceId(
  scores: Record<string, number>,
  participants: string[],
  winnerId: string,
): string | undefined {
  const nonWinners = participants.filter((id) => id !== winnerId);
  if (nonWinners.length === 0) return undefined;
  return nonWinners.reduce(
    (worst, id) => (scores[id] ?? 0) < (scores[worst] ?? 0) ? id : worst,
    nonWinners[0],
  );
}
