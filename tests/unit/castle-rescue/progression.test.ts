/**
 * tests/unit/castle-rescue/progression.test.ts
 *
 * Tests for applyPipeEntry — the deterministic pipe-entry state handler.
 *
 * Covers:
 *  - Entering correct pipes in order (0→1→2) increments pipesComplete.
 *  - Gate opens (gateOpen=true) when pipesComplete reaches CORRECT_ROUTE_LENGTH.
 *  - Re-entering a done pipe does NOT increment pipesComplete (idempotent).
 *  - Entering a correct pipe out of order triggers a setback penalty.
 *  - Entering a setback pipe marks it done and applies the penalty.
 *  - Entering a dead pipe marks it done and shows the dead flash.
 *  - pipesComplete is never reset by bonus/ambush/setback pipe entries.
 */

import { describe, it, expect } from 'vitest';
import {
  applyPipeEntry,
  computePlatformerFinalScore,
} from '../../../src/minigames/castleRescue/castleRescuePlatformerLogic';
import {
  CORRECT_ROUTE_LENGTH,
  RESPAWN_PENALTY,
} from '../../../src/minigames/castleRescue/castleRescueConstants';

// ── Mock factories ─────────────────────────────────────────────────────────────

/** Create a minimal Pipe mock for testing. */
function makePipe(
  routeIndex: number,
  pipeType: 'correct' | 'setback' | 'bonus' | 'ambush' | 'dead',
  done = false,
) {
  return {
    id: `test-pipe-${pipeType}-${routeIndex}`,
    x: 0, y: 0,
    width: 48, height: 64,
    entryZoneWidth: 48,
    slotIndex: routeIndex,
    routeIndex,
    pipeType,
    done,
  } as unknown as Parameters<typeof applyPipeEntry>[1];
}

/** Create a minimal GameState mock for testing pipe-entry effects. */
function makeGs(overrides: { pipesComplete?: number; score?: number; gateOpen?: boolean } = {}) {
  return {
    score: 1000,
    pipesComplete: 0,
    wrongPipes: 0,
    gateOpen: false,
    pipeFlashType: 'correct' as const,
    pipeFlashTimer: 0,
    phase: 'playing' as const,
    ...overrides,
  } as unknown as Parameters<typeof applyPipeEntry>[0];
}

// ── Correct-pipe progression ───────────────────────────────────────────────────

describe('applyPipeEntry — correct pipe in order', () => {
  it('increments pipesComplete when the first correct pipe is entered', () => {
    const gs = makeGs({ pipesComplete: 0 });
    const pipe = makePipe(0, 'correct');
    applyPipeEntry(gs, pipe);
    expect(gs.pipesComplete).toBe(1);
  });

  it('marks the pipe done after successful entry', () => {
    const gs = makeGs({ pipesComplete: 0 });
    const pipe = makePipe(0, 'correct');
    applyPipeEntry(gs, pipe);
    expect(pipe.done).toBe(true);
  });

  it('sets pipeFlashType to "correct" on ordered entry', () => {
    const gs = makeGs({ pipesComplete: 0 });
    const pipe = makePipe(0, 'correct');
    applyPipeEntry(gs, pipe);
    expect(gs.pipeFlashType).toBe('correct');
  });

  it('opens the gate when pipesComplete reaches CORRECT_ROUTE_LENGTH', () => {
    // Enter pipes 0, 1, and 2 in natural order — applyPipeEntry increments
    // pipesComplete each time so no manual reset is needed.
    const gs = makeGs({ pipesComplete: 0 });
    for (let i = 0; i < CORRECT_ROUTE_LENGTH; i++) {
      const pipe = makePipe(i, 'correct');
      applyPipeEntry(gs, pipe);
    }
    expect(gs.pipesComplete).toBe(CORRECT_ROUTE_LENGTH);
    expect(gs.gateOpen).toBe(true);
  });

  it('does NOT open the gate before CORRECT_ROUTE_LENGTH pipes are entered', () => {
    const gs = makeGs({ pipesComplete: 0 });
    // Enter only 2 of 3 correct pipes in natural order.
    for (let i = 0; i < CORRECT_ROUTE_LENGTH - 1; i++) {
      const pipe = makePipe(i, 'correct');
      applyPipeEntry(gs, pipe);
    }
    expect(gs.gateOpen).toBe(false);
  });
});

