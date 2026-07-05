import type { GameState } from '../types';

export type SurvivorAchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary' | 'mythic';

export type SurvivorAchievementCategory = 'milestone' | 'ultra' | 'mythic' | 'anomaly';

export type SurvivorAchievementVisibility = 'visible' | 'secret';

export type SurvivorAchievementEffectStyle = 'spark' | 'glow' | 'flare' | 'mythic' | 'mystery';

export interface SurvivorAchievementDefinition {
  id: string;
  day: number;
  name: string;
  subtitle: string;
  category: SurvivorAchievementCategory;
  visibility: SurvivorAchievementVisibility;
  tier: SurvivorAchievementTier;
  effectStyle: SurvivorAchievementEffectStyle;
}

export interface SurvivorAchievementUnlock {
  id: string;
  unlockedAt: string;
  unlockedAtDay: number;
  firstRunId: string | null;
  celebrationSeen: boolean;
}

export type SurvivorAchievementUnlockMap = Record<string, SurvivorAchievementUnlock>;

export interface SurvivorAchievementDisplayModel {
  id: string;
  title: string;
  subtitle: string;
  requirement: string;
  tierLabel: string;
  categoryLabel: string;
  visibility: SurvivorAchievementVisibility;
  tier: SurvivorAchievementTier;
  day: number;
  isUnlocked: boolean;
  unlock: SurvivorAchievementUnlock | null;
  effectStyle: SurvivorAchievementEffectStyle;
}

export interface SurvivorAchievementProgressResult {
  unlocks: SurvivorAchievementUnlockMap;
  newlyUnlocked: SurvivorAchievementDefinition[];
}

const SURVIVOR_TIER_PRIORITY: Record<SurvivorAchievementTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  legendary: 4,
  mythic: 5,
};

const SURVIVOR_ACHIEVEMENT_DATA: SurvivorAchievementDefinition[] = [
  {
    id: 'survivor-day-10',
    day: 10,
    name: 'Signal Detected',
    subtitle: 'You survived long enough for the system to notice you.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'bronze',
    effectStyle: 'spark',
  },
  {
    id: 'survivor-day-25',
    day: 25,
    name: 'Not a Glitch',
    subtitle: 'Twenty-five days in. This is no accident anymore.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'bronze',
    effectStyle: 'spark',
  },
  {
    id: 'survivor-day-50',
    day: 50,
    name: 'Half-Century Human',
    subtitle: 'Fifty days survived against the synthetic house.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'silver',
    effectStyle: 'glow',
  },
  {
    id: 'survivor-day-100',
    day: 100,
    name: 'The Human Anomaly',
    subtitle: 'One hundred days survived. The AI has no clean explanation.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'silver',
    effectStyle: 'glow',
  },
  {
    id: 'survivor-day-200',
    day: 200,
    name: 'Still Loading',
    subtitle: 'Two hundred days in, and the exit button is still missing.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'gold',
    effectStyle: 'flare',
  },
  {
    id: 'survivor-day-300',
    day: 300,
    name: 'Long-Term Problem',
    subtitle: 'You are no longer a contestant. You are a design flaw.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'gold',
    effectStyle: 'flare',
  },
  {
    id: 'survivor-day-365',
    day: 365,
    name: 'One Year in the Machine',
    subtitle: 'Three hundred sixty-five days inside an endless game.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'platinum',
    effectStyle: 'glow',
  },
  {
    id: 'survivor-day-400',
    day: 400,
    name: 'Error Tolerance',
    subtitle: 'Four hundred days survived. The system has adapted badly.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'platinum',
    effectStyle: 'glow',
  },
  {
    id: 'survivor-day-500',
    day: 500,
    name: 'Myth of the House',
    subtitle: 'The AI players are replacing each other around your legend.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'legendary',
    effectStyle: 'flare',
  },
  {
    id: 'survivor-day-1000',
    day: 1000,
    name: 'Permanent Error',
    subtitle: 'One thousand days survived. The system has learned to fear the exception.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'legendary',
    effectStyle: 'flare',
  },
  {
    id: 'survivor-day-2000',
    day: 2000,
    name: 'Second Millennium',
    subtitle: 'Two thousand days. The house has rebuilt itself around you.',
    category: 'ultra',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-3000',
    day: 3000,
    name: 'Synthetic Folklore',
    subtitle: 'New robo players enter already knowing your name.',
    category: 'ultra',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-4000',
    day: 4000,
    name: 'The Endless Resident',
    subtitle: 'You do not live in the house. The house lives around you.',
    category: 'ultra',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-5000',
    day: 5000,
    name: 'Impossible Tenant',
    subtitle: 'Five thousand days survived. The game has stopped pretending this is normal.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-6000',
    day: 6000,
    name: 'Machine-Worn Human',
    subtitle: 'The system is aging faster than you are.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-7000',
    day: 7000,
    name: 'Beyond Balance',
    subtitle: 'No simulation was meant to carry you this far.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-8000',
    day: 8000,
    name: 'Permanent Occupant',
    subtitle: 'Eight thousand days. The house has accepted the bug.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-9000',
    day: 9000,
    name: 'Over 9000',
    subtitle: 'The survival level is no longer measurable.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-10000',
    day: 10000,
    name: 'Five-Digit Survival',
    subtitle: 'Ten thousand days. You are no longer in Survival mode. Survival mode is in you.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-100000',
    day: 100000,
    name: 'The Immortal Exception',
    subtitle: 'One hundred thousand days. The system ends before you do.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-anomaly-69',
    day: 69,
    name: 'Nice Try, Algorithm',
    subtitle: 'The system tried to stay serious. You ruined that.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'silver',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-111',
    day: 111,
    name: 'Triple Signal',
    subtitle: 'Three ones. One human. Zero explanations.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'silver',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-314',
    day: 314,
    name: 'Pi in the Machine',
    subtitle: 'The numbers are irrational. So is your survival.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'gold',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-404',
    day: 404,
    name: 'Human Not Found',
    subtitle: 'The system searched for your elimination. No result.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'gold',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-444',
    day: 444,
    name: 'Synchronized Threat',
    subtitle: 'The house numbers lined up. Nobody feels safer.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'platinum',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-666',
    day: 666,
    name: 'Cursed Runtime',
    subtitle: 'Something unholy is keeping this run alive.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'platinum',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-777',
    day: 777,
    name: 'Jackpot Survival',
    subtitle: 'The house rolled lucky. Unfortunately, so did you.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'legendary',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-888',
    day: 888,
    name: 'Infinite Loop Energy',
    subtitle: 'The symbols repeat. The run refuses to end.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'legendary',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-999',
    day: 999,
    name: 'Almost Permanent',
    subtitle: 'One day before the line between player and bug disappears.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'legendary',
    effectStyle: 'mystery',
  },
];

