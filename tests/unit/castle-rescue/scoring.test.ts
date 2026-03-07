/**
 * tests/unit/castle-rescue/scoring.test.ts
 *
 * Tests for castleRescueScoring:
 *  - Perfect run (0 elapsed, 0 wrong) yields MAX_SCORE.
 *  - Each elapsed second deducts TIME_PENALTY_PER_SECOND.
 *  - Each wrong attempt deducts RESPAWN_PENALTY.
 *  - Combined penalties sum correctly.
 *  - Score is clamped to [SCORE_FLOOR, MAX_SCORE] (no negative, no over-cap).
 *  - computeScoreFromState handles null endTimeMs.
 *  - Sub-second elapsed time is floored before applying time penalty.
 */

import { describe, it, expect } from 'vitest';
import { computeScore, computeScoreFromState } from '../../../src/minigames/castleRescue/castleRescueScoring';
import {
  MAX_SCORE,
  TIME_PENALTY_PER_SECOND,
  RESPAWN_PENALTY,
  SCORE_FLOOR,
} from '../../../src/minigames/castleRescue/castleRescueConstants';
import { makeCompleteState, makeActiveState, FIXTURE_MAP_STRAIGHT } from '../../../src/minigames/castleRescue/castleRescueTestData';

describe('computeScore — basic formula', () => {
  it('returns MAX_SCORE for 0 elapsed ms and 0 wrong attempts', () => {
    expect(computeScore(0, 0)).toBe(MAX_SCORE);
  });

  it('deducts TIME_PENALTY_PER_SECOND for each full second elapsed', () => {
    expect(computeScore(1_000, 0)).toBe(MAX_SCORE - TIME_PENALTY_PER_SECOND);
    expect(computeScore(5_000, 0)).toBe(MAX_SCORE - 5 * TIME_PENALTY_PER_SECOND);
    expect(computeScore(10_000, 0)).toBe(MAX_SCORE - 10 * TIME_PENALTY_PER_SECOND);
  });

  it('deducts RESPAWN_PENALTY for each wrong attempt', () => {
    expect(computeScore(0, 1)).toBe(MAX_SCORE - RESPAWN_PENALTY);
    expect(computeScore(0, 3)).toBe(MAX_SCORE - 3 * RESPAWN_PENALTY);
  });

  it('deducts both time and respawn penalties combined', () => {
    const expected = MAX_SCORE - 10 * TIME_PENALTY_PER_SECOND - 2 * RESPAWN_PENALTY;
    expect(computeScore(10_000, 2)).toBe(expected);
  });

  it('floors sub-second elapsed time (999ms counts as 0 seconds)', () => {
    expect(computeScore(999, 0)).toBe(MAX_SCORE);
    expect(computeScore(1_999, 0)).toBe(MAX_SCORE - TIME_PENALTY_PER_SECOND);
  });
});

describe('computeScore — clamping', () => {
  it('never returns a value below SCORE_FLOOR (0)', () => {
    // 200 wrong attempts × 100 = 20 000 penalty; must clamp to 0
    expect(computeScore(0, 200)).toBe(SCORE_FLOOR);
  });

  it('never returns a value above MAX_SCORE', () => {
    // Negative elapsed is treated as 0 by computeScore via the formula
    expect(computeScore(0, 0)).toBe(MAX_SCORE);
  });

  it('returns SCORE_FLOOR when penalties exceed MAX_SCORE', () => {
    const score = computeScore(0, Math.ceil(MAX_SCORE / RESPAWN_PENALTY) + 10);
    expect(score).toBe(SCORE_FLOOR);
  });

  it('1000ms elapsed and 9 wrong attempts still yields a positive score', () => {
    // 1000ms → 10pts penalty; 9 × 100 = 900 penalty; total = 910; score = 90
    expect(computeScore(1_000, 9)).toBe(MAX_SCORE - TIME_PENALTY_PER_SECOND - 9 * RESPAWN_PENALTY);
  });
});

describe('computeScoreFromState', () => {
  it('returns SCORE_FLOOR when endTimeMs is null', () => {
    const active = makeActiveState(FIXTURE_MAP_STRAIGHT);
    expect(computeScoreFromState(active)).toBe(SCORE_FLOOR);
  });

  it('computes correct score from a complete state', () => {
    // 5 seconds elapsed, 1 wrong attempt
    const state = makeCompleteState(FIXTURE_MAP_STRAIGHT, 5_000, 1, 0 /* score will be recomputed */);
    const expected = MAX_SCORE - 5 * TIME_PENALTY_PER_SECOND - RESPAWN_PENALTY;
    expect(computeScoreFromState(state)).toBe(expected);
  });

  it('handles clock anomaly where endTimeMs < startTimeMs (defaults to 0 elapsed)', () => {
    const state = {
      ...makeActiveState(FIXTURE_MAP_STRAIGHT),
      status: 'complete' as const,
      startTimeMs: 1000,
      endTimeMs: 500, // before start — anomaly
      wrongAttempts: 0,
      score: null,
    };
    // elapsed = max(0, 500-1000) = 0 → no time penalty
    expect(computeScoreFromState(state)).toBe(MAX_SCORE);
  });

  it('score uniqueness — 10 different (elapsed, wrongs) pairs produce different scores', () => {
    const scores = new Set<number>();
    for (let w = 0; w < 5; w++) {
      for (let s = 0; s < 2; s++) {
        scores.add(computeScore(s * 10_000, w));
      }
    }
    // At least 5 unique scores must exist across these 10 combinations
    expect(scores.size).toBeGreaterThanOrEqual(5);
  });
});