// ── Idempotency: re-entering a done pipe ──────────────────────────────────────

describe('applyPipeEntry — re-entering a done pipe', () => {
  it('does NOT increment pipesComplete on re-entry', () => {
    const gs = makeGs({ pipesComplete: 1 });
    const donePipe = makePipe(0, 'correct', /* done= */ true);
    applyPipeEntry(gs, donePipe);
    // pipesComplete should stay at 1, not increment further.
    expect(gs.pipesComplete).toBe(1);
  });

  it('does NOT change gateOpen on re-entry', () => {
    const gs = makeGs({ pipesComplete: CORRECT_ROUTE_LENGTH, gateOpen: true });
    const donePipe = makePipe(0, 'correct', /* done= */ true);
    applyPipeEntry(gs, donePipe);
    // Gate stays open; no double-counting.
    expect(gs.gateOpen).toBe(true);
  });

  it('shows the dead flash (visual feedback only) on re-entry', () => {
    const gs = makeGs({ pipesComplete: 1 });
    const donePipe = makePipe(0, 'correct', /* done= */ true);
    applyPipeEntry(gs, donePipe);
    expect(gs.pipeFlashType).toBe('dead');
    expect(gs.phase).toBe('pipe_flash');
  });

  it('does NOT deduct score on re-entry of a done pipe', () => {
    const initialScore = 800;
    const gs = makeGs({ score: initialScore });
    const donePipe = makePipe(0, 'correct', /* done= */ true);
    applyPipeEntry(gs, donePipe);
    expect(gs.score).toBe(initialScore);
  });
});

// ── Out-of-order correct pipe ──────────────────────────────────────────────────

describe('applyPipeEntry — out-of-order correct pipe', () => {
  it('deducts RESPAWN_PENALTY when correct pipe entered out of order', () => {
    const gs = makeGs({ pipesComplete: 0, score: 1000 });
    const pipe = makePipe(2, 'correct'); // routeIndex=2 but pipesComplete=0
    applyPipeEntry(gs, pipe);
    expect(gs.score).toBe(1000 - RESPAWN_PENALTY);
  });

  it('increments wrongPipes counter for out-of-order entry', () => {
    const gs = makeGs({ pipesComplete: 0 });
    const pipe = makePipe(1, 'correct'); // routeIndex=1 but pipesComplete=0
    applyPipeEntry(gs, pipe);
    expect(gs.wrongPipes).toBe(1);
  });

  it('does NOT increment pipesComplete on out-of-order entry', () => {
    const gs = makeGs({ pipesComplete: 0 });
    const pipe = makePipe(2, 'correct');
    applyPipeEntry(gs, pipe);
    expect(gs.pipesComplete).toBe(0);
  });

  it('does NOT mark the pipe done on out-of-order entry (can re-enter when order is right)', () => {
    const gs = makeGs({ pipesComplete: 0 });
    const pipe = makePipe(1, 'correct');
    applyPipeEntry(gs, pipe);
    expect(pipe.done).toBe(false);
  });

  it('sets pipeFlashType to "setback" on out-of-order entry', () => {
    const gs = makeGs({ pipesComplete: 0 });
    const pipe = makePipe(2, 'correct');
    applyPipeEntry(gs, pipe);
    expect(gs.pipeFlashType).toBe('setback');
  });
});

// ── Setback pipe ──────────────────────────────────────────────────────────────