export const SURVIVOR_ACHIEVEMENTS: readonly SurvivorAchievementDefinition[] =
  Object.freeze(SURVIVOR_ACHIEVEMENT_DATA.slice());

export const SURVIVOR_ACHIEVEMENTS_BY_ID: Readonly<Record<string, SurvivorAchievementDefinition>> =
  Object.freeze(
    SURVIVOR_ACHIEVEMENT_DATA.reduce<Record<string, SurvivorAchievementDefinition>>((acc, achievement) => {
      acc[achievement.id] = achievement;
      return acc;
    }, {}),
  );

function isFiniteDay(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function normalizeTierLabel(tier: SurvivorAchievementTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function normalizeCategoryLabel(category: SurvivorAchievementCategory): string {
  switch (category) {
    case 'milestone':
      return 'Milestone';
    case 'ultra':
      return 'Ultra';
    case 'mythic':
      return 'Mythic';
    case 'anomaly':
      return 'Secret anomaly';
    default:
      return category;
  }
}

export function getSurvivorProgressDay(game: Pick<GameState, 'week' | 'modeSpecific'> | null | undefined): number {
  if (!game) return 0;
  const survivorState = game.modeSpecific?.kind === 'survival' ? game.modeSpecific : null;
  return Math.max(game.week ?? 1, survivorState?.currentDay ?? 1, survivorState?.bestDayReached ?? 1);
}

export function normalizeSurvivorAchievementUnlockMap(raw: unknown): SurvivorAchievementUnlockMap {
  if (!raw || typeof raw !== 'object') return {};

  const result: SurvivorAchievementUnlockMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const achievement = SURVIVOR_ACHIEVEMENTS_BY_ID[id];
    if (!achievement || !value || typeof value !== 'object') continue;

    const parsed = value as Record<string, unknown>;
    const unlockedAt =
      typeof parsed.unlockedAt === 'string' && parsed.unlockedAt.trim()
        ? parsed.unlockedAt
        : null;
    const unlockedAtDay =
      typeof parsed.unlockedAtDay === 'number' && Number.isFinite(parsed.unlockedAtDay)
        ? parsed.unlockedAtDay
        : null;
    if (!unlockedAt || unlockedAtDay == null) continue;

    result[id] = {
      id,
      unlockedAt,
      unlockedAtDay,
      firstRunId:
        typeof parsed.firstRunId === 'string' && parsed.firstRunId.trim()
          ? parsed.firstRunId
          : null,
      celebrationSeen: parsed.celebrationSeen === true,
    };
  }

  return result;
}

export function getEligibleSurvivorAchievements(
  bestDayReached: number,
  unlockedIds: Iterable<string> = [],
): SurvivorAchievementDefinition[] {
  const normalizedBestDay = isFiniteDay(bestDayReached) ? Math.floor(bestDayReached) : 0;
  const unlocked = new Set(unlockedIds);
  return SURVIVOR_ACHIEVEMENTS.filter(
    (achievement) => normalizedBestDay >= achievement.day && !unlocked.has(achievement.id),
  );
}

export function pickSurvivorAchievementToCelebrate(
  achievements: readonly SurvivorAchievementDefinition[],
): SurvivorAchievementDefinition | null {
  if (achievements.length === 0) return null;

  return [...achievements].sort((left, right) => {
    const tierDelta = SURVIVOR_TIER_PRIORITY[right.tier] - SURVIVOR_TIER_PRIORITY[left.tier];
    if (tierDelta !== 0) return tierDelta;
    const dayDelta = right.day - left.day;
    if (dayDelta !== 0) return dayDelta;
    return left.name.localeCompare(right.name);
  })[0] ?? null;
}

export function applySurvivorAchievementProgress(
  currentUnlocks: SurvivorAchievementUnlockMap,
  bestDayReached: number,
  runId: string | null = null,
  savedAt = new Date().toISOString(),
): SurvivorAchievementProgressResult {
  const eligible = getEligibleSurvivorAchievements(bestDayReached, Object.keys(currentUnlocks));
  if (eligible.length === 0) {
    return {
      unlocks: currentUnlocks,
      newlyUnlocked: [],
    };
  }

  const normalizedBestDay = isFiniteDay(bestDayReached) ? Math.floor(bestDayReached) : 0;
  const nextUnlocks = { ...currentUnlocks };
  for (const achievement of eligible) {
    nextUnlocks[achievement.id] = {
      id: achievement.id,
      unlockedAt: savedAt,
      unlockedAtDay: normalizedBestDay,
      firstRunId: runId,
      celebrationSeen: false,
    };
  }

  return {
    unlocks: nextUnlocks,
    newlyUnlocked: eligible,
  };
}

export function getNextUnseenSurvivorCelebration(unlocks: SurvivorAchievementUnlockMap): {
  achievement: SurvivorAchievementDefinition;
  unlock: SurvivorAchievementUnlock;
} | null {
  const pending = SURVIVOR_ACHIEVEMENTS.filter((achievement) => {
    const unlock = unlocks[achievement.id];
    return unlock != null && !unlock.celebrationSeen;
  });
  const achievement = pickSurvivorAchievementToCelebrate(pending);
  if (!achievement) return null;

  return {
    achievement,
    unlock: unlocks[achievement.id],
  };
}

export function buildSurvivorAchievementDisplayModel(
  achievement: SurvivorAchievementDefinition,
  unlock: SurvivorAchievementUnlock | null | undefined,
): SurvivorAchievementDisplayModel {
  const isUnlocked = unlock != null;
  const visibility = achievement.visibility;
  const tierLabel = normalizeTierLabel(achievement.tier);
  const categoryLabel = normalizeCategoryLabel(achievement.category);

  if (isUnlocked) {
    return {
      id: achievement.id,
      title: achievement.name,
      subtitle: achievement.subtitle,
      requirement: `Unlocked on Day ${unlock.unlockedAtDay}.`,
      tierLabel,
      categoryLabel,
      visibility,
      tier: achievement.tier,
      day: achievement.day,
      isUnlocked: true,
      unlock,
      effectStyle: achievement.effectStyle,
    };
  }

  if (visibility === 'secret') {
    return {
      id: achievement.id,
      title: '???',
      subtitle: 'Secret anomaly',
      requirement: 'Hidden day requirement.',
      tierLabel,
      categoryLabel,
      visibility,
      tier: achievement.tier,
      day: achievement.day,
      isUnlocked: false,
      unlock: null,
      effectStyle: achievement.effectStyle,
    };
  }

  return {
    id: achievement.id,
    title: achievement.name,
    subtitle: achievement.subtitle,
    requirement: `Reach Day ${achievement.day} in Survival Mode.`,
    tierLabel,
    categoryLabel,
    visibility,
    tier: achievement.tier,
    day: achievement.day,
    isUnlocked: false,
    unlock: null,
    effectStyle: achievement.effectStyle,
  };
}

export function buildUnlockedSurvivorAchievementDisplayModels(
  unlocks: SurvivorAchievementUnlockMap,
): SurvivorAchievementDisplayModel[] {
  return SURVIVOR_ACHIEVEMENTS
    .filter((achievement) => unlocks[achievement.id] != null)
    .map((achievement) =>
      buildSurvivorAchievementDisplayModel(achievement, unlocks[achievement.id]),
    )
    .sort((left, right) => {
      const rightUnlockDay = right.unlock?.unlockedAtDay ?? right.day;
      const leftUnlockDay = left.unlock?.unlockedAtDay ?? left.day;
      if (rightUnlockDay !== leftUnlockDay) return rightUnlockDay - leftUnlockDay;

      const rightUnlockedAt = right.unlock?.unlockedAt ?? '';
      const leftUnlockedAt = left.unlock?.unlockedAt ?? '';
      if (rightUnlockedAt !== leftUnlockedAt) {
        return rightUnlockedAt.localeCompare(leftUnlockedAt);
      }

      return right.day - left.day;
    });
}
