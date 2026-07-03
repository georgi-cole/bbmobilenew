import { beforeEach, describe, expect, it } from 'vitest';
import {
  SURVIVOR_ACHIEVEMENTS,
  buildSurvivorAchievementDisplayModel,
  getEligibleSurvivorAchievements,
  getNextUnseenSurvivorCelebration,
  pickSurvivorAchievementToCelebrate,
  type SurvivorAchievementDefinition,
  type SurvivorAchievementUnlockMap,
} from './survivorAchievements';

describe('survivorAchievements helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('treats the unlock threshold as inclusive', () => {
    const eligible = getEligibleSurvivorAchievements(25).map((achievement) => achievement.id);

    expect(eligible).toContain('survivor-day-25');
    expect(eligible).not.toContain('survivor-day-50');
  });

  it('skips achievements that are already unlocked', () => {
    const eligible = getEligibleSurvivorAchievements(100, [
      'survivor-day-10',
      'survivor-day-25',
    ]).map((achievement) => achievement.id);

    expect(eligible).not.toContain('survivor-day-10');
    expect(eligible).not.toContain('survivor-day-25');
    expect(eligible).toContain('survivor-day-50');
  });

  it('masks secret achievements before unlock', () => {
    const secretAchievement = SURVIVOR_ACHIEVEMENTS.find(
      (achievement) => achievement.id === 'survivor-anomaly-404',
    );

    expect(secretAchievement).toBeDefined();

    const locked = buildSurvivorAchievementDisplayModel(secretAchievement!, null);

    expect(locked.title).toBe('???');
    expect(locked.subtitle).toBe('Secret anomaly');
    expect(locked.requirement).toBe('Hidden day requirement.');
  });

  it('reveals secret achievements after unlock', () => {
    const secretAchievement = SURVIVOR_ACHIEVEMENTS.find(
      (achievement) => achievement.id === 'survivor-anomaly-404',
    );

    expect(secretAchievement).toBeDefined();

    const unlocked = buildSurvivorAchievementDisplayModel(secretAchievement!, {
      id: secretAchievement!.id,
      unlockedAt: '2026-07-01T09:30:00.000Z',
      unlockedAtDay: 404,
      firstRunId: 'run-1',
      celebrationSeen: false,
    });

    expect(unlocked.title).toBe(secretAchievement!.name);
    expect(unlocked.subtitle).toBe(secretAchievement!.subtitle);
    expect(unlocked.requirement).toBe('Unlocked on Day 404.');
  });

  it('does not repeat the celebration once it has been seen', () => {
    const unlocks: SurvivorAchievementUnlockMap = {
      'survivor-day-10': {
        id: 'survivor-day-10',
        unlockedAt: '2026-07-01T09:30:00.000Z',
        unlockedAtDay: 10,
        firstRunId: 'run-1',
        celebrationSeen: true,
      },
    };

    expect(getNextUnseenSurvivorCelebration(unlocks)).toBeNull();
  });

  it('prioritizes mythic achievements over legendary ones and higher days within the same tier', () => {
    const customAchievements: SurvivorAchievementDefinition[] = [
      {
        id: 'legendary-low',
        day: 5000,
        name: 'Legendary Low',
        subtitle: 'legendary',
        category: 'mythic',
        visibility: 'visible',
        tier: 'legendary',
        effectStyle: 'flare',
      },
      {
        id: 'mythic-low',
        day: 6000,
        name: 'Mythic Low',
        subtitle: 'mythic',
        category: 'mythic',
        visibility: 'visible',
        tier: 'mythic',
        effectStyle: 'mythic',
      },
      {
        id: 'mythic-high',
        day: 10000,
        name: 'Mythic High',
        subtitle: 'mythic',
        category: 'mythic',
        visibility: 'visible',
        tier: 'mythic',
        effectStyle: 'mythic',
      },
    ];

    expect(pickSurvivorAchievementToCelebrate(customAchievements)?.id).toBe('mythic-high');
  });
});
