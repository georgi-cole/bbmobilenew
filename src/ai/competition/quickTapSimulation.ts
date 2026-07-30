/**
 * Quick Tap Race — shared booster pool, deterministic prompt selection,
 * and weighted AI score simulation.
 *
 * This module is imported by both:
 *  1. The QuickTapRace React component (for booster scheduling / UI)
 *  2. The startMinigame thunk (for pre-computing competitive AI scores)
 */

import { mulberry32, seededPickN } from '../../store/rng';
import type { CompetitionSkillProfile } from './types';
import { minigameAiBalance } from './minigameAiBalance';
import type { ScoreBand } from './minigameAiBalance';

// ── Booster pool ──────────────────────────────────────────────────────────────

export type BoosterType = '2x' | '3x' | '0.5x' | '-1x' | '+3s' | '-3s';

export interface BoosterDefinition {
  type: BoosterType;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Emoji icon for the prompt button. */
  icon: string;
  /** 'multiplier' applies a tap-value multiplier; 'time' instantly adjusts remaining time. */
  kind: 'multiplier' | 'time';
  /** For 'multiplier' kind: value each tap adds while active (can be negative). */
  multiplier?: number;
  /** For 'time' kind: seconds to add to the clock (negative = subtract). */
  timeDelta?: number;
  /** Seconds the multiplier effect is active after the player taps the prompt (0 for instant). */
  activeDuration: number;
  beneficial: boolean;
}

export interface ScheduledBoosterPrompt extends BoosterDefinition {
  /** Seconds into the game when this prompt appears on screen. */
  scheduleAt: number;
  /** Seconds the prompt stays visible before auto-disappearing if not tapped. */
  visibleFor: number;
}

/** All possible booster types that can appear in a Quick Tap Race game. */
export const BOOSTER_POOL: readonly BoosterDefinition[] = [
  { type: '2x',   label: '2× FRENZY!',  icon: '⚡', kind: 'multiplier', multiplier: 2,    activeDuration: 5, beneficial: true  },
  { type: '3x',   label: '3× TURBO!',   icon: '🔥', kind: 'multiplier', multiplier: 3,    activeDuration: 4, beneficial: true  },
  { type: '0.5x', label: '½ FUMBLE',    icon: '🥴', kind: 'multiplier', multiplier: 0.5,  activeDuration: 4, beneficial: false },
  { type: '-1x',  label: '-1× DRAIN',   icon: '💀', kind: 'multiplier', multiplier: -1,   activeDuration: 4, beneficial: false },
  { type: '+3s',  label: '+3 SECONDS!', icon: '⏰', kind: 'time',       timeDelta:  3,    activeDuration: 0, beneficial: true  },
  { type: '-3s',  label: '-3 SECONDS',  icon: '⌛', kind: 'time',       timeDelta: -3,    activeDuration: 0, beneficial: false },
] as const;

/** Seconds into the game at which each of the 3 booster prompts appears. */
const PROMPT_SCHEDULE_TIMES = [6, 15, 23] as const;
/** Seconds each prompt remains visible before auto-disappearing if not tapped. */
export const PROMPT_VISIBLE_FOR = 4;

/**
 * Deterministically select exactly 3 booster prompts for a game based on
 * the competition seed.  The same seed always produces the same 3 prompts
 * in the same order, so the pre-computed AI scores reflect the same event
 * sequence the human player will see.
 */
export function selectBoosterPrompts(seed: number): ScheduledBoosterPrompt[] {
  const rng = mulberry32((seed >>> 0) ^ 0xdeadbeef);
  const selected = seededPickN(rng, BOOSTER_POOL as BoosterDefinition[], 3);
  return PROMPT_SCHEDULE_TIMES.map((scheduleAt, i) => ({
    ...selected[i],
    scheduleAt,
    visibleFor: PROMPT_VISIBLE_FOR,
  }));
}

// ── AI score bands ────────────────────────────────────────────────────────────
// Score bands are defined in minigameAiBalance.ts (the single authoritative
// place to tune quickTap AI scoring). Access them via minigameAiBalance.quickTap.

