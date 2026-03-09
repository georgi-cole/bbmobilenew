import type { GameRegistryEntry } from '../../minigames/registry';
import { DEFAULT_TAPRACE_OPTIONS, simulateTapRaceAI } from '../../store/minigame';
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

const FALLBACK_MODEL: Omit<MinigameAiModel, 'key'> = {
  category: 'hybrid',
  scoreDirection: 'higher-is-better',
  volatility: 0.5,
  weights: DEFAULT_WEIGHTS,
  notes: 'Fallback AI model (PR1 foundation). Replace with explicit metadata in PR3.',
};

export interface TapRaceAiSimulationArgs {
  minigameKey: string;
  seed: number;
  timeLimitSeconds?: number;
}

export interface ChallengeAiSimulationArgs {
  game: GameRegistryEntry;
  seed: number;
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
  const registered = minigameAiRegistry[key];
  return registered ? cloneMinigameAiModel(registered) : getFallbackMinigameAiModel(key);
}

/** Register or override metadata for a minigame at runtime (tests + future tooling). */
export function registerMinigameAiModel(model: MinigameAiModel): void {
  minigameAiRegistry[model.key] = cloneMinigameAiModel(model);
}

export function simulateTapRaceAiPerformance({
  minigameKey,
  seed,
  timeLimitSeconds,
}: TapRaceAiSimulationArgs): number {
  // PR1: keep legacy TapRace tuning; metadata lookup is here for later PRs.
  const model = getMinigameAiModel(minigameKey);
  const baseScore = simulateTapRaceAI(
    seed,
    'HARD',
    timeLimitSeconds ?? DEFAULT_TAPRACE_OPTIONS.timeLimit,
  );
  if (model.scoreDirection === 'lower-is-better') {
    // TODO(PR4): apply inversion once normalized scoring replaces legacy taps.
    if (import.meta.env.DEV) {
      console.warn(
        `[competition-ai] ${minigameKey} uses lower-is-better but still returns legacy tap scores.`,
      );
    }
  }
  return baseScore;
}

export function simulateChallengeAiScore({ game, seed }: ChallengeAiSimulationArgs): number {
  // PR3: ensure metadata is retrievable alongside the legacy scoring path.
  const model = getMinigameAiModel(game.key);
  void model;
  return simulateLegacyAiScore(game, seed);
}

function simulateLegacyAiScore(game: GameRegistryEntry, seed: number): number {
  const rng = mulberry32(seed >>> 0);
  const { metricKind, timeLimitMs, scoringParams } = game;
  switch (metricKind) {
    case 'count': {
      // Tap-like count scaled to time limit (75–90 taps per 10 s)
      const scale = timeLimitMs > 0 ? timeLimitMs / 10000 : 1;
      return Math.round(75 * scale + Math.floor(rng() * 16 * scale));
    }
    case 'time': {
      // Lower-is-better time; scatter between targetMs and ~50% of maxMs
      const targetMs = scoringParams?.targetMs ?? 1000;
      const maxMs = scoringParams?.maxMs ?? (timeLimitMs > 0 ? timeLimitMs : 60000);
      return Math.round(targetMs + rng() * (maxMs - targetMs) * 0.5);
    }
    case 'accuracy': {
      // Accuracy percentage 60–100
      return Math.round(60 + rng() * 40);
    }
    case 'endurance': {
      // Time survived in seconds 10–60
      return Math.round(10 + rng() * 50);
    }
    case 'hybrid':
    case 'points':
    default: {
      // Generic points 0–100
      return Math.round(rng() * 100);
    }
  }
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