describe('applyPipeEntry — setback pipe', () => {
  it('marks the setback pipe as done after entry', () => {
    const gs = makeGs();
    const pipe = makePipe(-1, 'setback');
    applyPipeEntry(gs, pipe);
    expect(pipe.done).toBe(true);
  });

  it('deducts RESPAWN_PENALTY on setback entry', () => {
    const gs = makeGs({ score: 1000 });
    const pipe = makePipe(-1, 'setback');
    applyPipeEntry(gs, pipe);
    expect(gs.score).toBe(1000 - RESPAWN_PENALTY);
  });

  it('increments wrongPipes on setback entry', () => {
    const gs = makeGs();
    const pipe = makePipe(-1, 'setback');
    applyPipeEntry(gs, pipe);
    expect(gs.wrongPipes).toBe(1);
  });

  it('does NOT reset pipesComplete on setback entry', () => {
    const gs = makeGs({ pipesComplete: 2 });
    const pipe = makePipe(-1, 'setback');
    applyPipeEntry(gs, pipe);
    expect(gs.pipesComplete).toBe(2);
  });

  it('clamps score to 0 when RESPAWN_PENALTY exceeds remaining score', () => {
    const gs = makeGs({ score: 50 }); // less than RESPAWN_PENALTY (100)
    const pipe = makePipe(-1, 'setback');
    applyPipeEntry(gs, pipe);
    expect(gs.score).toBe(0);
  });
});

// ── Dead pipe ─────────────────────────────────────────────────────────────────

describe('applyPipeEntry — dead pipe', () => {
  it('marks the dead pipe as done after entry', () => {
    const gs = makeGs();
    const pipe = makePipe(-1, 'dead');
    applyPipeEntry(gs, pipe);
    expect(pipe.done).toBe(true);
  });

  it('does NOT change score on dead pipe entry', () => {
    const gs = makeGs({ score: 800 });
    const pipe = makePipe(-1, 'dead');
    applyPipeEntry(gs, pipe);
    expect(gs.score).toBe(800);
  });

  it('does NOT change pipesComplete on dead pipe entry', () => {
    const gs = makeGs({ pipesComplete: 1 });
    const pipe = makePipe(-1, 'dead');
    applyPipeEntry(gs, pipe);
    expect(gs.pipesComplete).toBe(1);
  });
});

// ── Bonus / ambush rooms do not reset progression ─────────────────────────────

describe('applyPipeEntry — bonus / ambush do not reset progression', () => {
  it('bonus pipe returns "enter_bonus" without touching pipesComplete', () => {
    const gs = makeGs({ pipesComplete: 1 });
    const pipe = makePipe(-1, 'bonus');
    const result = applyPipeEntry(gs, pipe);
    expect(result).toBe('enter_bonus');
    expect(gs.pipesComplete).toBe(1);
  });

  it('ambush pipe returns "enter_ambush" without touching pipesComplete', () => {
    const gs = makeGs({ pipesComplete: 2 });
    const pipe = makePipe(-1, 'ambush');
    const result = applyPipeEntry(gs, pipe);
    expect(result).toBe('enter_ambush');
    expect(gs.pipesComplete).toBe(2);
  });

  it('bonus/ambush do not reset gateOpen', () => {
    const gs = makeGs({ pipesComplete: CORRECT_ROUTE_LENGTH, gateOpen: true });
    applyPipeEntry(gs, makePipe(-1, 'bonus'));
    expect(gs.gateOpen).toBe(true);
    applyPipeEntry(gs, makePipe(-1, 'ambush'));
    expect(gs.gateOpen).toBe(true);
  });
});

// ── Cross-check: CORRECT_ROUTE_LENGTH constant ────────────────────────────────

describe('CORRECT_ROUTE_LENGTH invariant', () => {
  it('is a positive route length', () => {
    expect(CORRECT_ROUTE_LENGTH).toBeGreaterThan(0);
  });

  it('entering exactly CORRECT_ROUTE_LENGTH pipes in order opens the gate', () => {
    const gs = makeGs();
    for (let i = 0; i < CORRECT_ROUTE_LENGTH; i++) {
      applyPipeEntry(gs, makePipe(i, 'correct'));
    }
    expect(gs.gateOpen).toBe(true);
  });
});

// ── Bonus: computePlatformerFinalScore preserves in-run score ─────────────────

describe('progression + finalize-score integration', () => {
  it('finalScore reflects in-run score (wrong-pipe penalties not double-counted)', () => {
    // Simulate a run where the player earned 700 points in-run
    // (e.g. started at some base score, collected coins, lost 100 to a wrong pipe).
    const gs = makeGs({ score: 700, pipesComplete: 2 });
    const finalScore = computePlatformerFinalScore(gs, 30_000); // 30s = 300pt time penalty
    // Expected: 700 - 300 = 400
    expect(finalScore).toBe(400);
  });
});
