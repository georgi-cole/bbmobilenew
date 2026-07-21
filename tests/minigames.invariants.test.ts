import { describe, expect, it } from 'vitest';

import { computeScore, computeScores, normalizeForRanking } from '../src/minigames/scoring';
import { getPoolByFilter, pickRandomGame } from '../src/minigames/registry';

describe('minigame invariants', () => {
  it('keeps scoring adapters finite across representative inputs', () => {
    const cases = [
      ['raw', -10, { minRaw: 0, maxRaw: 100 }],
      ['raw', 145, { minRaw: 0 }],
      ['rankPoints', 2, { rankScores: [500, 250, 100] }],
      ['timeToPoints', 800, { targetMs: 500, maxMs: 2000 }],
      ['lowerBetter', 2400, { targetMs: 500, maxMs: 5000 }],
      ['binary', 0, { threshold: 1 }],
      ['binary', 3, { threshold: 1 }],
      ['authoritative', 1337, {}],
    ] as const;

    for (const [adapter, rawValue, options] of cases) {
      const result = computeScore(adapter, rawValue, options);
      expect(Number.isFinite(result.score), `${adapter} score should be finite`).toBe(true);
      expect(Number.isFinite(result.points), `${adapter} points should be finite`).toBe(true);
      expect(result.score, `${adapter} score should never be negative`).toBeGreaterThanOrEqual(0);
      expect(result.points, `${adapter} points should never be negative`).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps authoritative winners ahead of equal-scoring ties', () => {
    const ranked = computeScores('raw', [
      { playerId: 'human', rawValue: 50, tiebreaker: 400 },
      { playerId: 'authority', rawValue: 50, authoritativeWinner: true, tiebreaker: 999 },
      { playerId: 'fast-tie', rawValue: 50, tiebreaker: 10 },
    ]);

    expect(ranked.map((entry) => entry.playerId)).toEqual(['authority', 'fast-tie', 'human']);
  });

  it('normalizes rankings without NaN or missing scores', () => {
    const ranking = normalizeForRanking(
      [
        { playerId: 'a', rawValue: 7 },
        { playerId: 'b', rawValue: 14, tiebreaker: 123 },
        { playerId: 'c', rawValue: 14, tiebreaker: 9 },
      ],
      { adapter: 'raw' },
    );

    expect(Object.keys(ranking)).toEqual(['c', 'b', 'a']);
    expect(Object.values(ranking).every((value) => Number.isFinite(value))).toBe(true);
  });

  it('keeps seeded game selection inside the active pool across many seeds', () => {
    const activeGames = getPoolByFilter({ retired: false });
    const activeKeys = new Set(activeGames.map((game) => game.key));

    for (let seed = 1; seed <= 200; seed += 1) {
      const selected = pickRandomGame(seed);
      expect(selected.retired, `seed ${seed} should never pick a retired game`).toBe(false);
      expect(activeKeys.has(selected.key), `seed ${seed} should stay in the active pool`).toBe(true);
    }
  });

  it('respects category filters and exclusions', () => {
    const logicPool = getPoolByFilter({ retired: false, category: 'logic' });
    expect(logicPool.length).toBeGreaterThan(0);
    expect(logicPool.every((game) => game.category === 'logic')).toBe(true);

    const first = logicPool[0];
    expect(first).toBeTruthy();
    if (!first) return;

    const excluded = getPoolByFilter({ retired: false, category: 'logic', excludeKeys: [first.key] });
    expect(excluded.some((game) => game.key === first.key)).toBe(false);
  });
});
