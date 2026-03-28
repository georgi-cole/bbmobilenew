import type { Player } from '../../types';
import { mulberry32 } from '../../store/rng';

export type TargetKind = 'standard' | 'bonus' | 'hazard';

export interface BullseyeRoundConfig {
  roundNumber: number;
  durationSeconds: number;
  spawnIntervalMs: number;
  maxTargets: number;
  targetWeights: Record<TargetKind, number>;
  targetLifetimes: Record<TargetKind, number>;
  hazardPenalty: number;
  difficultyLabel: string;
}

interface TargetConfig {
  emoji: string;
  /** Base score delta when tapped. */
  points: number;
  /** Milliseconds the target lives before disappearing. */
  lifetimeMs: number;
  /** CSS class modifier. */
  cls: string;
  /** Tooltip / aria label. */
  label: string;
}

export const TARGET_CONFIGS: Record<TargetKind, TargetConfig> = {
  standard: {
    emoji: '🎯',
    points: 10,
    lifetimeMs: 2200,
    cls: 'bbl__target--standard',
    label: 'Standard target +10',
  },
  bonus: {
    emoji: '⭐',
    points: 25,
    lifetimeMs: 1300,
    cls: 'bbl__target--bonus',
    label: 'Bonus target +25',
  },
  hazard: {
    emoji: '💣',
    points: -15,
    lifetimeMs: 2800,
    cls: 'bbl__target--hazard',
    label: 'Hazard! −15 if tapped',
  },
};

const DEFAULT_TARGET_WEIGHTS: Record<TargetKind, number> = {
  standard: 0.6,
  bonus: 0.25,
  hazard: 0.15,
};

const ROUND_PRESETS = [
  {
    durationSeconds: 18,
    spawnIntervalMs: 560,
    maxTargets: 6,
    targetWeights: { standard: 0.58, bonus: 0.27, hazard: 0.15 },
    lifetimeMultiplier: 1,
    hazardPenalty: -15,
    difficultyLabel: 'Opening round — balanced targets and a steady pace.',
  },
  {
    durationSeconds: 17,
    spawnIntervalMs: 500,
    maxTargets: 7,
    targetWeights: { standard: 0.54, bonus: 0.24, hazard: 0.22 },
    lifetimeMultiplier: 0.94,
    hazardPenalty: -20,
    difficultyLabel: 'Round heats up — faster spawns and more hazards.',
  },
  {
    durationSeconds: 16,
    spawnIntervalMs: 450,
    maxTargets: 8,
    targetWeights: { standard: 0.5, bonus: 0.22, hazard: 0.28 },
    lifetimeMultiplier: 0.88,
    hazardPenalty: -25,
    difficultyLabel: 'Pressure round — targets vanish faster and bombs pile up.',
  },
  {
    durationSeconds: 15,
    spawnIntervalMs: 410,
    maxTargets: 8,
    targetWeights: { standard: 0.46, bonus: 0.21, hazard: 0.33 },
    lifetimeMultiplier: 0.82,
    hazardPenalty: -30,
    difficultyLabel: 'Semi-final pace — dense spawns and very little breathing room.',
  },
  {
    durationSeconds: 14,
    spawnIntervalMs: 370,
    maxTargets: 9,
    targetWeights: { standard: 0.42, bonus: 0.2, hazard: 0.38 },
    lifetimeMultiplier: 0.76,
    hazardPenalty: -35,
    difficultyLabel: 'Final sprint — relentless spawns and danger everywhere.',
  },
] as const;

export const BULLSEYE_CHALLENGE_ROUNDS = ROUND_PRESETS.length;

const AI_BASELINE_MULTIPLIER = 1.15;
const AI_BASELINE_OFFSET = 24;
const AI_VOLATILITY_MIN = 0.9;
const AI_VOLATILITY_RANGE = 0.24;
const AI_ROUND_PRESSURE_DROP = 0.04;
const AI_HAZARD_PENALTY_MULTIPLIER = 0.18;

/**
 * Select a random target kind using weighted distribution.
 * Defaults to:
 *  standard:  60 %
 *  bonus:     25 %
 *  hazard:    15 %
 * Callers can override the default weights for harder tournament rounds.
 */
