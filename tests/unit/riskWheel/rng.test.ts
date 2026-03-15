/**
 * Unit tests — Risk Wheel RNG helpers
 *
 * Validates that:
 *  1. cryptoRandom() produces values in [0, 1).
 *  2. spinOnceCrypto() returns valid sectors from the array.
 *  3. Multiple calls to spinOnceCrypto() produce variety (not all identical).
 *  4. coinFlipCrypto() returns boolean values.
 *  5. cryptoSeed() produces non-zero seeds and varied values across calls.
 *  6. seededSpin helpers are deterministic for the same seed and produce
 *     different results for consecutive draws (RNG state advances).
 */

import { describe, expect, it } from 'vitest';
import { cryptoRandom, spinOnceCrypto, coinFlipCrypto, cryptoSeed } from '../../../src/features/riskWheel/cryptoSpin';
import { createSeededRng, spinOnceSeeded, coinFlipSeeded } from '../../../src/features/riskWheel/seededSpin';
import { WHEEL_SECTORS } from '../../../src/features/riskWheel/riskWheelSlice';

describe('cryptoRandom', () => {
  it('returns a float in [0, 1)', () => {
    for (let i = 0; i < 20; i++) {
      const v = cryptoRandom();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('spinOnceCrypto', () => {
  it('always returns an element from the sectors array', () => {
    for (let i = 0; i < 50; i++) {
      const result = spinOnceCrypto(WHEEL_SECTORS);
      expect(WHEEL_SECTORS).toContain(result);
    }
  });

  it('produces variety across many calls (smoke test)', () => {
    // With 16 sectors and 200 draws the probability of getting the same
    // sector every time is (1/16)^199 ≈ 0, so this should always pass.
    const results = new Set<string>();
    for (let i = 0; i < 200; i++) {
      results.add(spinOnceCrypto(WHEEL_SECTORS).label);
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('does not always return the first sector', () => {
    const first = WHEEL_SECTORS[0];
    let allFirst = true;
    for (let i = 0; i < 100; i++) {
      if (spinOnceCrypto(WHEEL_SECTORS) !== first) {
        allFirst = false;
        break;
      }
    }
    expect(allFirst).toBe(false);
  });
});

describe('coinFlipCrypto', () => {
  it('returns boolean values', () => {
    for (let i = 0; i < 20; i++) {
      expect(typeof coinFlipCrypto()).toBe('boolean');
    }
  });

  it('returns both true and false over many flips', () => {
    const results = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      results.add(coinFlipCrypto());
      if (results.size === 2) break;
    }
    expect(results.size).toBe(2);
  });
});

describe('cryptoSeed', () => {
  it('returns a positive 32-bit integer', () => {
    for (let i = 0; i < 10; i++) {
      const s = cryptoSeed();
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(s)).toBe(true);
    }
  });

  it('produces varied values across calls', () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 20; i++) {
      seeds.add(cryptoSeed());
    }
    expect(seeds.size).toBeGreaterThan(1);
  });
});

describe('seededSpin', () => {
  it('createSeededRng is deterministic for the same seed', () => {
    const rng1 = createSeededRng(12345);
    const rng2 = createSeededRng(12345);
    for (let i = 0; i < 10; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('spinOnceSeeded advances RNG state so consecutive spins differ', () => {
    const rng = createSeededRng(99999);
    const results: string[] = [];
    for (let i = 0; i < 50; i++) {
      results.push(spinOnceSeeded(rng, WHEEL_SECTORS).label);
    }
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('coinFlipSeeded returns boolean and advances state', () => {
    const rng = createSeededRng(42);
    const flips = new Set<boolean>();
    for (let i = 0; i < 50; i++) {
      flips.add(coinFlipSeeded(rng));
    }
    expect(flips.size).toBe(2);
  });
});
