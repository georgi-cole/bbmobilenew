/**
 * timingBarAi.ts
 *
 * Humanised AI simulation for the Timing Bar minigame.
 *
 * Each AI player has a personality that influences:
 *  - Timing precision (how close to center they stop)
 *  - Confidence (tendency to lock in early vs. probe multiple times)
 *  - Hesitation (how long before locking in, affecting time-remaining)
 *  - Choking under pressure (performance degrades in short-timer rounds)
 */

import { mulberry32 } from '../../store/rng';
import type { TimingSubmission } from './timingBarLogic';
import { BAR_TRACK_WIDTH, TARGET_POSITION, getRoundDurationSeconds } from './timingBarLogic';
import type { CompetitionSkillProfile } from '../../ai/competition/types';

// ── Timeout probability constants ─────────────────────────────────────────────
/** Probability that a nervous AI times out in a 5-second or shorter round. */
const NERVOUS_SHORT_ROUND_TIMEOUT_CHANCE = 0.12;
/** Baseline timeout probability for all other AI / round combinations. */
const DEFAULT_TIMEOUT_CHANCE = 0.02;

// ── Personality archetypes ─────────────────────────────────────────────────────

export type AiPersonality =
  | 'precise'    // high accuracy, low attempts, locks in confidently
  | 'nervous'    // probes a lot before locking, loses penalty points
  | 'aggressive' // goes for one fast lock, may be off-center but saves time
  | 'consistent' // solid mid-range accuracy, 1–2 attempts typically
  | 'clutch';    // average in easy rounds but improves in later rounds

interface AiPersonalityConfig {
  /** How close to center (in % of half-bar) on average. 0 = perfect, 1 = random. */
  errorSigma: number;
  /** Expected number of non-locking attempts (Poisson mean). */
  meanNonLockingAttempts: number;
  /** Fraction of round duration used before locking in (0 = instant, 1 = last second). */
  lockTimeFraction: number;
  /** How much performance degrades in short rounds (0 = none, 1 = heavy). */
  pressureSensitivity: number;
  /** Bonus in late rounds (clutch effect). */
  clutchBonus: number;
}

const PERSONALITY_CONFIGS: Record<AiPersonality, AiPersonalityConfig> = {
  precise: {
    errorSigma: 0.12,
    meanNonLockingAttempts: 0.3,
    lockTimeFraction: 0.45,
    pressureSensitivity: 0.15,
    clutchBonus: 0,
  },
  nervous: {
    errorSigma: 0.22,
    meanNonLockingAttempts: 2.5,
    lockTimeFraction: 0.72,
    pressureSensitivity: 0.5,
    clutchBonus: 0,
  },
  aggressive: {
    errorSigma: 0.28,
    meanNonLockingAttempts: 0.1,
    lockTimeFraction: 0.2,
    pressureSensitivity: 0.1,
    clutchBonus: 0,
  },
  consistent: {
    errorSigma: 0.16,
    meanNonLockingAttempts: 0.8,
    lockTimeFraction: 0.55,
    pressureSensitivity: 0.2,
    clutchBonus: 0,
  },
  clutch: {
    errorSigma: 0.24,
    meanNonLockingAttempts: 1.0,
    lockTimeFraction: 0.6,
    pressureSensitivity: 0.05,
    clutchBonus: 0.10,
  },
};

// ── Profile → personality mapping ─────────────────────────────────────────────

/**
 * Derives the dominant personality for an AI based on its competition skill profile.
 * Falls back to 'consistent' for generic/unspecialised profiles.
 */
export function deriveAiPersonality(profile: CompetitionSkillProfile): AiPersonality {
  const { precision, nerve, clutch, chokeRisk, consistency } = profile;

  if (precision >= 70 && chokeRisk <= 40) return 'precise';
  if (chokeRisk >= 70 || nerve <= 30) return 'nervous';
  if (clutch >= 70 && nerve >= 60) return 'clutch';
  if (precision <= 40 && nerve >= 65) return 'aggressive';
  if (consistency >= 65) return 'consistent';

  // Blended fallback weighted by dominant stat
  const maxStat = Math.max(precision, nerve, clutch, consistency);
  if (maxStat === precision) return 'precise';
  if (maxStat === clutch) return 'clutch';
  if (maxStat === nerve) return 'aggressive';
  return 'consistent';
}

// ── Simulation ─────────────────────────────────────────────────────────────────

/**
 * Box-Muller transform — generates a normally-distributed random number.
 * Returns a value centred at 0 with standard deviation 1.
 */
