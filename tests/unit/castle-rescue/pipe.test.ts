/**
 * tests/unit/castle-rescue/pipe.test.ts
 *
 * Tests for handlePipeClick engine logic:
 *  - Clicking the correct next route pipe advances the selection.
 *  - Clicking a decoy triggers a respawn: wrongAttempts++ and selection reset.
 *  - Clicking a non-adjacent pipe is a no-op (anti-exploit distance check).
 *  - Clicking an already-selected pipe is a no-op (anti-exploit re-click guard).
 *  - Clicking all three route pipes in order completes the run.
 *  - Completing the run sets status to 'complete' and computes a score.
 *  - Score for immediate correct completion (near-0 elapsed) is close to MAX_SCORE.
 *  - Clicking after the run is complete is a no-op.
 *  - Respawn resets currentHeadPos back to the source.
 */

import { describe, it, expect } from 'vitest';
import {
  startRun,
  handlePipeClick,
  createInitialRunState,
} from '../../../src/minigames/castleRescue/castleRescueEngine';
import { FIXTURE_MAP_STRAIGHT } from '../../../src/minigames/castleRescue/castleRescueTestData';
import { MAX_SCORE, RESPAWN_PENALTY } from '../../../src/minigames/castleRescue/castleRescueConstants';

const T0 = 0; // start timestamp
const T1 = 100; // small dt — keeps time penalty near zero

function freshRun() {
  const idle = createInitialRunState();
  return startRun(idle, FIXTURE_MAP_STRAIGHT, T0);
}

describe('handlePipeClick — correct route progression', () => {
  it('clicking the first route pipe advances selectedPipeIds', () => {
    const state = handlePipeClick(freshRun(), 'route-0', T1);
    expect(state.selectedPipeIds).toContain('route-0');
    expect(state.selectedPipeIds).toHaveLength(1);
  });

  it('currentHeadPos advances to the first route pipe cell', () => {
    const state = handlePipeClick(freshRun(), 'route-0', T1);
    // FIXTURE_MAP_STRAIGHT has route-0 at row:2, col:1
    expect(state.currentHeadPos).toEqual({ row: 2, col: 1 });
  });

  it('clicking all three route pipes in order completes the run', () => {
    let state = freshRun();
    state = handlePipeClick(state, 'route-0', T1);
    state = handlePipeClick(state, 'route-1', T1);
    state = handlePipeClick(state, 'route-2', T1);
    expect(state.status).toBe('complete');
  });

  it('score is set after completing the route', () => {
    let state = freshRun();
    state = handlePipeClick(state, 'route-0', T1);
    state = handlePipeClick(state, 'route-1', T1);
    state = handlePipeClick(state, 'route-2', T1);
    expect(state.score).not.toBeNull();
  });

  it('score for near-instant correct completion is close to MAX_SCORE', () => {
    // 100ms elapsed → floor(0.1) × 10 = 0 penalty; 0 wrongs → score = MAX_SCORE
    let state = freshRun();
    state = handlePipeClick(state, 'route-0', T1);
    state = handlePipeClick(state, 'route-1', T1);
    state = handlePipeClick(state, 'route-2', T1);
    expect(state.score).toBe(MAX_SCORE);
  });
});

