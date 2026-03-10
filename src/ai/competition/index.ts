import type { GameRegistryEntry } from '../../minigames/registry';
import { DEFAULT_TAPRACE_OPTIONS } from '../../store/minigame';
import { mulberry32 } from '../../store/rng';
import { minigameAiRegistry } from './minigameAiRegistry';
import type { CompetitionSkillProfile, CompetitionSkillWeights, MinigameAiModel } from './types';

const DEFAULT_PROFILE: CompetitionSkillProfile = {
  overall: 50,
  physical: 50,
  mental: 50,
  precision: 50,
  nerve: 50,
  consistency: 50,
  clutch: 50,
  chokeRisk: 50,
  luck: 50,
};

const DEFAULT_WEIGHTS: CompetitionSkillWeights = {
  physical: 1,
  mental: 1,
  precision: 1,
  nerve: 1,
  luck: 1,
};

const MINIGAME_AI_REGISTRY: Record<string, MinigameAiModel> = Object.fromEntries(
  Object.entries(minigameAiRegistry).map(([key, model]) => [key, cloneMinigameAiModel(model)]),
);

const FALLBACK_MODEL: Omit<MinigameAiModel, 'key'> = {
  category: 'hybrid',
  scoreDirection: 'higher-is-better',
  volatility: 0.5,
  weights: DEFAULT_WEIGHTS,
  notes: 'Fallback AI model (PR1 foundation). Replace with explicit metadata in PR3.',
};

const DEFAULT_SCORE_MAX = 100;
const DEFAULT_TIME_BASE_SECONDS = 10;
const LOWER_BETTER_MIN_RATIO = 0.2;
const VOLATILITY_SCALE = 0.35;

export interface TapRaceAiSimulationArgs {
  minigameKey: string;
  seed: number;
  timeLimitSeconds?: number;
}

export interface ChallengeAiSimulationArgs {
  game: GameRegistryEntry;
  seed: number;
}

export interface SimulateAiPerformanceArgs {
  minigameKey: string;
  seed: number;
  playerId?: string;
  participantIndex?: number;
  profile?: CompetitionSkillProfile;
  minigame?: MinigameAiModel;
  options?: {
    timeLimitSeconds?: number;
    timeLimitMs?: number;
  };
}

export function getDefaultCompetitionProfile(): CompetitionSkillProfile {
  return { ...DEFAULT_PROFILE };
}

function cloneMinigameAiModel(model: MinigameAiModel): MinigameAiModel {
  if (typeof structuredClone === 'function') {
    return structuredClone(model);
  }
  return {
    ...model,
    weights: { ...model.weights },
  };
}

/** Public fallback builder for minigames without explicit AI metadata yet. */
export function getFallbackMinigameAiModel(key: string): MinigameAiModel {
  return {
    ...FALLBACK_MODEL,
    key,
    weights: { ...DEFAULT_WEIGHTS },
  };
}

export function getMinigameAiModel(key: string): MinigameAiModel {
  const registered = MINIGAME_AI_REGISTRY[key];
  return registered ? cloneMinigameAiModel(registered) : getFallbackMinigameAiModel(key);
}

