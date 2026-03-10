import type { GameRegistryEntry } from '../../minigames/registry';
import { mulberry32 } from '../../store/rng';
import { getMinigameAiModel } from './index';
import type { CompetitionCategory } from './types';

export interface CompetitionScheduleInput {
  seed: number;
  games: GameRegistryEntry[];
  /**
   * Keys of previously played games, ordered from most recent to least recent.
   *
   * The scheduler only considers the first `recentWindow` entries, so callers
   * must put the most recent games at the start of this array.
   */
  recentGameKeys?: string[];
  /**
   * Number of most recent games (from `recentGameKeys`, starting at index 0)
   * to consider when applying recency penalties/bonuses.
   */
  recentWindow?: number;
  maxCategoryRepeats?: number;
  lateSeasonBias?: boolean;
}

const DEFAULT_RECENT_WINDOW = 3;
const DEFAULT_MAX_CATEGORY_REPEATS = 2;
const RECENT_WEIGHT_BONUS = 1.15;
const RECENT_WEIGHT_PENALTY = 0.85;
const REPEAT_WEIGHT_PENALTY = 0.6;

const LATE_SEASON_BIAS: Record<CompetitionCategory, number> = {
  mental: 1.12,
  precision: 1.12,
  hybrid: 1.08,
  luck: 1,
  endurance: 0.96,
  physical: 0.9,
};

export function selectNextCompetitionGame({
  seed,
  games,
  recentGameKeys = [],
  recentWindow = DEFAULT_RECENT_WINDOW,
  maxCategoryRepeats = DEFAULT_MAX_CATEGORY_REPEATS,
  lateSeasonBias = false,
}: CompetitionScheduleInput): GameRegistryEntry {
  if (games.length === 0) {
    throw new Error('[competitionScheduler] No games available for selection');
  }

  const categoryCache = new Map<string, CompetitionCategory>();
  const getCategory = (key: string) => {
    const cached = categoryCache.get(key);
    if (cached) return cached;
    const category = getMinigameAiModel(key).category;
    categoryCache.set(key, category);
    return category;
  };

  const recentCategories = recentGameKeys
    .slice(0, recentWindow)
    .map((key) => getCategory(key));
  const categoryCounts = countCategories(recentCategories);
  const overusedCategories = new Set(
    Object.entries(categoryCounts)
      .filter(([, count]) => count >= maxCategoryRepeats)
      .map(([category]) => category as CompetitionCategory),
  );

  const filteredPool = games.filter(
    (game) => !overusedCategories.has(getCategory(game.key)),
  );
  const pool = filteredPool.length > 0 ? filteredPool : games;

  const weightedPool = pool.map((game) => {
    const category = getCategory(game.key);
    const count = categoryCounts[category] ?? 0;
    const recencyMultiplier = getRecencyMultiplier(count);
    const lateSeasonMultiplier = lateSeasonBias ? LATE_SEASON_BIAS[category] ?? 1 : 1;
    const weight = Math.max(0.1, game.weight) * recencyMultiplier * lateSeasonMultiplier;
    return { game, weight };
  });

  return weightedPick(seed, weightedPool);
}

function weightedPick(
  seed: number,
  entries: Array<{ game: GameRegistryEntry; weight: number }>,
): GameRegistryEntry {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return entries[0].game;
  }

  const rng = mulberry32(seed >>> 0);
  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry.game;
  }

  return entries[entries.length - 1].game;
}

function countCategories(categories: CompetitionCategory[]): Record<CompetitionCategory, number> {
  return categories.reduce<Record<CompetitionCategory, number>>(
    (acc, category) => {
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    },
    {
      physical: 0,
      mental: 0,
      precision: 0,
      endurance: 0,
      luck: 0,
      hybrid: 0,
    },
  );
}

function getRecencyMultiplier(recentCount: number): number {
  if (recentCount <= 0) return RECENT_WEIGHT_BONUS;
  if (recentCount === 1) return RECENT_WEIGHT_PENALTY;
  return REPEAT_WEIGHT_PENALTY;
}
