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
    name: 'First Spar',
    subtitle: 'Ten days in Survivor Mode is enough to start leaving a mark.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'bronze',
    effectStyle: 'spark',
  },
  {
    id: 'survivor-day-25',
    day: 25,
    name: 'Heat Check',
    subtitle: 'A full month of pressure, and the run is still breathing.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'bronze',
    effectStyle: 'spark',
  },
  {
    id: 'survivor-day-50',
    day: 50,
    name: 'Halfway Fire',
    subtitle: 'Fifty days in Survivor Mode with the game still in your hands.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'silver',
    effectStyle: 'glow',
  },
  {
    id: 'survivor-day-100',
    day: 100,
    name: 'Century Run',
    subtitle: 'Three digits of Survivor Mode, no flinch required.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'silver',
    effectStyle: 'glow',
  },
  {
    id: 'survivor-day-200',
    day: 200,
    name: 'Pressure Proof',
    subtitle: 'Two hundred days and the floor is still holding.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'gold',
    effectStyle: 'flare',
  },
  {
    id: 'survivor-day-300',
    day: 300,
    name: 'Long Haul',
    subtitle: 'Survivor Mode becomes a habit somewhere around here.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'gold',
    effectStyle: 'flare',
  },
  {
    id: 'survivor-day-365',
    day: 365,
    name: 'Year One',
    subtitle: 'A full year in Survivor Mode deserves a proper spotlight.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'platinum',
    effectStyle: 'glow',
  },
  {
    id: 'survivor-day-400',
    day: 400,
    name: 'Skyline',
    subtitle: 'The run is starting to look architectural.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'platinum',
    effectStyle: 'glow',
  },
  {
    id: 'survivor-day-500',
    day: 500,
    name: 'Five Hundred Club',
    subtitle: 'A half-millennium of Survivor Mode is real commitment.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'legendary',
    effectStyle: 'flare',
  },
  {
    id: 'survivor-day-1000',
    day: 1000,
    name: 'Millennium Survivor',
    subtitle: 'A four-digit run that belongs on the wall.',
    category: 'milestone',
    visibility: 'visible',
    tier: 'legendary',
    effectStyle: 'flare',
  },
  {
    id: 'survivor-day-2000',
    day: 2000,
    name: 'Deep Archive',
    subtitle: 'Survivor Mode has become part of the profile history.',
    category: 'ultra',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-3000',
    day: 3000,
    name: 'Pressure Atlas',
    subtitle: 'Three thousand days of keeping the lights on.',
    category: 'ultra',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-4000',
    day: 4000,
    name: 'Signal Tower',
    subtitle: 'The Survivor profile is now visible from orbit.',
    category: 'ultra',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-5000',
    day: 5000,
    name: 'Mythic Five',
    subtitle: 'Five thousand days in Survivor Mode changes the shape of the file.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-6000',
    day: 6000,
    name: 'Mythic Six',
    subtitle: 'The profile has started collecting weather.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-7000',
    day: 7000,
    name: 'Mythic Seven',
    subtitle: 'Seven thousand days of pure stubbornness.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-8000',
    day: 8000,
    name: 'Mythic Eight',
    subtitle: 'By this point, Survivor Mode feels like a second home hub.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-9000',
    day: 9000,
    name: 'Mythic Nine',
    subtitle: 'The archive is getting heavier by the day.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-10000',
    day: 10000,
    name: 'Ten Thousand Days',
    subtitle: 'An impossible-looking milestone made visible anyway.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-day-100000',
    day: 100000,
    name: 'Forever Mode',
    subtitle: 'A myth so large it has to be treated like a landmark.',
    category: 'mythic',
    visibility: 'visible',
    tier: 'mythic',
    effectStyle: 'mythic',
  },
  {
    id: 'survivor-anomaly-69',
    day: 69,
    name: 'Lucky 69',
    subtitle: 'A suspiciously satisfying anomaly.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'silver',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-111',
    day: 111,
    name: 'Triple Signal',
    subtitle: 'Three ones, no explanation needed.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'silver',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-314',
    day: 314,
    name: 'Pi Day',
    subtitle: 'A hidden curve in the run.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'gold',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-404',
    day: 404,
    name: 'Not Found',
    subtitle: 'The day the signal folded in on itself.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'gold',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-444',
    day: 444,
    name: 'Mirror Wall',
    subtitle: 'A pattern that looks like it belongs to someone else.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'platinum',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-666',
    day: 666,
    name: 'Triple Six',
    subtitle: 'A loud little omen for the Survivor record book.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'platinum',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-777',
    day: 777,
    name: 'Jackpot Seven',
    subtitle: 'A secret that arrives with extra sparkle.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'legendary',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-888',
    day: 888,
    name: 'Infinite Loop',
    subtitle: 'The run seems to know where it is going.',
    category: 'anomaly',
    visibility: 'secret',
    tier: 'legendary',
    effectStyle: 'mystery',
  },
  {
    id: 'survivor-anomaly-999',
    day: 999,
    name: 'Almost There',
    subtitle: 'One breath before the next major wall.',
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
  const survivorState = game.modeSpecific?.kind === 'survivor' ? game.modeSpecific : null;
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
    requirement: `Reach Day ${achievement.day} in Survivor Mode.`,
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
