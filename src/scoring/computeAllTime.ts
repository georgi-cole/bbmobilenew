import type { SeasonArchive } from '../store/seasonArchive';
import type { ScoringWeights } from './types';
import { DEFAULT_WEIGHTS } from './weights';
import { computeScoreBreakdown } from './computeLeaderboard';
import type { ScoreBreakdown } from './types';

// ─── All-time leaderboard ─────────────────────────────────────────────────────

export interface AllTimeEntry {
  playerId: string;
  displayName: string;
  /** Total score summed across all seasons. */
  totalScore: number;
  /** Number of seasons this player appeared in. */
  seasonsPlayed: number;
  /** Number of seasons this player won (finalPlacement === 1). */
  wins: number;
  /** Aggregated score breakdown across all seasons. */
  breakdown: ScoreBreakdown;
}

/**
 * Aggregate season archives into an all-time leaderboard.
 *
 * Players are matched across seasons by `playerId`.  Per-season scores are
 * computed with `computeScoreBreakdown` and summed into a single
 * `AllTimeEntry` per player.  Results are sorted descending by `totalScore`.
 *
 * Archives created before the scoring system was introduced (missing fields)
 * are handled gracefully: missing numeric fields default to 0, missing
 * boolean fields default to false.
 *
 * @param archives   All completed season archives (any order).
 * @param weights    Optional scoring weights; defaults to DEFAULT_WEIGHTS.
 */
export function computeAllTimeLeaderboard(
  archives: SeasonArchive[],
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): AllTimeEntry[] {
  const map = new Map<string, AllTimeEntry>();

  for (const archive of archives) {
    for (const summary of archive.playerSummaries) {
      const bd = computeScoreBreakdown(summary, weights);
      const existing = map.get(summary.playerId);
      if (existing) {
        existing.totalScore += bd.total;
        existing.seasonsPlayed += 1;
        if (summary.finalPlacement === 1) existing.wins += 1;
        // Sum each breakdown field
        existing.breakdown.hohWins += bd.hohWins;
        existing.breakdown.povWins += bd.povWins;
        existing.breakdown.madeJury += bd.madeJury;
        existing.breakdown.battleBackWins += bd.battleBackWins;
        existing.breakdown.survivedDoubleEviction += bd.survivedDoubleEviction;
        existing.breakdown.survivedTripleEviction += bd.survivedTripleEviction;
        existing.breakdown.wonPublicFavorite += bd.wonPublicFavorite;
        existing.breakdown.winBonus += bd.winBonus;
        existing.breakdown.wonFinalHoh += bd.wonFinalHoh;
        existing.breakdown.runnerUp += bd.runnerUp;
        existing.breakdown.total += bd.total;
      } else {
        map.set(summary.playerId, {
          playerId: summary.playerId,
          displayName: summary.displayName,
          totalScore: bd.total,
          seasonsPlayed: 1,
          wins: summary.finalPlacement === 1 ? 1 : 0,
          breakdown: { ...bd },
        });
      }
    }
  }

  const entries = Array.from(map.values());
  entries.sort((a, b) => b.totalScore - a.totalScore);
  return entries;
}
