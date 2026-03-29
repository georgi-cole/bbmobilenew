/**
 * Snake AI Simulator — unit tests.
 *
 * Verifies that:
 *  1. simulateSnakeAiRun returns a non-negative integer.
 *  2. Results are deterministic (same seed → same output).
 *  3. Different seeds produce different results.
 *  4. Higher skill produces equal-or-better food count on average.
 *  5. The AI terminates (does not run forever).
 *  6. normaliseSnakeScore maps food counts to the 0–1000 range.
 *  7. simulateSnakeAiScore returns a value in [0, 1000].
 *  8. Different player IDs produce different scores from the same session seed.
 *  9. The AI occasionally achieves a non-zero score (is not always trivially bad).
 * 10. Scores stay below the theoretical max for low-skill AI.
 */

import { describe, it, expect } from 'vitest';
import {
  simulateSnakeAiRun,
  simulateSnakeAiScore,
  normaliseSnakeScore,
} from '../src/ai/competition/snakeAiSimulator';

// ── 1. Basic correctness ───────────────────────────────────────────────────────

describe('simulateSnakeAiRun — basic correctness', () => {
  it('returns a non-negative integer', () => {
    const result = simulateSnakeAiRun(42, 0.5);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('is deterministic: same seed + skill → same output', () => {
    const a = simulateSnakeAiRun(12345, 0.5);
    const b = simulateSnakeAiRun(12345, 0.5);
    expect(a).toBe(b);
  });

  it('different seeds produce different results', () => {
    const a = simulateSnakeAiRun(1, 0.5);
    const b = simulateSnakeAiRun(2, 0.5);
    const c = simulateSnakeAiRun(3, 0.5);
    // At least two of the three runs should differ
    const unique = new Set([a, b, c]);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('terminates quickly (does not run forever)', () => {
    const start = Date.now();
    simulateSnakeAiRun(99999, 0.8);
    const elapsed = Date.now() - start;
    // Should complete well under 500 ms in any JS environment
    expect(elapsed).toBeLessThan(500);
  });

  it('AI never eats more food than the board can hold', () => {
    // 20×20 grid minus the starting snake segment (1) = 399 max food items
    const maxPossible = 20 * 20 - 1;
    for (const seed of [1, 42, 9999, 31337]) {
      const food = simulateSnakeAiRun(seed, 1.0);
      expect(food).toBeLessThanOrEqual(maxPossible);
    }
  });
});

// ── 2. Skill influence ────────────────────────────────────────────────────────

describe('simulateSnakeAiRun — skill influence', () => {
  it('high skill AI scores ≥ low skill AI on average across many seeds', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    const lowAvg =
      seeds.reduce((sum, s) => sum + simulateSnakeAiRun(s, 0.1), 0) / seeds.length;
    const highAvg =
      seeds.reduce((sum, s) => sum + simulateSnakeAiRun(s, 0.9), 0) / seeds.length;
    expect(highAvg).toBeGreaterThanOrEqual(lowAvg);
  });

  it('low-skill AI is not always zero (can eat at least one food)', () => {
    const results = Array.from({ length: 20 }, (_, i) =>
      simulateSnakeAiRun(i + 100, 0.1),
    );
    const nonZero = results.filter((r) => r > 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });
});

// ── 3. normaliseSnakeScore ────────────────────────────────────────────────────

describe('normaliseSnakeScore', () => {
  it('maps 0 food to score 0', () => {
    expect(normaliseSnakeScore(0)).toBe(0);
  });

  it('maps 5 food to score 500', () => {
    expect(normaliseSnakeScore(5)).toBe(500);
  });

  it('maps 10 food to score 1000 (cap)', () => {
    expect(normaliseSnakeScore(10)).toBe(1000);
  });

  it('caps at 1000 for food > 10', () => {
    expect(normaliseSnakeScore(15)).toBe(1000);
    expect(normaliseSnakeScore(100)).toBe(1000);
  });

  it('stays within [0, 1000] for any input', () => {
    for (const f of [0, 1, 3, 5, 9, 10, 50]) {
      const s = normaliseSnakeScore(f);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1000);
    }
  });
});

// ── 4. simulateSnakeAiScore ───────────────────────────────────────────────────

describe('simulateSnakeAiScore', () => {
  it('returns a value in [0, 1000]', () => {
    const score = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'p1' });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1000);
  });

  it('is deterministic: same inputs → same output', () => {
    const a = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'alice' });
    const b = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'alice' });
    expect(a).toBe(b);
  });

  it('different player IDs produce different scores (same session seed)', () => {
    // Use enough player IDs that at least two should differ
    const scores = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id) =>
      simulateSnakeAiScore({ sessionSeed: 100, playerId: id }),
    );
    const unique = new Set(scores);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('different session seeds produce different scores for the same player', () => {
    const scores = [10, 20, 30].map((seed) =>
      simulateSnakeAiScore({ sessionSeed: seed, playerId: 'player_a' }),
    );
    const unique = new Set(scores);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('accepts an optional competition profile and produces a valid score', () => {
    const profile = {
      overall: 80,
      physical: 70,
      mental: 60,
      precision: 90,
      nerve: 80,
      consistency: 75,
      clutch: 70,
      chokeRisk: 30,
      luck: 50,
    };
    const score = simulateSnakeAiScore({ sessionSeed: 99, playerId: 'skilled', profile });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1000);
  });

  it('a high-skill AI tends to score above a low-skill AI on average', () => {
    const highProfile = {
      overall: 90, physical: 90, mental: 85, precision: 95,
      nerve: 90, consistency: 90, clutch: 85, chokeRisk: 10, luck: 50,
    };
    const lowProfile = {
      overall: 20, physical: 20, mental: 20, precision: 15,
      nerve: 20, consistency: 20, clutch: 20, chokeRisk: 80, luck: 50,
    };
    const seeds = Array.from({ length: 20 }, (_, i) => i + 500);
    const highAvg =
      seeds.reduce((s, seed) =>
        s + simulateSnakeAiScore({ sessionSeed: seed, playerId: 'x', profile: highProfile }), 0)
      / seeds.length;
    const lowAvg =
      seeds.reduce((s, seed) =>
        s + simulateSnakeAiScore({ sessionSeed: seed, playerId: 'x', profile: lowProfile }), 0)
      / seeds.length;
    expect(highAvg).toBeGreaterThanOrEqual(lowAvg);
  });
});

// ── 5. Human-like imperfection ────────────────────────────────────────────────

describe('simulateSnakeAiRun — human-like imperfection', () => {
  it('AI does not always achieve the maximum score (not a perfect player)', () => {
    const maxScore = 10; // normaliseScore cap: 10 food = 1000 pts
    const results = Array.from({ length: 30 }, (_, i) => simulateSnakeAiRun(i, 0.8));
    const perfect = results.filter((r) => r >= maxScore);
    // Perfect runs should be rare or absent for a realistic AI
    expect(perfect.length).toBeLessThan(results.length);
  });

  it('scores have meaningful variance (AI is not always the same)', () => {
    const results = Array.from({ length: 30 }, (_, i) => simulateSnakeAiRun(i * 7 + 1, 0.5));
    const min = Math.min(...results);
    const max = Math.max(...results);
    // There should be spread in outcomes
    expect(max - min).toBeGreaterThan(0);
  });
});
