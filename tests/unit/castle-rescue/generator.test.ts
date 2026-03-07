/**
 * tests/unit/castle-rescue/generator.test.ts
 *
 * Tests for the Castle Rescue level-config generator (platformer version).
 *
 * generateLevelConfig(seed) → LevelConfig:
 *  - Always returns exactly 3 correct pipe slots.
 *  - All slot indices are within [0, PIPE_SLOT_COUNT).
 *  - No duplicate slot indices.
 *  - Same seed always produces the same config (determinism).
 *  - Different seeds can produce different pipe assignments.
 *  - Works for 30+ seeds without throwing.
 *
 * validateLevelConfig:
 *  - Returns true for valid configs.
 *  - Returns false for malformed configs.
 */

import { describe, it, expect } from 'vitest';
import {
  generateLevelConfig,
  validateLevelConfig,
} from '../../../src/minigames/castleRescue/castleRescueGenerator';
import {
  PIPE_SLOT_COUNT,
  CORRECT_ROUTE_LENGTH,
} from '../../../src/minigames/castleRescue/castleRescueConstants';

describe('generateLevelConfig — structural validity', () => {
  it('returns exactly CORRECT_ROUTE_LENGTH (3) correct pipe slots', () => {
    const c = generateLevelConfig(0);
    expect(c.correctPipeSlots).toHaveLength(CORRECT_ROUTE_LENGTH);
  });

  it('all slot indices are within [0, PIPE_SLOT_COUNT)', () => {
    for (let s = 0; s < 20; s++) {
      const c = generateLevelConfig(s);
      for (const slot of c.correctPipeSlots) {
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(slot).toBeLessThan(PIPE_SLOT_COUNT);
      }
    }
  });

  it('no duplicate slot indices in the same config', () => {
    for (let s = 0; s < 20; s++) {
      const c = generateLevelConfig(s);
      const set = new Set(c.correctPipeSlots);
      expect(set.size).toBe(CORRECT_ROUTE_LENGTH);
    }
  });

  it('stores the original seed in the returned config', () => {
    const c = generateLevelConfig(42);
    expect(c.seed).toBe(42);
  });

  it('works without error for 30 consecutive seeds', () => {
    expect(() => {
      for (let s = 0; s < 30; s++) generateLevelConfig(s);
    }).not.toThrow();
  });
});

describe('generateLevelConfig — determinism', () => {
  it('same seed produces identical configs', () => {
    const a = generateLevelConfig(42);
    const b = generateLevelConfig(42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('seed 0 and seed 1 produce identical structs for their own repeated calls', () => {
    expect(JSON.stringify(generateLevelConfig(0))).toBe(JSON.stringify(generateLevelConfig(0)));
    expect(JSON.stringify(generateLevelConfig(1))).toBe(JSON.stringify(generateLevelConfig(1)));
  });

  it('different seeds produce different pipe assignments across many seeds', () => {
    const configs = new Set<string>();
    for (let s = 0; s < 30; s++) {
      configs.add(JSON.stringify(generateLevelConfig(s).correctPipeSlots));
    }
    // With PIPE_SLOT_COUNT=6 and 3 chosen, there are C(6,3)×3!=120 ordered arrangements.
    // Across 30 seeds we should see more than 1 distinct assignment.
    expect(configs.size).toBeGreaterThan(1);
  });

  it('large seed values do not throw', () => {
    expect(() => {
      generateLevelConfig(0xFFFFFFFF);
      generateLevelConfig(Number.MAX_SAFE_INTEGER);
    }).not.toThrow();
  });
});

describe('validateLevelConfig — valid configs', () => {
  it('returns true for all configs produced by generateLevelConfig', () => {
    for (let s = 0; s < 20; s++) {
      expect(validateLevelConfig(generateLevelConfig(s))).toBe(true);
    }
  });
});

describe('validateLevelConfig — invalid configs', () => {
  it('returns false when fewer than CORRECT_ROUTE_LENGTH slots are provided', () => {
    const c = generateLevelConfig(1);
    // Intentional unsafe cast: we're constructing an invalid config to verify
    // that validateLevelConfig rejects it.  The cast bypasses TypeScript so
    // we can test runtime behaviour with a malformed tuple length.
    const broken = { ...c, correctPipeSlots: [c.correctPipeSlots[0], c.correctPipeSlots[1]] as unknown as [number,number,number] };
    expect(validateLevelConfig(broken)).toBe(false);
  });

  it('returns false when a slot index is out of range (< 0)', () => {
    const c = generateLevelConfig(1);
    const broken = { ...c, correctPipeSlots: [-1, 1, 2] as [number,number,number] };
    expect(validateLevelConfig(broken)).toBe(false);
  });

  it('returns false when a slot index is out of range (>= PIPE_SLOT_COUNT)', () => {
    const c = generateLevelConfig(1);
    const broken = { ...c, correctPipeSlots: [0, 1, PIPE_SLOT_COUNT] as [number,number,number] };
    expect(validateLevelConfig(broken)).toBe(false);
  });

  it('returns false when there are duplicate slot indices', () => {
    const c = generateLevelConfig(1);
    const [a] = c.correctPipeSlots;
    const broken = { ...c, correctPipeSlots: [a, a, 5] as [number,number,number] };
    expect(validateLevelConfig(broken)).toBe(false);
  });
});
