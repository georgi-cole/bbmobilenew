/**
 * tests/unit/castle-rescue/generator.test.ts
 *
 * Tests for castleRescueGenerator:
 *  - generateMapForSeed produces a map that passes validateGeneratedMap.
 *  - Same seed always produces the same map (determinism).
 *  - Different seeds can produce different maps.
 *  - Pipe count is within [MIN_TOTAL_PIPES, MAX_TOTAL_PIPES].
 *  - correctRoute length is exactly CORRECT_ROUTE_LENGTH.
 *  - No duplicate pipe IDs or grid positions.
 *  - Source and sink are in bounds and not occupied by pipes.
 *  - Every consecutive pair in the full path (source → pipes → sink) is adjacent.
 *  - Generator works for 20 different seeds without throwing.
 */

import { describe, it, expect } from 'vitest';
import {
  generateMapForSeed,
  validateGeneratedMap,
} from '../../../src/minigames/castleRescue/castleRescueGenerator';
import {
  MIN_TOTAL_PIPES,
  MAX_TOTAL_PIPES,
  CORRECT_ROUTE_LENGTH,
  GRID_ROWS,
  GRID_COLS,
} from '../../../src/minigames/castleRescue/castleRescueConstants';
import { areAdjacent, inBounds } from '../../../src/minigames/castleRescue/castleRescueUtils';

describe('generateMapForSeed — structural validity', () => {
  it('passes validateGeneratedMap for seed 0', () => {
    const map = generateMapForSeed(0);
    expect(validateGeneratedMap(map)).toBe(true);
  });

  it('passes validateGeneratedMap for seed 42', () => {
    const map = generateMapForSeed(42);
    expect(validateGeneratedMap(map)).toBe(true);
  });

  it('passes validateGeneratedMap for seed 999_999', () => {
    const map = generateMapForSeed(999_999);
    expect(validateGeneratedMap(map)).toBe(true);
  });

  it('correctRoute length equals CORRECT_ROUTE_LENGTH (3)', () => {
    const map = generateMapForSeed(7);
    expect(map.correctRoute).toHaveLength(CORRECT_ROUTE_LENGTH);
  });

  it('total pipe count is within [MIN_TOTAL_PIPES, MAX_TOTAL_PIPES]', () => {
    const map = generateMapForSeed(123);
    expect(map.pipes.length).toBeGreaterThanOrEqual(MIN_TOTAL_PIPES);
    expect(map.pipes.length).toBeLessThanOrEqual(MAX_TOTAL_PIPES);
  });

  it('grid dimensions match constants', () => {
    const map = generateMapForSeed(1);
    expect(map.gridRows).toBe(GRID_ROWS);
    expect(map.gridCols).toBe(GRID_COLS);
  });
});

describe('generateMapForSeed — position validity', () => {
  it('source is in bounds', () => {
    const map = generateMapForSeed(5);
    expect(inBounds(map.source)).toBe(true);
  });

  it('sink is in bounds', () => {
    const map = generateMapForSeed(5);
    expect(inBounds(map.sink)).toBe(true);
  });

  it('all pipe cells are in bounds', () => {
    const map = generateMapForSeed(17);
    for (const pipe of map.pipes) {
      expect(inBounds({ row: pipe.row, col: pipe.col })).toBe(true);
    }
  });

  it('no pipe overlaps with source', () => {
    const map = generateMapForSeed(8);
    for (const pipe of map.pipes) {
      expect(pipe.row === map.source.row && pipe.col === map.source.col).toBe(false);
    }
  });

  it('no pipe overlaps with sink', () => {
    const map = generateMapForSeed(8);
    for (const pipe of map.pipes) {
      expect(pipe.row === map.sink.row && pipe.col === map.sink.col).toBe(false);
    }
  });

  it('no two pipes share the same grid cell', () => {
    const map = generateMapForSeed(99);
    const seen = new Set<string>();
    for (const pipe of map.pipes) {
      const key = `${pipe.row},${pipe.col}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('pipe IDs are unique', () => {
    const map = generateMapForSeed(55);
    const ids = map.pipes.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generateMapForSeed — route connectivity', () => {
  it('source is adjacent to the first route pipe', () => {
    const map = generateMapForSeed(3);
    const first = map.pipes.find((p) => p.id === map.correctRoute[0])!;
    expect(areAdjacent(map.source, { row: first.row, col: first.col })).toBe(true);
  });

  it('last route pipe is adjacent to the sink', () => {
    const map = generateMapForSeed(3);
    const last = map.pipes.find(
      (p) => p.id === map.correctRoute[map.correctRoute.length - 1],
    )!;
    expect(areAdjacent({ row: last.row, col: last.col }, map.sink)).toBe(true);
  });

  it('consecutive route pipes are adjacent', () => {
    const map = generateMapForSeed(10);
    for (let i = 0; i + 1 < map.correctRoute.length; i++) {
      const a = map.pipes.find((p) => p.id === map.correctRoute[i])!;
      const b = map.pipes.find((p) => p.id === map.correctRoute[i + 1])!;
      expect(areAdjacent({ row: a.row, col: a.col }, { row: b.row, col: b.col })).toBe(true);
    }
  });
});

describe('generateMapForSeed — determinism', () => {
  it('same seed produces identical maps', () => {
    const a = generateMapForSeed(42);
    const b = generateMapForSeed(42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds can produce different maps', () => {
    const maps = new Set<string>();
    for (let s = 0; s < 20; s++) {
      maps.add(JSON.stringify(generateMapForSeed(s)));
    }
    // There are 10 templates so at least 2 distinct maps must appear in 20 seeds.
    expect(maps.size).toBeGreaterThan(1);
  });

  it('works without error for 20 consecutive seeds', () => {
    expect(() => {
      for (let s = 0; s < 20; s++) generateMapForSeed(s);
    }).not.toThrow();
  });
});

describe('validateGeneratedMap — rejects invalid maps', () => {
  it('rejects map with correctRoute length !== 3', () => {
    const map = generateMapForSeed(1);
    const broken = { ...map, correctRoute: map.correctRoute.slice(0, 2) };
    expect(validateGeneratedMap(broken)).toBe(false);
  });

  it('rejects map when pipe count is too low', () => {
    const map = generateMapForSeed(1);
    const broken = { ...map, pipes: map.pipes.slice(0, 2) }; // only 2 pipes
    expect(validateGeneratedMap(broken)).toBe(false);
  });

  it('rejects map when pipe count is too high (9 pipes)', () => {
    const map = generateMapForSeed(1);
    const extra = {
      ...map,
      pipes: [
        ...map.pipes,
        { id: 'extra-0', row: 0, col: 3, isRoute: false },
        { id: 'extra-1', row: 0, col: 2, isRoute: false },
        { id: 'extra-2', row: 0, col: 1, isRoute: false },
      ],
    };
    expect(validateGeneratedMap(extra)).toBe(false);
  });

  it('rejects map where source is out of bounds', () => {
    const map = generateMapForSeed(1);
    const broken = { ...map, source: { row: -1, col: 0 } };
    expect(validateGeneratedMap(broken)).toBe(false);
  });

  it('rejects map with disconnected route (non-adjacent pipes)', () => {
    const map = generateMapForSeed(1);
    // Move the first route pipe far away from source
    const pipes = map.pipes.map((p) =>
      p.id === map.correctRoute[0] ? { ...p, row: 4, col: 4 } : p,
    );
    const broken = { ...map, pipes };
    expect(validateGeneratedMap(broken)).toBe(false);
  });
});