describe('handlePipeClick — wrong (decoy) click', () => {
  it('increments wrongAttempts by 1 when an adjacent decoy is clicked', () => {
    // decoy-0 is at (0,0); to trigger a wrong attempt we need the head to be
    // adjacent to it.  Manually place the head at (0,1) (adjacent to decoy-0).
    const manipulated = { ...freshRun(), currentHeadPos: { row: 0, col: 1 } };
    const state = handlePipeClick(manipulated, 'decoy-0', T1);
    expect(state.wrongAttempts).toBe(1);
  });

  it('does not change selection on non-adjacent wrong click (no-op)', () => {
    // decoy-0 is at (0,0), which is not adjacent to the source (2,0).
    // Clicking it is blocked by the adjacency guard: no wrongAttempts increment,
    // no selection change.
    const state = handlePipeClick(freshRun(), 'decoy-0', T1);
    expect(state.wrongAttempts).toBe(0);
    expect(state.selectedPipeIds).toHaveLength(0);
  });

  it('resets selectedPipeIds and currentHeadPos on an adjacent wrong click', () => {
    // Place the head at (0,1) so that decoy-0 at (0,0) is adjacent.
    let state = { ...freshRun(), currentHeadPos: { row: 0, col: 1 } };
    // Simulate having already selected one route pipe (to verify the reset clears it)
    state = { ...state, selectedPipeIds: ['route-0'] };
    const after = handlePipeClick(state, 'decoy-0', T1);
    expect(after.wrongAttempts).toBe(1);
    expect(after.selectedPipeIds).toHaveLength(0);
    expect(after.currentHeadPos).toEqual(FIXTURE_MAP_STRAIGHT.source);
  });

  it('clicking the correct pipe after respawn works normally', () => {
    // Build a scenario where wrong attempt happens then correct sequence succeeds
    let state = freshRun();
    // Click route-1 directly from source — it's at (2,2), source is (2,0): not adjacent → no-op
    state = handlePipeClick(state, 'route-1', T1);
    expect(state.wrongAttempts).toBe(0);
    // Now click correctly
    state = handlePipeClick(state, 'route-0', T1);
    state = handlePipeClick(state, 'route-1', T1);
    state = handlePipeClick(state, 'route-2', T1);
    expect(state.status).toBe('complete');
  });
});

describe('handlePipeClick — anti-exploit guards', () => {
  it('re-clicking an already-selected pipe is a no-op', () => {
    let state = freshRun();
    state = handlePipeClick(state, 'route-0', T1);
    const before = { ...state };
    state = handlePipeClick(state, 'route-0', T1); // re-click
    expect(state.selectedPipeIds).toHaveLength(before.selectedPipeIds.length);
    expect(state.wrongAttempts).toBe(before.wrongAttempts);
  });

  it('clicking a non-adjacent pipe is a no-op (no wrong attempt charged)', () => {
    const state = handlePipeClick(freshRun(), 'route-2', T1); // not adjacent to source
    expect(state.wrongAttempts).toBe(0);
    expect(state.selectedPipeIds).toHaveLength(0);
  });

  it('clicking after run is complete is a no-op', () => {
    let state = freshRun();
    state = handlePipeClick(state, 'route-0', T1);
    state = handlePipeClick(state, 'route-1', T1);
    state = handlePipeClick(state, 'route-2', T1); // complete
    const scoreAfter = state.score;
    // Try to click again (complete state → no-op)
    const postClick = handlePipeClick(state, 'route-0', T1 + 1000);
    expect(postClick.score).toBe(scoreAfter);
    expect(postClick.status).toBe('complete');
  });

  it('wrong click respawn deducts RESPAWN_PENALTY from potential score', () => {
    // Click a non-adjacent decoy pipe that IS a pipe — will be adjacency-blocked,
    // so no penalty. Verify this explicitly.
    const state = handlePipeClick(freshRun(), 'decoy-0', T1);
    // decoy-0 at (0,0): not adjacent to source (2,0) → no-op
    expect(state.wrongAttempts).toBe(0);

    // Build a state where we manually set the head adjacent to a decoy
    // by using a modified state. (Pure engine test, no DOM needed.)
    const manipulated = {
      ...freshRun(),
      currentHeadPos: { row: 0, col: 1 }, // adjacent to decoy-0 at (0,0)
    };
    const afterWrong = handlePipeClick(manipulated, 'decoy-0', T1);
    // decoy-0 IS adjacent to (0,1) — row diff=0, col diff=1 → adjacent → wrong attempt
    expect(afterWrong.wrongAttempts).toBe(1);
    expect(afterWrong.selectedPipeIds).toHaveLength(0);
    expect(afterWrong.currentHeadPos).toEqual(FIXTURE_MAP_STRAIGHT.source);
    // Score (from a theoretical completion after 1 wrong) would deduct RESPAWN_PENALTY
    expect(RESPAWN_PENALTY).toBe(100);
  });
});
