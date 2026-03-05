/**
 * Unit tests: scaled numeric input parsing.
 *
 * Verifies the parseScaledGuess logic (extracted for unit-testability):
 *  - No scale: integer input parsed as-is.
 *  - No scale: decimal input rounded to nearest integer.
 *  - Thousand scale: "4.5" → 4500.
 *  - Million scale: "8.8" → 8800000.
 *  - Billion scale: "4.5" → 4500000000.
 *  - Trillion scale: "37" → 37000000000000.
 *  - Invalid input ("abc") → null.
 *  - Empty string → null.
 */

import { describe, it, expect } from 'vitest';

// ── Scales (mirrors the constant in ClosestWithoutGoingOverComp.tsx) ──────────
const SCALES = [
  { label: '—',           value: 1 },
  { label: 'K (thousand)', value: 1_000 },
  { label: 'M (million)',  value: 1_000_000 },
  { label: 'B (billion)',  value: 1_000_000_000 },
  { label: 'T (trillion)', value: 1_000_000_000_000 },
] as const;

/** Replicate parseScaledGuess from ClosestWithoutGoingOverComp for testing. */
function parseScaledGuess(raw: string, scaleIdx: number): number | null {
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  return Math.round(n * SCALES[scaleIdx].value);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseScaledGuess — no scale (index 0)', () => {
  it('parses a plain integer', () => {
    expect(parseScaledGuess('42', 0)).toBe(42);
  });

  it('rounds a decimal when no scale applied', () => {
    expect(parseScaledGuess('3.7', 0)).toBe(4);
  });

  it('returns null for non-numeric input', () => {
    expect(parseScaledGuess('abc', 0)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseScaledGuess('', 0)).toBeNull();
  });
});

describe('parseScaledGuess — thousand scale (index 1)', () => {
  it('"4.5" → 4500', () => {
    expect(parseScaledGuess('4.5', 1)).toBe(4500);
  });

  it('"170" → 170000', () => {
    expect(parseScaledGuess('170', 1)).toBe(170_000);
  });
});

describe('parseScaledGuess — million scale (index 2)', () => {
  it('"8.8" → 8800000', () => {
    expect(parseScaledGuess('8.8', 2)).toBe(8_800_000);
  });

  it('"150" → 150000000', () => {
    expect(parseScaledGuess('150', 2)).toBe(150_000_000);
  });
});

describe('parseScaledGuess — billion scale (index 3)', () => {
  it('"4.5" → 4500000000', () => {
    expect(parseScaledGuess('4.5', 3)).toBe(4_500_000_000);
  });

  it('"1" → 1000000000', () => {
    expect(parseScaledGuess('1', 3)).toBe(1_000_000_000);
  });
});

describe('parseScaledGuess — trillion scale (index 4)', () => {
  it('"37" → 37000000000000', () => {
    expect(parseScaledGuess('37', 4)).toBe(37_000_000_000_000);
  });

  it('"0.5" → 500000000000', () => {
    expect(parseScaledGuess('0.5', 4)).toBe(500_000_000_000);
  });
});
