import type { ScoringWeights } from './types';

// ─── Default weights ──────────────────────────────────────────────────────────

/**
 * Default scoring weights used when no override is provided.
 * All values are in points.
 *
 * Special rule — wonBothGameAndFavorite:
 *   If a player wins *both* the game (finalPlacement === 1) and the
 *   Public's Favorite Player vote, their combined award for those two events
 *   is exactly `wonBothGameAndFavorite` points (50), NOT the sum of
 *   `wonGame` (100) + `wonPublicFavorite` (25).  See computeLeaderboard.ts.
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  perHohWin: 10,
  perPovWin: 8,
  madeJury: 5,
  perBattleBackWin: 8,
  survivedDoubleEviction: 7,
  survivedTripleEviction: 10,
  wonPublicFavorite: 25,
  wonGame: 100,
  wonBothGameAndFavorite: 50,
  wonFinalHoh: 15,
  runnerUp: 50,
};

/**
 * Return a new weights object by merging `overrides` on top of `base`.
 * Only the keys present in `overrides` are changed; all others keep their
 * base values.  Safe to call with a partial override at runtime (e.g. from
 * server config) without mutating the defaults.
 */
export function mergeWeights(
  overrides: Partial<ScoringWeights>,
  base: ScoringWeights = DEFAULT_WEIGHTS,
): ScoringWeights {
  return { ...base, ...overrides };
}
