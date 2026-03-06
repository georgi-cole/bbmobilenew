/**
 * EffectsScheduler — deterministic / randomised distraction-effect scheduler.
 *
 * When a Hold-the-Wall round becomes active, call `start()` to schedule a
 * timeline of EFFECT_START / EFFECT_STOP events that fire automatically
 * through the given GameController.  Call `stop()` (or let `destroy()` on the
 * controller propagate) to cancel all pending timers.
 *
 * Scheduling is controlled by two parameters:
 *  - `seed`      — integer seed for the mulberry32 PRNG.  When supplied the
 *                  same seed always produces the same timeline (deterministic
 *                  for tests).  Defaults to `Date.now()`.
 *  - `intensity` — probability multiplier in [0, ∞).  1 = normal, 0 = off,
 *                  2 = double probability for every effect type.
 *
 * Auto-scheduled effects coexist safely with manual calls to
 * `controller.emitEffectStart/Stop` — the scheduler checks whether an effect
 * is already active before starting it, and emits the matching STOP after the
 * configured duration.
 */

import { mulberry32 } from '../../../../store/rng';
import type {
  HoldTheWallGameController,
  EffectType,
} from '../../../../games/hold-the-wall/GameController';

// ─── Internal types ───────────────────────────────────────────────────────────

interface ScheduledEffect {
  effectType: EffectType;
  /** Milliseconds after round start to emit EFFECT_START. */
  startDelay: number;
  /** Milliseconds after EFFECT_START to emit EFFECT_STOP. */
  duration: number;
  /** Params forwarded to emitEffectStart. */
  params: Record<string, unknown>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** XOR constant mixed into seed to decouple effect scheduling from other RNG
 *  streams that use the same base seed (e.g. AI-drop schedule). */
const SEED_MIX = 0xeffec75;

/** Default round window assumed when none is provided (ms). */
const DEFAULT_ROUND_MS = 120_000;

/** Minimum ms after round start before any auto-effect fires. */
const WINDOW_START_MS = 5_000;

/** Minimum ms before round end to avoid late effects. */
const WINDOW_END_BUFFER_MS = 10_000;

/** Minimum effect duration (ms). */
const EFFECT_MIN_DURATION_MS = 3_000;

/** Random range on top of the minimum (ms). */
const EFFECT_DURATION_RANGE_MS = 5_000;

const CALLERS = ['Julie Chen', 'BB Production', 'Mom', 'Your Agent', 'CBS'];

// ─── Effect catalogue ─────────────────────────────────────────────────────────

/** Base probability (0–1) for each effect type at intensity = 1. */
const EFFECT_CATALOGUE: Array<{
  effectType: EffectType;
  baseProbability: number;
  buildParams: (rng: () => number) => Record<string, unknown>;
}> = [
  {
    effectType: 'rain',
    baseProbability: 0.6,
    buildParams: (rng) => ({ intensity: 0.5 + rng() * 1.5 }),
  },
  {
    effectType: 'wind',
    baseProbability: 0.5,
    buildParams: () => ({}),
  },
  {
    effectType: 'paint',
    baseProbability: 0.3,
    buildParams: () => ({}),
  },
  {
    effectType: 'fakeCall',
    baseProbability: 0.4,
    buildParams: (rng) => ({
      caller: CALLERS[Math.floor(rng() * CALLERS.length)],
    }),
  },
  {
    effectType: 'vibrate',
    baseProbability: 0.35,
    buildParams: () => ({ pattern: [150, 80, 150] }),
  },
  {
    effectType: 'sound',
    baseProbability: 0.2,
    buildParams: () => ({}),
  },
];

// ─── Schedule builder ─────────────────────────────────────────────────────────

/** Build a deterministic list of scheduled effects for one round. */
export function buildEffectSchedule(
  seed: number,
  intensity: number,
  roundDurationMs: number,
): ScheduledEffect[] {
  const rng = mulberry32(seed ^ SEED_MIX);
  const schedule: ScheduledEffect[] = [];

  const windowStart = WINDOW_START_MS;
  const windowEnd = roundDurationMs - WINDOW_END_BUFFER_MS;
  const usableWindow = windowEnd - windowStart;

  if (usableWindow <= 0) return schedule;

  for (const entry of EFFECT_CATALOGUE) {
    const probability = Math.min(1, entry.baseProbability * intensity);
    if (rng() > probability) continue;

    const startDelay = windowStart + Math.floor(rng() * usableWindow);
    const duration = EFFECT_MIN_DURATION_MS + Math.floor(rng() * EFFECT_DURATION_RANGE_MS);
    const params = entry.buildParams(rng);

    schedule.push({ effectType: entry.effectType, startDelay, duration, params });
  }

  return schedule;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Standalone effect scheduler that wraps a `HoldTheWallGameController`.
 *
 * Typical usage in a React component:
 *
 * ```ts
 * const scheduler = useMemo(
 *   () => new EffectsScheduler(controller, { seed, intensity: 1 }),
 *   [controller],
 * );
 *
 * useEffect(() => {
 *   if (status === 'active') scheduler.start();
 *   return () => scheduler.stop();
 * }, [status]);
 * ```
 */
export class EffectsScheduler {
  private readonly seed: number;
  private readonly intensity: number;
  private readonly roundDurationMs: number;

  private timers: ReturnType<typeof setTimeout>[] = [];
  private activeEffects = new Set<EffectType>();

  /** Unsubscribe functions from controller event listeners. */
  private unsubStart: (() => void) | null = null;
  private unsubStop: (() => void) | null = null;

  /**
   * @param controller     - The game controller whose `emitEffectStart/Stop`
   *                         will be called.
   * @param seed           - PRNG seed for deterministic schedules.  Defaults
   *                         to `Date.now()`.
   * @param intensity      - Probability multiplier (0–∞).  Defaults to 1.
   * @param roundDurationMs - Expected round length in ms.  Used to space
   *                          effects across the round window.  Defaults to
   *                          120 000 ms.
   */
  constructor(
    private readonly controller: HoldTheWallGameController,
    seed?: number,
    intensity = 1,
    roundDurationMs = DEFAULT_ROUND_MS,
  ) {
    this.seed = seed ?? Date.now();
    this.intensity = intensity;
    this.roundDurationMs = roundDurationMs;

    // Track ALL effect activity on this controller (including external calls)
    // so scheduled effects don't conflict with manually triggered ones.
    this.unsubStart = controller.on('EFFECT_START', (p) => {
      this.activeEffects.add(p.effectType);
    });
    this.unsubStop = controller.on('EFFECT_STOP', (p) => {
      this.activeEffects.delete(p.effectType);
    });
  }

  /** Start scheduling effects for the current round. Clears any previous timers. */
  start(): void {
    this.stop();

    const schedule = buildEffectSchedule(this.seed, this.intensity, this.roundDurationMs);

    for (const effect of schedule) {
      const startTimer = setTimeout(() => {
        // Skip if any source (manual or earlier schedule) already started this effect
        if (this.activeEffects.has(effect.effectType)) return;

        // activeEffects will be updated via the EFFECT_START listener we registered
        this.controller.emitEffectStart(effect.effectType, effect.params);

        const stopTimer = setTimeout(() => {
          // Only emit STOP if the effect is still tracked as active by us
          // (guards against external stop calls that already ended the effect)
          if (this.activeEffects.has(effect.effectType)) {
            this.controller.emitEffectStop(effect.effectType);
          }
        }, effect.duration);

        this.timers.push(stopTimer);
      }, effect.startDelay);

      this.timers.push(startTimer);
    }
  }

  /** Cancel all pending scheduled timers and unsubscribe from controller events. */
  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.activeEffects.clear();
  }

  /** Release all resources. Call when the scheduler is no longer needed. */
  destroy(): void {
    this.stop();
    this.unsubStart?.();
    this.unsubStop?.();
    this.unsubStart = null;
    this.unsubStop = null;
  }
}
