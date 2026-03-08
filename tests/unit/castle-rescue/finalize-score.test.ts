/**
 * tests/unit/castle-rescue/finalize-score.test.ts
 *
 * Tests for computePlatformerFinalScore:
 *  - Preserves gs.score (does not double-count penalties already applied in-run).
 *  - Subtracts floor(elapsedMs/1000) × TIME_PENALTY_PER_SECOND from the score.
 *  - Adds RESCUE_BONUS when princessRescued is true.
 *  - Score is clamped to 0 (never negative).
 *  - Sub-second elapsed time is floored before applying time penalty.
 */

import { describe, it, expect } from 'vitest';
import { computePlatformerFinalScore } from '../../../src/minigames/castleRescue/castleRescuePlatformerLogic';
import {
  TIME_PENALTY_PER_SECOND,
  SCORE_RESCUE,
} from '../../../src/minigames/castleRescue/castleRescueConstants';

/** Minimal game-state shape accepted by computePlatformerFinalScore. */
function makeGs(score: number, princessRescued: boolean) {
  return { score, princessRescued };
}

describe('computePlatformerFinalScore — time penalty', () => {
  it('preserves gs.score when elapsedMs is 0', () => {
    expect(computePlatformerFinalScore(makeGs(400, false), 0)).toBe(400);
  });

  it('deducts TIME_PENALTY_PER_SECOND for each full elapsed second', () => {
    const score = 500;
    const elapsedMs = 10_000; // 10 seconds
    const expected = score - 10 * TIME_PENALTY_PER_SECOND;
    expect(computePlatformerFinalScore(makeGs(score, false), elapsedMs)).toBe(expected);
  });

  it('floors sub-second elapsed time (999ms counts as 0 full seconds)', () => {
    expect(computePlatformerFinalScore(makeGs(300, false), 999)).toBe(300);
    expect(computePlatformerFinalScore(makeGs(300, false), 1_999)).toBe(300 - TIME_PENALTY_PER_SECOND);
  });

  it('applies only the time penalty — does NOT re-deduct in-run wrong-pipe penalties', () => {
    // gs.score already has wrong-pipe penalties subtracted during play.
    // computePlatformerFinalScore must not subtract any additional respawn penalty.
    const scoreAfterPenalties = 700; // e.g. started at 1000, lost 300 via wrong pipes
    const elapsedMs = 5_000;         // 5s × 10pts = 50pt time penalty
    const expected = scoreAfterPenalties - 5 * TIME_PENALTY_PER_SECOND;
    expect(computePlatformerFinalScore(makeGs(scoreAfterPenalties, false), elapsedMs)).toBe(expected);
  });
});

describe('computePlatformerFinalScore — rescue bonus', () => {
  it('adds SCORE_RESCUE when princessRescued is true', () => {
    const score = 0;
    const elapsedMs = 0;
    expect(computePlatformerFinalScore(makeGs(score, true), elapsedMs)).toBe(SCORE_RESCUE);
  });

  it('adds SCORE_RESCUE on top of gs.score minus time penalty', () => {
    const score = 200;
    const elapsedMs = 5_000; // 50pt time penalty
    const expected = score - 5 * TIME_PENALTY_PER_SECOND + SCORE_RESCUE;
    expect(computePlatformerFinalScore(makeGs(score, true), elapsedMs)).toBe(expected);
  });

  it('does not add SCORE_RESCUE when princessRescued is false', () => {
    expect(computePlatformerFinalScore(makeGs(200, false), 0)).toBe(200);
  });
});

describe('computePlatformerFinalScore — clamping', () => {
  it('never returns a negative value when penalties exceed score', () => {
    // score=0, elapsed=300 000ms (300s × 10pts = 3000pt penalty) → clamp to 0
    expect(computePlatformerFinalScore(makeGs(0, false), 300_000)).toBe(0);
  });

  it('clamps to 0 even when score is non-zero but smaller than time penalty', () => {
    expect(computePlatformerFinalScore(makeGs(50, false), 10_000)).toBe(0);
  });

  it('rescue bonus is added before clamping (can rescue from otherwise-zero score)', () => {
    // score=0, time penalty=0, rescue=1000 → final=1000 (not clamped to 0 first)
    expect(computePlatformerFinalScore(makeGs(0, true), 0)).toBe(SCORE_RESCUE);
  });
});
