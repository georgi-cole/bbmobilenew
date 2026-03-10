import type { GameRegistryEntry } from '../../minigames/registry';
import { DEFAULT_TAPRACE_OPTIONS } from '../../store/minigame';
import { mulberry32 } from '../../store/rng';
import { minigameAiRegistry } from './minigameAiRegistry';
import type {
  CompetitionSeasonState,
  CompetitionSkillProfile,
  CompetitionSkillWeights,
  MinigameAiModel,
} from './types';

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

const DEFAULT_SEASON_STATE: CompetitionSeasonState = {
  form: 0,
  confidence: 0,
  fatigue: 0,
};

const SEASON_STATE_BOUNDS = {
  form: { min: -5, max: 5 },
  confidence: { min: -3, max: 3 },
  fatigue: { min: 0, max: 5 },
} as const;

const SEASON_MODIFIER_WEIGHTS = {
  form: 0.01,
  confidence: 0.008,
  fatigue: 0.01,
} as const;

const SEASON_DECAY = {
  form: 0.5,
  confidence: 0.5,
  fatigueRecovery: 0.5,
  fatigueGain: 0.75,
} as const;

const SEASON_OUTCOME_BONUSES = {
  winForm: 1,
  winConfidence: 0.5,
  topForm: 0.25,
  topConfidence: 0.25,
  bottomForm: 0.5,
  bottomConfidence: 0.25,
} as const;

const SEASON_BAND_RATIO = 0.3;

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
const MIN_SCORE_FLOOR = 1;
const DEFAULT_LOWER_BETTER_MIN = 5;
const BASELINE_SKILL_KEYS: Array<keyof CompetitionSkillProfile> = [
  'physical',
  'mental',
  'precision',
  'nerve',
  'luck',
];
const PARTICIPANT_HASH_PREFIX = 'participant';
const VOLATILITY_SCALE = 0.35;

export interface TapRaceAiSimulationArgs {
  minigameKey: string;
  seed: number;
  timeLimitSeconds?: number;
  playerId?: string;
  participantIndex?: number;
  profile?: CompetitionSkillProfile;
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
  minigameModel?: MinigameAiModel;
  seasonState?: CompetitionSeasonState;
  options?: {
    timeLimitSeconds?: number;
    timeLimitMs?: number;
  };
}

export interface CompetitionSeasonModifiers {
  formAdjustment: number;
  confidenceAdjustment: number;
  fatigueAdjustment: number;
  totalAdjustment: number;
}

export interface CompetitionSeasonUpdateInput {
  playerIds: string[];
  participants: string[];
  scores?: Record<string, number>;
  winnerId?: string;
  /** When false, only winner boosts + fatigue are applied (no placement bonuses). */
  includePlacementBonuses?: boolean;
}

export function getDefaultCompetitionProfile(): CompetitionSkillProfile {
  return { ...DEFAULT_PROFILE };
}

export function getDefaultCompetitionSeasonState(): CompetitionSeasonState {
  return { ...DEFAULT_SEASON_STATE };
}

export function clampCompetitionSeasonState(
  state: CompetitionSeasonState,
): CompetitionSeasonState {
  return {
    form: clamp(state.form, SEASON_STATE_BOUNDS.form.min, SEASON_STATE_BOUNDS.form.max),
    confidence: clamp(
      state.confidence,
      SEASON_STATE_BOUNDS.confidence.min,
      SEASON_STATE_BOUNDS.confidence.max,
    ),
    fatigue: clamp(state.fatigue, SEASON_STATE_BOUNDS.fatigue.min, SEASON_STATE_BOUNDS.fatigue.max),
  };
}

export function getCompetitionSeasonState(
  seasonStateByPlayerId: Record<string, CompetitionSeasonState> | undefined,
  playerId: string,
): CompetitionSeasonState {
  const state = seasonStateByPlayerId?.[playerId];
  return clampCompetitionSeasonState(state ?? DEFAULT_SEASON_STATE);
}

export function getCompetitionSeasonModifiers(
  seasonState: CompetitionSeasonState,
): CompetitionSeasonModifiers {
  const clamped = clampCompetitionSeasonState(seasonState);
  const formAdjustment = clamped.form * SEASON_MODIFIER_WEIGHTS.form;
  const confidenceAdjustment = clamped.confidence * SEASON_MODIFIER_WEIGHTS.confidence;
  const fatigueAdjustment = clamped.fatigue * SEASON_MODIFIER_WEIGHTS.fatigue;
  return {
    formAdjustment,
    confidenceAdjustment,
    fatigueAdjustment,
    totalAdjustment: formAdjustment + confidenceAdjustment - fatigueAdjustment,
  };
}

