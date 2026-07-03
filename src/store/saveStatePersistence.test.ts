import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadSavedRunProfile,
  markSurvivorAchievementCelebrationSeen,
  saveRunSnapshot,
  savedRunsKeyForProfile,
  type SavedSeasonSnapshot,
} from './saveStatePersistence';

describe('saveStatePersistence survivor progression', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('normalizes missing survivor achievement unlock maps to an empty object', () => {
    localStorage.setItem(
      savedRunsKeyForProfile('profile-1'),
      JSON.stringify({
        version: 2,
        profileId: 'profile-1',
        savedAt: '2026-07-01T00:00:00.000Z',
        activeRunId: null,
        lastPlayedRunId: null,
        runs: {},
        stats: {
          maxSurvivorDaysSurvived: 37,
        },
      }),
    );

    expect(loadSavedRunProfile('profile-1').stats.survivorAchievementsUnlocked).toEqual({});
  });

  it('persists survivor unlocks and marks their celebration as seen', () => {
    const snapshot = {
      version: 1,
      profileId: 'profile-1',
      savedAt: '2026-07-01T12:00:00.000Z',
      game: {
        mode: 'survivor',
        week: 25,
        status: 'active',
        runId: 'run-1',
        gameId: 'game-1',
        players: [
          { id: 'user', name: 'You', avatar: '🙂', status: 'active', isUser: true },
          { id: 'ai-1', name: 'AI 1', avatar: 'A', status: 'active' },
          { id: 'ai-2', name: 'AI 2', avatar: 'B', status: 'active' },
        ],
        modeSpecific: {
          kind: 'survivor',
          currentDay: 25,
          bestDayReached: 25,
          startingCastSize: 9,
          totalRoboContestantsEvicted: 0,
          nextRoboIndex: 0,
        },
      },
      finale: {},
      social: {},
    } as SavedSeasonSnapshot;

    expect(saveRunSnapshot('profile-1', snapshot)).toBe(true);

    const afterUnlock = loadSavedRunProfile('profile-1');
    expect(afterUnlock.stats.maxSurvivorDaysSurvived).toBe(25);
    expect(Object.keys(afterUnlock.stats.survivorAchievementsUnlocked)).toEqual([
      'survivor-day-10',
      'survivor-day-25',
    ]);
    expect(afterUnlock.stats.survivorAchievementsUnlocked['survivor-day-25'].celebrationSeen).toBe(
      false,
    );

    expect(markSurvivorAchievementCelebrationSeen('profile-1', 'survivor-day-25')).toBe(true);
    expect(loadSavedRunProfile('profile-1').stats.survivorAchievementsUnlocked['survivor-day-25'].celebrationSeen).toBe(
      true,
    );
  });
});
