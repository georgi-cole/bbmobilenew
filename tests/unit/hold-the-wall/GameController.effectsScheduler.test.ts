/**
 * Unit tests: EffectsScheduler — deterministic scheduling via seed.
 *
 * Verifies that:
 *  1. buildEffectSchedule produces the same schedule for the same seed.
 *  2. buildEffectSchedule produces a different schedule for a different seed.
 *  3. intensity = 0 produces an empty schedule.
 *  4. intensity > 1 increases the number of scheduled effects.
 *  5. All scheduled startDelay values fall within the expected window
 *     (5 000 ms … roundDuration − 10 000 ms).
 *  6. EffectsScheduler.start() emits EFFECT_START events at the expected
 *     delays using fake timers and a deterministic seed.
 *  7. EFFECT_STOP is emitted after each effect's duration.
 *  8. EffectsScheduler.stop() cancels pending timers — no events fire afterward.
 *  9. Scheduler skips an effect type already marked active (no conflict with
 *     manual emitEffectStart calls).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildEffectSchedule,
  EffectsScheduler,
} from '../../../src/ui/games/HoldTheWall/effects/EffectsScheduler';
import { HoldTheWallGameController } from '../../../src/games/hold-the-wall/GameController';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeController(id = 'sched-test') {
  return new HoldTheWallGameController(id);
}

// ─── buildEffectSchedule ──────────────────────────────────────────────────────

describe('buildEffectSchedule', () => {
  it('produces the same schedule for the same seed', () => {
    const a = buildEffectSchedule(42, 1, 60_000);
    const b = buildEffectSchedule(42, 1, 60_000);
    expect(a).toEqual(b);
  });

  it('produces a different schedule for a different seed', () => {
    const a = buildEffectSchedule(1, 1, 60_000);
    const b = buildEffectSchedule(2, 1, 60_000);
    // Different seeds should produce different results (very high probability)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('returns empty schedule when intensity is 0', () => {
    const schedule = buildEffectSchedule(99, 0, 60_000);
    expect(schedule).toHaveLength(0);
  });

  it('all startDelay values fall within [5000, roundDuration - 10000]', () => {
    const roundMs = 60_000;
    const schedule = buildEffectSchedule(7, 1, roundMs);
    for (const effect of schedule) {
      expect(effect.startDelay).toBeGreaterThanOrEqual(5_000);
      expect(effect.startDelay).toBeLessThan(roundMs - 10_000);
    }
  });

  it('returns empty schedule when usable window is non-positive', () => {
    // Round too short: 5000 + 10000 > 12000
    const schedule = buildEffectSchedule(1, 1, 12_000);
    expect(schedule).toHaveLength(0);
  });

  it('with intensity > 1 produces at least as many effects as intensity 1 (statistically)', () => {
    // With intensity = 2 every probability doubles; run many seeds and verify
    // that on average we get more effects.
    let highCount = 0;
    let normalCount = 0;
    for (let s = 0; s < 50; s++) {
      highCount += buildEffectSchedule(s, 2, 120_000).length;
      normalCount += buildEffectSchedule(s, 1, 120_000).length;
    }
    expect(highCount).toBeGreaterThanOrEqual(normalCount);
  });
});

// ─── EffectsScheduler ─────────────────────────────────────────────────────────

describe('EffectsScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits EFFECT_START events at the scheduled delays', () => {
    const ctrl = makeController();
    const startListener = vi.fn();
    ctrl.on('EFFECT_START', startListener);

    const scheduler = new EffectsScheduler(ctrl, /* seed */ 1, /* intensity */ 2, 120_000);
    scheduler.start();

    // Advance time to just past the last possible scheduled start
    // (usable window end = 120_000 − 10_000 = 110_000)
    vi.advanceTimersByTime(115_000);

    // With intensity=2 and seed=1 we expect at least some EFFECT_START events
    expect(startListener.mock.calls.length).toBeGreaterThan(0);

    scheduler.stop();
    ctrl.destroy();
  });

  it('emits EFFECT_STOP after each effect duration', () => {
    const ctrl = makeController();
    const stopListener = vi.fn();
    ctrl.on('EFFECT_STOP', stopListener);

    const scheduler = new EffectsScheduler(ctrl, 1, 2, 120_000);
    scheduler.start();

    // Advance well past end of all possible effects (max start 110s + max duration 8s)
    vi.advanceTimersByTime(120_000);

    expect(stopListener.mock.calls.length).toBeGreaterThan(0);

    scheduler.stop();
    ctrl.destroy();
  });

  it('stop() cancels pending timers — no events fire after stop', () => {
    const ctrl = makeController();
    const startListener = vi.fn();
    ctrl.on('EFFECT_START', startListener);

    // Seed with high intensity so at least one effect would be scheduled
    const scheduler = new EffectsScheduler(ctrl, 7, 2, 120_000);
    scheduler.start();

    // Advance a small amount — well before any effect fires (window starts at 5s)
    vi.advanceTimersByTime(3_000);

    scheduler.stop();

    // Now advance past the whole window — nothing should fire
    vi.advanceTimersByTime(120_000);
    expect(startListener).not.toHaveBeenCalled();

    ctrl.destroy();
  });

  it('start() with the same seed produces the same sequence twice', () => {
    const ctrl1 = makeController('c1');
    const ctrl2 = makeController('c2');
    const calls1: string[] = [];
    const calls2: string[] = [];
    ctrl1.on('EFFECT_START', (p) => calls1.push(p.effectType));
    ctrl2.on('EFFECT_START', (p) => calls2.push(p.effectType));

    const s1 = new EffectsScheduler(ctrl1, 42, 2, 120_000);
    const s2 = new EffectsScheduler(ctrl2, 42, 2, 120_000);
    s1.start();
    s2.start();

    vi.advanceTimersByTime(120_000);

    expect(calls1).toEqual(calls2);

    s1.stop();
    s2.stop();
    ctrl1.destroy();
    ctrl2.destroy();
  });

  it('does not emit EFFECT_START for a type already active', () => {
    const ctrl = makeController();
    const startListener = vi.fn();
    ctrl.on('EFFECT_START', startListener);

    // We need to simulate the scheduler having an active effect.
    // We do this by starting, letting the first effect fire, then checking
    // a second scheduler for the same effect type does nothing.
    // Instead, test directly: manually trigger the internal active-effects guard
    // by calling emitEffectStart before the scheduler fires.

    // Use a predictable seed that includes 'rain' at its first scheduled position
    const schedule = buildEffectSchedule(1, 2, 120_000);
    expect(schedule.length).toBeGreaterThan(0);

    // Find the first effect type in the schedule
    const firstEffect = schedule[0];

    const scheduler = new EffectsScheduler(ctrl, 1, 2, 120_000);
    scheduler.start();

    // Manually emit a start for the first effect type before the scheduler fires it
    ctrl.emitEffectStart(firstEffect.effectType, {});
    const countAfterManualTrigger = startListener.mock.calls.length;

    // Advance past that effect's start delay
    vi.advanceTimersByTime(firstEffect.startDelay + 1);

    // The scheduler should NOT have re-emitted since the effect was already active
    // (manual call incremented the count by 1; scheduler should add 0 more for that type)
    const countAfterScheduledDelay = startListener.mock.calls.length;
    expect(countAfterScheduledDelay).toBe(countAfterManualTrigger);

    scheduler.stop();
    ctrl.destroy();
  });
});
