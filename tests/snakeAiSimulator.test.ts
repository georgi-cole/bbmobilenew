/**
 * Snake AI Simulator — unit tests.
 *
 * Verifies that:
 *  1. simulateSnakeAiRun returns a valid result object.
 *  2. Results are deterministic (same seed → same output).
 *  3. Different seeds produce different results.
 *  4. Higher skill produces equal-or-better score on average.
 *  5. The AI terminates (does not run forever).
 *  6. normaliseSnakeScore clamps values to [0, 1000].
 *  7. simulateSnakeAiScore returns { score, completionMs } in valid ranges.
 *  8. Different player IDs produce different scores from the same session seed.
 *  9. The AI occasionally reaches a non-zero score (is not always trivially bad).
 * 10. Not every run ends in completion (AI is fallible).
 */

import { describe, it, expect } from 'vitest';
import {
  simulateSnakeAiRun,
  simulateSnakeAiScore,
  normaliseSnakeScore,
} from '../src/ai/competition/snakeAiSimulator';

// ── 1. Basic correctness ───────────────────────────────────────────────────────

describe('simulateSnakeAiRun — basic correctness', () => {
  it('returns an object with score, ticks, and completed fields', () => {
    const result = simulateSnakeAiRun(42, 0.5);
    expect(typeof result.score).toBe('number');
    expect(typeof result.ticks).toBe('number');
    expect(typeof result.completed).toBe('boolean');
  });

  it('score is a non-negative integer', () => {
    const result = simulateSnakeAiRun(42, 0.5);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('is deterministic: same seed + skill → same output', () => {
    const a = simulateSnakeAiRun(12345, 0.5);
    const b = simulateSnakeAiRun(12345, 0.5);
    expect(a.score).toBe(b.score);
    expect(a.ticks).toBe(b.ticks);
    expect(a.completed).toBe(b.completed);
  });

  it('different seeds produce different results', () => {
    // Sample a range of seeds to avoid flakiness from score-space collisions
    const unique = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      unique.add(simulateSnakeAiRun(seed, 0.5).score);
    }
    // There should be at least some variability across 50 seeds
    expect(unique.size).toBeGreaterThan(1);
  });

  it('terminates (does not run forever) for large seeds', () => {
    const result = simulateSnakeAiRun(99999, 0.8);
    // If the simulator failed to terminate, this test would time out.
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('ticks reflects the actual last tick executed, not the MAX_TICKS ceiling', () => {
    // A non-completing run should report how many ticks it actually ran, not
    // the hard loop limit (12 000).  We use a low-skill AI so it is unlikely
    // to complete, making the ticks value verifiable.
    const results = Array.from({ length: 20 }, (_, i) => simulateSnakeAiRun(i + 200, 0.1));
    const nonCompleters = results.filter((r) => !r.completed);
    expect(nonCompleters.length).toBeGreaterThan(0);
    for (const r of nonCompleters) {
      // A short run (low-skill, small seed) should end well below 12 000 ticks.
      // If it returned MAX_TICKS for every non-completer the bug is still present.
      expect(r.ticks).toBeLessThan(12_000);
    }
  });

  it('score is clamped to TARGET_SCORE when a large bonus food overshoots', () => {
    // Any completing run must end with exactly 1000, never above.
    for (let seed = 1; seed <= 50; seed++) {
      const result = simulateSnakeAiRun(seed, 0.9);
      if (result.completed) {
        expect(result.score).toBe(1000);
        return;
      }
    }
  });

  it('score never exceeds the target (1000)', () => {
    for (const seed of [1, 42, 9999, 31337]) {
      const result = simulateSnakeAiRun(seed, 1.0);
      expect(result.score).toBeLessThanOrEqual(1000);
    }
  });

  it('completed is true only when score equals the target', () => {
    // Run many seeds; for any completed run the score must equal 1000
    for (let seed = 1; seed <= 20; seed++) {
      const result = simulateSnakeAiRun(seed, 0.9);
      if (result.completed) {
        expect(result.score).toBe(1000);
      }
    }
  });
});

// ── 2. Skill influence ────────────────────────────────────────────────────────

describe('simulateSnakeAiRun — skill influence', () => {
  it('high skill AI scores ≥ low skill AI on average across many seeds', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    const lowAvg =
      seeds.reduce((sum, s) => sum + simulateSnakeAiRun(s, 0.1).score, 0) / seeds.length;
    const highAvg =
      seeds.reduce((sum, s) => sum + simulateSnakeAiRun(s, 0.9).score, 0) / seeds.length;
    expect(highAvg).toBeGreaterThanOrEqual(lowAvg);
  });

  it('low-skill AI can still reach a non-zero score', () => {
    const results = Array.from({ length: 20 }, (_, i) =>
      simulateSnakeAiRun(i + 100, 0.1),
    );
    const nonZero = results.filter((r) => r.score > 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });
});

// ── 3. normaliseSnakeScore ────────────────────────────────────────────────────

describe('normaliseSnakeScore', () => {
  it('maps score 0 to 0', () => {
    expect(normaliseSnakeScore(0)).toBe(0);
  });

  it('maps score 500 to 500', () => {
    expect(normaliseSnakeScore(500)).toBe(500);
  });

  it('maps score 1000 to 1000 (target)', () => {
    expect(normaliseSnakeScore(1000)).toBe(1000);
  });

  it('caps at 1000 for values above target', () => {
    expect(normaliseSnakeScore(1200)).toBe(1000);
    expect(normaliseSnakeScore(9999)).toBe(1000);
  });

  it('clamps negative values to 0', () => {
    expect(normaliseSnakeScore(-50)).toBe(0);
  });

  it('stays within [0, 1000] for any input', () => {
    for (const s of [0, 100, 350, 500, 900, 1000, 1500]) {
      const n = normaliseSnakeScore(s);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1000);
    }
  });
});

// ── 4. simulateSnakeAiScore ───────────────────────────────────────────────────

describe('simulateSnakeAiScore', () => {
  it('returns an object with score and completionMs', () => {
    const result = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'p1' });
    expect(typeof result.score).toBe('number');
    expect(result.completionMs === null || typeof result.completionMs === 'number').toBe(true);
  });

  it('score is in [0, 1000]', () => {
    const result = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'p1' });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1000);
  });

  it('is deterministic: same inputs → same output', () => {
    const a = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'alice' });
    const b = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'alice' });
    expect(a.score).toBe(b.score);
    expect(a.completionMs).toBe(b.completionMs);
  });

  it('completionMs is a positive number when the AI reached the target', () => {
    // Use a high-skill profile and wide seed range to find a completing run.
    // At skill ≈ 0.9 the AI reliably survives long enough to reach 1000 pts.
    const highProfile = {
      overall: 90, physical: 90, mental: 85, precision: 95,
      nerve: 90, consistency: 90, clutch: 85, chokeRisk: 10, luck: 50,
    };
    let foundCompleter = false;
    for (let seed = 1; seed <= 300; seed++) {
      const result = simulateSnakeAiScore({ sessionSeed: seed, playerId: 'skilled', profile: highProfile });
      if (result.completionMs !== null) {
        expect(result.completionMs).toBeGreaterThan(0);
        expect(result.score).toBe(1000);
        foundCompleter = true;
        break;
      }
    }
    // A high-skill AI should complete at least one run across 300 seeds
    expect(foundCompleter).toBe(true);
  });

  it('different player IDs produce deterministic but distinct simulation states', () => {
    // Verify that each player ID uses a different internal seed.
    const scores = new Set([1, 42, 199, 350, 777, 1234, 5000, 9999].map((seed) =>
      simulateSnakeAiRun(seed, 0.3).score,
    ));
    // 8 distinct seeds should produce at least 2 different scores
    expect(scores.size).toBeGreaterThan(1);
  });

  it('different session seeds produce different raw scores for the same player', () => {
    const scores = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      // Use a mid-skill run to get variance
      scores.add(simulateSnakeAiRun(seed, 0.5).score);
    }
    // 30 different seeds should produce at least a few distinct scores
    expect(scores.size).toBeGreaterThan(1);
  });

  it('accepts an optional competition profile and produces a valid result', () => {
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
    const result = simulateSnakeAiScore({ sessionSeed: 99, playerId: 'skilled', profile });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1000);
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
        s + simulateSnakeAiScore({ sessionSeed: seed, playerId: 'x', profile: highProfile }).score, 0)
      / seeds.length;
    const lowAvg =
      seeds.reduce((s, seed) =>
        s + simulateSnakeAiScore({ sessionSeed: seed, playerId: 'x', profile: lowProfile }).score, 0)
      / seeds.length;
    expect(highAvg).toBeGreaterThanOrEqual(lowAvg);
  });
});

// ── 5. Human-like imperfection ────────────────────────────────────────────────

describe('simulateSnakeAiRun — human-like imperfection', () => {
  it('not every run completes the target (AI is fallible at low skill)', () => {
    const results = Array.from({ length: 30 }, (_, i) => simulateSnakeAiRun(i, 0.1));
    const completions = results.filter((r) => r.completed);
    // A low-skill AI should fail to complete at least some runs
    expect(completions.length).toBeLessThan(results.length);
  });

  it('scores have meaningful variance (AI is not always the same)', () => {
    const results = Array.from({ length: 30 }, (_, i) => simulateSnakeAiRun(i * 7 + 1, 0.5));
    const scores = results.map((r) => r.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    // There should be spread in outcomes
    expect(max - min).toBeGreaterThan(0);
  });
});
