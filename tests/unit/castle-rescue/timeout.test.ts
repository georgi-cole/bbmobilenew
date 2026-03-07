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

  it('computes the correct score when full time elapses with no wrong attempts', () => {
    // 60 000 ms elapsed → 60s × 10pts/s = 600 time penalty
    // With MAX_SCORE 1000 and 0 wrong attempts: score = 1000 - 600 = 400
    const active = makeActiveRun();
    const finalised = finalizeRunState(active, TIME_LIMIT_MS);
    expect(finalised.score).toBe(400);
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

describe('finalizeRunState — idle state behaviour', () => {
  it('marks outcomeResolved on an idle state without starting the run', () => {
    const idle = createInitialRunState();
    // idle.outcomeResolved is false; calling finalizeRunState on an idle run
    // only flips outcomeResolved — the status stays 'idle' because the engine
    // only force-completes 'active' runs in the timeout path.
    const result = finalizeRunState(idle, T0);
    expect(result.outcomeResolved).toBe(true);
    // Status remains idle (an unstarted run is not converted to 'complete').
    expect(result.status).toBe('idle');
  });
});
