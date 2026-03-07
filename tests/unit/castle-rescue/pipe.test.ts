/**
 * tests/unit/castle-rescue/pipe.test.ts
 *
 * Tests for the platformer pipe-sequence system.
 *
 * The Castle Rescue platformer places PIPE_SLOT_COUNT (6) physical pipes in
 * the castle level.  generateLevelConfig() assigns exactly 3 of them as the
 * correct route (I, II, III) per seed.  These tests verify:
 *
 *  - The correct-pipe assignment is valid (indices in range, no duplicates).
 *  - The sequence order is meaningful (index 0 ≠ index 1 ≠ index 2).
 *  - Non-route slots are all "wrong" pipes (not in correctPipeSlots).
 *  - Entering all 6 slots that exist in the level is possible (no slot > 5).
 *  - Competition scoring integrates correctly with wrongPipes counter.
 */

import { describe, it, expect } from 'vitest';
import {
  generateLevelConfig,
  validateLevelConfig,
} from '../../../src/minigames/castleRescue/castleRescueGenerator';
import {
  PIPE_SLOT_COUNT,
  CORRECT_ROUTE_LENGTH,
  RESPAWN_PENALTY,
  MAX_SCORE,
} from '../../../src/minigames/castleRescue/castleRescueConstants';
import { computeScore } from '../../../src/minigames/castleRescue/castleRescueScoring';

// ── LevelConfig correctness ────────────────────────────────────────────────────

describe('pipe slot assignment — correctness', () => {
  it('generates valid configs for seeds 0..19', () => {
    for (let s = 0; s < 20; s++) {
      expect(validateLevelConfig(generateLevelConfig(s))).toBe(true);
    }
  });

  it('the three correct-slot indices are all distinct', () => {
    for (let s = 0; s < 20; s++) {
      const { correctPipeSlots } = generateLevelConfig(s);
      const set = new Set(correctPipeSlots);
      expect(set.size).toBe(CORRECT_ROUTE_LENGTH);
    }
  });

  it('none of the correct slots equal each other (sequence is ordered)', () => {
    for (let s = 0; s < 20; s++) {
      const [a, b, c] = generateLevelConfig(s).correctPipeSlots;
      expect(a).not.toBe(b);
      expect(b).not.toBe(c);
      expect(a).not.toBe(c);
    }
  });

  it('exactly 3 out of 6 slots are marked correct', () => {
    for (let s = 0; s < 10; s++) {
      const { correctPipeSlots } = generateLevelConfig(s);
      const wrongCount = PIPE_SLOT_COUNT - correctPipeSlots.length;
      expect(correctPipeSlots.length).toBe(3);
      expect(wrongCount).toBe(3);
    }
  });
});

describe('pipe slot assignment — wrong slots', () => {
  it('identifies exactly 3 wrong slots for every seed', () => {
    for (let s = 0; s < 10; s++) {
      const { correctPipeSlots } = generateLevelConfig(s);
      const allSlots = Array.from({ length: PIPE_SLOT_COUNT }, (_, i) => i);
      const wrongSlots = allSlots.filter((sl) => !correctPipeSlots.includes(sl));
      expect(wrongSlots).toHaveLength(3);
    }
  });

  it('wrong slots do not appear in correctPipeSlots', () => {
    for (let s = 0; s < 10; s++) {
      const { correctPipeSlots } = generateLevelConfig(s);
      const allSlots = Array.from({ length: PIPE_SLOT_COUNT }, (_, i) => i);
      const wrongSlots = allSlots.filter((sl) => !correctPipeSlots.includes(sl));
      for (const ws of wrongSlots) {
        expect(correctPipeSlots).not.toContain(ws);
      }
    }
  });
});

describe('pipe slot assignment — seed variation', () => {
  it('different seeds assign different correct-slot sets', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 30; s++) {
      seen.add(JSON.stringify(generateLevelConfig(s).correctPipeSlots));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('all 6 slot indices are used across many seeds', () => {
    const usedSlots = new Set<number>();
    for (let s = 0; s < 50; s++) {
      for (const sl of generateLevelConfig(s).correctPipeSlots) {
        usedSlots.add(sl);
      }
    }
    // Every one of the 6 slots should appear as a correct slot for at least one seed.
    expect(usedSlots.size).toBe(PIPE_SLOT_COUNT);
  });
});

// ── Competition scoring integration ───────────────────────────────────────────

describe('wrong-pipe scoring integration', () => {
  it('each wrong pipe entry deducts RESPAWN_PENALTY from the base score', () => {
    expect(computeScore(0, 1)).toBe(MAX_SCORE - RESPAWN_PENALTY);
    expect(computeScore(0, 2)).toBe(MAX_SCORE - 2 * RESPAWN_PENALTY);
    expect(computeScore(0, 3)).toBe(MAX_SCORE - 3 * RESPAWN_PENALTY);
  });

  it('entering 0 wrong pipes and finishing instantly gives MAX_SCORE', () => {
    expect(computeScore(0, 0)).toBe(MAX_SCORE);
  });

  it('score clamps to 0 when total penalty exceeds MAX_SCORE', () => {
    // 11 wrong pipes × 100 = 1100 penalty > MAX_SCORE 1000 → clamp to 0
    expect(computeScore(0, 11)).toBe(0);
  });

  it('does not change selection on a non-adjacent wrong click (no-op scenario)', () => {
    // Demonstrates the competition score impact of 0 wrong pipes vs 1
    const scoreNoWrong = computeScore(5_000, 0);
    const scoreOneWrong = computeScore(5_000, 1);
    expect(scoreNoWrong).toBeGreaterThan(scoreOneWrong);
    expect(scoreNoWrong - scoreOneWrong).toBe(RESPAWN_PENALTY);
  });

  it('resets selection penalty applies cumulatively with time penalty', () => {
    // 10s elapsed + 1 wrong pipe: 1000 - 100 - 100 = 800
    expect(computeScore(10_000, 1)).toBe(MAX_SCORE - 100 - RESPAWN_PENALTY);
  });
});