function applyScoringParamsToModel(
  game: GameRegistryEntry,
  model: MinigameAiModel,
): MinigameAiModel {
  const params = game.scoringParams;
  if (!params) return model;

  let minScore = model.minScore;
  let maxScore = model.maxScore;

  if (game.scoringAdapter === 'lowerBetter' || game.scoringAdapter === 'timeToPoints') {
    if (minScore === undefined && typeof params.targetMs === 'number') {
      minScore = params.targetMs;
    }
    if (maxScore === undefined && typeof params.maxMs === 'number') {
      maxScore = params.maxMs;
    }
  }

  if (game.scoringAdapter === 'raw') {
    if (minScore === undefined && typeof params.minRaw === 'number') {
      minScore = params.minRaw;
    }
    if (maxScore === undefined && typeof params.maxRaw === 'number') {
      maxScore = params.maxRaw;
    }
  }

  if (minScore === model.minScore && maxScore === model.maxScore) {
    return model;
  }

  return { ...model, minScore, maxScore };
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

export function getMinigameAiModelForGame(game: GameRegistryEntry): MinigameAiModel {
  const baseModel = getMinigameAiModel(game.key);
  return applyScoringParamsToModel(game, baseModel);
}

/** Register or override metadata for a minigame at runtime (tests + future tooling). */
export function registerMinigameAiModel(model: MinigameAiModel): void {
  MINIGAME_AI_REGISTRY[model.key] = cloneMinigameAiModel(model);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function driftTowardZero(value: number, step: number): number {
  if (value > 0) return Math.max(0, value - step);
  if (value < 0) return Math.min(0, value + step);
  return 0;
}

export function updateCompetitionSeasonStateByPlayerId(
  seasonStateByPlayerId: Record<string, CompetitionSeasonState> | undefined,
  update: CompetitionSeasonUpdateInput,
): Record<string, CompetitionSeasonState> {
  const {
    playerIds,
    participants,
    scores,
    winnerId,
    includePlacementBonuses = true,
  } = update;
  const participantSet = new Set(participants);
  const scoresByPlayerId = scores ?? {};
  const ranked = includePlacementBonuses
    ? participants
      .map((id) => ({ id, score: scoresByPlayerId[id] ?? 0 }))
      .sort((a, b) => b.score - a.score)
    : [];
  const resolvedWinnerId = winnerId ?? ranked[0]?.id;
  const bandSize =
    includePlacementBonuses && ranked.length > 0
      ? Math.max(1, Math.ceil(ranked.length * SEASON_BAND_RATIO))
      : 0;
  const rankById = includePlacementBonuses
    ? new Map(ranked.map((entry, index) => [entry.id, index]))
    : new Map();

  const next: Record<string, CompetitionSeasonState> = {};
  for (const playerId of playerIds) {
    const current = getCompetitionSeasonState(seasonStateByPlayerId, playerId);
    let form = driftTowardZero(current.form, SEASON_DECAY.form);
    let confidence = driftTowardZero(current.confidence, SEASON_DECAY.confidence);
    let fatigue = current.fatigue;

    if (participantSet.has(playerId)) {
      fatigue += SEASON_DECAY.fatigueGain;
      if (playerId === resolvedWinnerId) {
        form += SEASON_OUTCOME_BONUSES.winForm;
        confidence += SEASON_OUTCOME_BONUSES.winConfidence;
      } else if (includePlacementBonuses) {
        const rankIndex = rankById.get(playerId);
        if (rankIndex !== undefined && bandSize > 0) {
          if (rankIndex < bandSize) {
            form += SEASON_OUTCOME_BONUSES.topForm;
            confidence += SEASON_OUTCOME_BONUSES.topConfidence;
          } else if (rankIndex >= ranked.length - bandSize) {
            form -= SEASON_OUTCOME_BONUSES.bottomForm;
            confidence -= SEASON_OUTCOME_BONUSES.bottomConfidence;
          }
        }
      }
    } else {
      fatigue -= SEASON_DECAY.fatigueRecovery;
    }

    next[playerId] = clampCompetitionSeasonState({ form, confidence, fatigue });
  }

  return next;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5 >>> 0; // FNV-1a 32-bit offset basis
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0; // FNV-1a 32-bit prime
  }
  return hash;
}

function averageBaselineSkill(profile: CompetitionSkillProfile): number {
  const total = BASELINE_SKILL_KEYS.reduce((sum, key) => sum + (profile[key] ?? 0), 0);
  return total / BASELINE_SKILL_KEYS.length;
}

function hashParticipantIndex(participantIndex?: number): number {
  return hashString(`${PARTICIPANT_HASH_PREFIX}:${participantIndex ?? 0}`);
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

  let minScore = model.minScore ?? 0;
  let maxScore = model.maxScore ?? DEFAULT_SCORE_MAX;

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
      minScore = Math.max(MIN_SCORE_FLOOR, Math.round(basis * LOWER_BETTER_MIN_RATIO));
    } else {
      minScore = DEFAULT_LOWER_BETTER_MIN;
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
  // 'overall' is reserved as a fallback when no explicit weights are provided.
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
    // Skip undefined or zero weights to intentionally exclude a skill from the mix.
    if (weight == null || weight === 0) continue;
    weightedTotal += (profile[key] ?? 0) * weight;
    weightSum += weight;
  }

  if (weightSum <= 0) {
    const fallback = profile.overall ?? averageBaselineSkill(profile);
    return clamp(fallback / 100, 0, 1);
  }

  return clamp(weightedTotal / (weightSum * 100), 0, 1);
}

