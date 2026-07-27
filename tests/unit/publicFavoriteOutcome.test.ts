import { describe, expect, it } from 'vitest';
import { buildPublicFavoriteForecast } from '../../src/components/PublicFavoriteOverlay/publicFavoriteOutcome';
import type { PublicOpinionState } from '../../src/publicOpinion/types';
import type { Player } from '../../src/types';

const CANDIDATES: Player[] = [
  {
    id: 'low',
    name: 'Low',
    avatar: 'L',
    status: 'jury',
    stats: { lohWins: 1, posWins: 0, timesNominated: 2 },
  },
  {
    id: 'favorite',
    name: 'Favorite',
    avatar: 'F',
    status: 'jury',
    stats: { lohWins: 2, posWins: 1, timesNominated: 1 },
  },
  {
    id: 'middle',
    name: 'Middle',
    avatar: 'M',
    status: 'evicted',
    stats: { lohWins: 0, posWins: 1, timesNominated: 4 },
  },
];

const PUBLIC_OPINION: PublicOpinionState = {
  profiles: {
    low: {
      playerId: 'low',
      approval: 24,
      previousApproval: 30,
      seasonApprovals: [50, 38, 30, 24],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 2,
    },
    favorite: {
      playerId: 'favorite',
      approval: 86,
      previousApproval: 76,
      seasonApprovals: [52, 63, 76, 86],
      completedDirectionCount: 3,
      cumulativePositiveDelta: 38,
    },
    middle: {
      playerId: 'middle',
      approval: 55,
      previousApproval: 56,
      seasonApprovals: [50, 58, 56, 55],
      completedDirectionCount: 1,
      cumulativePositiveDelta: 12,
    },
  },
  directions: [],
  feed: [
    {
      id: 'favorite-headline',
      playerId: 'favorite',
      text: 'The audience loved the move.',
      delta: 12,
      week: 8,
      timestamp: 1,
      isHeadline: true,
    },
  ],
  lastUpdatedWeek: 8,
  feedPostsThisDay: 1,
  currentFeedDay: 8,
};

describe('buildPublicFavoriteForecast', () => {
  it('makes the season-long public favorite authoritative across seeds', () => {
    for (const seed of [1, 2, 3, 999, 0xffffffff]) {
      const forecast = buildPublicFavoriteForecast(CANDIDATES, PUBLIC_OPINION, seed);
      expect(forecast.winnerId).toBe('favorite');
      expect(forecast.targetPercentages.favorite).toBeGreaterThan(
        forecast.targetPercentages.middle,
      );
      expect(forecast.targetPercentages.middle).toBeGreaterThan(
        forecast.targetPercentages.low,
      );
    }
  });

  it('is deterministic and produces a complete 100-percent board', () => {
    const first = buildPublicFavoriteForecast(CANDIDATES, PUBLIC_OPINION, 41);
    const second = buildPublicFavoriteForecast(CANDIDATES, PUBLIC_OPINION, 41);
    expect(second).toEqual(first);
    expect(
      Object.values(first.targetPercentages).reduce((sum, value) => sum + value, 0),
    ).toBe(100);
  });

  it('handles empty and single-candidate pools explicitly', () => {
    expect(buildPublicFavoriteForecast([], PUBLIC_OPINION, 1)).toEqual({
      entries: [],
      targetPercentages: {},
      winnerId: null,
    });

    const single = buildPublicFavoriteForecast([CANDIDATES[0]], PUBLIC_OPINION, 1);
    expect(single.winnerId).toBe('low');
    expect(single.targetPercentages).toEqual({ low: 100 });
  });
});
