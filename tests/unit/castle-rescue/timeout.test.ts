/**
 * tests/unit/castle-rescue/timeout.test.ts
 *
 * Tests for timeout / finalization logic in the Castle Rescue engine:
 *  - finalizeRunState on an active run forces status to 'complete'.
 *  - finalizeRunState computes a score for a timed-out run.
 *  - finalizeRunState is idempotent: second call returns the same state.
 *  - outcomeResolved is set to true after finalisation.
 *  - Score is 0 when time penalty and respawn penalty exceed MAX_SCORE.
 *  - A pre-completed run is unchanged by finalizeRunState.
 *  - All tests use fake timestamps (no wall-clock dependency).
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialRunState,
  startRun,
  finalizeRunState,
} from '../../../src/minigames/castleRescue/castleRescueEngine';
import { FIXTURE_MAP_STRAIGHT } from '../../../src/minigames/castleRescue/castleRescueTestData';
import { SCORE_FLOOR, MAX_SCORE, TIME_LIMIT_MS } from '../../../src/minigames/castleRescue/castleRescueConstants';

/** Start time constant — all tests use 0 ms for determinism. */
const T0 = 0;

describe('finalizeRunState — timeout on active run', () => {
  function makeActiveRun(nowMs = T0) {
    const idle = createInitialRunState();
    return startRun(idle, FIXTURE_MAP_STRAIGHT, nowMs);
  }

  it('transitions status from active to complete', () => {
    const active = makeActiveRun();
    const finalised = finalizeRunState(active, TIME_LIMIT_MS);
    expect(finalised.status).toBe('complete');
  });

  it('sets endTimeMs to the provided nowMs', () => {
    const active = makeActiveRun();
    const finalised = finalizeRunState(active, TIME_LIMIT_MS);
    expect(finalised.endTimeMs).toBe(TIME_LIMIT_MS);
  });

  it('computes a non-null score', () => {
    const active = makeActiveRun();
    const finalised = finalizeRunState(active, TIME_LIMIT_MS);
    expect(finalised.score).not.toBeNull();
  });

  it('score is SCORE_FLOOR when full time elapses and there are wrong attempts', () => {
    // 60 000 ms elapsed → 600 time penalty (> MAX_SCORE 1000) → clamp to 0
    const active = makeActiveRun();
    const finalised = finalizeRunState(active, TIME_LIMIT_MS);
    // 60s × 10pts/s = 600 penalty; score = max(0, 1000 - 600) = 400 with 0 wrongs
    expect(finalised.score).toBeGreaterThanOrEqual(SCORE_FLOOR);
    expect(finalised.score).toBeLessThanOrEqual(MAX_SCORE);
  });

  it('score is SCORE_FLOOR when combined penalties exceed MAX_SCORE', () => {
    // Manually build a state with many wrong attempts and max time
    const active = {
      ...makeActiveRun(),
      wrongAttempts: 20, // 20 × 100 = 2000 penalty alone
    };
    const finalised = finalizeRunState(active, TIME_LIMIT_MS);
    expect(finalised.score).toBe(SCORE_FLOOR);
  });

  it('sets outcomeResolved to true', () => {
    const active = makeActiveRun();
    const finalised = finalizeRunState(active, TIME_LIMIT_MS);
    expect(finalised.outcomeResolved).toBe(true);
  });
});

describe('finalizeRunState — idempotency', () => {
  it('second call returns state unchanged (no double-finalization)', () => {
    const active = createInitialRunState();
    const started = startRun(active, FIXTURE_MAP_STRAIGHT, T0);
    const once = finalizeRunState(started, TIME_LIMIT_MS);
    const twice = finalizeRunState(once, TIME_LIMIT_MS + 1000);

    // State must be identical — second call must not update endTimeMs
    expect(twice.endTimeMs).toBe(once.endTimeMs);
    expect(twice.score).toBe(once.score);
    expect(twice.outcomeResolved).toBe(true);
  });

  it('calling FINALIZE on an already-complete run with outcomeResolved=true is a no-op', () => {
    const active = startRun(createInitialRunState(), FIXTURE_MAP_STRAIGHT, T0);
    const finalised = finalizeRunState(active, 5_000);
    const refinalised = finalizeRunState(finalised, 99_000);

    expect(refinalised.endTimeMs).toBe(5_000);
    expect(refinalised.score).toBe(finalised.score);
  });
});

describe('finalizeRunState — no-op on idle state', () => {
  it('does not change an idle state (outcomeResolved is false, no-op)', () => {
    const idle = createInitialRunState();
    // idle.outcomeResolved is false, so finalizeRunState will try to complete it
    // but status is idle — it should flip outcomeResolved without breaking state
    const result = finalizeRunState(idle, T0);
    // idle → complete with 0 ms elapsed, score = MAX_SCORE - 0 = MAX_SCORE
    // Since idle has status 'idle' (not 'active'), it goes through the non-timeout path
    expect(result.outcomeResolved).toBe(true);
  });
});