export function pickTargetKind(
  random01: number,
  weights: Record<TargetKind, number> = DEFAULT_TARGET_WEIGHTS,
): TargetKind {
  const standardThreshold = weights.standard;
  const bonusThreshold = standardThreshold + weights.bonus;
  if (random01 < standardThreshold) return 'standard';
  if (random01 < bonusThreshold) return 'bonus';
  return 'hazard';
}

export function getBullseyeRoundConfig(roundNumber: number): BullseyeRoundConfig {
  const preset = ROUND_PRESETS[Math.min(Math.max(roundNumber - 1, 0), ROUND_PRESETS.length - 1)];

  return {
    roundNumber,
    durationSeconds: preset.durationSeconds,
    spawnIntervalMs: preset.spawnIntervalMs,
    maxTargets: preset.maxTargets,
    targetWeights: preset.targetWeights,
    targetLifetimes: {
      standard: Math.round(TARGET_CONFIGS.standard.lifetimeMs * preset.lifetimeMultiplier),
      bonus: Math.round(TARGET_CONFIGS.bonus.lifetimeMs * preset.lifetimeMultiplier),
      hazard: Math.round(TARGET_CONFIGS.hazard.lifetimeMs * preset.lifetimeMultiplier),
    },
    hazardPenalty: preset.hazardPenalty,
    difficultyLabel: preset.difficultyLabel,
  };
}

export function getBullseyeEliminationCount(activeCount: number): number {
  if (activeCount <= 1) return 0;
  return Math.min(activeCount - 1, Math.ceil(activeCount / 2));
}

export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  hits: { standard: number; bonus: number; hazard: number };
  isHuman: boolean;
}

/**
 * Build a ranked leaderboard from raw scores + participant list.
 *
 * Tie-breaking rule (deterministic):
 *   Equal scores → lower participant index wins (earlier in the participants array).
 *   This is explicit and documented so it is never silently falling back to
 *   arbitrary order.
 */
export function buildRankedLeaderboard(
  participants: string[],
  scores: Record<string, number>,
  humanId: string | undefined,
  players: Player[],
  humanHits?: { standard: number; bonus: number; hazard: number },
): ScoreEntry[] {
  type RankedEntry = ScoreEntry & { participantIndex: number };

  const entries: RankedEntry[] = participants.map((id, idx) => {
    const p = players.find((pl) => pl.id === id);
    const isHuman = id === humanId;
    return {
      id,
      name: p?.name ?? id,
      score: scores[id] ?? 0,
      hits: isHuman && humanHits
        ? humanHits
        : { standard: 0, bonus: 0, hazard: 0 },
      isHuman,
      participantIndex: idx,
    };
  });

  const rankedEntries = entries.sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) return diff;
    return a.participantIndex - b.participantIndex;
  });

  return rankedEntries.map(({ participantIndex: _participantIndex, ...entry }) => entry);
}

function hashTournamentSeed(seed: number, participantId: string, roundNumber: number): number {
  let hash = seed ^ (roundNumber * 0x9e3779b9);
  for (let i = 0; i < participantId.length; i += 1) {
    hash = Math.imul(hash ^ participantId.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

export function simulateBullseyeAiRoundScore(
  baseScore: number,
  roundNumber: number,
  seed: number,
  participantId: string,
): number {
  const rng = mulberry32(hashTournamentSeed(seed, participantId, roundNumber));
  const roundConfig = getBullseyeRoundConfig(roundNumber);
  const adjustedBaseScore = baseScore * AI_BASELINE_MULTIPLIER + AI_BASELINE_OFFSET;
  const volatility = AI_VOLATILITY_MIN + rng() * AI_VOLATILITY_RANGE;
  const pressureAdjustment = 1 - Math.max(0, roundNumber - 1) * AI_ROUND_PRESSURE_DROP;
  const hazardPenalty = roundConfig.targetWeights.hazard * AI_HAZARD_PENALTY_MULTIPLIER;
  return Math.max(
    0,
    Math.round(adjustedBaseScore * volatility * pressureAdjustment * (1 - hazardPenalty)),
  );
}