/** Register or override metadata for a minigame at runtime (tests + future tooling). */
export function registerMinigameAiModel(model: MinigameAiModel): void {
  MINIGAME_AI_REGISTRY[model.key] = cloneMinigameAiModel(model);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function resolveTimeLimitSeconds(options?: SimulateAiPerformanceArgs['options']): number | undefined {
  if (!options) return undefined;
  if (typeof options.timeLimitSeconds === 'number') return options.timeLimitSeconds;
  if (typeof options.timeLimitMs === 'number') return options.timeLimitMs / 1000;
  return undefined;
}

function resolveScoreRange(
  model: MinigameAiModel,
  options?: SimulateAiPerformanceArgs['options'],
): { minScore: number; maxScore: number } {
  const timeLimitMs = options?.timeLimitMs;
  const timeLimitSeconds = resolveTimeLimitSeconds(options);
  const hasMin = typeof model.minScore === 'number';
  const hasMax = typeof model.maxScore === 'number';

  let minScore = hasMin ? model.minScore! : 0;
  let maxScore = hasMax ? model.maxScore! : DEFAULT_SCORE_MAX;

  if (!hasMax && timeLimitSeconds && model.scoreDirection === 'higher-is-better') {
    maxScore = Math.max(
      1,
      Math.round(DEFAULT_SCORE_MAX * (timeLimitSeconds / DEFAULT_TIME_BASE_SECONDS)),
    );
  }

  if (!hasMax && model.scoreDirection === 'lower-is-better') {
    if (typeof timeLimitMs === 'number' && timeLimitMs > 0) {
      maxScore = timeLimitMs;
    } else if (typeof timeLimitSeconds === 'number' && timeLimitSeconds > 0) {
      maxScore = timeLimitSeconds;
    }
  }

  if (!hasMin && model.scoreDirection === 'lower-is-better') {
    const basis =
      typeof timeLimitMs === 'number' && timeLimitMs > 0
        ? timeLimitMs
        : typeof timeLimitSeconds === 'number' && timeLimitSeconds > 0
          ? timeLimitSeconds
          : undefined;
    if (typeof basis === 'number') {
      minScore = Math.max(1, Math.round(basis * LOWER_BETTER_MIN_RATIO));
    } else {
      minScore = 5;
    }
  }

  if (maxScore <= minScore) {
    maxScore = minScore + 1;
  }

  return { minScore, maxScore };
}

function computeWeightedSkill(
  profile: CompetitionSkillProfile,
  weights: CompetitionSkillWeights,
): number {
  const entries: Array<[keyof CompetitionSkillProfile, number | undefined]> = [
    ['physical', weights.physical],
    ['mental', weights.mental],
    ['precision', weights.precision],
    ['nerve', weights.nerve],
    ['luck', weights.luck],
    ['consistency', weights.consistency],
    ['clutch', weights.clutch],
    ['chokeRisk', weights.chokeRisk],
  ];

  let weightedTotal = 0;
  let weightSum = 0;
  for (const [key, weight] of entries) {
    if (weight == null || weight === 0) continue;
    weightedTotal += (profile[key] ?? 0) * weight;
    weightSum += weight;
  }

  if (weightSum <= 0) {
    const fallback =
      profile.overall ??
      (profile.physical +
        profile.mental +
        profile.precision +
        profile.nerve +
        profile.luck) /
        5;
    return clamp(fallback / 100, 0, 1);
  }

  return clamp(weightedTotal / (weightSum * 100), 0, 1);
}

export function simulateAiPerformance({
  minigameKey,
  seed,
  playerId,
  participantIndex,
  profile,
  minigame,
  options,
}: SimulateAiPerformanceArgs): number {
  const model = minigame ?? getMinigameAiModel(minigameKey);
  const resolvedProfile = profile ?? getDefaultCompetitionProfile();
  const weights = model.weights ?? DEFAULT_WEIGHTS;

  const expectedSkill = computeWeightedSkill(resolvedProfile, weights);
  const offset =
    typeof playerId === 'string' && playerId.length > 0
      ? hashString(playerId)
      : participantIndex ?? 0;
  const rng = mulberry32(((seed >>> 0) ^ offset) >>> 0);
  const volatility = clamp(model.volatility ?? 0.5, 0, 1);
  const deviation = (rng() + rng() - 1) * volatility * VOLATILITY_SCALE;
  const performance = clamp(expectedSkill + deviation, 0, 1);

  const { minScore, maxScore } = resolveScoreRange(model, options);
  const span = maxScore - minScore;
  const rawScore =
    model.scoreDirection === 'lower-is-better'
      ? maxScore - performance * span
      : minScore + performance * span;

  return Math.round(rawScore);
}

export function simulateTapRaceAiPerformance({
  minigameKey,
  seed,
  timeLimitSeconds,
}: TapRaceAiSimulationArgs): number {
  const timeLimit =
    typeof timeLimitSeconds === 'number'
      ? timeLimitSeconds
      : DEFAULT_TAPRACE_OPTIONS.timeLimit;
  return simulateAiPerformance({
    minigameKey,
    seed,
    participantIndex: 0,
    options: { timeLimitSeconds: timeLimit },
  });
}

export function simulateChallengeAiScore({ game, seed }: ChallengeAiSimulationArgs): number {
  const timeLimitMs = game.timeLimitMs > 0 ? game.timeLimitMs : undefined;
  return simulateAiPerformance({
    minigameKey: game.key,
    seed,
    participantIndex: 0,
    options: {
      timeLimitMs,
      timeLimitSeconds: timeLimitMs ? timeLimitMs / 1000 : undefined,
    },
  });
}

export type {
  AiParticipantSnapshot,
  AiSimulationContext,
  CompetitionCategory,
  CompetitionSkillProfile,
  CompetitionSkillWeights,
  MinigameAiModel,
  ScoreDirection,
} from './types';