function normalRandom(rng: () => number): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Poisson-distributed random integer (approximated via sum of uniforms).
 * Mean is lambda. Result is always ≥ 0.
 */
function poissonRandom(rng: () => number, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/**
 * Derives a deterministic per-participant per-round seed.
 */
function participantRoundSeed(baseSeed: number, participantId: string, roundNumber: number): number {
  let hash = baseSeed ^ (roundNumber * 0x9e3779b9);
  for (let i = 0; i < participantId.length; i++) {
    hash = Math.imul(hash ^ participantId.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

/**
 * Simulates an AI participant's submission for one round.
 *
 * @param profile  - Competition skill profile of the AI player.
 * @param participantId - Used for per-player determinism.
 * @param roundNumber - Current round (1-based).
 * @param gameSeed - Game-wide seed.
 */
export function simulateAiRoundSubmission(
  profile: CompetitionSkillProfile,
  participantId: string,
  roundNumber: number,
  gameSeed: number,
): TimingSubmission {
  const seed = participantRoundSeed(gameSeed, participantId, roundNumber);
  const rng = mulberry32(seed);

  const personality = deriveAiPersonality(profile);
  const cfg = PERSONALITY_CONFIGS[personality];
  const durationSeconds = getRoundDurationSeconds(roundNumber);

  // Compute skill-adjusted sigma.
  // High precision → smaller error sigma; low precision → larger.
  const precisionFactor = (100 - profile.precision) / 100; // 0 (perfect) → 1 (terrible)
  const baseErrorSigma = cfg.errorSigma * (0.5 + precisionFactor * 1.2);

  // Pressure adjustment: longer rounds are easier; short rounds increase error.
  const pressureLevel = durationSeconds <= 5 ? 1.0 : durationSeconds <= 10 ? 0.6 : 0.2;
  const pressuredSigma = baseErrorSigma * (1 + pressureLevel * cfg.pressureSensitivity);

  // Clutch bonus: reduces sigma in shorter rounds.
  const clutchAdjustedSigma = pressuredSigma * (1 - pressureLevel * cfg.clutchBonus);
  const finalSigma = Math.max(0.01, Math.min(0.5, clutchAdjustedSigma));

  // Generate bar position: Gaussian error from TARGET_POSITION.
  const halfBar = BAR_TRACK_WIDTH / 2; // 50
  const errorPP = normalRandom(rng) * finalSigma * halfBar;
  const rawPosition = TARGET_POSITION + errorPP;
  const lockedPosition = Math.max(0, Math.min(BAR_TRACK_WIDTH, rawPosition));

  // Non-locking attempts.
  const nerveFactor = (100 - profile.nerve) / 100;
  const adjustedMean = cfg.meanNonLockingAttempts * (0.5 + nerveFactor * 1.5);
  const nonLockingAttempts = Math.min(5, poissonRandom(rng, adjustedMean));

  // Time remaining: fraction of round consumed before locking.
  const lockFractionNoise = (rng() - 0.5) * 0.3;
  const lockFraction = Math.max(0.05, Math.min(0.95, cfg.lockTimeFraction + lockFractionNoise));
  const timeRemainingMs = Math.round((1 - lockFraction) * durationSeconds * 1000);

  // Rare timeout: nervous AI in a very short round may not lock at all.
  const timeoutChance =
    personality === 'nervous' && durationSeconds <= 5
      ? NERVOUS_SHORT_ROUND_TIMEOUT_CHANCE
      : DEFAULT_TIMEOUT_CHANCE;
  const timedOut = rng() < timeoutChance;

  if (timedOut) {
    return {
      participantId,
      lockedPosition: 0,
      timeRemainingMs: 0,
      nonLockingAttempts,
      timedOut: true,
    };
  }

  return {
    participantId,
    lockedPosition,
    timeRemainingMs,
    nonLockingAttempts,
    timedOut: false,
  };
}

/**
 * Builds a submission generator function for spectator/skip simulation.
 * Accepts a profile map so callers can pass per-player profiles.
 */
export function buildAiSubmissionFn(
  profileMap: Record<string, CompetitionSkillProfile>,
  defaultProfile: CompetitionSkillProfile,
): (participantId: string, roundNumber: number, roundSeed: number) => TimingSubmission {
  return (participantId, roundNumber, roundSeed) => {
    const profile = profileMap[participantId] ?? defaultProfile;
    return simulateAiRoundSubmission(profile, participantId, roundNumber, roundSeed);
  };
}
