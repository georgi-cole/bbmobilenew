import type { PlayerSeasonSummary } from '../store/seasonArchive';
import type { ScoreBreakdown, ScoringWeights } from './types';
import { DEFAULT_WEIGHTS } from './weights';

// ─── Per-player season score ──────────────────────────────────────────────────

/**
 * Compute the full `ScoreBreakdown` for a single `PlayerSeasonSummary`.
 *
 * All raw fields are treated as 0 / false when absent so that archives
 * created before the scoring system was introduced continue to work.
 *
 * Special rule — wonBothGameAndFavorite:
 *   When the player both won the game (finalPlacement === 1) and the
 *   Public's Favorite Player vote, `winBonus` is set to
 *   `weights.wonBothGameAndFavorite` (50 by default) instead of the
 *   sum of `wonGame + wonPublicFavorite`.  This matches the documented
 *   requirement: "Won both Public's Favorite and the Game: 50 points total".
 *
 * @param summary   Per-player archive data for one completed season.
 * @param weights   Optional scoring weights; defaults to DEFAULT_WEIGHTS.
 */
export function computeScoreBreakdown(
  summary: PlayerSeasonSummary,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoreBreakdown {
  const hohWins = (summary.hohWins ?? 0) * weights.perHohWin;
  const povWins = (summary.povWins ?? 0) * weights.perPovWin;
  const madeJury = summary.madeJury ? weights.madeJury : 0;
  const battleBackWins = (summary.battleBackWins ?? 0) * weights.perBattleBackWin;
  const survivedDoubleEviction = summary.survivedDoubleEviction
    ? weights.survivedDoubleEviction
    : 0;
  const survivedTripleEviction = summary.survivedTripleEviction
    ? weights.survivedTripleEviction
    : 0;
  const wonFinalHoh = summary.wonFinalHoh ? weights.wonFinalHoh : 0;
  const runnerUp = summary.finalPlacement === 2 ? weights.runnerUp : 0;

  const isGameWinner = summary.finalPlacement === 1;
  const isFavoriteWinner = !!summary.wonPublicFavorite;

  // Public's Favorite points — may be superseded by the combined bonus below
  const wonPublicFavorite = isFavoriteWinner && !isGameWinner ? weights.wonPublicFavorite : 0;

  // Win bonus: use the combined award when both conditions are true
  let winBonus = 0;
  if (isGameWinner && isFavoriteWinner) {
    winBonus = weights.wonBothGameAndFavorite;
  } else if (isGameWinner) {
    winBonus = weights.wonGame;
  }

  const total =
    hohWins +
    povWins +
    madeJury +
    battleBackWins +
    survivedDoubleEviction +
    survivedTripleEviction +
    wonPublicFavorite +
    winBonus +
    wonFinalHoh +
    runnerUp;

  return {
    hohWins,
    povWins,
    madeJury,
    battleBackWins,
    survivedDoubleEviction,
    survivedTripleEviction,
    wonPublicFavorite,
    winBonus,
    wonFinalHoh,
    runnerUp,
    total,
  };
}

/**
 * Compute only the numeric total leaderboard score for a summary.
 * Convenience wrapper around `computeScoreBreakdown`.
 */
export function computeLeaderboardScore(
  summary: PlayerSeasonSummary,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): number {
  return computeScoreBreakdown(summary, weights).total;
}

// ─── Season leaderboard ───────────────────────────────────────────────────────

export interface SeasonLeaderboardEntry {
  playerId: string;
  displayName: string;
  score: number;
  breakdown: ScoreBreakdown;
  finalPlacement?: number | null;
}

/**
 * Produce a sorted season leaderboard from an array of `PlayerSeasonSummary`.
 * Entries are sorted descending by score; ties are broken by finalPlacement
 * (lower placement = higher rank, null/undefined placed last).
 *
 * @param summaries  Player summaries for a single season.
 * @param weights    Optional scoring weights; defaults to DEFAULT_WEIGHTS.
 */
export function computeSeasonLeaderboard(
  summaries: PlayerSeasonSummary[],
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): SeasonLeaderboardEntry[] {
  const entries: SeasonLeaderboardEntry[] = summaries.map((s) => {
    const breakdown = computeScoreBreakdown(s, weights);
    return {
      playerId: s.playerId,
      displayName: s.displayName,
      score: breakdown.total,
      breakdown,
      finalPlacement: s.finalPlacement,
    };
  });

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break by final placement (lower = better; null/undefined last)
    const pa = a.finalPlacement ?? Infinity;
    const pb = b.finalPlacement ?? Infinity;
    return pa - pb;
  });

  return entries;
}