function mapPerformanceToScore(
  scoreDirection: MinigameAiModel['scoreDirection'],
  minScore: number,
  maxScore: number,
  performance: number,
): number {
  const span = maxScore - minScore;
  if (scoreDirection === 'lower-is-better') {
    return maxScore - performance * span;
  }
  return minScore + performance * span;
}

export function simulateAiPerformance({
  minigameKey,
  seed,
  playerId,
  participantIndex,
  profile,
  minigameModel,
  seasonState,
  options,
}: SimulateAiPerformanceArgs): number {
  const model = minigameModel ?? getMinigameAiModel(minigameKey);
  const resolvedProfile = profile ?? getDefaultCompetitionProfile();
  const weights = model.weights ?? DEFAULT_WEIGHTS;

  const expectedSkill = computeWeightedSkill(resolvedProfile, weights);
  const seasonAdjustment = getCompetitionSeasonModifiers(seasonState ?? DEFAULT_SEASON_STATE);
  // Use player IDs (or participant index) so each AI gets a stable, independent roll.
  const offset =
    typeof playerId === 'string' && playerId.length > 0
      ? hashString(playerId)
      : hashParticipantIndex(participantIndex);
  const rng = mulberry32(((seed >>> 0) ^ offset) >>> 0);
  const volatility = clamp(model.volatility ?? 0.5, 0, 1);
  // Triangular distribution in [-1, 1] centered at 0 (Irwin-Hall n=2 shifted).
  const deviation = (rng() + rng() - 1) * volatility * VOLATILITY_SCALE;
  const performance = clamp(expectedSkill + deviation + seasonAdjustment.totalAdjustment, 0, 1);

  const { minScore, maxScore } = resolveScoreRange(model, options);
  const rawScore = mapPerformanceToScore(model.scoreDirection, minScore, maxScore, performance);

  return Math.round(rawScore);
}

export function simulateTapRaceAiPerformance({
  minigameKey,
  seed,
  timeLimitSeconds,
  playerId,
  participantIndex,
  profile,
}: TapRaceAiSimulationArgs): number {
  const timeLimit =
    typeof timeLimitSeconds === 'number'
      ? timeLimitSeconds
      : DEFAULT_TAPRACE_OPTIONS.timeLimit;
  return simulateAiPerformance({
    minigameKey,
    seed,
    playerId,
    participantIndex,
    profile,
    options: { timeLimitSeconds: timeLimit },
  });
}

export function simulateChallengeAiScore({ game, seed }: ChallengeAiSimulationArgs): number {
  const timeLimitMs = game.timeLimitMs > 0 ? game.timeLimitMs : undefined;
  return simulateAiPerformance({
    minigameKey: game.key,
    minigameModel: getMinigameAiModelForGame(game),
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
  CompetitionSeasonState,
  CompetitionSkillProfile,
  CompetitionSkillWeights,
  MinigameAiModel,
  ScoreDirection,
} from './types';
