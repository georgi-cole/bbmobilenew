import { mulberry32 } from '../../store/rng';
import type { NumberTriviaDifficulty, NumberTriviaQuestion } from './numberTriviaData';

export const NUMBER_TRIVIA_TOTAL_ROUNDS = 5;
export const NUMBER_TRIVIA_MAX_ATTEMPTS = 6;
export const NUMBER_TRIVIA_READING_BUFFER_MS = 3_000;
export const NUMBER_TRIVIA_DUEL_STARTING_LIVES = 3;

export interface TriviaRoundPerformance {
  guessed: boolean;
  attempts: number;
  timeMs: number;
  closestDistance?: number;
  skipped?: boolean;
}

export interface TriviaStanding {
  participantId: string;
  participantName: string;
  isHuman: boolean;
  cumulativeScore: number;
  lastRoundScore: number;
  lastRoundAttempts: number;
  lastRoundTimeMs: number;
  lastRoundGuessed: boolean;
  eliminatedRound: number | null;
}

export interface NumberTriviaAiPerformanceContext {
  precomputedScore: number;
  roundNumber: number;
  question: NumberTriviaQuestion;
}

export interface NumberTriviaAiRngContext {
  seed: number;
  roundNumber: number;
  participantId: string;
}

interface NumberTriviaAiDifficultyProfile {
  accuracyRange: [number, number];
  delayRangeMs: [number, number];
  maxCorrectAttempts: number;
  maxWrongAttempts: number;
  hesitationChance: number;
  nearMissChance: number;
  giveUpChance: number;
  confidentWrongChance: number;
}

