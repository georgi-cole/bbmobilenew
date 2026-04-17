import { describe, expect, it } from 'vitest';
import type { Player } from '../src/types';
import type { SeasonArchive } from '../src/store/seasonArchive';
import {
  buildAchievementSummary,
  findArchiveUserSummary,
} from '../src/store/achievementSummary';

function makeUser(overrides: Partial<Player> = {}): Player {
  return {
    id: 'user',
    name: 'Jordan',
    avatar: '🧑',
    status: 'active',
    isUser: true,
    stats: {
      lohWins: 0,
      posWins: 0,
      timesNominated: 0,
    },
    ...overrides,
  };
}

function makeArchive(overrides: Partial<SeasonArchive> = {}): SeasonArchive {
  return {
    seasonIndex: 1,
    seasonId: 'season-1',
    playerSummaries: [],
    ...overrides,
  };
}

describe('findArchiveUserSummary', () => {
  it('falls back to displayName matching when archived playerId is not the current user id', () => {
    const archive = makeArchive({
      playerSummaries: [
        {
          playerId: 'legacy-profile-id',
          displayName: 'Jordan',
          finalPlacement: 1,
        },
      ],
    });

    const summary = findArchiveUserSummary(archive, makeUser());
    expect(summary?.playerId).toBe('legacy-profile-id');
    expect(summary?.displayName).toBe('Jordan');
  });
});

describe('buildAchievementSummary', () => {
  it('derives non-zero totals from archived seasons even when the archived user id is legacy/mismatched', () => {
    const summary = buildAchievementSummary({
      userPlayer: makeUser(),
      day: 1,
      phase: 'week_start',
      seasonArchives: [
        makeArchive({
          seasonIndex: 3,
          seasonId: 'season-3',
          rewardsEarned: ['egg-1'],
          playerSummaries: [
            {
              playerId: 'legacy-profile-id',
              displayName: 'Jordan',
              finalPlacement: 1,
              lohWins: 2,
              posWins: 1,
              battleBackWins: 0,
              timesNominated: 2,
              wonPublicFavorite: true,
              wonFinalHoh: true,
              survivedDoubleEviction: true,
              daysAlive: 10,
              isEvicted: false,
              madeJury: false,
            },
          ],
        }),
        makeArchive({
          seasonIndex: 2,
          seasonId: 'season-2',
          rewardsEarned: ['egg-2'],
          playerSummaries: [
            {
              playerId: 'legacy-profile-id-2',
              displayName: 'Jordan',
              finalPlacement: 4,
              lohWins: 1,
              posWins: 2,
              battleBackWins: 1,
              timesNominated: 3,
              daysAlive: 7,
              isEvicted: true,
              madeJury: true,
            },
          ],
        }),
      ],
    });

    expect(summary.totals.seasonsPlayed).toBe(2);
    expect(summary.totals.seasonsWon).toBe(1);
    expect(summary.totals.lohWins).toBe(3);
    expect(summary.totals.posWins).toBe(3);
    expect(summary.totals.battleBackWins).toBe(1);
    expect(summary.totals.publicFavoriteWins).toBe(1);
    expect(summary.totals.rewardsFound).toBe(2);
    expect(summary.totals.doubleEvictionSurvivals).toBe(1);
    expect(summary.totals.averageDaysSurvived).toBe('8.5 days');
    expect(summary.highlightBadges).toContain('🏆 Season champ ×1');
    expect(summary.highlightBadges).toContain('🌟 Public favorite ×1');
    expect(summary.highlightBadges).toContain('💪 Comp beast ×7');
  });
});