function hashIdentity(playerId?: string, participantIndex = 0): number {
  if (typeof playerId === 'string' && playerId.length > 0) {
    let hash = 0x811c9dc5 >>> 0; // FNV-1a 32-bit
    for (let i = 0; i < playerId.length; i++) {
      hash ^= playerId.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
  }
  return ((participantIndex + 1) * 0x9e3779b9) >>> 0;
}

export interface SimulateQuickTapAiScoreArgs {
  seed: number;
  playerId?: string;
  participantIndex?: number;
  profile?: CompetitionSkillProfile;
  /** Defaults to 30 seconds. */
  timeLimitSeconds?: number;
}

/**
 * Simulate a Quick Tap Race AI player's effective score for a given seed.
 *
 * Score bands and tuning parameters are read from `minigameAiBalance.quickTap`
 * — edit that file to rebalance AI scoring without touching logic here.
 *
 * Distribution (default 30 s game, from minigameAiBalance.ts):
 *  - 89–118   →  3%   (occasional weak outcome)
 *  - 119–157  → 17%   (below-competitive)
 *  - 158–187  → 20%   (competitive)
 *  - 187–225  → 30%   (strong finish)
 *  - 226–264  → 25%   (standout performance)
 *  - 300–328  →  5%   (rare perfect booster run; can reach 350 with bonuses)
 * plus optional ±jitter, hot-streak bonus and slump penalty.
 *
 * Profile stats (physical, consistency, luck) only bias the *position within*
 * the chosen band so band probabilities remain stable — avoiding deterministic
 * identity lock-in while still letting varied profiles influence outcomes.
 */
export function simulateQuickTapAiScore({
  seed,
  playerId,
  participantIndex = 0,
  profile,
  timeLimitSeconds = 30,
}: SimulateQuickTapAiScoreArgs): number {
  const config = minigameAiBalance.quickTap;
  const bands: ScoreBand[] = config.scoreBands;

  const identity = hashIdentity(playerId, participantIndex);
  const bandRng = mulberry32(((seed >>> 0) ^ identity ^ 0x1a2b3c4d) >>> 0);
  const roll = bandRng();

  let cumulativeChance = 0;
  let band: ScoreBand = bands[bands.length - 1];
  for (const candidate of bands) {
    cumulativeChance += candidate.chance;
    if (roll < cumulativeChance) {
      band = candidate;
      break;
    }
  }

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const physicalSkill = clamp01((profile?.physical ?? 50) / 100);
  const consistency = clamp01((profile?.consistency ?? 50) / 100);
  const luck = clamp01((profile?.luck ?? 50) / 100);
  const bandPositionRng = mulberry32(((seed >>> 0) ^ identity ^ 0xf00dcafe) >>> 0);
  const triangularRoll = (bandPositionRng() + bandPositionRng()) * 0.5;
  const skillBias =
    (physicalSkill - 0.5) * 0.28 +
    (consistency - 0.5) * 0.12 +
    (luck - 0.5) * 0.08;
  const bandPosition = clamp01(triangularRoll + skillBias);
  const bandSpan = band.max - band.min;
  let baseScore = band.min + Math.round(bandSpan * bandPosition);

  // Apply optional jitter (±jitter, independent RNG stream).
  const jitter = config.jitter ?? 0;
  if (jitter > 0) {
    const jitterRng = mulberry32(((seed >>> 0) ^ identity ^ 0xabcd1234) >>> 0);
    const jitterOffset = Math.round((jitterRng() * 2 - 1) * jitter);
    baseScore += jitterOffset;
  }

  // Apply optional hot-streak or slump modifier (mutually exclusive).
  const streakRng = mulberry32(((seed >>> 0) ^ identity ^ 0x5ca1ab1e) >>> 0);
  const streakRoll = streakRng();
  const hotChance = config.hotStreakChance ?? 0;
  const slumpChance = config.slumpChance ?? 0;

  if (hotChance > 0 && streakRoll < hotChance) {
    const bonusMin = config.hotStreakBonusMin ?? 0;
    const bonusMax = config.hotStreakBonusMax ?? bonusMin;
    baseScore += bonusMin + Math.round(streakRng() * (bonusMax - bonusMin));
  } else if (slumpChance > 0 && streakRoll < hotChance + slumpChance) {
    const penaltyMin = config.slumpPenaltyMin ?? 0;
    const penaltyMax = config.slumpPenaltyMax ?? penaltyMin;
    baseScore -= penaltyMin + Math.round(streakRng() * (penaltyMax - penaltyMin));
  }

  baseScore = Math.max(0, baseScore);

  if (timeLimitSeconds === 30) {
    return baseScore;
  }

  return Math.max(0, Math.round(baseScore * (timeLimitSeconds / 30)));
}
