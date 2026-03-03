/**
 * Scoreboard compute module — unit tests.
 *
 * Validates:
 *  1. computeScoreBreakdown returns zeros for an empty summary.
 *  2. Each scoring event produces the correct points with default weights.
 *  3. The wonBothGameAndFavorite rule: combined award replaces wonGame + wonPublicFavorite.
 *  4. computeSeasonLeaderboard sorts correctly and breaks ties by finalPlacement.
 *  5. computeAllTimeLeaderboard aggregates across multiple seasons.
 *  6. mergeWeights correctly overrides a subset of default weights.
 *  7. Missing / undefined fields on PlayerSeasonSummary are treated as 0/false.
 */

import { describe, it, expect } from 'vitest';
import type { PlayerSeasonSummary } from '../src/store/seasonArchive';
import type { SeasonArchive } from '../src/store/seasonArchive';
import { computeScoreBreakdown, computeLeaderboardScore, computeSeasonLeaderboard } from '../src/scoring/computeLeaderboard';
import { computeAllTimeLeaderboard } from '../src/scoring/computeAllTime';
import { DEFAULT_WEIGHTS, mergeWeights } from '../src/scoring/weights';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<PlayerSeasonSummary> = {}): PlayerSeasonSummary {
  return {
    playerId: 'p1',
    displayName: 'Player 1',
    finalPlacement: null,
    ...overrides,
  };
}

function makeArchive(seasonIndex: number, summaries: PlayerSeasonSummary[]): SeasonArchive {
  return {
    seasonIndex,
    seasonId: `season-${seasonIndex}`,
    playerSummaries: summaries,
  };
}

// ── computeScoreBreakdown ─────────────────────────────────────────────────────

describe('computeScoreBreakdown', () => {
  it('returns all zeros for an empty summary', () => {
    const bd = computeScoreBreakdown(makeSummary());
    expect(bd.total).toBe(0);
    expect(bd.hohWins).toBe(0);
    expect(bd.povWins).toBe(0);
    expect(bd.madeJury).toBe(0);
    expect(bd.battleBackWins).toBe(0);
    expect(bd.survivedDoubleEviction).toBe(0);
    expect(bd.survivedTripleEviction).toBe(0);
    expect(bd.wonPublicFavorite).toBe(0);
    expect(bd.winBonus).toBe(0);
    expect(bd.wonFinalHoh).toBe(0);
    expect(bd.runnerUp).toBe(0);
  });

  it('awards perHohWin points per HOH win', () => {
    const bd = computeScoreBreakdown(makeSummary({ hohWins: 3 }));
    expect(bd.hohWins).toBe(3 * DEFAULT_WEIGHTS.perHohWin);
  });

  it('awards perPovWin points per POV win', () => {
    const bd = computeScoreBreakdown(makeSummary({ povWins: 2 }));
    expect(bd.povWins).toBe(2 * DEFAULT_WEIGHTS.perPovWin);
  });

  it('awards madeJury points when madeJury is true', () => {
    const bd = computeScoreBreakdown(makeSummary({ madeJury: true }));
    expect(bd.madeJury).toBe(DEFAULT_WEIGHTS.madeJury);
  });

  it('awards perBattleBackWin points per Battle Back win', () => {
    const bd = computeScoreBreakdown(makeSummary({ battleBackWins: 1 }));
    expect(bd.battleBackWins).toBe(DEFAULT_WEIGHTS.perBattleBackWin);
  });

  it('awards survivedDoubleEviction points', () => {
    const bd = computeScoreBreakdown(makeSummary({ survivedDoubleEviction: true }));
    expect(bd.survivedDoubleEviction).toBe(DEFAULT_WEIGHTS.survivedDoubleEviction);
  });

  it('awards survivedTripleEviction points', () => {
    const bd = computeScoreBreakdown(makeSummary({ survivedTripleEviction: true }));
    expect(bd.survivedTripleEviction).toBe(DEFAULT_WEIGHTS.survivedTripleEviction);
  });

  it('awards wonPublicFavorite points when player wins favorite and does NOT win game', () => {
    const bd = computeScoreBreakdown(makeSummary({ wonPublicFavorite: true, finalPlacement: null }));
    expect(bd.wonPublicFavorite).toBe(DEFAULT_WEIGHTS.wonPublicFavorite);
    expect(bd.winBonus).toBe(0);
  });

  it('awards wonGame (winBonus) when player wins the game', () => {
    const bd = computeScoreBreakdown(makeSummary({ finalPlacement: 1 }));
    expect(bd.winBonus).toBe(DEFAULT_WEIGHTS.wonGame);
    expect(bd.wonPublicFavorite).toBe(0);
  });

  it('awards wonFinalHoh points', () => {
    const bd = computeScoreBreakdown(makeSummary({ wonFinalHoh: true }));
    expect(bd.wonFinalHoh).toBe(DEFAULT_WEIGHTS.wonFinalHoh);
  });

  it('awards runnerUp points for finalPlacement === 2', () => {
    const bd = computeScoreBreakdown(makeSummary({ finalPlacement: 2 }));
    expect(bd.runnerUp).toBe(DEFAULT_WEIGHTS.runnerUp);
    expect(bd.winBonus).toBe(0);
  });

  it('uses wonBothGameAndFavorite when player wins both game and public favorite', () => {
    const bd = computeScoreBreakdown(makeSummary({ finalPlacement: 1, wonPublicFavorite: true }));
    // winBonus = wonBothGameAndFavorite (50), NOT wonGame (100) + wonPublicFavorite (25)
    expect(bd.winBonus).toBe(DEFAULT_WEIGHTS.wonBothGameAndFavorite);
    // wonPublicFavorite field should be 0 (included in winBonus)
    expect(bd.wonPublicFavorite).toBe(0);
    expect(bd.total).toBe(DEFAULT_WEIGHTS.wonBothGameAndFavorite);
  });

  it('computes correct total for a typical winner', () => {
    const bd = computeScoreBreakdown(
      makeSummary({
        finalPlacement: 1,
        hohWins: 2,
        povWins: 1,
        madeJury: true,
        wonFinalHoh: true,
      }),
    );
    const expected =
      2 * DEFAULT_WEIGHTS.perHohWin +
      1 * DEFAULT_WEIGHTS.perPovWin +
      DEFAULT_WEIGHTS.madeJury +
      DEFAULT_WEIGHTS.wonGame +
      DEFAULT_WEIGHTS.wonFinalHoh;
    expect(bd.total).toBe(expected);
  });

  it('treats missing fields as 0/false', () => {
    // Intentionally pass an object with only required fields
    const summary: PlayerSeasonSummary = { playerId: 'x', displayName: 'X' };
    expect(() => computeScoreBreakdown(summary)).not.toThrow();
    const bd = computeScoreBreakdown(summary);
    expect(bd.total).toBe(0);
  });
});

