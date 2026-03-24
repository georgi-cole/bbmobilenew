/**
 * Quick Tap Race — shared booster pool, deterministic prompt selection,
 * and archetype-based AI score simulation.
 *
 * This module is imported by both:
 *  1. The QuickTapRace React component (for booster scheduling / UI)
 *  2. The startMinigame thunk (for pre-computing realistic AI scores)
 */

import { mulberry32, seededPickN } from '../../store/rng';
import type { CompetitionSkillProfile } from './types';

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

// ── AI archetypes ─────────────────────────────────────────────────────────────

interface QuickTapArchetype {
  /** Base tapping speed range in taps/second [min, max]. */
  baseRateMin: number;
  baseRateMax: number;
  /** 0-1: probability of chasing a beneficial booster prompt. */
  beneficialChaseRate: number;
  /** 0-1: probability of accidentally activating a harmful booster prompt. */
  harmfulActivateRate: number;
  /**
   * 0-1: how quickly the AI reacts to a prompt.  Lower values mean more of
   * the prompt's `visibleFor` window is "wasted" before activation — increasing
   * the interruption cost subtracted from the base tapping score.
   */
  reactionSpeed: number;
}

const AI_ARCHETYPES: readonly QuickTapArchetype[] = [
  // 0: steady-fast — reliable, high-speed tapper with good booster judgement
  { baseRateMin: 7.0, baseRateMax: 8.5, beneficialChaseRate: 0.80, harmfulActivateRate: 0.10, reactionSpeed: 0.90 },
  // 1: bursty — variable speed, can peak very high; decent booster decisions
  { baseRateMin: 5.0, baseRateMax: 9.5, beneficialChaseRate: 0.65, harmfulActivateRate: 0.15, reactionSpeed: 0.75 },
  // 2: booster-chaser — lower base speed but aggressively hunts every prompt
  { baseRateMin: 5.5, baseRateMax: 7.0, beneficialChaseRate: 0.95, harmfulActivateRate: 0.30, reactionSpeed: 0.95 },
  // 3: hesitant-chaser — wants boosters but slow to react; high interruption cost
  { baseRateMin: 6.0, baseRateMax: 7.5, beneficialChaseRate: 0.55, harmfulActivateRate: 0.10, reactionSpeed: 0.50 },
  // 4: booster-avoider — high base speed, essentially ignores all prompts
  { baseRateMin: 7.5, baseRateMax: 9.5, beneficialChaseRate: 0.15, harmfulActivateRate: 0.05, reactionSpeed: 0.85 },
  // 5: unlucky-strong — strong tapper, good intentions, but activates harmful ones often
  { baseRateMin: 7.0, baseRateMax: 8.5, beneficialChaseRate: 0.80, harmfulActivateRate: 0.35, reactionSpeed: 0.88 },
  // 6: weak player — lower overall performance across the board
  { baseRateMin: 3.5, baseRateMax: 5.5, beneficialChaseRate: 0.50, harmfulActivateRate: 0.20, reactionSpeed: 0.55 },
] as const;

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
 * The simulation models:
 *  - per-player archetype (tapping speed profile, booster decision style)
 *  - physical-skill influence on base tap rate
 *  - per-run rhythm variance (fatigue / momentum fluctuations)
 *  - the exact booster prompts appearing for this seed (shared with the component)
 *  - booster decision: beneficial prompts chased, harmful prompts sometimes activated
 *  - interruption cost when activating a booster (reaction-speed-dependent)
 *
 * Returns the expected effective tap score (integer ≥ 0).
 */
export function simulateQuickTapAiScore({
  seed,
  playerId,
  participantIndex = 0,
  profile,
  timeLimitSeconds = 30,
}: SimulateQuickTapAiScoreArgs): number {
  const identity = hashIdentity(playerId, participantIndex);

  // ── 1. Archetype selection ─────────────────────────────────────────────────
  const archetypeRng = mulberry32(((seed >>> 0) ^ identity ^ 0x1a2b3c4d) >>> 0);
  const archetype = AI_ARCHETYPES[Math.floor(archetypeRng() * AI_ARCHETYPES.length)];

  // ── 2. Base tap rate (physical skill scales within archetype range) ────────
  // Normalize profile.physical from [0, 100] → [0, 1], clamped. Missing profile → 0.5.
  const rawPhysical = profile?.physical ?? 50;
  const physicalSkill = Math.min(1, Math.max(0, rawPhysical / 100));
  const baseRate =
    archetype.baseRateMin + (archetype.baseRateMax - archetype.baseRateMin) * physicalSkill;

  // ── 3. Per-run rhythm variance ─────────────────────────────────────────────
  // Two uniform samples averaged → triangular distribution peaked at center.
  const rhythmRng = mulberry32(((seed >>> 0) ^ identity ^ 0xf00dcafe) >>> 0);
  const rhythmFactor = 0.85 + (rhythmRng() + rhythmRng()) * 0.5 * 0.30; // [0.85, 1.15]
  const effectiveRate = baseRate * rhythmFactor;

  // ── 4. Base score (no booster effects) ────────────────────────────────────
  let score = effectiveRate * timeLimitSeconds;

  // ── 5. Booster simulation ─────────────────────────────────────────────────
  const prompts = selectBoosterPrompts(seed);
  const decisionRng = mulberry32(((seed >>> 0) ^ identity ^ 0xbeef1234) >>> 0);

  for (const prompt of prompts) {
    const timeRemaining = timeLimitSeconds - prompt.scheduleAt;
    if (timeRemaining <= 0) continue;

    const willActivate = prompt.beneficial
      ? decisionRng() < archetype.beneficialChaseRate
      : decisionRng() < archetype.harmfulActivateRate;

    if (!willActivate) continue;

    if (prompt.kind === 'time' && typeof prompt.timeDelta === 'number') {
      // Instant time effect: add or subtract tapping time
      score += prompt.timeDelta * effectiveRate;
    } else if (prompt.kind === 'multiplier' && typeof prompt.multiplier === 'number') {
      // Time spent reacting reduces the effective multiplier window
      const interruptSeconds = prompt.visibleFor * (1 - archetype.reactionSpeed);
      const effectiveDuration = Math.max(0, Math.min(prompt.activeDuration, timeRemaining) - interruptSeconds);
      if (effectiveDuration <= 0) continue;

      const normalTaps = effectiveDuration * effectiveRate;
      // (multiplier - 1) * normalTaps = delta vs. tapping normally during that window
      const multiplierDelta = (prompt.multiplier - 1) * normalTaps;
      const interruptCost = interruptSeconds * effectiveRate;

      score += multiplierDelta - interruptCost;
    }
  }

  return Math.max(0, Math.round(score));
}