const NUMBER_TRIVIA_AI_PROFILES: Record<NumberTriviaDifficulty, NumberTriviaAiDifficultyProfile> = {
  easy: {
    accuracyRange: [0.9, 0.98],
    delayRangeMs: [2_200, 6_000],
    maxCorrectAttempts: 3,
    maxWrongAttempts: 3,
    hesitationChance: 0.38,
    nearMissChance: 0.3,
    giveUpChance: 0.08,
    confidentWrongChance: 0.12,
  },
  medium: {
    accuracyRange: [0.7, 0.86],
    delayRangeMs: [3_000, 8_500],
    maxCorrectAttempts: 4,
    maxWrongAttempts: 4,
    hesitationChance: 0.52,
    nearMissChance: 0.4,
    giveUpChance: 0.14,
    confidentWrongChance: 0.16,
  },
  hard: {
    accuracyRange: [0.45, 0.65],
    delayRangeMs: [4_000, 12_000],
    maxCorrectAttempts: 5,
    maxWrongAttempts: 5,
    hesitationChance: 0.64,
    nearMissChance: 0.52,
    giveUpChance: 0.2,
    confidentWrongChance: 0.2,
  },
  'very-hard': {
    accuracyRange: [0.22, 0.46],
    delayRangeMs: [5_000, 16_000],
    maxCorrectAttempts: 6,
    maxWrongAttempts: 6,
    hesitationChance: 0.76,
    nearMissChance: 0.68,
    giveUpChance: 0.32,
    confidentWrongChance: 0.3,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min: number, max: number, rng: () => number): number {
  return min + (max - min) * rng();
}

function hashNumberTriviaParticipantId(participantId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < participantId.length; index += 1) {
    hash ^= participantId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createNumberTriviaAiRng(context: NumberTriviaAiRngContext): () => number {
  // 0x9e3779b9 is the golden-ratio-derived Fibonacci hashing constant, used here
  // to spread adjacent round numbers apart before mixing in the participant hash.
  const roundSeed = Math.imul(context.roundNumber >>> 0, 0x9e3779b9) >>> 0;
  const participantSeed = hashNumberTriviaParticipantId(context.participantId);
  return mulberry32(((context.seed >>> 0) ^ roundSeed ^ participantSeed) >>> 0);
}

function getNearMissDistance(answer: number, rng: () => number): number {
  const magnitude = Math.abs(answer);
  if (magnitude <= 5) return 1;
  if (magnitude < 100) return 1 + Math.floor(rng() * 3);
  return 1 + Math.floor(rng() * 2);
}

function getFarMissDistance(answer: number, difficulty: NumberTriviaDifficulty, rng: () => number): number {
  const magnitude = Math.max(6, Math.abs(answer));
  const divisor = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 5;
  const floor = Math.max(3, Math.round(magnitude / divisor));
  const ceiling = Math.max(floor + 2, Math.round(magnitude / (difficulty === 'very-hard' ? 2.4 : 2.8)));
  return floor + Math.floor(rng() * (ceiling - floor + 1));
}

export function simulateNumberTriviaAiPerformance(
  context: NumberTriviaAiPerformanceContext,
  rng: () => number,
): TriviaRoundPerformance {
  const profile = NUMBER_TRIVIA_AI_PROFILES[context.question.difficulty];
  const skillOffset = clamp((context.precomputedScore - 60) / 450, -0.08, 0.08);
  const fatiguePenalty = Math.max(0, context.roundNumber - 3) * 0.015;
  const baseAccuracy = (profile.accuracyRange[0] + profile.accuracyRange[1]) / 2;
  const accuracy = clamp(baseAccuracy + skillOffset - fatiguePenalty, 0.05, 0.985);
  const baseDelayMs = randomBetween(profile.delayRangeMs[0], profile.delayRangeMs[1], rng);
  const guessed = rng() < accuracy;

  if (guessed) {
    let attempts = 1;
    let hesitationChance = clamp(profile.hesitationChance - skillOffset * 1.2, 0.01, 0.9);
    while (attempts < profile.maxCorrectAttempts && rng() < hesitationChance) {
      attempts += 1;
      hesitationChance *= 0.45;
    }

    return {
      guessed: true,
      attempts,
      timeMs: Math.round(baseDelayMs + (attempts - 1) * 1_400 + Math.max(0, fatiguePenalty * 3_000)),
      closestDistance: 0,
    };
  }

  let attempts = profile.maxWrongAttempts;
  const confidentWrong = rng() < clamp(profile.confidentWrongChance + Math.max(0, skillOffset), 0.05, 0.9);
  if (confidentWrong) {
    attempts = 1;
  } else if (rng() < clamp(profile.giveUpChance - skillOffset, 0.02, 0.9)) {
    attempts = Math.max(1, profile.maxWrongAttempts - 1 - Math.floor(rng() * 2));
  }

  const nearMiss = rng() < clamp(profile.nearMissChance + skillOffset * 0.6, 0.15, 0.95);
  return {
    guessed: false,
    attempts: clamp(attempts, 1, NUMBER_TRIVIA_MAX_ATTEMPTS),
    timeMs: Math.round(
      baseDelayMs
      + Math.max(0, attempts - 1) * 1_350
      + (nearMiss ? 250 : 900)
      + Math.max(0, fatiguePenalty * 3_000),
    ),
    closestDistance: nearMiss
      ? getNearMissDistance(context.question.answer, rng)
      : getFarMissDistance(context.question.answer, context.question.difficulty, rng),
  };
}

export function computeNumberTriviaRoundScore(performance: TriviaRoundPerformance): number {
  const attempts = Math.max(1, performance.attempts);
  if (performance.guessed) {
    const solvedBonus = 1000;
    const timeBonus = Math.max(0, 700 - Math.round(performance.timeMs / 20));
    const attemptBonus = Math.max(0, 180 - (attempts - 1) * 28);
    return solvedBonus + timeBonus + attemptBonus;
  }

  const closestDistance = Math.max(0, performance.closestDistance ?? Number.POSITIVE_INFINITY);
  const proximityBonus = Number.isFinite(closestDistance)
    ? Math.max(0, 140 - Math.min(140, closestDistance * 8))
    : 0;
  const attemptBonus = performance.skipped ? 0 : Math.max(0, 36 - (attempts - 1) * 6);
  return proximityBonus + attemptBonus;
}

export function getNumberTriviaEliminationCount(roundNumber: number, activeCount: number): number {
  if (roundNumber >= NUMBER_TRIVIA_TOTAL_ROUNDS || activeCount <= 2) return 0;
  return Math.min(activeCount - 2, 1);
}

/**
 * Round five keeps the top two cumulative scores. Everyone tied with the
 * second-place score also qualifies, so a genuine cutoff tie is never broken
 * by an unrelated field such as player name.
 */
export function getNumberTriviaFinalistIds(rankedStandings: TriviaStanding[]): string[] {
  if (rankedStandings.length <= 2) return rankedStandings.map((entry) => entry.participantId);
  const cutoffScore = rankedStandings[1].cumulativeScore;
  return rankedStandings
    .filter((entry) => entry.cumulativeScore >= cutoffScore)
    .map((entry) => entry.participantId);
}

export interface NumberTriviaDuelPerformance {
  participantId: string;
  performance: TriviaRoundPerformance;
}

/** Pick exactly one duel loser. Accuracy comes first; response time only breaks numerical ties. */
export function getNumberTriviaDuelLoserId(
  entries: NumberTriviaDuelPerformance[],
  rng: () => number = () => 0,
): string | null {
  if (entries.length === 0) return null;
  const compare = (a: NumberTriviaDuelPerformance, b: NumberTriviaDuelPerformance) => {
    if (a.performance.guessed !== b.performance.guessed) return a.performance.guessed ? -1 : 1;

    const aDistance = a.performance.guessed
      ? 0
      : Math.max(0, a.performance.closestDistance ?? Number.POSITIVE_INFINITY);
    const bDistance = b.performance.guessed
      ? 0
      : Math.max(0, b.performance.closestDistance ?? Number.POSITIVE_INFINITY);
    if (aDistance !== bDistance) return aDistance - bDistance;
    if (a.performance.timeMs !== b.performance.timeMs) return a.performance.timeMs - b.performance.timeMs;
    if (a.performance.attempts !== b.performance.attempts) return a.performance.attempts - b.performance.attempts;
    return 0;
  };
  const worst = [...entries].sort(compare).at(-1);
  if (!worst) return null;
  const exactTies = entries.filter((entry) => compare(entry, worst) === 0);
  return exactTies[Math.floor(rng() * exactTies.length)]?.participantId ?? worst.participantId;
}

export function compareTriviaStandings(a: TriviaStanding, b: TriviaStanding): number {
  if (b.cumulativeScore !== a.cumulativeScore) return b.cumulativeScore - a.cumulativeScore;
  if (b.lastRoundScore !== a.lastRoundScore) return b.lastRoundScore - a.lastRoundScore;
  if (a.lastRoundGuessed !== b.lastRoundGuessed) return a.lastRoundGuessed ? -1 : 1;
  if (a.lastRoundTimeMs !== b.lastRoundTimeMs) return a.lastRoundTimeMs - b.lastRoundTimeMs;
  if (a.lastRoundAttempts !== b.lastRoundAttempts) return a.lastRoundAttempts - b.lastRoundAttempts;
  return a.participantName.localeCompare(b.participantName);
}

export function formatTriviaTimeMs(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return '—';
  return `${(timeMs / 1000).toFixed(1)}s`;
}

export function getTriviaHint(guess: number, answer: number): string {
  const diff = Math.abs(guess - answer);
  const percentOff = (diff / Math.max(Math.abs(answer), 1)) * 100;

  if (guess === answer) {
    return 'Correct!';
  }
  if (diff === 1) {
    return guess < answer ? '↑ Almost! Go higher by 1' : '↓ Almost! Go lower by 1';
  }
  if (diff <= 5) {
    return guess < answer ? '↑ Close! Go higher' : '↓ Close! Go lower';
  }
  if (percentOff <= 10) {
    return guess < answer ? '↑ Higher!' : '↓ Lower!';
  }
  if (percentOff <= 25) {
    return guess < answer ? '↑↑ Much higher!' : '↓↓ Much lower!';
  }
  if (percentOff <= 50) {
    return guess < answer ? '↑↑↑ Way higher!' : '↓↓↓ Way lower!';
  }
  return guess < answer ? '⬆ Significantly higher!' : '⬇ Significantly lower!';
}
