/**
 * Tests for CWGO helper functions.
 */
import { describe, it, expect } from 'vitest';
import {
  generateAIGuess,
  computeWinnerClosestWithoutGoingOver,
  computeMassElimination,
  computeSortedResultsForReveal,
} from '../src/features/cwgo/cwgoHelpers';

// ─── generateAIGuess ──────────────────────────────────────────────────────────

describe('generateAIGuess', () => {
  it('returns a non-negative number', () => {
    const guess = generateAIGuess(100, 0.5, 42);
    expect(guess).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic for same inputs', () => {
    const a = generateAIGuess(7200, 0.7, 1234);
    const b = generateAIGuess(7200, 0.7, 1234);
    expect(a).toBe(b);
  });

  it('produces different results for different seeds', () => {
    const a = generateAIGuess(100, 0.5, 1);
    const b = generateAIGuess(100, 0.5, 2);
    // Very unlikely to be equal with different seeds
    expect(a === b).toBeFalsy();
  });

  it('high skill tends to produce guesses closer to (or at) the answer', () => {
    // Run many samples and check that high skill guesses are closer on average
    const answer = 1000;
    let highSkillDiff = 0;
    let lowSkillDiff = 0;
    const trials = 30;
    for (let i = 0; i < trials; i++) {
      const highGuess = generateAIGuess(answer, 1.0, i * 137 + 7);
      const lowGuess = generateAIGuess(answer, 0.0, i * 137 + 7);
      highSkillDiff += Math.abs(answer - highGuess);
      lowSkillDiff += Math.abs(answer - lowGuess);
    }
    // High skill should on average be closer
    expect(highSkillDiff).toBeLessThan(lowSkillDiff * 1.5);
  });
});

// ─── computeWinnerClosestWithoutGoingOver ─────────────────────────────────────

describe('computeWinnerClosestWithoutGoingOver', () => {
  it('returns null for empty entries', () => {
    expect(computeWinnerClosestWithoutGoingOver([], 100)).toBeNull();
  });

  it('picks the closest without going over', () => {
    const guesses = [
      { playerId: 'a', guess: 95 },
      { playerId: 'b', guess: 99 },
      { playerId: 'c', guess: 101 }, // over
    ];
    expect(computeWinnerClosestWithoutGoingOver(guesses, 100)).toBe('b');
  });

  it('ignores guesses that go over when a valid guess exists', () => {
    const guesses = [
      { playerId: 'a', guess: 50 },
      { playerId: 'b', guess: 110 }, // over
    ];
    expect(computeWinnerClosestWithoutGoingOver(guesses, 100)).toBe('a');
  });

  it('exact match wins', () => {
    const guesses = [
      { playerId: 'a', guess: 99 },
      { playerId: 'b', guess: 100 }, // exact
      { playerId: 'c', guess: 50 },
    ];
    expect(computeWinnerClosestWithoutGoingOver(guesses, 100)).toBe('b');
  });

  it('when all go over, the least-over (lowest guess) wins', () => {
    const guesses = [
      { playerId: 'a', guess: 110 },
      { playerId: 'b', guess: 105 }, // least over
      { playerId: 'c', guess: 120 },
    ];
    expect(computeWinnerClosestWithoutGoingOver(guesses, 100)).toBe('b');
  });

  it('tie is broken by first entry', () => {
    const guesses = [
      { playerId: 'a', guess: 80 },
      { playerId: 'b', guess: 80 },
    ];
    // Both equal — first entry should win
    expect(computeWinnerClosestWithoutGoingOver(guesses, 100)).toBe('a');
  });
});

// ─── computeMassElimination ───────────────────────────────────────────────────

describe('computeMassElimination', () => {
  it('eliminates players who go over when others do not', () => {
    const guesses = [
      { playerId: 'a', guess: 80 },
      { playerId: 'b', guess: 105 }, // over
      { playerId: 'c', guess: 90 },
    ];
    const { eliminated, surviving } = computeMassElimination(guesses, 100, ['a', 'b', 'c']);
    expect(eliminated).toContain('b');
    expect(surviving).not.toContain('b');
    expect(surviving).toContain('a');
    expect(surviving).toContain('c');
  });

  it('when all go over, keeps only the least-over player', () => {
    const guesses = [
      { playerId: 'a', guess: 110 },
      { playerId: 'b', guess: 105 }, // least over
      { playerId: 'c', guess: 115 },
    ];
    const { eliminated, surviving } = computeMassElimination(guesses, 100, ['a', 'b', 'c']);
    expect(surviving).toEqual(['b']);
    expect(eliminated).toContain('a');
    expect(eliminated).toContain('c');
  });

  it('when no one goes over, eliminates bottom half', () => {
    const guesses = [
      { playerId: 'a', guess: 60 }, // lowest → eliminated
      { playerId: 'b', guess: 80 },
      { playerId: 'c', guess: 90 },
      { playerId: 'd', guess: 70 }, // second-lowest → eliminated
    ];
    const { eliminated } = computeMassElimination(guesses, 100, ['a', 'b', 'c', 'd']);
    // Bottom 2 of 4 should be eliminated
    expect(eliminated).toHaveLength(2);
    expect(eliminated).toContain('a');
    expect(eliminated).toContain('d');
  });

  it('returns empty arrays for empty input', () => {
    const result = computeMassElimination([], 100, []);
    expect(result.eliminated).toHaveLength(0);
    expect(result.surviving).toHaveLength(0);
  });
});

// ─── computeSortedResultsForReveal ────────────────────────────────────────────

describe('computeSortedResultsForReveal', () => {
  it('winner appears first', () => {
    const guesses = [
      { playerId: 'a', guess: 70 },
      { playerId: 'b', guess: 99 }, // winner
      { playerId: 'c', guess: 50 },
    ];
    const results = computeSortedResultsForReveal(guesses, 100);
    expect(results[0].playerId).toBe('b');
    expect(results[0].isWinner).toBe(true);
  });

  it('over-guessers appear after valid guessers', () => {
    const guesses = [
      { playerId: 'a', guess: 110 }, // over
      { playerId: 'b', guess: 80 },  // valid winner
    ];
    const results = computeSortedResultsForReveal(guesses, 100);
    expect(results[0].wentOver).toBe(false);
    expect(results[1].wentOver).toBe(true);
  });

  it('marks wentOver correctly', () => {
    const guesses = [
      { playerId: 'a', guess: 100 },
      { playerId: 'b', guess: 101 },
    ];
    const results = computeSortedResultsForReveal(guesses, 100);
    const aResult = results.find((r) => r.playerId === 'a')!;
    const bResult = results.find((r) => r.playerId === 'b')!;
    expect(aResult.wentOver).toBe(false);
    expect(bResult.wentOver).toBe(true);
  });

  it('diff is correct (answer - guess)', () => {
    const guesses = [{ playerId: 'a', guess: 95 }];
    const results = computeSortedResultsForReveal(guesses, 100);
    expect(results[0].diff).toBe(5);
  });

  it('diff is negative when gone over', () => {
    const guesses = [{ playerId: 'a', guess: 105 }];
    const results = computeSortedResultsForReveal(guesses, 100);
    expect(results[0].diff).toBe(-5);
    expect(results[0].wentOver).toBe(true);
  });
});