// ── computeLeaderboardScore ───────────────────────────────────────────────────

describe('computeLeaderboardScore', () => {
  it('returns the same value as breakdown.total', () => {
    const s = makeSummary({ hohWins: 1, povWins: 1, madeJury: true });
    expect(computeLeaderboardScore(s)).toBe(computeScoreBreakdown(s).total);
  });
});

// ── mergeWeights ──────────────────────────────────────────────────────────────

describe('mergeWeights', () => {
  it('keeps unchanged keys from base', () => {
    const merged = mergeWeights({ perHohWin: 20 });
    expect(merged.perHohWin).toBe(20);
    expect(merged.perPovWin).toBe(DEFAULT_WEIGHTS.perPovWin);
  });

  it('does not mutate the DEFAULT_WEIGHTS object', () => {
    const before = DEFAULT_WEIGHTS.perHohWin;
    mergeWeights({ perHohWin: 99 });
    expect(DEFAULT_WEIGHTS.perHohWin).toBe(before);
  });
});

// ── computeSeasonLeaderboard ──────────────────────────────────────────────────

describe('computeSeasonLeaderboard', () => {
  it('sorts entries by score descending', () => {
    const summaries: PlayerSeasonSummary[] = [
      makeSummary({ playerId: 'p1', displayName: 'P1', hohWins: 1 }),
      makeSummary({ playerId: 'p2', displayName: 'P2', hohWins: 3 }),
      makeSummary({ playerId: 'p3', displayName: 'P3' }),
    ];
    const entries = computeSeasonLeaderboard(summaries);
    expect(entries[0].playerId).toBe('p2');
    expect(entries[1].playerId).toBe('p1');
    expect(entries[2].playerId).toBe('p3');
  });

  it('breaks ties by finalPlacement (lower is better)', () => {
    const summaries: PlayerSeasonSummary[] = [
      makeSummary({ playerId: 'p1', displayName: 'P1', finalPlacement: 3 }),
      makeSummary({ playerId: 'p2', displayName: 'P2', finalPlacement: 1 }),
    ];
    const entries = computeSeasonLeaderboard(summaries);
    // Both have score 0; player with placement 1 wins the tie
    expect(entries[0].playerId).toBe('p2');
  });

  it('handles an empty array', () => {
    expect(computeSeasonLeaderboard([])).toEqual([]);
  });
});

// ── computeAllTimeLeaderboard ─────────────────────────────────────────────────

describe('computeAllTimeLeaderboard', () => {
  it('aggregates scores for the same playerId across seasons', () => {
    const archives: SeasonArchive[] = [
      makeArchive(1, [makeSummary({ playerId: 'p1', displayName: 'P1', hohWins: 1 })]),
      makeArchive(2, [makeSummary({ playerId: 'p1', displayName: 'P1', hohWins: 2 })]),
    ];
    const entries = computeAllTimeLeaderboard(archives);
    expect(entries).toHaveLength(1);
    expect(entries[0].playerId).toBe('p1');
    expect(entries[0].seasonsPlayed).toBe(2);
    expect(entries[0].totalScore).toBe(3 * DEFAULT_WEIGHTS.perHohWin);
  });

  it('counts wins correctly', () => {
    const archives: SeasonArchive[] = [
      makeArchive(1, [makeSummary({ playerId: 'p1', displayName: 'P1', finalPlacement: 1 })]),
      makeArchive(2, [makeSummary({ playerId: 'p1', displayName: 'P1', finalPlacement: 2 })]),
    ];
    const entries = computeAllTimeLeaderboard(archives);
    expect(entries[0].wins).toBe(1);
  });

  it('handles multiple players across multiple seasons', () => {
    const archives: SeasonArchive[] = [
      makeArchive(1, [
        makeSummary({ playerId: 'p1', displayName: 'P1', hohWins: 2 }),
        makeSummary({ playerId: 'p2', displayName: 'P2', povWins: 1 }),
      ]),
    ];
    const entries = computeAllTimeLeaderboard(archives);
    expect(entries).toHaveLength(2);
    // p1 should be ranked higher
    expect(entries[0].playerId).toBe('p1');
  });

  it('handles an empty archives array', () => {
    expect(computeAllTimeLeaderboard([])).toEqual([]);
  });
});
