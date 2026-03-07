/**
 * tests/unit/castle-rescue/ranking.test.ts
 *
 * Tests for rankCastleRescueResults:
 *  - Higher score ranks first.
 *  - On score tie: fewer wrongAttempts wins.
 *  - On score + wrongAttempts tie: lower elapsedMs wins.
 *  - On full tie: alphabetical playerId order is stable.
 *  - Returns [] for empty input.
 *  - Single-player input returns placement 1.
 *  - Placements are 1-indexed and sequential.
 *  - Input array is not mutated.
 */

import { describe, it, expect } from 'vitest';
import { rankCastleRescueResults } from '../../../src/minigames/castleRescue/castleRescueRanking';
import type { CastleRescueResult } from '../../../src/minigames/castleRescue/castleRescueTypes';

function makeResult(
  playerId: string,
  score: number,
  wrongAttempts = 0,
  elapsedMs = 0,
): CastleRescueResult {
  return { playerId, score, wrongAttempts, elapsedMs };
}

describe('rankCastleRescueResults — empty / single', () => {
  it('returns empty array for empty input', () => {
    expect(rankCastleRescueResults([])).toEqual([]);
  });

  it('returns placement 1 for a single player', () => {
    const result = rankCastleRescueResults([makeResult('alice', 500)]);
    expect(result).toHaveLength(1);
    expect(result[0].placement).toBe(1);
    expect(result[0].playerId).toBe('alice');
  });
});

describe('rankCastleRescueResults — primary sort by score', () => {
  it('higher score ranks first', () => {
    const ranked = rankCastleRescueResults([
      makeResult('low', 200),
      makeResult('high', 900),
      makeResult('mid', 500),
    ]);
    expect(ranked[0].playerId).toBe('high');
    expect(ranked[1].playerId).toBe('mid');
    expect(ranked[2].playerId).toBe('low');
  });

  it('placements are 1-indexed and sequential', () => {
    const ranked = rankCastleRescueResults([
      makeResult('a', 100),
      makeResult('b', 200),
      makeResult('c', 300),
    ]);
    expect(ranked.map((r) => r.placement)).toEqual([1, 2, 3]);
  });
});

describe('rankCastleRescueResults — tie-break: wrongAttempts', () => {
  it('on score tie, fewer wrong attempts ranks higher', () => {
    const ranked = rankCastleRescueResults([
      makeResult('more_wrong', 500, 3),
      makeResult('fewer_wrong', 500, 1),
    ]);
    expect(ranked[0].playerId).toBe('fewer_wrong');
    expect(ranked[1].playerId).toBe('more_wrong');
  });
});

describe('rankCastleRescueResults — tie-break: elapsedMs', () => {
  it('on score + wrongAttempts tie, lower elapsedMs ranks higher', () => {
    const ranked = rankCastleRescueResults([
      makeResult('slow', 500, 0, 30_000),
      makeResult('fast', 500, 0, 10_000),
    ]);
    expect(ranked[0].playerId).toBe('fast');
    expect(ranked[1].playerId).toBe('slow');
  });
});

describe('rankCastleRescueResults — tie-break: playerId (alphabetical)', () => {
  it('on full tie, alphabetical playerId wins', () => {
    const ranked = rankCastleRescueResults([
      makeResult('charlie', 500, 0, 5_000),
      makeResult('alice', 500, 0, 5_000),
      makeResult('bob', 500, 0, 5_000),
    ]);
    expect(ranked[0].playerId).toBe('alice');
    expect(ranked[1].playerId).toBe('bob');
    expect(ranked[2].playerId).toBe('charlie');
  });
});

describe('rankCastleRescueResults — immutability', () => {
  it('does not mutate the input array', () => {
    const input: CastleRescueResult[] = [
      makeResult('z', 100),
      makeResult('a', 900),
    ];
    const original = [...input];
    rankCastleRescueResults(input);
    expect(input[0].playerId).toBe(original[0].playerId);
    expect(input[1].playerId).toBe(original[1].playerId);
  });
});

describe('rankCastleRescueResults — multi-player scenario', () => {
  it('ranks 4 players correctly with mixed tie-breaks', () => {
    const ranked = rankCastleRescueResults([
      makeResult('p1', 800, 2, 20_000),
      makeResult('p2', 800, 1, 20_000), // same score as p1, fewer wrongs → 1st
      makeResult('p3', 600, 0, 5_000),
      makeResult('p4', 600, 0, 10_000), // same score/wrongs as p3, slower → 4th
    ]);
    expect(ranked[0].playerId).toBe('p2');
    expect(ranked[1].playerId).toBe('p1');
    expect(ranked[2].playerId).toBe('p3');
    expect(ranked[3].playerId).toBe('p4');
    expect(ranked.map((r) => r.placement)).toEqual([1, 2, 3, 4]);
  });
});
